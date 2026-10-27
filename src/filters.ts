import {LinkIcon} from '@sanity/icons/Link'
import {UnlinkIcon} from '@sanity/icons/Unlink'
import {WarningOutlineIcon} from '@sanity/icons/WarningOutline'
import type {ComponentType} from 'react'

import type {TranslateFn} from './i18n'
import {defaultNodeKinds, type NodeKindDef} from './kinds'
import type {GraphNode, SchemaGraph} from './types'

/**
 * Graph-wide facts a predicate may need beyond the node itself.
 *
 * @public
 */
export interface FilterContext {
  /**
   * The whole schema, unfiltered — for a predicate that has to look past the
   * node it was handed, e.g. at its neighbors or at the edges pointing in.
   * Deliberately not the currently visible subgraph: a filter that judged a
   * node by what other filters had already hidden would make the result depend
   * on the order predicates happen to run in.
   */
  graph: SchemaGraph
  /** Health issues per node, of any severity. A node with none is absent. */
  issueCountByNodeId: Map<string, number>
  /**
   * The `warning`-severity share of
   * {@link FilterContext.issueCountByNodeId} — subtract one from the other for
   * the `info` count. Split so a predicate can tell an advisory note from a
   * real problem; the health filter's "Only with warnings" is the built-in
   * that does.
   */
  warningCountByNodeId: Map<string, number>
  connectedNodeIds: Set<string>
  /**
   * Live document counts, keyed by type name (not node id). Empty until
   * someone presses the toolbar's "Load doc counts" — and always empty when
   * `documentCounts` is off — so a predicate reading this must treat a missing
   * entry as "not known yet" rather than as zero documents.
   */
  docCountByType: ReadonlyMap<string, number>
  /**
   * Translates against this plugin's namespace, for a filter's `summary` — the
   * one string a filter computes rather than declares. Falls back to the
   * English bundle outside a Studio, so `nodeMatchesFilters` stays callable
   * with a hand-built context.
   */
  t: TranslateFn
}

/**
 * A filter's current selection. Every filter stores a list of selected values,
 * so state, URLs and stored preferences stay uniform; `value` is the
 * convenience accessor a single-choice predicate wants.
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
  /**
   * Short, stable token for this option in a URL. Defaults to `value`; the
   * kind filter overrides it (`document` becomes `doc`) to keep shared links
   * compact.
   */
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
  /**
   * `single` renders as a radio group and stores one value; `multi` renders as
   * checkboxes and stores a list.
   */
  type: 'single' | 'multi'
  options: readonly FilterOption[]
  /** Selection when nothing else says otherwise. Defaults to every option, for `multi`. */
  defaultValues: readonly string[]
  /** URL search param. Changing one invalidates existing shared links. */
  urlParam: string
  predicate: (node: GraphNode, selected: FilterValue, ctx: FilterContext) => boolean
  /**
   * A short note for the toolbar's stats line — "system types hidden",
   * "unused only" — describing what this filter is currently doing to the
   * graph, or `undefined` when its selection needs no comment (nothing to hide,
   * or the default selection). Gets the same context as `predicate`, so it can
   * check the unfiltered graph — including its `t`. Keeps the toolbar from
   * naming any filter to word that line.
   */
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
 * Which kinds of type to show. Built from the kind registry rather than a
 * hardcoded list, so registering a kind adds its toggle here automatically.
 *
 * @public
 */
export function createKindsFilter(kinds: readonly NodeKindDef[] = defaultNodeKinds): FilterDef {
  const options = kinds.map((kind) => ({
    value: kind.id,
    label: kind.label,
    // The toggle is the kind's own label, so it translates with the kind
    // rather than through a second copy of the same string here.
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
 * Sanity's built-in types ride along on every compiled schema, so they're
 * hidden unless asked for. Values are `'1'`/`'0'` to keep the URL short.
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
  // An `info` issue still counts as an issue here — a rule raised it against
  // this type, so calling the type clean would hide it from the one filter
  // meant to surface it. "Only with warnings" is what narrows to the issues
  // worth acting on.
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

/** Reads one filter's selection, falling back to its default when unset. */
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

/** How many filters are set to something other than their default. */
export function activeFilterCount(values: FilterValues, defs: readonly FilterDef[]): number {
  return defs.filter((def) => !isAtDefault(values, def)).length
}

/**
 * Central node-visibility predicate. Shared between the canvas's own filtering
 * and the toolbar's focus-orphaning check so the two can't drift apart.
 */
export function nodeMatchesFilters(
  node: GraphNode,
  values: FilterValues,
  defs: readonly FilterDef[],
  ctx: FilterContext,
): boolean {
  return defs.every((def) => def.predicate(node, selectionFor(values, def), ctx))
}

/** Discards values a filter no longer offers — a stale URL or stored preference. */
export function sanitizeFilterValues(
  raw: Readonly<Record<string, readonly string[] | undefined>>,
  defs: readonly FilterDef[],
): FilterValues {
  const result: Record<string, readonly string[]> = {}
  for (const def of defs) {
    const allowed = new Set(def.options.map((o) => o.value))
    const kept = (raw[def.id] ?? []).filter((v) => allowed.has(v))
    // An empty multi-select hides everything, which reads as a broken canvas
    // rather than a filter; an empty single-select has nothing to test against.
    result[def.id] = kept.length > 0 ? kept : def.defaultValues
  }
  return result
}

/** Toggles one value of a `multi` filter, keeping at least one selected. */
export function toggleFilterValue(
  values: FilterValues,
  def: FilterDef,
  value: string,
): FilterValues {
  const current = values[def.id] ?? def.defaultValues
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  // An empty multi-select matches nothing, which reads as a broken canvas rather
  // than a filter — and `sanitizeFilterValues` would restore every value on the
  // next reload, so live state and its own shareable link would disagree.
  if (next.length === 0) return values
  return {...values, [def.id]: next}
}

export function setFilterValue(values: FilterValues, def: FilterDef, value: string): FilterValues {
  return {...values, [def.id]: [value]}
}

const urlValueOf = (option: FilterOption) => option.urlValue ?? option.value

/** Maps a filter's selected values to the short tokens used in a URL. */
export function toUrlValues(def: FilterDef, values: readonly string[]): string[] {
  return values.map((value) => {
    const option = def.options.find((o) => o.value === value)
    return option ? urlValueOf(option) : value
  })
}

/** Inverse of {@link toUrlValues}. Unknown tokens pass through for `sanitizeFilterValues` to drop. */
export function fromUrlValues(def: FilterDef, raw: readonly string[]): string[] {
  return raw.map((token) => {
    const option = def.options.find((o) => urlValueOf(o) === token)
    return option ? option.value : token
  })
}
