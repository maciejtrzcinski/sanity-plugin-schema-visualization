import type {Rule, SchemaType, SchemaValidationValue} from 'sanity'

import {reportBrokenAssumption} from './compat'
import type {FieldConstraint} from './types'

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

function isRule(value: SchemaValidationValue): value is Rule {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Sanity's own validators (every `slug` has one) carry `bypassConcurrencyLimit`. */
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

/** `_rules` is internal but typed, so a removal fails the build; runtime guards cover the rest. */
export function readValidation(type: SchemaType): FieldValidation {
  const missedRules = () =>
    reportBrokenAssumption(
      'rule._rules',
      'Fields can no longer be told apart by validation, so the `required` and validation badges and the "required but hidden" health warning will not appear.',
    )
  try {
    const rules = type.validation
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
    // Every compiled Rule carries `_rules`, so none at all means the shape moved.
    if (!sawRuleList) missedRules()
    return {required, constraints}
  } catch {
    missedRules()
    return NONE
  }
}
