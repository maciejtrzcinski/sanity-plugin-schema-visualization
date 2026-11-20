import {describe, expect, it} from 'vitest'

import {authorEdge, graph, makeFilterContext, seoEdge} from '../test/fixtures'
import {createDefaultFilters, defaultFilterValues, type FilterValues} from './filters'
import type {SchemaGraph} from './types'
import {focusCandidates, visibleSubgraph, type VisibleGraphInputs} from './visibleGraph'

const filterDefs = createDefaultFilters()
const defaults = defaultFilterValues(filterDefs)

function visible(overrides: Partial<VisibleGraphInputs> = {}): SchemaGraph {
  return visibleSubgraph(graph, {
    filters: defaults,
    filterDefs,
    filterContext: makeFilterContext(),
    focusNodeId: null,
    selectedNodeId: null,
    ...overrides,
  })
}

const nodeIds = (g: SchemaGraph) => g.nodes.map((n) => n.id).sort()
const edgeIds = (g: SchemaGraph) => g.edges.map((e) => e.id).sort()
const onlyDocuments: FilterValues = {...defaults, kinds: ['document']}

describe('visibleSubgraph', () => {
  it('keeps the types the filters let through, and only the edges between them', () => {
    expect(nodeIds(visible())).toEqual(['author', 'post', 'seo'])
    expect(edgeIds(visible())).toEqual([authorEdge.id, seoEdge.id].sort())

    const documents = visible({filters: onlyDocuments})
    expect(nodeIds(documents)).toEqual(['author', 'post'])
    expect(edgeIds(documents)).toEqual([authorEdge.id])
  })

  it('narrows a focus to the focused type and its direct neighbours', () => {
    const focused = visible({focusNodeId: 'author'})

    expect(nodeIds(focused)).toEqual(['author', 'post'])
    expect(edgeIds(focused)).toEqual([authorEdge.id])
  })

  it('filters the focused type’s neighbours like any other type', () => {
    expect(nodeIds(visible({focusNodeId: 'post', filters: onlyDocuments}))).toEqual([
      'author',
      'post',
    ])
  })

  it('never lets a filter drop the focused type', () => {
    expect(nodeIds(visible({focusNodeId: 'sanity.imageAsset'}))).toEqual(['sanity.imageAsset'])
  })

  it('never lets a filter drop the selected type', () => {
    expect(nodeIds(visible({selectedNodeId: 'sanity.imageAsset'}))).toEqual([
      'author',
      'post',
      'sanity.imageAsset',
      'seo',
    ])
  })

  it('keeps a selection outside the focus neighbourhood, without adding its edges', () => {
    const focused = visible({focusNodeId: 'author', selectedNodeId: 'seo'})

    expect(nodeIds(focused)).toEqual(['author', 'post', 'seo'])
    expect(edgeIds(focused)).toEqual([authorEdge.id])
  })

  it('ignores a focus that names no type', () => {
    expect(visible({focusNodeId: 'gone'})).toEqual(visible())
  })
})

describe('focusCandidates', () => {
  const candidates = (focusNodeId: string | null) =>
    focusCandidates(graph, {
      filters: defaults,
      filterDefs,
      filterContext: makeFilterContext(),
      focusNodeId,
    })

  it('lists the types the filters show, sorted by title', () => {
    expect(candidates(null)).toEqual([
      {id: 'author', title: 'Author', isSystem: false, kind: 'document'},
      {id: 'post', title: 'Blog post', isSystem: false, kind: 'document'},
      {id: 'seo', title: 'SEO', isSystem: false, kind: 'object'},
    ])
  })

  it('keeps the current focus even when a filter hides it', () => {
    expect(candidates('sanity.imageAsset').map((c) => c.title)).toEqual([
      'Author',
      'Blog post',
      'Image asset',
      'SEO',
    ])
  })
})
