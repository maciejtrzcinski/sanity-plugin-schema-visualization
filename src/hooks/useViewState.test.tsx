// @vitest-environment jsdom
/**
 * The router here is the real Studio one, driven by a harness that holds its
 * state the way the Studio provider does: `navigate` calls arrive as a path,
 * are decoded back into router state and re-render. A test can also push state
 * in without going through the hook, which is how a browser back, an intent or
 * a link into the tool reaches it — the case the hook has to tell apart from
 * its own writes.
 */
import {act, renderHook} from '@testing-library/react'
import {useSyncExternalStore, type ReactNode} from 'react'
import {route, RouterProvider, type RouterState} from 'sanity/router'
import {beforeEach, describe, expect, it} from 'vitest'

import {graph, makeFilterContext} from '../../test/fixtures'
import {ConfigProvider} from '../config'
import {
  INITIAL_DOCUMENT_COUNTS_STATE,
  type DocumentCountsState,
  type StoredDocumentCounts,
} from '../documentCounts'
import {createDefaultFilters, defaultFilterValues} from '../filters'
import type {SessionPrefs, ViewPrefs} from '../viewPrefs'
import {usePersistedViewPrefs, useViewState} from './useViewState'

const router = route.create('/')
const systemFilter = createDefaultFilters().find((def) => def.id === 'system')!

/** The history the harness renders from: a store, so nothing is set in render. */
const listeners = new Set<() => void>()
let routerState: RouterState = {}
let navigations: string[] = []

function setRouterState(next: RouterState) {
  routerState = next
  for (const listener of listeners) listener()
}

/** A navigation the hook didn't make. */
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
    // Focus implies selection, so `selected` doesn't have to be in the link.
    expect(result.current.selectedNodeId).toBe('post')
    expect(result.current.filters.system).toEqual(['1'])
    // Nothing to correct, so the hook leaves the URL alone.
    expect(navigations).toEqual([])
  })

  it('drops a focus the graph cannot show', () => {
    // A link that outlived its type, and one pointing at a system type while
    // the system filter (at its default) hides it.
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

    // A browser back over that `replace`, an intent, a link into the tool:
    // whatever the router now holds is the view, and the stale focus must not
    // be replaced back over it.
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
    // No adoption, and no navigation that would drop the foreign param.
    expect(navigations).toHaveLength(written)
  })
})

/**
 * The write-back half. `saveViewPrefs`/`loadViewPrefs` are covered directly in
 * `src/viewPrefs.test.ts` — what's asserted here is *when* this hook decides
 * there is something worth writing, which is where a cached result can be lost.
 */
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
  /** What `loaded` persists as. */
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

  /**
   * The bug this guards: clicking Refresh takes the state through `loading`,
   * where `counts` is whatever the hook holds and there is nothing worth
   * persisting. Writing that transition would replace a good cache with an
   * empty one, and the next session would start blank for no reason.
   */
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

    // A load that does land replaces them.
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

  /**
   * `documentCounts` is a fresh object on every status change, so the effect
   * re-runs for each of them. Without the hook's own "is any of this new?"
   * check, a button that only ever transitions loading → error → loading would
   * write the same bytes back to disk on every click.
   *
   * Asserted through a sentinel rather than a spy: jsdom's `localStorage` is a
   * proxy, and a `vi.spyOn` on it never sees the hook's own `setItem`.
   */
  it('does not rewrite storage for a status change that persists nothing new', () => {
    const key = 'prefs:idempotent'
    const {rerender} = renderPersisted(key)
    rerender({documentCounts: loaded([['post', 47]])})

    window.localStorage.setItem(key, 'untouched')
    // Distinct objects each time — only the hook's own check can tell that none
    // of them says anything new.
    rerender({documentCounts: {status: 'loading', counts: new Map(), breakdown: new Map()}})
    rerender({
      documentCounts: {status: 'error', counts: new Map(), breakdown: new Map(), error: 'offline'},
    })
    rerender({documentCounts: {status: 'loading', counts: new Map(), breakdown: new Map()}})

    expect(window.localStorage.getItem(key)).toBe('untouched')

    // A load that does land writes again, sentinel or not.
    rerender({documentCounts: loaded([['post', 99]], 1700000999000)})
    expect(stored(key)?.cache.documentCounts).toEqual(persisted({post: 99}, 1700000999000))
  })
})
