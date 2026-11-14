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
  safeLocalStorage,
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
  persistable: SessionPrefs
}

/** One reducer, so `setFocus` commits both at once and the toolbar callbacks stay stable. */
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

/** A filter change never clears focus or selection; the canvas keeps them on screen. */
function coreReducer(state: CoreState, action: CoreAction): CoreState {
  switch (action.type) {
    case 'changeFilters':
      return {...state, filters: action.compute(state.filters)}
    case 'setFocus':
      return {...state, focusNodeId: action.id, selectedNodeId: action.id ?? state.selectedNodeId}
    case 'setSelectedNodeId':
      return {...state, selectedNodeId: action.id}
    case 'adopt':
      return action.state
    default:
      return state
  }
}

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

/** Defaults, then stored prefs, then the URL — which stays a live input after mount. */
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

  // Read at dispatch time so `clearFilters` stays stable.
  const defaultFiltersRef = useRef(defaults.filters)
  useEffect(() => {
    defaultFiltersRef.current = defaults.filters
  })

  // Owned params as last written or adopted; a router update that differs came from elsewhere.
  const syncedParamsRef = useRef<readonly SearchParamPair[]>(initial.ownedParams)

  // Writes local changes to the URL and adopts outside ones. Through the router, not
  // `history.replaceState`: the router re-derives the query string from its own state.
  useEffect(() => {
    const current = router.state._searchParams ?? []
    const currentOwned = ownedViewStateParams(current, filterDefs)
    const encoded = encodeViewState({searchQuery, filters, focusNodeId, selectedNodeId}, filterDefs)

    if (sameSearchParams(currentOwned, [...encoded])) {
      syncedParamsRef.current = currentOwned
      return
    }

    // Params nobody here wrote (back navigation, an intent, a link): the URL wins.
    if (!sameSearchParams(currentOwned, syncedParamsRef.current)) {
      syncedParamsRef.current = currentOwned
      // Missing filters fall back to configured defaults, not stored prefs, as `clearFilters` does.
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

  const setCompactMode = useCallback((value: boolean) => {
    setCompactModeState(value)
    setExpandedNodeIds(new Set())
  }, [])

  const relayout = useCallback(() => setRelayoutToken((t) => t + 1), [])

  // Memoized: an effect dependency, so a fresh object would write storage every render.
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

function readFeatureCache(raw: Record<string, unknown>): FeatureCache {
  return {documentCounts: readStoredDocumentCounts(raw.documentCounts)}
}

export function useStoredViewPrefs(storageKey: string): ViewPrefs | null {
  const {filters: filterDefs} = useConfig()
  const [prefs] = useState(() =>
    loadViewPrefs(safeLocalStorage(), storageKey, filterDefs, readFeatureCache),
  )
  return prefs
}

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
    // A loading/error transition has nothing new to write.
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
    saveViewPrefs(safeLocalStorage(), storageKey, {
      prefs,
      cache: {documentCounts: lastLoadedRef.current},
    })
  }, [storageKey, prefs, documentCounts])
}
