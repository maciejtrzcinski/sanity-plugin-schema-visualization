import {useCallback, useEffect, useMemo, useReducer, useRef, useState} from 'react'
import {useRouter} from 'sanity/router'

import {useConfig} from '../config'
import {
  readStoredDocumentCounts,
  type DocumentCountsState,
  type StoredDocumentCounts,
} from '../documentCounts'
import {
  nodeMatchesFilters,
  setFilterValue as setOne,
  toggleFilterValue as toggleOne,
  type FilterContext,
  type FilterDef,
  type FilterValues,
} from '../filters'
import type {GraphNode} from '../types'
import {
  decodeViewState,
  encodeViewState,
  mergeViewStateParams,
  ownedViewStateParams,
  sameSearchParams,
  type SearchParamPair,
  type ShareableViewState,
} from '../urlState'
import {
  loadViewPrefs,
  saveViewPrefs,
  type FeatureCache,
  type SessionPrefs,
  type ViewPrefs,
} from '../viewPrefs'

export interface ViewState {
  searchQuery: string
  setSearchQuery: (value: string) => void
  filters: FilterValues
  toggleFilterValue: (def: FilterDef, value: string) => void
  setFilterValue: (def: FilterDef, value: string) => void
  clearFilters: () => void
  direction: 'LR' | 'TB'
  setDirection: (value: 'LR' | 'TB') => void
  compactMode: boolean
  setCompactMode: (value: boolean) => void
  selectedNodeId: string | null
  setSelectedNodeId: (id: string | null) => void
  focusNodeId: string | null
  setFocus: (id: string | null) => void
  expandedNodeIds: Set<string>
  toggleExpanded: (nodeId: string) => void
  relayoutToken: number
  relayout: () => void
  /** Prefs to persist, for {@link usePersistedViewPrefs}. */
  persistable: SessionPrefs
}

/**
 * Filters, focus and selection kept in one reducer so `setFocus` can set focus
 * and selection together in a single commit, and so the toolbar callbacks that
 * drive it (`toggleFilterValue` and friends) never close over
 * `focusNodeId`/`selectedNodeId` and so keep a stable identity across renders —
 * the toolbar has ~20 of these and re-renders on any change.
 */
interface CoreState {
  filters: FilterValues
  focusNodeId: string | null
  selectedNodeId: string | null
}

type CoreAction =
  | {type: 'changeFilters'; compute: (current: FilterValues) => FilterValues}
  | {type: 'setFocus'; id: string | null}
  | {type: 'setSelectedNodeId'; id: string | null}
  | {type: 'adopt'; state: CoreState}

/**
 * A filter change never clears focus or selection: a pick made from the
 * toolbar's "types & connections" combobox (or a click on the canvas) stays
 * put while the user narrows the graph around it. The canvas keeps a
 * focused/selected node on screen even when the active filters would otherwise
 * hide it (see `visibleGraph` in `GraphCanvas`), so nothing is left pointing
 * at something that isn't there.
 */
function coreReducer(state: CoreState, action: CoreAction): CoreState {
  switch (action.type) {
    case 'changeFilters':
      return {...state, filters: action.compute(state.filters)}
    case 'setFocus':
      // Focusing a node selects it too; clearing focus leaves the selection be.
      return {...state, focusNodeId: action.id, selectedNodeId: action.id ?? state.selectedNodeId}
    case 'setSelectedNodeId':
      return {...state, selectedNodeId: action.id}
    // A URL that moved on its own replaces all three at once: they were
    // decoded from one set of params and have to land in one commit.
    case 'adopt':
      return action.state
    default:
      return state
  }
}

/**
 * Drops a focus or selection the canvas couldn't act on: a link can outlive the
 * type it points at, or point at one the filters it carries hide (a system type
 * while the system filter is off).
 */
function visibleIds(
  state: ShareableViewState,
  nodes: readonly GraphNode[],
  defs: readonly FilterDef[],
  ctx: FilterContext,
): {focusNodeId: string | null; selectedNodeId: string | null} {
  const visible = (id: string | null) => {
    const node = id ? nodes.find((n) => n.id === id) : undefined
    return node && nodeMatchesFilters(node, state.filters, defs, ctx) ? node.id : null
  }
  return {focusNodeId: visible(state.focusNodeId), selectedNodeId: visible(state.selectedNodeId)}
}

/**
 * All the view state the toolbar and canvas share: what's searched, filtered,
 * focused, selected and expanded.
 *
 * Initial values are layered — hardcoded defaults, then last session's stored
 * preferences, then whatever the URL carries. An explicit shared link always
 * wins over a stored personal default.
 *
 * The URL stays a live input after mount, not just a seed: params that change
 * from outside this hook are adopted (see the sync effect).
 */
