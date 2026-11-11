import type {Schema} from 'sanity'

import type {HealthContext, HealthRule, RawIssue} from './healthRules'
import {getAuthoredTypes} from './intrinsics'

// Restates the slice of `@sanity-labs/schema-lint` used here, so it adds nothing to the bundle.

/**
 * A type definition in the shape Sanity Lint's schema rules read.
 *
 * @beta
 */
export interface SanityLintType {
  name: string
  /** What the type was declared as: `document`, `object`, or another type's name. */
  type: string
  title?: string
  description?: string
  hasIcon?: boolean
  hasPreview?: boolean
  fields?: SanityLintField[]
  groups?: Array<{name: string; title?: string}>
}

/** @beta */
export interface SanityLintField {
  name: string
  type: string
  title?: string
  description?: string
  hasValidation?: boolean
  deprecated?: boolean | string
  hidden?: boolean
  readOnly?: boolean
  options?: Record<string, unknown>
  of?: SanityLintField[]
  to?: Array<{type: string}>
}

/** @beta */
export interface SanityLintFinding {
  message: string
  help?: string
}

/** @beta */
export interface SanityLintRuleContext {
  filePath: string
  report: (finding: SanityLintFinding) => void
}

/**
 * The part of a Sanity Lint schema rule that {@link fromSanityLint} calls.
 * The package's exported `rules`, and each rule on its own, satisfy it.
 *
 * @beta
 */
export interface SanityLintRule {
  id: string
  name: string
  severity: 'error' | 'warning' | 'info'
  // Method syntax: only a method parameter is compared bivariantly.
  check(schema: SanityLintType, context: SanityLintRuleContext): void
}

/** These judge source text; at runtime `defineType` is invisible, so both flag every type. */
const SOURCE_ONLY_RULES: ReadonlySet<string> = new Set([
  'missing-define-type',
  'missing-define-field',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function list<T>(value: unknown, convert: (item: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.flatMap((item) => convert(item) ?? [])
}

function toTargets(value: unknown): Array<{type: string}> | undefined {
  const targets = list(Array.isArray(value) ? value : value === undefined ? [] : [value], (to) =>
    isRecord(to) && typeof to.type === 'string' ? {type: to.type} : undefined,
  )
  return targets && targets.length > 0 ? targets : undefined
}

function toLintField(def: unknown): SanityLintField | undefined {
  if (!isRecord(def)) return undefined
  const type = text(def.type)
  const name = text(def.name) ?? type
  if (!name || !type) return undefined
  return {
    name,
    type,
    title: text(def.title),
    description: text(def.description),
    hasValidation: def.validation !== undefined,
    deprecated: isRecord(def.deprecated) ? (text(def.deprecated.reason) ?? true) : undefined,
    hidden: def.hidden === true,
    readOnly: def.readOnly === true,
    options: isRecord(def.options) ? def.options : undefined,
    of: list(def.of, toLintField),
    to: toTargets(def.to),
  }
}

function toLintType(def: unknown): SanityLintType | undefined {
  if (!isRecord(def)) return undefined
  const name = text(def.name)
  const type = text(def.type)
  if (!name || !type) return undefined
  return {
    name,
    type,
    title: text(def.title),
    description: text(def.description),
    hasIcon: def.icon !== undefined,
    hasPreview: def.preview !== undefined,
    fields: list(def.fields, toLintField),
    groups: list(def.groups, (group) =>
      isRecord(group) && typeof group.name === 'string'
        ? {name: group.name, title: text(group.title)}
        : undefined,
    ),
  }
}

const converted = new WeakMap<Schema, readonly SanityLintType[]>()

/** Authored definitions: compilation titles every type, so `missing-title` would never fire. */
function lintTypes({schema, nodesById}: HealthContext): SanityLintType[] {
  if (!schema) return []
  let types = converted.get(schema)
  if (!types) {
    types = list(getAuthoredTypes(schema), toLintType) ?? []
    converted.set(schema, types)
  }
  // A filtered graph leaves types out, and an issue has to land on a card.
  return types.filter((type) => nodesById.has(type.name))
}

function toHealthRule(rule: SanityLintRule): HealthRule {
  return {
    id: `sanity-lint/${rule.id}`,
    label: rule.name,
    severity: rule.severity === 'info' ? 'info' : 'warning',
    check: (ctx) => {
      const issues: RawIssue[] = []
      const seen = new Set<string>()
      for (const type of lintTypes(ctx)) {
        const report = ({message, help}: SanityLintFinding) => {
          const key = `${type.name}:${message}`
          if (seen.has(key)) return
          seen.add(key)
          issues.push({
            key,
            nodeId: type.name,
            message: help ? ctx.t('health.sanity-lint.message', {message, help}) : message,
          })
        }
        try {
          rule.check(type, {filePath: '', report})
        } catch {
          // One definition the rule can't read shouldn't hide what it found in the rest.
        }
      }
      return issues
    },
  }
}

/**
 * Health rules that run [Sanity Lint](https://github.com/sanity-labs/sanity-lint)'s
 * schema rules over the authored types. Outside a Studio they need
 * `computeHealthIssues` to be given the schema.
 *
 * @beta
 */
export function fromSanityLint(rules: readonly SanityLintRule[]): HealthRule[] {
  return rules.filter((rule) => !SOURCE_ONLY_RULES.has(rule.id)).map(toHealthRule)
}
