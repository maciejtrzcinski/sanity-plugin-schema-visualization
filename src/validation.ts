import type {Rule, SchemaType, SchemaValidationValue} from 'sanity'

import {reportBrokenAssumption} from './compat'
import type {FieldConstraint} from './types'

/** What validation statically says about a field. */
export interface FieldValidation {
  required: boolean
  constraints: FieldConstraint[]
}

/** The flags surfaced as constraints. `type`, `presence` and `reference` are bookkeeping. */
const CONSTRAINT_FLAGS = new Set([
  'min',
  'max',
  'length',
  'regex',
  'integer',
  'precision',
  'lessThan',
  'greaterThan',
  'unique',
  'uri',
  'email',
  'assetRequired',
  'custom',
])

const NONE: FieldValidation = {required: false, constraints: []}

/** The one member of `validation`'s union that carries validation rules. */
function isRule(value: SchemaValidationValue): value is Rule {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Sanity attaches its own async validators to some intrinsic types (every
 * `slug` gets one) and flags them `bypassConcurrencyLimit`. They are not
 * something the author wrote, so they don't count as a `custom` rule.
 */
function isBuiltInValidator(constraint: unknown): boolean {
  return typeof constraint === 'function' && 'bypassConcurrencyLimit' in constraint
}

function constraintValue(flag: string, constraint: unknown): Partial<FieldConstraint> {
  if (typeof constraint === 'number') return {value: constraint}
  if (flag === 'regex' && isRecord(constraint) && constraint.pattern instanceof RegExp) {
    const name = typeof constraint.name === 'string' ? constraint.name : undefined
    return {
      value: name ?? `/${constraint.pattern.source}/`,
      ...(constraint.invert === true ? {inverted: true} : {}),
    }
  }
  // `Rule.valueOfField('end')` compiles to `{type: Symbol(field-ref), path}`.
  if (isRecord(constraint) && typeof constraint.type === 'symbol') {
    const {path} = constraint
    if (typeof path === 'string') return {value: {field: path}}
    if (Array.isArray(path)) return {value: {field: path.join('.')}}
  }
  return {}
}

const sameConstraint = (a: FieldConstraint, b: FieldConstraint) =>
  a.flag === b.flag &&
  a.level === b.level &&
  a.inverted === b.inverted &&
  JSON.stringify(a.value) === JSON.stringify(b.value)

/**
 * Reads a compiled type's validation. `_rules` is `@internal` and deprecated
 * in `@sanity/types`, but it is typed, so it is read through `Rule` rather
 * than `any`: if Sanity drops the field this stops compiling at upgrade time.
 *
 * The runtime guards stay regardless. If the shape doesn't match, the field
 * reads as unconstrained and the mismatch is reported once, since otherwise
 * the `required` badge and the health rules built on it just stop reporting.
 */
export function readValidation(type: SchemaType): FieldValidation {
  const missedRules = () =>
    reportBrokenAssumption(
      'rule._rules',
      'Fields can no longer be told apart by validation, so the `required` and validation badges and the "required but hidden" health warning will not appear.',
    )
  try {
    const rules = type.validation
    // A non-array `validation` is a type we were handed uncompiled, not a
    // change in the Rule shape — nothing to report.
    if (!Array.isArray(rules) || rules.length === 0) return NONE

    let sawRuleList = false
    let required = false
    const constraints: FieldConstraint[] = []
    for (const entry of rules) {
      if (!isRule(entry)) continue
      // The one place the deprecated internal is read on purpose.
      // oxlint-disable-next-line typescript/no-deprecated
      const inner: unknown = entry._rules
      if (!Array.isArray(inner)) continue
      sawRuleList = true
      // oxlint-disable-next-line typescript/no-deprecated
      const declared = entry._level
      const level = declared === 'warning' || declared === 'info' ? declared : 'error'
      for (const spec of inner) {
        if (!isRecord(spec) || typeof spec.flag !== 'string') continue
        if (spec.flag === 'presence' && spec.constraint === 'required') required = true
        if (!CONSTRAINT_FLAGS.has(spec.flag)) continue
        if (spec.flag === 'custom' && isBuiltInValidator(spec.constraint)) continue
        const constraint: FieldConstraint = {
          flag: spec.flag,
          level,
          ...constraintValue(spec.flag, spec.constraint),
        }
        if (!constraints.some((seen) => sameConstraint(seen, constraint))) {
          constraints.push(constraint)
        }
      }
    }
    // Every compiled Rule carries a `_rules` list, even for a field the author
    // wrote no validation for, so finding none means the shape moved.
    if (!sawRuleList) missedRules()
    return {required, constraints}
  } catch {
    missedRules()
    return NONE
  }
}
