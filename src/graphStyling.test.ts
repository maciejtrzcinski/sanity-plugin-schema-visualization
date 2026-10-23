import {describe, expect, it} from 'vitest'

import type {FlowEdge, FlowNode} from './flowModel'
import {computeStyledEdges, computeStyledNodes, DIM_CLASSES, matchesQuery} from './graphStyling'
import type {FieldSummary, GraphNode} from './types'

function field(overrides: Partial<FieldSummary> & Pick<FieldSummary, 'name'>): FieldSummary {
  return {
    typeLabel: 'string',
    options: [],
    referencesTo: [],
    reusesTypes: [],
    required: false,
    hidden: false,
    ...overrides,
  }
}

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

function flowNode(id: string, overrides: Partial<GraphNode> = {}): FlowNode {
  return {
    id,
    type: 'typeNode',
    position: {x: 0, y: 0},
    selected: false,
    data: {
      node: graphNode({id, ...overrides}),
      fieldCount: 0,
      expanded: false,
      connectionCount: 0,
      warningCount: 0,
      infoCount: 0,
      annotations: {},
      onToggleExpand: () => {},
    },
  }
}

function baseEdge(id: string, source: string, target: string, fieldName = 'field'): FlowEdge {
  return {
    id,
    source,
    target,
    data: {fieldName},
    style: {opacity: 1},
    zIndex: 0,
  }
}

describe('matchesQuery', () => {
  it('matches on node name, title, and field names/types', () => {
    const n = graphNode({
      id: 'post',
      title: 'Post',
      fields: [field({name: 'author', typeLabel: 'reference'})],
    })
    expect(matchesQuery(n, 'post')).toBe(true)
    expect(matchesQuery(n, 'author')).toBe(true)
    expect(matchesQuery(n, 'reference')).toBe(true)
    expect(matchesQuery(n, 'nope')).toBe(false)
  })

  it('treats an empty query as matching everything', () => {
    expect(matchesQuery(graphNode({id: 'x'}), '')).toBe(true)
  })
})

describe('computeStyledNodes', () => {
  it('keeps every node reference unchanged when idle (no search, no selection)', () => {
    const nodes = [flowNode('a'), flowNode('b'), flowNode('c')]
    const result = computeStyledNodes(nodes, '', null, new Map())
    expect(result[0]).toBe(nodes[0])
    expect(result[1]).toBe(nodes[1])
    expect(result[2]).toBe(nodes[2])
  })

  it('lights the selection and its neighbours, leaving every other node untouched', () => {
    const nodes = [flowNode('a'), flowNode('b'), flowNode('c')]
    const adjacency = new Map([
      ['a', new Set(['b'])],
      ['b', new Set(['a'])],
    ])

    const [a, b, c] = computeStyledNodes(nodes, '', 'a', adjacency)

    expect(a.selected).toBe(true)
    expect(a.className).toBe(DIM_CLASSES.lit)
    expect(b.className).toBe(DIM_CLASSES.lit)
    // The canvas stylesheet fades it; its object — and so its card — is untouched.
    expect(c).toBe(nodes[2])
  })

  it('marks nodes that fail the search and keeps matching ones stable', () => {
    const nodes = [flowNode('post', {title: 'Post'}), flowNode('author', {title: 'Author'})]
    const result = computeStyledNodes(nodes, 'post', null, new Map())

    expect(result[0]).toBe(nodes[0]) // matches "post" — unchanged
    expect(result[1].className).toBe(DIM_CLASSES.miss)
  })

  it('never hands a card new data, so no card re-renders for dimming', () => {
    const nodes = [flowNode('a'), flowNode('b')]
    const result = computeStyledNodes(nodes, 'zzz', 'a', new Map())

    expect(result.map((n) => n.data)).toEqual(nodes.map((n) => n.data))
    result.forEach((n, i) => expect(n.data).toBe(nodes[i].data))
  })
})

describe('computeStyledEdges', () => {
  it('returns the same array reference when idle (no selection, no hover)', () => {
    const edges = [baseEdge('e1', 'a', 'b')]
    expect(computeStyledEdges(edges, null, null)).toBe(edges)
  })

  it('lights and labels the edges touching the selection, and leaves the rest alone', () => {
    const connected = baseEdge('e1', 'a', 'b')
    const unrelated = baseEdge('e2', 'c', 'd')
    const result = computeStyledEdges([connected, unrelated], 'a', null)

    expect(result[0].label).toBe('field')
    expect(result[0].className).toBe(DIM_CLASSES.lit)
    expect(result[0].zIndex).toBe(1)

    // Faded by the stylesheet, not by a new object: its path is not recomputed.
    expect(result[1]).toBe(unrelated)
  })

  it('keeps the reference of an already-lit edge across an unrelated recompute', () => {
    const alreadyLit: FlowEdge = {
      ...baseEdge('e1', 'a', 'b'),
      label: 'field',
      className: DIM_CLASSES.lit,
      zIndex: 1,
    }
    const result = computeStyledEdges([alreadyLit], 'a', null)
    expect(result[0]).toBe(alreadyLit)
  })

  it('shows a label only on the hovered edge when nothing is selected', () => {
    const hovered = baseEdge('e1', 'a', 'b', 'author')
    const other = baseEdge('e2', 'c', 'd', 'category')
    const result = computeStyledEdges([hovered, other], null, 'e1')

    expect(result[0].label).toBe('author')
    expect(result[0].className).toBeUndefined()

    expect(result[1]).toBe(other)
    expect(result[1].label).toBeUndefined()
  })
})