export function useViewState({
  nodes,
  filterContext,
  storedPrefs,
}: {
  nodes: readonly GraphNode[]
  filterContext: FilterContext
  storedPrefs: ViewPrefs | null
}): ViewState {
  const {filters: filterDefs, defaults} = useConfig()
  // Scoped to this tool by the `RouteScope` Studio wraps every tool in, so the
  // params read and written here are namespaced under the tool name and can't
  // collide with the Studio's or another plugin's.
  const router = useRouter()

  const [initial] = useState(() => {
    const params = router.state._searchParams ?? []
    const decoded = decodeViewState(
      new URLSearchParams(params),
      filterDefs,
      storedPrefs?.prefs.filters ?? defaults.filters,
    )
    return {
      ...decoded,
      ...visibleIds(decoded, nodes, filterDefs, filterContext),
      ownedParams: ownedViewStateParams(params, filterDefs),
    }
  })

  const [searchQuery, setSearchQuery] = useState(initial.searchQuery)
  const [direction, setDirection] = useState<'LR' | 'TB'>(
    storedPrefs?.prefs.direction ?? defaults.direction,
  )
  const [compactMode, setCompactModeState] = useState(
    storedPrefs?.prefs.compactMode ?? defaults.compactMode,
  )
  const [{filters, focusNodeId, selectedNodeId}, dispatch] = useReducer(
    coreReducer,
    undefined,
    () => ({
      filters: initial.filters,
      focusNodeId: initial.focusNodeId,
      selectedNodeId: initial.selectedNodeId,
    }),
  )
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set())
  const [relayoutToken, setRelayoutToken] = useState(0)

  // Read fresh at dispatch time so `clearFilters` can stay `[]`-stable.
  // Updated after every commit; event handlers only ever fire post-commit, so
  // `.current` is never stale.
  const defaultFiltersRef = useRef(defaults.filters)
  useEffect(() => {
    defaultFiltersRef.current = defaults.filters
  })

  // The owned params as this hook last left them — written below, or adopted
  // from the router. A router update that disagrees with them changed the URL
  // from somewhere else, which is what tells the two directions apart.
  const syncedParamsRef = useRef<readonly SearchParamPair[]>(initial.ownedParams)

  // Keeps the URL and the shareable slice of view state in step, whichever of
  // the two moved: a local change is written to the URL, so the address bar
  // always reflects a link that reproduces what's on screen, and a URL that
  // changed on its own is adopted, so the plugin doesn't overwrite a
  // navigation it didn't make.
  //
  // Writing goes through the router rather than `history.replaceState`: the
  // Studio router owns the query string and re-derives it from its own state
  // on every navigation, so writing to history directly would both drop the
  // params it holds and be undone the next time anything else navigates.
  useEffect(() => {
    const current = router.state._searchParams ?? []
    const currentOwned = ownedViewStateParams(current, filterDefs)
    const encoded = encodeViewState({searchQuery, filters, focusNodeId, selectedNodeId}, filterDefs)

    // The effect re-runs on every router update, including the ones it caused
    // itself — bail out unless the two sides actually disagree.
    if (sameSearchParams(currentOwned, [...encoded])) {
      syncedParamsRef.current = currentOwned
      return
    }

    // Params nobody here wrote: a back navigation over one of the `replace`s
    // below, an intent, a link into this tool carrying a different view. The
    // URL wins — replacing it with the state on screen is what made those
    // navigations look ignored.
    if (!sameSearchParams(currentOwned, syncedParamsRef.current)) {
      syncedParamsRef.current = currentOwned
      // Filters missing from the URL fall back to the configured defaults, not
      // to the stored preferences as on mount: arriving at a link that carries
      // no filters should show what `clearFilters` shows, not whatever this
      // browser last persisted.
      const decoded = decodeViewState(
        new URLSearchParams(current),
        filterDefs,
        defaultFiltersRef.current,
      )
      setSearchQuery(decoded.searchQuery)
      dispatch({
        type: 'adopt',
        state: {
          filters: decoded.filters,
          ...visibleIds(decoded, nodes, filterDefs, filterContext),
        },
      })
      return
    }

    syncedParamsRef.current = [...encoded]
    const next = mergeViewStateParams(current, encoded, filterDefs)
    router.navigate({...router.state, _searchParams: next}, {replace: true})
  }, [searchQuery, filters, focusNodeId, selectedNodeId, filterDefs, router, nodes, filterContext])

  const setSelectedNodeId = useCallback(
    (id: string | null) => dispatch({type: 'setSelectedNodeId', id}),
    [],
  )

  const setFocus = useCallback((id: string | null) => dispatch({type: 'setFocus', id}), [])

  // `compute` defers reading the current filters to the reducer, keeping these
  // callbacks free of a `filters` dependency.
  const changeFilters = useCallback(
    (compute: (current: FilterValues) => FilterValues) =>
      dispatch({type: 'changeFilters', compute}),
    [],
  )

  const toggleFilterValue = useCallback(
    (def: FilterDef, value: string) => changeFilters((current) => toggleOne(current, def, value)),
    [changeFilters],
  )

  const setFilterValue = useCallback(
    (def: FilterDef, value: string) => changeFilters((current) => setOne(current, def, value)),
    [changeFilters],
  )

  const clearFilters = useCallback(
    () => changeFilters(() => defaultFiltersRef.current),
    [changeFilters],
  )

  const toggleExpanded = useCallback((nodeId: string) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  // Switching compact mode resets per-node overrides, which only make sense
  // relative to the mode they were made in.
  const setCompactMode = useCallback((value: boolean) => {
    setCompactModeState(value)
    setExpandedNodeIds(new Set())
  }, [])

  const relayout = useCallback(() => setRelayoutToken((t) => t + 1), [])

  // Memoized: this is an effect dependency in `usePersistedViewPrefs`, and a
  // fresh object every render would write to localStorage every render.
  const persistable = useMemo(
    () => ({compactMode, direction, filters}),
    [compactMode, direction, filters],
  )

  return {
    searchQuery,
    setSearchQuery,
    filters,
    toggleFilterValue,
    setFilterValue,
    clearFilters,
    direction,
    setDirection,
    compactMode,
    setCompactMode,
    selectedNodeId,
    setSelectedNodeId,
    focusNodeId,
    setFocus,
    expandedNodeIds,
    toggleExpanded,
    relayoutToken,
    relayout,
    persistable,
  }
}

