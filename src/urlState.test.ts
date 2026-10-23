import {describe, expect, it} from 'vitest'

import {createDefaultFilters, defaultFilterValues} from './filters'
import {
  decodeViewState,
  encodeViewState,
  mergeViewStateParams,
  ownedViewStateParams,
  sameSearchParams,
  type SearchParamPair,
  type ShareableViewState,
} from './urlState'

const defs = createDefaultFilters()
const defaults = defaultFilterValues(defs)

function state(overrides: Partial<ShareableViewState>): ShareableViewState {
  return {
    searchQuery: '',
    filters: defaults,
    focusNodeId: null,
    selectedNodeId: null,
    ...overrides,
  }
}

describe('encodeViewState', () => {
  it('produces no params for the all-default view', () => {
    expect(encodeViewState(state({}), defs).toString()).toBe('')
  })

  it('encodes search, focus, and non-default filters', () => {
    const params = encodeViewState(
      state({
        searchQuery: 'hero',
        focusNodeId: 'post',
        filters: {...defaults, system: ['1'], health: ['issues']},
      }),
      defs,
    )
    expect(params.get('q')).toBe('hero')
    expect(params.get('focus')).toBe('post')
    expect(params.get('system')).toBe('1')
    expect(params.get('health')).toBe('issues')
    expect(params.has('connectivity')).toBe(false)
  })

  it('omits selected when it mirrors focus, keeps it when it differs', () => {
    const mirrored = encodeViewState(state({focusNodeId: 'post', selectedNodeId: 'post'}), defs)
    expect(mirrored.has('selected')).toBe(false)

    const distinct = encodeViewState(state({focusNodeId: 'post', selectedNodeId: 'author'}), defs)
    expect(distinct.get('selected')).toBe('author')
  })

  it('encodes a restricted kind set using the short URL tokens', () => {
    const params = encodeViewState(state({filters: {...defaults, kinds: ['document']}}), defs)
    expect(params.get('kinds')).toBe('doc')
  })
})

describe('decodeViewState', () => {
  it('round-trips through encodeViewState', () => {
    const original = state({
      searchQuery: 'hero',
      focusNodeId: 'post',
      selectedNodeId: 'post',
      filters: {...defaults, kinds: ['document', 'object'], deprecated: ['only']},
    })
    const decoded = decodeViewState(`?${encodeViewState(original, defs)}`, defs, defaults)

    expect(decoded.searchQuery).toBe('hero')
    expect(decoded.focusNodeId).toBe('post')
    expect(decoded.selectedNodeId).toBe('post')
    expect(decoded.filters.deprecated).toEqual(['only'])
    expect([...decoded.filters.kinds].sort()).toEqual(['document', 'object'])
  })

  it('round-trips filter values containing commas or percent signs', () => {
    // A custom filter is free to use any string as a value — a comma must not
    // split one token into two on the way back in.
    const custom = [
      {
        id: 'custom',
        label: 'Custom',
        type: 'multi' as const,
        options: [
          {value: 'a,b', label: 'A and B'},
          {value: '100%', label: 'All'},
          {value: 'plain', label: 'Plain'},
        ],
        defaultValues: ['a,b', '100%', 'plain'],
        urlParam: 'custom',
        predicate: () => true,
      },
    ]
    const customDefaults = defaultFilterValues(custom)
    const original = state({filters: {custom: ['a,b', '100%']}})
    const decoded = decodeViewState(`?${encodeViewState(original, custom)}`, custom, customDefaults)
    expect([...decoded.filters.custom].sort()).toEqual(['100%', 'a,b'])
  })

  it('passes a malformed percent-escape through instead of throwing', () => {
    const decoded = decodeViewState('?kinds=%E0%,doc', defs, defaults)
    expect([...decoded.filters.kinds]).toEqual(['document'])
  })

  it('still reads the short kind tokens written by older links', () => {
    const decoded = decodeViewState('?kinds=doc,obj', defs, defaults)
    expect([...decoded.filters.kinds].sort()).toEqual(['document', 'object'])
  })

  it('falls back to defaults for missing or unrecognized values', () => {
    const decoded = decodeViewState('?health=bogus&kinds=nonsense', defs, defaults)
    expect(decoded.filters.health).toEqual(['all'])
    expect([...decoded.filters.kinds].sort()).toEqual([...defaults.kinds].sort())
    expect(decoded.focusNodeId).toBeNull()
  })

  it('selects the focused node when no explicit selection is given', () => {
    expect(decodeViewState('?focus=post', defs, defaults).selectedNodeId).toBe('post')
  })

  it('returns an empty search on an empty query string', () => {
    const decoded = decodeViewState('', defs, defaults)
    expect(decoded.searchQuery).toBe('')
    expect(decoded.focusNodeId).toBeNull()
    expect(decoded.selectedNodeId).toBeNull()
  })

  it('honours the supplied defaults for params the URL omits', () => {
    // A stored preference the URL says nothing about must survive decoding.
    const stored = {...defaults, system: ['1']}
    expect(decodeViewState('?q=hero', defs, stored).filters.system).toEqual(['1'])
  })
})

