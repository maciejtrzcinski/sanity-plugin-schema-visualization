import {
  isArraySchemaType,
  isObjectSchemaType,
  isReferenceSchemaType,
  type CrossDatasetReferenceSchemaType,
  type GlobalDocumentReferenceSchemaType,
  type SchemaType,
} from 'sanity'

import {defaultTranslate, type TranslateFn} from './i18n'
import {INTRINSIC_FIELD_NAMES} from './intrinsics'
import {guarded} from './registry'
import type {FieldLink, FieldOptionSummary} from './types'

export const DEFAULT_MAX_DEPTH = 8

/** @public */
export interface WalkContext {
  /** Path rooted at the field name, e.g. `"body[].markDefs[].author"`. Labels edges. */
  path: string
  depth: number
  maxDepth: number
  /** True for a type the user registered in `schema.types`; it gets its own node. */
  isRegistered: (name: string) => boolean
  /** Types already on the current descent path, guarding against cyclic compiled types. */
  seen: ReadonlySet<SchemaType>
  /** Walked into, not read as a reuse — how a registered array type reaches its members. */
  selfName?: string
  /** Translates against this plugin's namespace. */
  t: TranslateFn
}

/** @public */
export interface DescribeResult {
  /** Human-readable type label. Only the top-level result's label is surfaced. */
  typeLabel: string
  /** Reference/reuse connections found at this level and below. */
  links: FieldLink[]
  /** Badges for this type. Only the top-level result's options are surfaced. */
  options: FieldOptionSummary[]
}

/**
 * Descends into a nested type, extending the current path by one segment.
 *
 * @public
 */
export type Recurse = (type: SchemaType, segment: string) => DescribeResult

/**
 * The two functions a describer is made of — see {@link FieldDescriber} for
 * the whole entry.
 *
 * @public
 */
export interface FieldDescriberRule {
  match: (type: SchemaType, ctx: WalkContext) => boolean
  describe: (type: SchemaType, ctx: WalkContext, recurse: Recurse) => DescribeResult
}

/**
 * Turns a compiled schema type into a label plus the connections it implies.
 * The first describer whose `match` returns true wins.
 *
 * @public
 */
export interface FieldDescriber extends FieldDescriberRule {
  id: string
}

interface CommonFieldOptions {
  list?: unknown[]
  layout?: string
  source?: unknown
  hotspot?: boolean
  filter?: unknown
  disableNew?: boolean
}

export function getTypeOptions(type: SchemaType): CommonFieldOptions | undefined {
  const options: unknown = 'options' in type ? type.options : undefined
  return options && typeof options === 'object' ? options : undefined
}

/** An inline, unnamed alias: its name is just its jsonType. */
export function isAnonymousType(type: SchemaType): boolean {
  return type.name === type.jsonType
}

function childPath(path: string, segment: string): string {
  if (segment === '[]') return `${path}[]`
  return path ? `${path}.${segment}` : segment
}

const empty = (typeLabel: string): DescribeResult => ({typeLabel, links: [], options: []})

/** Bounded rather than recursive, so a self-referential `type` link can't hang the build. */
export function isAliasOf(type: SchemaType, name: string): boolean {
  let current: SchemaType | undefined = type
  for (let depth = 0; current && depth <= 32; depth++) {
    if (current.name === name) return true
    current = current.type
  }
  return false
}

/** Sanity's own declared shape, so a rename there fails this build, not reads `undefined`. */
function isCrossDatasetReference(
  type: SchemaType,
): type is SchemaType & CrossDatasetReferenceSchemaType {
  return isAliasOf(type, 'crossDatasetReference')
}

function isGlobalDocumentReference(
  type: SchemaType,
): type is SchemaType & GlobalDocumentReferenceSchemaType {
  return isAliasOf(type, 'globalDocumentReference')
}

