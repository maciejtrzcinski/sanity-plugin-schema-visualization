import {isDeprecatedSchemaType, type SchemaType} from 'sanity'

import {getTypeOptions} from './fieldWalker'
import {defaultTranslate, type TranslateFn} from './i18n'
import {guarded} from './registry'
import type {CollectedFieldOption, FieldConstraint, FieldOptionSummary} from './types'

/**
 * What a badge is handed besides the field's own compiled type.
 *
 * @public
 */
export interface FieldBadgeContext {
  /** The field's name on the type that owns it. */
  name: string
  /** Whether validation statically requires this field. */
  required: boolean
  /** The field's other validation constraints, read in the same pass as `required`. */
  validation: FieldConstraint[]
  /** Translates against this plugin's namespace. */
  t: TranslateFn
}

/**
 * One badge describing how a field behaves. Every def runs, in order, and
 * contributes at most one badge.
 *
 * @public
 */
export interface FieldBadgeDef {
  /** Stable id, so a caller can drop or replace one built-in by name. */
  id: string
  /** The badge for this field, or undefined when it doesn't apply. */
  badge: (type: SchemaType, ctx: FieldBadgeContext) => FieldOptionSummary | undefined
}

/** @beta */
export const requiredBadge: FieldBadgeDef = {
  id: 'required',
  badge: (_type, ctx) =>
    ctx.required ? {label: ctx.t('field-badge.required'), tone: 'critical'} : undefined,
}

/** @beta */
export const readOnlyBadge: FieldBadgeDef = {
  id: 'read-only',
  // Only a literal `true` is always read-only; a callback can't be evaluated statically.
  badge: (type, ctx) =>
    type.readOnly === true ? {label: ctx.t('field-badge.read-only'), tone: 'default'} : undefined,
}

/** @beta */
export const hiddenBadge: FieldBadgeDef = {
  id: 'hidden',
  badge: (type, ctx) => {
    if (type.hidden === true) return {label: ctx.t('field-badge.hidden'), tone: 'default'}
    if (typeof type.hidden === 'function') {
      return {label: ctx.t('field-badge.conditionally-hidden'), tone: 'default'}
    }
    return undefined
  },
}

/** @beta */
export const deprecatedBadge: FieldBadgeDef = {
  id: 'deprecated',
  badge: (type, ctx) =>
    isDeprecatedSchemaType(type)
      ? {label: ctx.t('field-badge.deprecated'), tone: 'caution'}
      : undefined,
}

/** @beta */
export const listBadge: FieldBadgeDef = {
  id: 'list',
  badge: (type, ctx) => {
    const list = getTypeOptions(type)?.list
    return list
      ? {label: ctx.t('field-badge.list', {count: list.length}), tone: 'primary'}
      : undefined
  },
}

/** @beta */
export const layoutBadge: FieldBadgeDef = {
  id: 'layout',
  badge: (type, ctx) => {
    const layout = getTypeOptions(type)?.layout
    return layout ? {label: ctx.t('field-badge.layout', {layout}), tone: 'default'} : undefined
  },
}

/** @beta */
export const sourceBadge: FieldBadgeDef = {
  id: 'source',
  badge: (type, ctx) => {
    const source = getTypeOptions(type)?.source
    if (typeof source === 'function') {
      return {label: ctx.t('field-badge.source-computed'), tone: 'default'}
    }
    return typeof source === 'string' && source
      ? {label: ctx.t('field-badge.source', {source}), tone: 'default'}
      : undefined
  },
}

/** @beta */
export const hotspotBadge: FieldBadgeDef = {
  id: 'hotspot',
  badge: (type, ctx) =>
    getTypeOptions(type)?.hotspot
      ? {label: ctx.t('field-badge.hotspot'), tone: 'default'}
      : undefined,
}

const MAX_INITIAL_VALUE_LENGTH = 16

