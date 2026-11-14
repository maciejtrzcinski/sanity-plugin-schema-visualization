import {afterEach, describe, expect, it, vi} from 'vitest'

import {readStoredDocumentCounts} from './documentCounts'
import {createDefaultFilters, defaultFilterValues, type FilterValues} from './filters'
import {
  buildViewPrefsStorageKey,
  loadViewPrefs,
  safeLocalStorage,
  saveViewPrefs,
  type FeatureCache,
  type ViewPrefs,
  type ViewPrefsScope,
} from './viewPrefs'

function readCache(raw: Record<string, unknown>): FeatureCache {
  return {documentCounts: readStoredDocumentCounts(raw.documentCounts)}
}

function fakeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size
    },
  }
}

const scope: ViewPrefsScope = {
  projectId: 'abc123',
  dataset: 'production',
  workspaceName: 'default',
  basePath: '/',
  toolName: 'graph',
}

const defs = createDefaultFilters()

const filters: FilterValues = {
  ...defaultFilterValues(defs),
  kinds: ['document', 'object'],
  system: ['1'],
  health: ['issues'],
  connectivity: ['orphan'],
  deprecated: ['only'],
}

const prefs: ViewPrefs = {
  prefs: {compactMode: true, direction: 'TB', filters},
  cache: {
    documentCounts: {
      counts: {post: 47, author: 3},
      perspective: 'drafts',
      fetchedAt: 1700000000000,
    },
  },
}

describe('buildViewPrefsStorageKey', () => {
  it('differs when project, dataset, env, or tool name differ', () => {
    const base = buildViewPrefsStorageKey(scope)
    expect(buildViewPrefsStorageKey({...scope, projectId: 'other'})).not.toBe(base)
    expect(buildViewPrefsStorageKey({...scope, dataset: 'staging'})).not.toBe(base)
    expect(buildViewPrefsStorageKey({...scope, apiHost: 'https://staging.example.com'})).not.toBe(
      base,
    )
    expect(buildViewPrefsStorageKey({...scope, toolName: 'data-model'})).not.toBe(base)
  })

  it('is stable for the same scope', () => {
    expect(buildViewPrefsStorageKey(scope)).toBe(buildViewPrefsStorageKey({...scope}))
  })
})

