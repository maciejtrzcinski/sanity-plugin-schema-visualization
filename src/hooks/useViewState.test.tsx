// @vitest-environment jsdom
import {act, renderHook} from '@testing-library/react'
import {useSyncExternalStore, type ReactNode} from 'react'
import {route, RouterProvider, type RouterState} from 'sanity/router'
import {beforeEach, describe, expect, it, onTestFinished} from 'vitest'

import {graph, makeFilterContext} from '../../test/fixtures'
import {ConfigProvider} from '../config'
import {
  INITIAL_DOCUMENT_COUNTS_STATE,
  type DocumentCountsState,
  type StoredDocumentCounts,
} from '../documentCounts'
import {createDefaultFilters, defaultFilterValues} from '../filters'
import {saveViewPrefs, type SessionPrefs, type ViewPrefs} from '../viewPrefs'
import {usePersistedViewPrefs, useStoredViewPrefs, useViewState} from './useViewState'

const router = route.create('/')
const systemFilter = createDefaultFilters().find((def) => def.id === 'system')!

const listeners = new Set<() => void>()
let routerState: RouterState = {}
let navigations: string[] = []

function setRouterState(next: RouterState) {
  routerState = next
  for (const listener of listeners) listener()
}

function navigateOutside(next: RouterState) {
  act(() => setRouterState(next))
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

beforeEach(() => {
  navigations = []
  routerState = {}
})

function Wrapper({children}: {children: ReactNode}) {
  const state = useSyncExternalStore(subscribe, () => routerState)
  return (
    <RouterProvider
      router={router}
      state={state}
      onNavigate={({path}) => {
        navigations.push(path)
        setRouterState(router.decode(path) ?? {})
      }}
    >
      <ConfigProvider options={{}}>{children}</ConfigProvider>
    </RouterProvider>
  )
}

/** What a browser does with site data blocked: reading `localStorage` at all throws. */
function blockStorage() {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('denied', 'SecurityError')
    },
  })
  onTestFinished(() => {
    if (original) Object.defineProperty(window, 'localStorage', original)
    else Reflect.deleteProperty(window, 'localStorage')
  })
}

function renderViewState(initialState: RouterState = {}) {
  routerState = initialState
  return renderHook(
    () =>
      useViewState({
        nodes: graph.nodes,
        filterContext: makeFilterContext(),
        storedPrefs: null,
      }),
    {wrapper: Wrapper},
  )
}

describe('useViewState', () => {
  it('starts from the params the URL carries', () => {
    const {result} = renderViewState({
      _searchParams: [
        ['q', 'hero'],
        ['focus', 'post'],
        ['system', '1'],
      ],
    })

    expect(result.current.searchQuery).toBe('hero')
    expect(result.current.focusNodeId).toBe('post')
    expect(result.current.selectedNodeId).toBe('post')
    expect(result.current.filters.system).toEqual(['1'])
    expect(navigations).toEqual([])
  })

  it('drops a focus the graph cannot show', () => {
    const gone = renderViewState({_searchParams: [['focus', 'ghost']]})
    expect(gone.result.current.focusNodeId).toBeNull()
    gone.unmount()

    const hidden = renderViewState({_searchParams: [['focus', 'sanity.imageAsset']]})
    expect(hidden.result.current.focusNodeId).toBeNull()
  })

  it('writes local changes back to the URL', () => {
    const {result} = renderViewState()

    act(() => result.current.setSearchQuery('hero'))

    expect(navigations.at(-1)).toBe('/?q=hero')
  })

  it('adopts params that changed outside the hook', () => {
    const {result} = renderViewState()
    act(() => result.current.setFocus('post'))
    expect(navigations.at(-1)).toBe('/?focus=post')

    navigateOutside({_searchParams: [['q', 'author']]})

    expect(result.current.searchQuery).toBe('author')
    expect(result.current.focusNodeId).toBeNull()
    expect(result.current.selectedNodeId).toBeNull()
    expect(navigations.at(-1)).toBe('/?focus=post')
  })

  it('returns to the default view when the params go away', () => {
    const {result} = renderViewState()
    act(() => result.current.setFilterValue(systemFilter, '1'))
    act(() => result.current.setSearchQuery('hero'))

    navigateOutside({})

    expect(result.current.searchQuery).toBe('')
    expect(result.current.filters.system).toEqual(['0'])
  })

  it('ignores a router update that only touches someone else’s params', () => {
    const {result} = renderViewState()
    act(() => result.current.setSearchQuery('hero'))
    const written = navigations.length

    navigateOutside({
      _searchParams: [
        ['q', 'hero'],
        ['perspective', 'drafts'],
      ],
    })

    expect(result.current.searchQuery).toBe('hero')
    expect(navigations).toHaveLength(written)
  })
})