describe('ownedViewStateParams', () => {
  it("keeps only the plugin's own params, in order", () => {
    const current: SearchParamPair[] = [
      ['perspective', 'drafts'],
      ['q', 'hero'],
      ['other[thing]', 'keep'],
      ['kinds', 'doc'],
    ]

    expect(ownedViewStateParams(current, defs)).toEqual([
      ['q', 'hero'],
      ['kinds', 'doc'],
    ])
  })
})

describe('mergeViewStateParams', () => {
  it("replaces the plugin's own params and leaves everyone else's in place", () => {
    const current: SearchParamPair[] = [
      ['perspective', 'drafts'],
      ['q', 'stale'],
      ['other[thing]', 'keep'],
      ['kinds', 'doc'],
    ]
    const encoded = encodeViewState(state({searchQuery: 'hero'}), defs)

    expect(mergeViewStateParams(current, encoded, defs)).toEqual([
      ['perspective', 'drafts'],
      ['other[thing]', 'keep'],
      ['q', 'hero'],
    ])
  })

  it("drops the plugin's params entirely when the view is back at its default", () => {
    const current: SearchParamPair[] = [
      ['q', 'hero'],
      ['system', '1'],
      ['perspective', 'drafts'],
    ]

    expect(mergeViewStateParams(current, encodeViewState(state({}), defs), defs)).toEqual([
      ['perspective', 'drafts'],
    ])
  })

  it('is a no-op — by sameSearchParams — when state already matches the URL', () => {
    const view = state({searchQuery: 'hero', filters: {...defaults, system: ['1']}})
    const current = mergeViewStateParams(
      [['perspective', 'drafts']],
      encodeViewState(view, defs),
      defs,
    )

    const next = mergeViewStateParams(current, encodeViewState(view, defs), defs)
    expect(sameSearchParams(current, next)).toBe(true)
  })
})

describe('sameSearchParams', () => {
  it('compares keys, values and length, ignoring order', () => {
    const a: SearchParamPair[] = [
      ['q', 'hero'],
      ['system', '1'],
    ]
    expect(sameSearchParams(a, [...a])).toBe(true)
    // A router that normalizes/reorders params must not read as a change,
    // or the sync effect would navigate on every router update.
    expect(sameSearchParams(a, [a[1], a[0]])).toBe(true)
    expect(sameSearchParams(a, [a[0]])).toBe(false)
    expect(sameSearchParams(a, [a[0], ['system', '0']])).toBe(false)
  })

  it('treats duplicate pairs as a multiset', () => {
    const twice: SearchParamPair[] = [
      ['q', 'hero'],
      ['q', 'hero'],
    ]
    const once: SearchParamPair[] = [
      ['q', 'hero'],
      ['system', '1'],
    ]
    expect(sameSearchParams(twice, once)).toBe(false)
  })

  it("doesn't conflate pairs whose concatenation collides", () => {
    expect(sameSearchParams([['a=b', 'c']], [['a', 'b=c']])).toBe(false)
  })
})