describe('saveViewPrefs / loadViewPrefs', () => {
  it('round-trips everything, including document counts', () => {
    const storage = fakeStorage()
    const key = buildViewPrefsStorageKey(scope)
    saveViewPrefs(storage, key, prefs)

    const loaded = loadViewPrefs(storage, key, defs, readCache)
    expect(loaded?.prefs.compactMode).toBe(true)
    expect(loaded?.prefs.direction).toBe('TB')
    expect([...(loaded?.prefs.filters.kinds ?? [])].sort()).toEqual(['document', 'object'])
    expect(loaded?.prefs.filters.system).toEqual(['1'])
    expect(loaded?.prefs.filters.health).toEqual(['issues'])
    expect(loaded?.prefs.filters.connectivity).toEqual(['orphan'])
    expect(loaded?.prefs.filters.deprecated).toEqual(['only'])
    expect(loaded?.cache.documentCounts).toEqual({
      counts: {post: 47, author: 3},
      perspective: 'drafts',
      fetchedAt: 1700000000000,
    })
  })

  it('returns null for a missing key', () => {
    expect(loadViewPrefs(fakeStorage(), 'nope', defs, readCache)).toBeNull()
  })

  it('returns null for corrupted JSON instead of throwing', () => {
    const storage = fakeStorage()
    const key = buildViewPrefsStorageKey(scope)
    storage.setItem(key, '{not json')
    expect(loadViewPrefs(storage, key, defs, readCache)).toBeNull()
  })

  it('returns null for a stale storage version', () => {
    const storage = fakeStorage()
    const key = buildViewPrefsStorageKey(scope)
    storage.setItem(
      key,
      JSON.stringify({version: 999, compactMode: true, filters: {kinds: ['document']}}),
    )
    expect(loadViewPrefs(storage, key, defs, readCache)).toBeNull()
  })

  it('falls back per-field for unrecognized filter values without discarding the rest', () => {
    const storage = fakeStorage()
    const key = buildViewPrefsStorageKey(scope)
    storage.setItem(
      key,
      JSON.stringify({
        version: 3,
        prefs: {
          compactMode: true,
          direction: 'TB',
          filters: {
            kinds: ['document', 'bogus'],
            system: ['1'],
            health: ['nonsense'],
            notAFilter: ['whatever'],
          },
        },
        cache: {},
      }),
    )
    const loaded = loadViewPrefs(storage, key, defs, readCache)
    expect(loaded?.prefs.compactMode).toBe(true)
    expect([...(loaded?.prefs.filters.kinds ?? [])]).toEqual(['document'])
    expect(loaded?.prefs.filters.system).toEqual(['1'])
    expect(loaded?.prefs.filters.health).toEqual(['all'])
    expect(loaded?.prefs.filters.notAFilter).toBeUndefined()
  })

  it('drops an entry from the previous storage version rather than half-reading it', () => {
    const storage = fakeStorage()
    const key = buildViewPrefsStorageKey(scope)
    storage.setItem(
      key,
      JSON.stringify({
        version: 2,
        compactMode: true,
        direction: 'TB',
        filters: {kinds: ['document']},
        documentCounts: {counts: {post: 47}, fetchedAt: 1700000000000},
      }),
    )
    expect(loadViewPrefs(storage, key, defs, readCache)).toBeNull()
  })

  it('reads a missing prefs or cache record as empty rather than discarding the entry', () => {
    const storage = fakeStorage()
    const key = buildViewPrefsStorageKey(scope)
    storage.setItem(key, JSON.stringify({version: 3}))

    const loaded = loadViewPrefs(storage, key, defs, readCache)
    expect(loaded?.prefs.compactMode).toBe(false)
    expect(loaded?.prefs.direction).toBe('LR')
    expect(loaded?.cache.documentCounts).toBeUndefined()
  })

  it('stores whatever the cache reader returns, without validating the slice', () => {
    const storage = fakeStorage()
    const key = buildViewPrefsStorageKey(scope)
    let seen: unknown
    storage.setItem(
      key,
      JSON.stringify({version: 3, prefs: {}, cache: {anythingAtAll: {nested: 1}}}),
    )

    const loaded = loadViewPrefs(storage, key, defs, (raw) => {
      seen = raw
      return {documentCounts: {counts: {invented: 1}, perspective: 'drafts', fetchedAt: 42}}
    })

    expect(seen).toEqual({anythingAtAll: {nested: 1}})
    expect(loaded?.cache.documentCounts).toEqual({
      counts: {invented: 1},
      perspective: 'drafts',
      fetchedAt: 42,
    })
  })

  it('does not throw when storage access is denied', () => {
    const throwingStorage: Storage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    }
    expect(() => saveViewPrefs(throwingStorage, 'key', prefs)).not.toThrow()
    expect(loadViewPrefs(throwingStorage, 'key', defs, readCache)).toBeNull()
  })

  it('loads nothing and saves nothing without storage', () => {
    expect(loadViewPrefs(null, 'key', defs, readCache)).toBeNull()
    expect(() => saveViewPrefs(null, 'key', prefs)).not.toThrow()
  })
})

describe('safeLocalStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is null outside a browser', () => {
    expect(safeLocalStorage()).toBeNull()
  })

  it('is null when reading `window.localStorage` throws', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new DOMException('denied', 'SecurityError')
      },
    })
    expect(safeLocalStorage()).toBeNull()
  })

  it('hands back the browser’s storage when it can be read', () => {
    const storage = fakeStorage()
    vi.stubGlobal('window', {localStorage: storage})
    expect(safeLocalStorage()).toBe(storage)
  })
})
