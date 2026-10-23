import {isDeprecatedSchemaType, type SchemaType} from 'sanity'

import {warnOnce} from './compat'
import {getTypeOptions} from './fieldWalker'
import {defaultTranslate, type TranslateFn} from './i18n'
import type {CollectedFieldOption, FieldConstraint, FieldOptionSummary} from './types'

/**
 * What a badge is handed besides the field's own compiled type.
 *
 * @public
 */
export interface FieldBadgeContext {
  /** The field's name on the type that owns it. */
  name: string
  /**
   * Whether validation statically requires this field. Resolved centrally
   * because it comes from an undocumented shape inside the compiled `Rule`
   * (see `isFieldRequired`), which no badge should have to guess at twice.
   */
  required: boolean
  /** The field's other validation constraints, read in the same pass as `required`. */
  validation: FieldConstraint[]
  /**
   * Translates against this plugin's namespace — a badge's text is computed,
   * so this is where a custom field badge localises, exactly as the built-ins
   * below do.
   */
  t: TranslateFn
}

/**
 * One badge describing how a field *behaves*, as opposed to what its type
 * points at. Every def in the registry runs, in order, and each contributes
 * at most one badge — so a caller adds one with
 * `[...defaultFieldBadges, myBadge]` and drops or replaces exactly one
 * built-in by id.
 *
 * Deliberately not a `FieldDescriber` concern: describers run at every depth
 * of a field's type, while these read the field's own type only. The same
 * flags on a nested type describe that nested type, not this field, so a
 * describer emitting them would bubble misleading badges up.
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
  // `readOnly` is `boolean | ((context) => boolean)`; only a literal `true`
  // means "always read-only" — a callback is conditional and can't be
  // evaluated statically, so treating it as truthy here would be misleading.
  badge: (type, ctx) =>
    type.readOnly === true ? {label: ctx.t('field-badge.read-only'), tone: 'default'} : undefined,
}

/** @beta */
export const hiddenBadge: FieldBadgeDef = {
  id: 'hidden',
  // Same shape as `readOnly`, but a conditional one is worth saying out loud:
  // a field missing from the form for reasons the graph can't show.
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

/** Longest literal an initial-value badge spells out before it truncates. */
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

/**
 * One phrase per constraint flag. Literal keys, so the i18n suite can see
 * every one of them is defined.
 */
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
 * Every constraint beyond `required` in one badge — `min 3 · max 120`. Warning
 * and info rules say so, since they don't block publishing.
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
 * Order is the order badges appear on a field row, ahead of a describer's own.
 * A card shows the first two, so the badges that change how a field behaves
 * come first.
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

/**
 * Runs a badge registry over one field.
 *
 * A throwing badge is skipped for that field rather than taking the graph
 * build down with it, and reported once: these run per field per build, so a
 * warning each would be unreadable — the same trade-off `src/compat.ts` makes.
 */
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
    let badge: FieldOptionSummary | undefined
    try {
      badge = def.badge(type, context)
    } catch {
      warnOnce(
        `field-badge:${def.id}`,
        `The \`${def.id}\` field badge threw on field \`${ctx.name}\`, so it is skipped there. ` +
          `Further failures from this badge are not reported.`,
      )
      continue
    }
    if (badge) collected.push({...badge, id: def.id})
  }

  return collected
}
