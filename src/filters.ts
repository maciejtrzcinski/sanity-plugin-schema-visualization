import {LinkIcon} from '@sanity/icons/Link'
import {UnlinkIcon} from '@sanity/icons/Unlink'
import {WarningOutlineIcon} from '@sanity/icons/WarningOutline'
import type {ComponentType} from 'react'

import type {TranslateFn} from './i18n'
import {defaultNodeKinds, type NodeKindDef} from './kinds'
import {guarded} from './registry'
import type {GraphNode, SchemaGraph} from './types'

/**
 * Graph-wide facts a predicate may need beyond the node itself.
 *
 * @public
 */
export interface FilterContext {
  /** The whole schema, unfiltered — not the visible subgraph, so filter order can't matter. */
  graph: SchemaGraph
  /** Health issues per node, of any severity. A node with none is absent. */
  issueCountByNodeId: Map<string, number>
  /** The `warning`-severity share of `issueCountByNodeId`. */
  warningCountByNodeId: Map<string, number>
  connectedNodeIds: Set<string>
  /** Document counts by type name. Empty until loaded: missing means unknown, not zero. */
  docCountByType: ReadonlyMap<string, number>
  /** Translates against this plugin's namespace, for `summary`. */
  t: TranslateFn
}

/**
 * A filter's current selection. `value` is the first selected value.
 *
 * @public
 */
export interface FilterValue {
  /** The first selected value — the only one, for a single-choice filter. */
  readonly value: string
  readonly values: ReadonlySet<string>
}

/** @public */
export interface FilterOption {
  value: string
  label: string
  /** Resource key for `label`, resolved against the Studio's locale — see `localized`. */
  i18n?: {label?: string}
  /** Short token for this option in a URL. Defaults to `value`. */
  urlValue?: string
}

/** @public */
export interface FilterDef {
  id: string
  /** Heading for this filter's group in the toolbar menu. */
  label: string
  /** Resource key for `label`, resolved against the Studio's locale — see `localized`. */
  i18n?: {label?: string}
  icon?: ComponentType
  /** `single` is a radio group; `multi` is checkboxes. */
  type: 'single' | 'multi'
  options: readonly FilterOption[]
  /** Selection when nothing else says otherwise. Defaults to every option, for `multi`. */
  defaultValues: readonly string[]
  /** URL search param. Changing one invalidates existing shared links. */
  urlParam: string
  predicate: (node: GraphNode, selected: FilterValue, ctx: FilterContext) => boolean
  /** A note for the toolbar's stats line, or `undefined` when the selection needs none. */
  summary?: (selected: FilterValue, ctx: FilterContext) => string | undefined
}

/**
 * Canonical filter state, keyed by filter id, holding each filter's selected values.
 *
 * @public
 */
export type FilterValues = Readonly<Record<string, readonly string[]>>

const KINDS_FILTER_ID = 'kinds'

/**
 * Which kinds of type to show, built from the kind registry.
 *
 * @public
 */
export function createKindsFilter(kinds: readonly NodeKindDef[] = defaultNodeKinds): FilterDef {
  const options = kinds.map((kind) => ({
    value: kind.id,
    label: kind.label,
    ...(kind.i18n?.label ? {i18n: {label: kind.i18n.label}} : {}),
    urlValue: kind.urlParam,
  }))
  return {
    id: KINDS_FILTER_ID,
    label: 'Kind',
    i18n: {label: 'filter.kinds.label'},
    type: 'multi',
    options,
    defaultValues: options.map((o) => o.value),
    urlParam: 'kinds',
    predicate: (node, selected) => selected.values.has(node.kind),
  }
}

/**
 * Values are `'1'`/`'0'` to keep the URL short.
 *
 * @beta
 */
export const systemTypesFilter: FilterDef = {
  id: 'system',
  label: 'System types',
  i18n: {label: 'filter.system.label'},
  type: 'single',
  options: [
    {value: '0', label: 'Exclude system types', i18n: {label: 'filter.system.exclude'}},
    {value: '1', label: 'Include system types', i18n: {label: 'filter.system.include'}},
  ],
  defaultValues: ['0'],
  urlParam: 'system',
  predicate: (node, selected) => selected.value === '1' || !node.isSystem,
  summary: (selected, ctx) =>
    selected.value === '1' || !ctx.graph.nodes.some((node) => node.isSystem)
      ? undefined
      : ctx.t('filter.system.summary'),
}

/** @beta */
export const healthFilter: FilterDef = {
  id: 'health',
  label: 'Health status',
  i18n: {label: 'filter.health.label'},
  icon: WarningOutlineIcon,
  type: 'single',
  options: [
    {value: 'all', label: 'All types', i18n: {label: 'filter.health.all'}},
    {value: 'issues', label: 'Only with issues', i18n: {label: 'filter.health.issues'}},
    {value: 'warnings', label: 'Only with warnings', i18n: {label: 'filter.health.warnings'}},
    {value: 'clean', label: 'Only clean', i18n: {label: 'filter.health.clean'}},
  ],
  defaultValues: ['all'],
  urlParam: 'health',
  predicate: (node, selected, ctx) => {
    if (selected.value === 'warnings') return (ctx.warningCountByNodeId.get(node.id) ?? 0) > 0
    const count = ctx.issueCountByNodeId.get(node.id) ?? 0
    if (selected.value === 'issues') return count > 0
    if (selected.value === 'clean') return count === 0
    return true
  },
}

