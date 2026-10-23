import {describe, expect, it} from 'vitest'

import {
  activeFilterCount,
  createDefaultFilters,
  defaultFilterValues,
  isAtDefault,
  nodeMatchesFilters,
  sanitizeFilterValues,
  setFilterValue,
  toggleFilterValue,
  type FilterContext,
  type FilterDef,
  type FilterValues,
} from './filters'
import {defaultTranslate} from './i18n'
import type {GraphEdge, GraphNode} from './types'

const defs = createDefaultFilters()
const defsById = new Map(defs.map((d) => [d.id, d]))
const def = (id: string): FilterDef => defsById.get(id)!

function graphNode(overrides: Partial<GraphNode> & Pick<GraphNode, 'id'>): GraphNode {
  return {
    name: overrides.id,
    title: overrides.id,
    kind: 'object',
    baseType: 'object',
    fields: [],
    isLeaf: true,
    isSystem: false,
    ...overrides,
  }
}

function ctx(overrides: Partial<FilterContext> = {}): FilterContext {
  return {
    graph: {nodes: [], edges: []},
    issueCountByNodeId: new Map(),
    warningCountByNodeId: new Map(),
    connectedNodeIds: new Set(),
    docCountByType: new Map(),
    t: defaultTranslate,
    ...overrides,
  }
}

function graphEdge(source: string, target: string): GraphEdge {
  return {id: `${source}->${target}`, source, target, kind: 'reference', fieldName: target}
}

/** Defaults, but permissive about system types, so each test varies one thing. */
const base: FilterValues = {...defaultFilterValues(defs), system: ['1']}

describe('nodeMatchesFilters', () => {
  it('matches everything under the all-permissive defaults', () => {
    const node = graphNode({id: 'post', isSystem: true, deprecated: 'old'})
    expect(nodeMatchesFilters(node, base, defs, ctx())).toBe(true)
  })

  it('filters by kind', () => {
    const node = graphNode({id: 'post', kind: 'document'})
    const filters = {...base, kinds: ['object']}
    expect(nodeMatchesFilters(node, filters, defs, ctx())).toBe(false)
    expect(nodeMatchesFilters(node, {...base, kinds: ['document']}, defs, ctx())).toBe(true)
  })

  it('hides system types unless asked for', () => {
    const node = graphNode({id: 'slug', isSystem: true})
    expect(nodeMatchesFilters(node, {...base, system: ['0']}, defs, ctx())).toBe(false)
    expect(nodeMatchesFilters(node, {...base, system: ['1']}, defs, ctx())).toBe(true)
  })

  it('filters by health status', () => {
    const node = graphNode({id: 'post'})
    const withIssues = ctx({
      issueCountByNodeId: new Map([['post', 2]]),
      warningCountByNodeId: new Map([['post', 2]]),
    })
    expect(nodeMatchesFilters(node, {...base, health: ['issues']}, defs, withIssues)).toBe(true)
    expect(nodeMatchesFilters(node, {...base, health: ['clean']}, defs, withIssues)).toBe(false)
    expect(nodeMatchesFilters(node, {...base, health: ['issues']}, defs, ctx())).toBe(false)
    expect(nodeMatchesFilters(node, {...base, health: ['clean']}, defs, ctx())).toBe(true)
  })

  it('separates info-only issues from warnings', () => {
    const node = graphNode({id: 'post'})
    // One issue, raised at `info` — an issue for "Only with issues" and for
    // "Only clean", but not something "Only with warnings" should surface.
    const infoOnly = ctx({issueCountByNodeId: new Map([['post', 1]])})
    expect(nodeMatchesFilters(node, {...base, health: ['issues']}, defs, infoOnly)).toBe(true)
    expect(nodeMatchesFilters(node, {...base, health: ['clean']}, defs, infoOnly)).toBe(false)
    expect(nodeMatchesFilters(node, {...base, health: ['warnings']}, defs, infoOnly)).toBe(false)

    const mixed = ctx({
      issueCountByNodeId: new Map([['post', 3]]),
      warningCountByNodeId: new Map([['post', 1]]),
    })
    expect(nodeMatchesFilters(node, {...base, health: ['warnings']}, defs, mixed)).toBe(true)
    expect(nodeMatchesFilters(node, {...base, health: ['warnings']}, defs, ctx())).toBe(false)
  })

  it('filters by connectivity', () => {
    const node = graphNode({id: 'post'})
    const connected = ctx({connectedNodeIds: new Set(['post'])})
    expect(nodeMatchesFilters(node, {...base, connectivity: ['connected']}, defs, connected)).toBe(
      true,
    )
    expect(nodeMatchesFilters(node, {...base, connectivity: ['orphan']}, defs, connected)).toBe(
      false,
    )
    expect(nodeMatchesFilters(node, {...base, connectivity: ['orphan']}, defs, ctx())).toBe(true)
  })

  it('filters by deprecation, on the type and on its fields', () => {
    const plain = graphNode({id: 'post'})
    const deprecatedType = graphNode({id: 'legacy', deprecated: 'gone'})
    const deprecatedField = graphNode({
      id: 'partly',
      fields: [
        {
          name: 'old',
          typeLabel: 'string',
          options: [],
          referencesTo: [],
          reusesTypes: [],
          required: false,
          hidden: false,
          deprecated: 'gone',
        },
      ],
    })

    expect(nodeMatchesFilters(deprecatedType, {...base, deprecated: ['only']}, defs, ctx())).toBe(
      true,
    )
    expect(nodeMatchesFilters(plain, {...base, deprecated: ['only']}, defs, ctx())).toBe(false)
    expect(nodeMatchesFilters(deprecatedType, {...base, deprecated: ['hide']}, defs, ctx())).toBe(
      false,
    )
    expect(
      nodeMatchesFilters(deprecatedField, {...base, deprecated: ['only-fields']}, defs, ctx()),
    ).toBe(true)
    expect(nodeMatchesFilters(plain, {...base, deprecated: ['only-fields']}, defs, ctx())).toBe(
      false,
    )
  })

  it('applies every filter, not just the first that matches', () => {
    const node = graphNode({id: 'slug', kind: 'document', isSystem: true})
    // Kind passes, system does not.
    expect(
      nodeMatchesFilters(node, {...base, kinds: ['document'], system: ['0']}, defs, ctx()),
    ).toBe(false)
  })

  it('falls back to a filter default when its value is missing entirely', () => {
    const node = graphNode({id: 'slug', isSystem: true})
    // No `system` key at all — the default ('0', exclude) must still apply.
    expect(nodeMatchesFilters(node, {}, defs, ctx())).toBe(false)
  })

  it('hands a custom predicate the whole graph and the loaded doc counts', () => {
    const post = graphNode({id: 'post', kind: 'document'})
    const author = graphNode({id: 'author', kind: 'document'})
    // The "types with zero documents that nothing points at" filter the wider
    // context is meant to make writable outside this package.
    const unusedFilter: FilterDef = {
      id: 'unused',
      label: 'Unused',
      type: 'single',
      options: [
        {value: 'all', label: 'All types'},
        {value: 'only', label: 'Only unused'},
      ],
      defaultValues: ['all'],
      urlParam: 'unused',
      predicate: (node, selected, c) =>
        selected.value !== 'only' ||
        (c.docCountByType.get(node.name) === 0 && !c.graph.edges.some((e) => e.target === node.id)),
    }
    const custom = [unusedFilter]
    const only = {unused: ['only']}
    const withCounts = ctx({
      graph: {nodes: [post, author], edges: [graphEdge('author', 'post')]},
      docCountByType: new Map([
        ['post', 0],
        ['author', 0],
      ]),
    })

    expect(nodeMatchesFilters(author, only, custom, withCounts)).toBe(true)
    // Empty, but `author` references it.
    expect(nodeMatchesFilters(post, only, custom, withCounts)).toBe(false)
    // Counts nobody loaded read as unknown, not as zero.
    expect(nodeMatchesFilters(author, only, custom, ctx())).toBe(false)
  })
})