/**
 * Hands each feature its own slice of the stored cache to validate. One entry
 * today; a second feature adds a line here and a validator of its own, and
 * `viewPrefs.ts` is untouched either way.
 */
function readFeatureCache(raw: Record<string, unknown>): FeatureCache {
  return {documentCounts: readStoredDocumentCounts(raw.documentCounts)}
}

/** Reads stored preferences once, on mount. */
export function useStoredViewPrefs(storageKey: string): ViewPrefs | null {
  const {filters: filterDefs} = useConfig()
  const [prefs] = useState(() =>
    loadViewPrefs(window.localStorage, storageKey, filterDefs, readFeatureCache),
  )
  return prefs
}

/**
 * Writes preferences back whenever they change. A ref holds the last
 * successfully loaded document counts, so a transient loading/error state
 * during a refresh click doesn't overwrite a cached result with nothing.
 */
export function usePersistedViewPrefs({
  storageKey,
  prefs,
  documentCounts,
  initialDocumentCounts,
}: {
  storageKey: string
  prefs: SessionPrefs
  documentCounts: DocumentCountsState
  initialDocumentCounts?: StoredDocumentCounts
}): void {
  const lastLoadedRef = useRef<StoredDocumentCounts | undefined>(initialDocumentCounts)
  const lastSavedRef = useRef<{
    storageKey: string
    prefs: SessionPrefs
    documentCounts: StoredDocumentCounts | undefined
  } | null>(null)

  useEffect(() => {
    if (documentCounts.status === 'loaded' && documentCounts.perspective !== undefined) {
      lastLoadedRef.current = {
        counts: Object.fromEntries(documentCounts.counts),
        breakdown: Object.fromEntries(documentCounts.breakdown),
        perspective: documentCounts.perspective,
        fetchedAt: documentCounts.fetchedAt ?? Date.now(),
      }
    }
    // A loading/error transition changes `documentCounts` without changing
    // anything worth writing, so skip the save unless something did.
    const last = lastSavedRef.current
    if (
      last &&
      last.storageKey === storageKey &&
      last.prefs === prefs &&
      last.documentCounts === lastLoadedRef.current
    ) {
      return
    }
    lastSavedRef.current = {storageKey, prefs, documentCounts: lastLoadedRef.current}
    saveViewPrefs(window.localStorage, storageKey, {
      prefs,
      cache: {documentCounts: lastLoadedRef.current},
    })
  }, [storageKey, prefs, documentCounts])
}
