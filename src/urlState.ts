import {
  fromUrlValues,
  isAtDefault,
  sanitizeFilterValues,
  toUrlValues,
  type FilterDef,
  type FilterValues,
} from './filters'

/** Tokens are percent-encoded before comma-joining, so a custom value with a comma survives. */
const encodeToken = encodeURIComponent

function decodeToken(token: string): string {
  try {
    return decodeURIComponent(token)
  } catch {
    // A stray `%` passes through raw for `sanitizeFilterValues` to judge.
    return token
  }
}

export interface ShareableViewState {
  searchQuery: string
  filters: FilterValues
  focusNodeId: string | null
  selectedNodeId: string | null
}

/** Only filters that differ from their default are written, so a default view has a clean URL. */
export function encodeViewState(
  state: ShareableViewState,
  defs: readonly FilterDef[],
): URLSearchParams {
  const params = new URLSearchParams()

  if (state.searchQuery) params.set('q', state.searchQuery)
  if (state.focusNodeId) params.set('focus', state.focusNodeId)
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

/** Node ids come back as-is: the caller checks they still exist. */
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

/** Sanity router's `SearchParam`, declared here to keep this module free of Studio imports. */
export type SearchParamPair = [key: string, value: string]

export const RESERVED_URL_PARAMS: readonly string[] = ['q', 'focus', 'selected']

function viewStateParamNames(defs: readonly FilterDef[]): string[] {
  return [...RESERVED_URL_PARAMS, ...defs.map((def) => def.urlParam)]
}

export function ownedViewStateParams(
  params: readonly SearchParamPair[],
  defs: readonly FilterDef[],
): SearchParamPair[] {
  const owned = new Set(viewStateParamNames(defs))
  return params.filter(([key]) => owned.has(key))
}

/** Replaces only the params this plugin owns; everyone else's keep their value and position. */
export function mergeViewStateParams(
  current: readonly SearchParamPair[],
  encoded: URLSearchParams,
  defs: readonly FilterDef[],
): SearchParamPair[] {
  const owned = new Set(viewStateParamNames(defs))
  return [...current.filter(([key]) => !owned.has(key)), ...encoded]
}

/** Order-insensitive: a router that reorders params would loop the sync effect otherwise. */
export function sameSearchParams(
  a: readonly SearchParamPair[],
  b: readonly SearchParamPair[],
): boolean {
  if (a.length !== b.length) return false
  const sort = (pairs: readonly SearchParamPair[]) =>
    pairs.map(([key, value]) => JSON.stringify([key, value])).sort()
  const sortedA = sort(a)
  const sortedB = sort(b)
  return sortedA.every((pair, i) => pair === sortedB[i])
}