describe('sanitizeFilterValues', () => {
  it('drops values a filter no longer offers', () => {
    const result = sanitizeFilterValues({health: ['issues', 'bogus']}, defs)
    expect(result.health).toEqual(['issues'])
  })

  it('falls back to the default when nothing valid survives', () => {
    expect(sanitizeFilterValues({health: ['nope']}, defs).health).toEqual(['all'])
    expect(sanitizeFilterValues({kinds: []}, defs).kinds).toEqual(['document', 'object', 'other'])
  })

  it('fills in every known filter, even ones absent from the input', () => {
    expect(Object.keys(sanitizeFilterValues({}, defs)).sort()).toEqual(defs.map((d) => d.id).sort())
  })
})

describe('isAtDefault / activeFilterCount', () => {
  it('treats a reordered multi-selection as still default', () => {
    const values = {
      ...defaultFilterValues(defs),
      kinds: ['other', 'document', 'object'],
    }
    expect(isAtDefault(values, def('kinds'))).toBe(true)
    expect(activeFilterCount(values, defs)).toBe(0)
  })

  it('counts each filter moved off its default once', () => {
    const values = {
      ...defaultFilterValues(defs),
      health: ['issues'],
      system: ['1'],
    }
    expect(activeFilterCount(values, defs)).toBe(2)
  })
})

describe('toggleFilterValue / setFilterValue', () => {
  it('adds and removes one value of a multi filter', () => {
    const start = defaultFilterValues(defs)
    const without = toggleFilterValue(start, def('kinds'), 'other')
    expect(without.kinds).toEqual(['document', 'object'])
    expect(toggleFilterValue(without, def('kinds'), 'other').kinds).toContain('other')
  })

  it('refuses to uncheck the last selected value of a multi filter', () => {
    const kinds = def('kinds')
    const oneLeft = kinds.options
      .slice(1)
      .reduce(
        (acc, option) => toggleFilterValue(acc, kinds, option.value),
        defaultFilterValues(defs),
      )
    expect(oneLeft.kinds).toEqual(['document'])
    expect(toggleFilterValue(oneLeft, kinds, 'document')).toBe(oneLeft)
  })

  it('replaces the whole selection for a single filter', () => {
    const result = setFilterValue(defaultFilterValues(defs), def('health'), 'issues')
    expect(result.health).toEqual(['issues'])
  })
})

describe('createDefaultFilters', () => {
  it('derives the kind filter from the kind registry it is given', () => {
    const custom = createDefaultFilters([
      {
        id: 'singleton',
        label: 'Singletons',
        singular: 'singleton',
        clusterLabel: 'Singletons',
        urlParam: 'sing',
        tone: 'primary' as const,
        color: {cssVar: '--x', fallback: '#000'},
        icon: () => null,
        classify: () => true,
      },
    ])
    expect(custom[0].options).toEqual([{value: 'singleton', label: 'Singletons', urlValue: 'sing'}])
    expect(custom[0].defaultValues).toEqual(['singleton'])
  })
})
