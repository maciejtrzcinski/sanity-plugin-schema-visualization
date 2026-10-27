import {isArraySchemaType, isObjectSchemaType, isReferenceSchemaType, type SchemaType} from 'sanity'

import {isAliasOf, isAnonymousType} from './fieldWalker'
import type {AttributePathEstimate} from './types'

/**
 * Sanity's dataset attribute limit counts unique combinations of path and data
 * type across every document — `sections[].heading` holding a string is one.
 * This walks the schema for every such pair a document *could* write. Real
 * datasets only count paths that hold content, so the estimate is a ceiling
 * for a finite schema, and a floor once a type can contain itself.
 *
 * Paths are kept relative to the type that produces them (`.title`, `[]._key`)
 * so a registered type is walked once and prefixed wherever it's used.
 */

/** Stop counting past this many — far beyond any plan's limit, so the answer doesn't change. */
const ATTRIBUTE_PATH_CAP = 20_000

/** Every document carries these. */
const DOCUMENT_ATTRIBUTES = ['_id', '_type', '_rev', '_createdAt', '_updatedAt']

/** Image and file `media` is only written by the Media Library. */
const SKIPPED_FIELDS = new Set(['media'])

const SEPARATOR = '\0'
const entry = (path: string, jsonType: string) => `${path}${SEPARATOR}${jsonType}`

interface Walk {
  isRegistered: (name: string) => boolean
  memo: Map<string, string[]>
  /** Registered types on the current descent path. */
  stack: Set<string>
  recursive: Set<string>
  /** Entries produced so far, across every root — the cap's budget. */
  produced: number
  capped: boolean
}

function referenceEntries(type: SchemaType): string[] {
  const entries = [entry('._ref', 'string'), entry('._type', 'string')]
  if ('weak' in type && type.weak) entries.push(entry('._weak', 'boolean'))
  if (isAliasOf(type, 'crossDatasetReference')) {
    entries.push(entry('._dataset', 'string'), entry('._projectId', 'string'))
  }
  return entries
}

function relativeEntries(type: SchemaType, walk: Walk, depth: number): string[] {
  if (walk.capped || depth > 32) return []
  // Only a type the author registered can be memoised by name: a customised
  // intrinsic (an `image` with extra fields) shares its name with every other
  // `image` but not its fields.
  const memoKey = walk.isRegistered(type.name) && !isAnonymousType(type) ? type.name : undefined
  if (memoKey) {
    const cached = walk.memo.get(memoKey)
    if (cached) return cached
    if (walk.stack.has(memoKey)) {
      walk.recursive.add(memoKey)
      return []
    }
    walk.stack.add(memoKey)
  }

  const entries = [entry('', type.jsonType)]
  if (
    isReferenceSchemaType(type) ||
    isAliasOf(type, 'crossDatasetReference') ||
    isAliasOf(type, 'globalDocumentReference')
  ) {
    entries.push(...referenceEntries(type))
  } else if (isArraySchemaType(type)) {
    for (const member of type.of ?? []) {
      for (const child of relativeEntries(member, walk, depth + 1)) entries.push(`[]${child}`)
      if (member.jsonType === 'object') {
        entries.push(entry('[]._key', 'string'), entry('[]._type', 'string'))
      }
    }
  } else if (isObjectSchemaType(type)) {
    if (!isAnonymousType(type)) entries.push(entry('._type', 'string'))
    for (const field of type.fields ?? []) {
      if (SKIPPED_FIELDS.has(field.name)) continue
      for (const child of relativeEntries(field.type, walk, depth + 1)) {
        entries.push(`.${field.name}${child}`)
      }
    }
  }

  // Array members repeat `[]._key` and `[]._type`; dropping the copies here
  // keeps them from multiplying everywhere this type is prefixed.
  const unique = [...new Set(entries)]
  walk.produced += unique.length
  if (walk.produced > ATTRIBUTE_PATH_CAP * 10) walk.capped = true

  if (memoKey) {
    walk.stack.delete(memoKey)
    walk.memo.set(memoKey, unique)
  }
  return unique
}

/**
 * Estimates the attribute paths each document type writes, and all of them
 * together. `roots` are the document types; `isRegistered` says which type
 * names the author declared.
 */
export function estimateAttributePaths(
  roots: readonly SchemaType[],
  isRegistered: (name: string) => boolean,
): {total: AttributePathEstimate; byType: Map<string, number>} {
  const walk: Walk = {
    isRegistered,
    memo: new Map(),
    stack: new Set(),
    recursive: new Set(),
    produced: 0,
    capped: false,
  }
  const all = new Set<string>()
  const byType = new Map<string, number>()

  for (const root of roots) {
    // The intrinsic `document` type every document extends writes nothing of its own.
    if (root.name === 'document') continue
    const own = new Set(DOCUMENT_ATTRIBUTES.map((name) => entry(name, 'string')))
    for (const relative of relativeEntries(root, walk, 0)) {
      // The root's own entry is the document object itself, not a path in it.
      if (relative.startsWith(SEPARATOR)) continue
      own.add(relative.slice(1))
    }
    byType.set(root.name, own.size)
    for (const path of own) {
      if (all.size >= ATTRIBUTE_PATH_CAP) {
        walk.capped = true
        break
      }
      all.add(path)
    }
  }

  return {
    total: {count: all.size, capped: walk.capped, recursiveTypes: [...walk.recursive].sort()},
    byType,
  }
}