describe('usePersistedViewPrefs', () => {
  const prefs: SessionPrefs = {
    compactMode: false,
    direction: 'LR',
    filters: defaultFilterValues(createDefaultFilters()),
  }

  const loaded = (counts: Array<[string, number]>, fetchedAt = 1700000000000) => ({
    status: 'loaded' as const,
    counts: new Map(counts),
    breakdown: new Map(),
    perspective: 'drafts',
    fetchedAt,
  })
  const persisted = (counts: Record<string, number>, fetchedAt = 1700000000000) => ({
    counts,
    breakdown: {},
    perspective: 'drafts',
    fetchedAt,
  })

  function renderPersisted(storageKey: string, initial?: StoredDocumentCounts) {
    return renderHook(
      ({documentCounts}: {documentCounts: DocumentCountsState}) =>
        usePersistedViewPrefs({
          storageKey,
          prefs,
          documentCounts,
          initialDocumentCounts: initial,
        }),
      {
        wrapper: Wrapper,
        initialProps: {documentCounts: INITIAL_DOCUMENT_COUNTS_STATE},
      },
    )
  }

  function stored(key: string): ViewPrefs | null {
    const raw = window.localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  }

  beforeEach(() => window.localStorage.clear())

  it('writes the preferences and the counts a load produced', () => {
    const key = 'prefs:write'
    const {rerender} = renderPersisted(key)

    expect(stored(key)?.cache.documentCounts).toBeUndefined()

    rerender({documentCounts: loaded([['post', 47]])})

    expect(stored(key)).toMatchObject({
      prefs: {compactMode: false, direction: 'LR'},
      cache: {documentCounts: persisted({post: 47})},
    })
  })

  it('keeps the cached counts through a refresh that has not landed yet', () => {
    const key = 'prefs:refresh'
    const {rerender} = renderPersisted(key)
    rerender({documentCounts: loaded([['post', 47]])})

    rerender({documentCounts: {status: 'loading', counts: new Map(), breakdown: new Map()}})
    expect(stored(key)?.cache.documentCounts).toEqual(persisted({post: 47}))

    rerender({
      documentCounts: {
        status: 'error',
        counts: new Map(),
        breakdown: new Map(),
        error: 'Request timed out',
      },
    })
    expect(stored(key)?.cache.documentCounts).toEqual(persisted({post: 47}))

    rerender({documentCounts: loaded([['post', 48]], 1700000060000)})
    expect(stored(key)?.cache.documentCounts).toEqual(persisted({post: 48}, 1700000060000))
  })

  it('carries a cache restored from a previous session through a failed first load', () => {
    const key = 'prefs:restored'
    const restored = {counts: {post: 12}, perspective: 'drafts', fetchedAt: 1699999000000}
    const {rerender} = renderPersisted(key, restored)

    rerender({
      documentCounts: {status: 'error', counts: new Map(), breakdown: new Map(), error: 'offline'},
    })

    expect(stored(key)?.cache.documentCounts).toEqual(restored)
  })

  /** A sentinel, not a spy: `vi.spyOn` on jsdom's `localStorage` proxy never sees `setItem`. */
  it('does not rewrite storage for a status change that persists nothing new', () => {
    const key = 'prefs:idempotent'
    const {rerender} = renderPersisted(key)
    rerender({documentCounts: loaded([['post', 47]])})

    window.localStorage.setItem(key, 'untouched')
    rerender({documentCounts: {status: 'loading', counts: new Map(), breakdown: new Map()}})
    rerender({
      documentCounts: {status: 'error', counts: new Map(), breakdown: new Map(), error: 'offline'},
    })
    rerender({documentCounts: {status: 'loading', counts: new Map(), breakdown: new Map()}})

    expect(window.localStorage.getItem(key)).toBe('untouched')

    rerender({documentCounts: loaded([['post', 99]], 1700000999000)})
    expect(stored(key)?.cache.documentCounts).toEqual(persisted({post: 99}, 1700000999000))
  })

  it('keeps going when site data is blocked and nothing can be saved', () => {
    blockStorage()
    const {rerender} = renderPersisted('prefs:blocked')

    expect(() => rerender({documentCounts: loaded([['post', 47]])})).not.toThrow()
  })
})

describe('useStoredViewPrefs', () => {
  it('finds nothing when site data is blocked, so the view starts from the defaults', () => {
    blockStorage()
    const {result} = renderHook(
      () => {
        const storedPrefs = useStoredViewPrefs('prefs:blocked')
        const view = useViewState({
          nodes: graph.nodes,
          filterContext: makeFilterContext(),
          storedPrefs,
        })
        return {storedPrefs, view}
      },
      {wrapper: Wrapper},
    )

    expect(result.current.storedPrefs).toBeNull()
    expect(result.current.view).toMatchObject({
      filters: defaultFilterValues(createDefaultFilters()),
      direction: 'LR',
      compactMode: false,
    })
  })

  it('reads back what was saved under the same key', () => {
    const key = 'prefs:round-trip'
    const filters = defaultFilterValues(createDefaultFilters())
    saveViewPrefs(window.localStorage, key, {
      prefs: {compactMode: true, direction: 'TB', filters},
      cache: {},
    })

    const {result} = renderHook(() => useStoredViewPrefs(key), {wrapper: Wrapper})

    expect(result.current?.prefs).toMatchObject({compactMode: true, direction: 'TB'})
  })
})
