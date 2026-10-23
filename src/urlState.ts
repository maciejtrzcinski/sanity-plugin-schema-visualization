import {
  fromUrlValues,
  isAtDefault,
  sanitizeFilterValues,
  toUrlValues,
  type FilterDef,
  type FilterValues,
} from './filters'

/**
 * Filter values travel as one comma-joined list per param, so each token is
 * percent-encoded before joining — a custom `FilterOption` whose `value` or
 * `urlValue` contains a comma (or `%`) survives the round trip instead of
 * splitting into two bogus tokens. Every stock token is untouched by
 * `encodeURIComponent`, so links produced before this encoding keep working.
 */
const encodeToken = encodeURIComponent

function decodeToken(token: string): string {
  try {
    return decodeURIComponent(token)
  } catch {
    // A hand-edited URL with a stray `%` shouldn't take the whole view state
    // down — pass the raw token through for `sanitizeFilterValues` to judge.
    return token
  }
}

export interface ShareableViewState {
  searchQuery: string
  filters: FilterValues
  focusNodeId: string | null
  /** The open detail panel's node. Omitted from the URL when it just mirrors `focusNodeId`. */
  selectedNodeId: string | null
}

/**
 * Serializes the parts of view state worth sharing a link to — search,
 * filters, focus, and the open detail panel — as URL search params. Only
 * filters that differ from their default are written, so browsing with
 * everything at its default keeps a clean URL with no params at all.
 *
 * Filters are handled entirely through their definitions: each writes its own
 * `urlParam` as a comma-separated value list. Adding a filter needs no change
 * here.
 */
export function encodeViewState(
  state: ShareableViewState,
  defs: readonly FilterDef[],
): URLSearchParams {
  const params = new URLSearchParams()

  if (state.searchQuery) params.set('q', state.searchQuery)
  if (state.focusNodeId) params.set('focus', state.focusNodeId)
  // Focusing a node also selects it (see handleSetFocus), so `selected` only
  // needs to appear when it points somewhere focus doesn't.
  if (state.selectedNodeId && state.selectedNodeId !== state.focusNodeId)
    params.set('selected', state.selectedNodeId)

  for (const def of defs) {
    if (isAtDefault(state.filters, def)) continue
    params.set(
      def.urlParam,
      toUrlValues(def, state.filters[def.id] ?? [])
        .map(encodeToken)
        .join(','),
    )
  }

  return params
}

/**
 * Inverse of {@link encodeViewState}. Unrecognized or missing params fall back
 * to `defaults` filter-by-filter, so a hand-edited or partial URL never
 * produces an invalid filter state. Node ids (`focus`/`selected`) are returned
 * as-is — the caller is responsible for checking they still exist in the
 * current schema, since a shared link can outlive the type it points to.
 */
export function decodeViewState(
  search: string | URLSearchParams,
  defs: readonly FilterDef[],
  defaults: FilterValues,
): ShareableViewState {
  const params = new URLSearchParams(search)

  const raw: Record<string, readonly string[] | undefined> = {}
  for (const def of defs) {
    const value = params.get(def.urlParam)
    raw[def.id] =
      value === null
        ? defaults[def.id]
        : fromUrlValues(def, value.split(',').filter(Boolean).map(decodeToken))
  }

  const focusNodeId = params.get('focus') || null

  return {
    searchQuery: params.get('q') ?? '',
    focusNodeId,
    selectedNodeId: params.get('selected') || focusNodeId,
    filters: sanitizeFilterValues(raw, defs),
  }
}

/**
 * A single `[key, value]` search param, structurally identical to Sanity
 * router's `SearchParam` but declared here so this module stays free of
 * Studio imports.
 */
export type SearchParamPair = [key: string, value: string]

/**
 * The param names this module writes itself. A filter's `urlParam` must not
 * collide with one — `resolveConfig` checks against this list, so the two
 * can't drift.
 */
export const RESERVED_URL_PARAMS: readonly string[] = ['q', 'focus', 'selected']

/** Every param name {@link encodeViewState} may write, filters included. */
function viewStateParamNames(defs: readonly FilterDef[]): string[] {
  return [...RESERVED_URL_PARAMS, ...defs.map((def) => def.urlParam)]
}

/**
 * The params this plugin owns, in the order they appear. Comparing two router
 * updates on this slice alone tells a change to the view state from a change
 * to someone else's params, which the plugin has no business reacting to.
 */
export function ownedViewStateParams(
  params: readonly SearchParamPair[],
  defs: readonly FilterDef[],
): SearchParamPair[] {
  const owned = new Set(viewStateParamNames(defs))
  return params.filter(([key]) => owned.has(key))
}

/**
 * Folds encoded view state into the params the router is already carrying.
 *
 * Only the names this plugin owns are replaced; anything else — the Studio's
 * own params, another plugin's — keeps its value *and* its position, so a
 * filter toggle here never disturbs state belonging to someone else.
 */
export function mergeViewStateParams(
  current: readonly SearchParamPair[],
  encoded: URLSearchParams,
  defs: readonly FilterDef[],
): SearchParamPair[] {
  const owned = new Set(viewStateParamNames(defs))
  return [...current.filter(([key]) => !owned.has(key)), ...encoded]
}

/**
 * Order-insensitive equality (same pairs, duplicates included), used to skip a
 * navigation that wouldn't change anything — the sync effect runs on every
 * router update, including the ones it caused itself. Ignoring order matters:
 * `mergeViewStateParams` appends owned params at the end, so a router that
 * normalized or reordered `_searchParams` would otherwise make every update
 * look like a change and trap the effect in a `replace` loop.
 */
export function sameSearchParams(
  a: readonly SearchParamPair[],
  b: readonly SearchParamPair[],
): boolean {
  if (a.length !== b.length) return false
  // JSON-encoded pairs, so a `=` or `,` inside a key or value can't make two
  // different pair lists serialize identically.
  const sort = (pairs: readonly SearchParamPair[]) =>
    pairs.map(([key, value]) => JSON.stringify([key, value])).sort()
  const sortedA = sort(a)
  const sortedB = sort(b)
  return sortedA.every((pair, i) => pair === sortedB[i])
}