function referenceOptions(type: SchemaType, weak: boolean, ctx: WalkContext): FieldOptionSummary[] {
  const options: FieldOptionSummary[] = []
  const typeOptions = getTypeOptions(type)
  if (weak) options.push({label: ctx.t('field.weak-ref'), tone: 'caution'})
  if (typeOptions?.filter) options.push({label: ctx.t('field.filtered'), tone: 'default'})
  if (typeOptions?.disableNew === true) {
    options.push({label: ctx.t('field.disable-new'), tone: 'default'})
  }
  return options
}

function externalTargets(to: readonly {type?: string}[] | undefined): string[] {
  return (to ?? []).map((entry) => entry.type).filter((name): name is string => Boolean(name))
}

/**
 * Ordered first so a registered reference alias still surfaces its targets.
 *
 * @beta
 */
export const referenceDescriber: FieldDescriber = {
  id: 'reference',
  match: (type) => isReferenceSchemaType(type),
  describe(type, ctx) {
    if (!isReferenceSchemaType(type)) return empty(type.name)
    const to = type.to.map((t) => t.name).filter(Boolean)
    const weak = Boolean(type.weak)

    return {
      typeLabel: ctx.t('field.reference-label', {
        targets: to.join(' | ') || ctx.t('field.unknown-target'),
      }),
      links: to.map((target) => ({kind: 'reference', target, path: ctx.path, weak})),
      options: referenceOptions(type, weak, ctx),
    }
  },
}

/**
 * The target is named by string, from the other dataset's schema, so it's only
 * drawn when this schema holds a type of that name.
 *
 * @beta
 */
export const crossDatasetReferenceDescriber: FieldDescriber = {
  id: 'crossDatasetReference',
  match: isCrossDatasetReference,
  describe(type, ctx) {
    if (!isCrossDatasetReference(type)) return empty(type.name)
    const {to, dataset, weak} = type
    const targets = externalTargets(to)
    const options = referenceOptions(type, Boolean(weak), ctx)
    if (dataset) options.push({label: ctx.t('field.dataset', {dataset}), tone: 'default'})

    return {
      typeLabel: ctx.t('field.cross-dataset-reference-label', {
        targets: targets.join(' | ') || ctx.t('field.unknown-target'),
      }),
      links: targets.map((target) => ({
        kind: 'external-reference',
        target,
        path: ctx.path,
        weak: Boolean(weak),
      })),
      options,
    }
  },
}

/**
 * Like {@link crossDatasetReferenceDescriber}, for a `resourceType:resourceId` target.
 *
 * @beta
 */
export const globalDocumentReferenceDescriber: FieldDescriber = {
  id: 'globalDocumentReference',
  match: isGlobalDocumentReference,
  describe(type, ctx) {
    if (!isGlobalDocumentReference(type)) return empty(type.name)
    const {to, resourceType, resourceId, weak} = type
    const targets = externalTargets(to)
    const options = referenceOptions(type, Boolean(weak), ctx)
    if (resourceType || resourceId) {
      options.push({label: ctx.t('field.resource', {resourceType, resourceId}), tone: 'default'})
    }

    return {
      typeLabel: ctx.t('field.global-document-reference-label', {
        targets: targets.join(' | ') || ctx.t('field.unknown-target'),
      }),
      links: targets.map((target) => ({
        kind: 'external-reference',
        target,
        path: ctx.path,
        weak: Boolean(weak),
      })),
      options,
    }
  },
}

/**
 * Terminal: the registered type has its own node. Ahead of the structural
 * describers so a registered array type gets a "reuses" edge.
 *
 * @beta
 */
export const namedTypeDescriber: FieldDescriber = {
  id: 'namedType',
  match: (type, ctx) =>
    ctx.isRegistered(type.name) && !isAnonymousType(type) && type.name !== ctx.selfName,
  describe: (type, ctx) => ({
    // Nested, the jsonType suffix is noise ("array of seo (object)").
    typeLabel:
      ctx.depth === 0
        ? ctx.t('field.named-type-label', {name: type.name, jsonType: type.jsonType})
        : type.name,
    links: [{kind: 'reuses', target: type.name, path: ctx.path}],
    options: [],
  }),
}