/** @beta */
export const initialValueBadge: FieldBadgeDef = {
  id: 'initial-value',
  badge: (type, ctx) => {
    const initial: unknown = type.initialValue
    if (initial === undefined) return undefined
    if (typeof initial === 'function') {
      return {label: ctx.t('field-badge.initial-value-computed'), tone: 'default'}
    }
    if (
      typeof initial === 'string' ||
      typeof initial === 'number' ||
      typeof initial === 'boolean'
    ) {
      const text = String(initial)
      const value =
        text.length > MAX_INITIAL_VALUE_LENGTH
          ? `${text.slice(0, MAX_INITIAL_VALUE_LENGTH)}…`
          : text
      return {label: ctx.t('field-badge.initial-value-literal', {value}), tone: 'default'}
    }
    return {label: ctx.t('field-badge.initial-value'), tone: 'default'}
  },
}

/** Literal keys, so the i18n suite can see each one. */
const CONSTRAINT_KEYS: Record<string, string> = {
  min: 'field-badge.validation.min',
  max: 'field-badge.validation.max',
  length: 'field-badge.validation.length',
  regex: 'field-badge.validation.regex',
  integer: 'field-badge.validation.integer',
  precision: 'field-badge.validation.precision',
  lessThan: 'field-badge.validation.less-than',
  greaterThan: 'field-badge.validation.greater-than',
  unique: 'field-badge.validation.unique',
  uri: 'field-badge.validation.uri',
  email: 'field-badge.validation.email',
  assetRequired: 'field-badge.validation.asset-required',
  custom: 'field-badge.validation.custom',
}

function constraintLabel(constraint: FieldConstraint, t: TranslateFn): string | undefined {
  const key =
    constraint.flag === 'regex' && constraint.inverted
      ? 'field-badge.validation.regex-inverted'
      : CONSTRAINT_KEYS[constraint.flag]
  if (!key) return undefined
  const {value} = constraint
  const shown =
    typeof value === 'object' ? t('field-badge.validation.field', {path: value.field}) : value
  const label = t(key, {value: shown})
  if (constraint.level === 'warning') return t('field-badge.validation.as-warning', {rule: label})
  if (constraint.level === 'info') return t('field-badge.validation.as-info', {rule: label})
  return label
}

/**
 * Every constraint beyond `required`, e.g. `min 3 · max 120`.
 *
 * @beta
 */
export const validationBadge: FieldBadgeDef = {
  id: 'validation',
  badge: (_type, ctx) => {
    const labels = ctx.validation
      .map((constraint) => constraintLabel(constraint, ctx.t))
      .filter((label): label is string => Boolean(label))
    if (labels.length === 0) return undefined
    return {label: labels.join(ctx.t('field-badge.validation.separator')), tone: 'default'}
  },
}

/**
 * Order is the order badges appear on a field row; a card shows the first two.
 *
 * @public
 */
export const defaultFieldBadges: readonly FieldBadgeDef[] = [
  requiredBadge,
  readOnlyBadge,
  hiddenBadge,
  deprecatedBadge,
  listBadge,
  layoutBadge,
  sourceBadge,
  hotspotBadge,
  validationBadge,
  initialValueBadge,
]

/** A throwing badge is skipped for that field and reported once. */
export function collectFieldBadges(
  type: SchemaType,
  ctx: Omit<FieldBadgeContext, 't' | 'validation'> & {
    t?: TranslateFn
    validation?: FieldConstraint[]
  },
  badges: readonly FieldBadgeDef[] = defaultFieldBadges,
): CollectedFieldOption[] {
  const context: FieldBadgeContext = {
    ...ctx,
    validation: ctx.validation ?? [],
    t: ctx.t ?? defaultTranslate,
  }
  const collected: CollectedFieldOption[] = []

  for (const def of badges) {
    const badge = guarded(
      () => def.badge(type, context),
      undefined,
      () => ({
        registry: 'field badge',
        id: def.id,
        subject: `field \`${ctx.name}\``,
        outcome: 'it is skipped there',
      }),
    )
    if (badge) collected.push({...badge, id: def.id})
  }

  return collected
}