/** @beta */
export const connectivityFilter: FilterDef = {
  id: 'connectivity',
  label: 'Connectivity',
  i18n: {label: 'filter.connectivity.label'},
  icon: LinkIcon,
  type: 'single',
  options: [
    {value: 'all', label: 'All types', i18n: {label: 'filter.connectivity.all'}},
    {value: 'connected', label: 'Only connected', i18n: {label: 'filter.connectivity.connected'}},
    {
      value: 'orphan',
      label: 'Only orphans (no connections)',
      i18n: {label: 'filter.connectivity.orphan'},
    },
  ],
  defaultValues: ['all'],
  urlParam: 'connectivity',
  predicate: (node, selected, ctx) => {
    const connected = ctx.connectedNodeIds.has(node.id)
    if (selected.value === 'connected') return connected
    if (selected.value === 'orphan') return !connected
    return true
  },
}

/** @beta */
export const deprecatedFilter: FilterDef = {
  id: 'deprecated',
  label: 'Deprecated',
  i18n: {label: 'filter.deprecated.label'},
  icon: UnlinkIcon,
  type: 'single',
  options: [
    {value: 'all', label: 'All types', i18n: {label: 'filter.deprecated.all'}},
    {value: 'only', label: 'Only deprecated', i18n: {label: 'filter.deprecated.only'}},
    {
      value: 'only-fields',
      label: 'Only with deprecated fields',
      i18n: {label: 'filter.deprecated.only-fields'},
    },
    {value: 'hide', label: 'Hide deprecated', i18n: {label: 'filter.deprecated.hide'}},
  ],
  defaultValues: ['all'],
  urlParam: 'deprecated',
  predicate: (node, selected) => {
    if (selected.value === 'only') return Boolean(node.deprecated)
    if (selected.value === 'only-fields') return node.fields.some((field) => field.deprecated)
    if (selected.value === 'hide') return !node.deprecated
    return true
  },
}

/**
 * The stock filter set. The kinds filter is derived, so this takes the kind registry.
 *
 * @public
 */
export function createDefaultFilters(
  kinds: readonly NodeKindDef[] = defaultNodeKinds,
): readonly FilterDef[] {
  return [
    createKindsFilter(kinds),
    systemTypesFilter,
    healthFilter,
    connectivityFilter,
    deprecatedFilter,
  ]
}

export function defaultFilterValues(defs: readonly FilterDef[]): FilterValues {
  return Object.fromEntries(defs.map((def) => [def.id, def.defaultValues]))
}

export function selectionFor(values: FilterValues, def: FilterDef): FilterValue {
  const selected = values[def.id] ?? def.defaultValues
  return {value: selected[0] ?? '', values: new Set(selected)}
}

export function isAtDefault(values: FilterValues, def: FilterDef): boolean {
  const selected = values[def.id] ?? def.defaultValues
  return (
    selected.length === def.defaultValues.length &&
    selected.every((v) => def.defaultValues.includes(v))
  )
}

export function activeFilterCount(values: FilterValues, defs: readonly FilterDef[]): number {
  return defs.filter((def) => !isAtDefault(values, def)).length
}

export function nodeMatchesFilters(
  node: GraphNode,
  values: FilterValues,
  defs: readonly FilterDef[],
  ctx: FilterContext,
): boolean {
  return defs.every((def) =>
    guarded(
      () => def.predicate(node, selectionFor(values, def), ctx),
      // A broken filter mustn't hide types.
      true,
      () => ({
        registry: 'filter',
        id: def.id,
        callback: 'predicate',
        subject: `type \`${node.name}\``,
        outcome: 'the type stays visible',
      }),
    ),
  )
}

export function sanitizeFilterValues(
  raw: Readonly<Record<string, readonly string[] | undefined>>,
  defs: readonly FilterDef[],
): FilterValues {
  const result: Record<string, readonly string[]> = {}
  for (const def of defs) {
    const allowed = new Set(def.options.map((o) => o.value))
    const kept = (raw[def.id] ?? []).filter((v) => allowed.has(v))
    result[def.id] = kept.length > 0 ? kept : def.defaultValues
  }
  return result
}

export function toggleFilterValue(
  values: FilterValues,
  def: FilterDef,
  value: string,
): FilterValues {
  const current = values[def.id] ?? def.defaultValues
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  // Keep one selected: an empty multi-select matches nothing, and a reload would refill it.
  if (next.length === 0) return values
  return {...values, [def.id]: next}
}

export function setFilterValue(values: FilterValues, def: FilterDef, value: string): FilterValues {
  return {...values, [def.id]: [value]}
}

const urlValueOf = (option: FilterOption) => option.urlValue ?? option.value

export function toUrlValues(def: FilterDef, values: readonly string[]): string[] {
  return values.map((value) => {
    const option = def.options.find((o) => o.value === value)
    return option ? urlValueOf(option) : value
  })
}

export function fromUrlValues(def: FilterDef, raw: readonly string[]): string[] {
  return raw.map((token) => {
    const option = def.options.find((o) => urlValueOf(o) === token)
    return option ? option.value : token
  })
}