/** @beta */
export const arrayDescriber: FieldDescriber = {
  id: 'array',
  match: (type) => isArraySchemaType(type),
  describe(type, ctx, recurse) {
    if (!isArraySchemaType(type)) return empty(type.name)
    const parts: string[] = []
    const links: FieldLink[] = []
    for (const member of type.of ?? []) {
      const result = recurse(member, '[]')
      parts.push(result.typeLabel)
      links.push(...result.links)
    }
    return {
      typeLabel: ctx.t('field.array-label', {
        members: parts.join(', ') || ctx.t('field.unknown-target'),
      }),
      links,
      options: [],
    }
  },
}

/**
 * An anonymous object. Skips the built-in fields of the intrinsic it extends.
 *
 * @beta
 */
export const objectDescriber: FieldDescriber = {
  id: 'object',
  match: (type) => isObjectSchemaType(type),
  describe(type, _ctx, recurse) {
    if (!isObjectSchemaType(type)) return empty(type.name)
    const builtIn = INTRINSIC_FIELD_NAMES[type.name]
    const links: FieldLink[] = []
    for (const field of type.fields ?? []) {
      if (builtIn?.has(field.name)) continue
      links.push(...recurse(field.type, field.name).links)
    }
    return {typeLabel: type.name, links, options: []}
  },
}

/** @beta */
export const fallbackDescriber: FieldDescriber = {
  id: 'fallback',
  match: () => true,
  describe: (type) => empty(type.name),
}

/**
 * Order is the contract: terminal rules first, structural recursion after,
 * catch-all last. Insert a describer ahead of the built-in it pre-empts.
 *
 * @public
 */
export const defaultFieldDescribers: readonly FieldDescriber[] = [
  referenceDescriber,
  crossDatasetReferenceDescriber,
  globalDocumentReferenceDescriber,
  namedTypeDescriber,
  arrayDescriber,
  objectDescriber,
  fallbackDescriber,
]

export function walkFieldType(
  type: SchemaType,
  ctx: WalkContext,
  describers: readonly FieldDescriber[] = defaultFieldDescribers,
): DescribeResult {
  if (ctx.depth > ctx.maxDepth || ctx.seen.has(type)) return empty(type.name)

  const recurse: Recurse = (childType, segment) =>
    walkFieldType(
      childType,
      {
        ...ctx,
        path: childPath(ctx.path, segment),
        depth: ctx.depth + 1,
        seen: new Set(ctx.seen).add(type),
      },
      describers,
    )

  const describer =
    describers.find((d) =>
      guarded(
        () => d.match(type, ctx),
        false,
        () => ({
          registry: 'field describer',
          id: d.id,
          callback: 'match',
          subject: walkSubject(type, ctx),
          outcome: 'the next describer is tried',
        }),
      ),
    ) ?? fallbackDescriber
  const described = guarded(
    () => {
      const result: unknown = describer.describe(type, ctx, recurse)
      if (isDescribeResult(result)) return result
      // Caught here, the failure is pinned on this describer, not the parent that reads it.
      throw new TypeError('`describe` must return {typeLabel, links, options}')
    },
    undefined,
    () => ({
      registry: 'field describer',
      id: describer.id,
      callback: 'describe',
      subject: walkSubject(type, ctx),
      outcome: 'it is labelled by its type name alone',
    }),
  )
  // Built only on failure: this runs at every level of every field.
  return described ?? fallbackDescriber.describe(type, ctx, recurse)
}

function walkSubject(type: SchemaType, ctx: WalkContext): string {
  return `\`${type.name}\` in field \`${ctx.path}\``
}

function isDescribeResult(value: unknown): value is DescribeResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'typeLabel' in value &&
    typeof value.typeLabel === 'string' &&
    'links' in value &&
    Array.isArray(value.links) &&
    'options' in value &&
    Array.isArray(value.options)
  )
}

export function rootWalkContext(
  fieldName: string,
  isRegistered: (name: string) => boolean,
  maxDepth: number = DEFAULT_MAX_DEPTH,
  selfName?: string,
  t: TranslateFn = defaultTranslate,
): WalkContext {
  return {path: fieldName, depth: 0, maxDepth, isRegistered, seen: new Set(), selfName, t}
}
