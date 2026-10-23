import {describe, expect, it} from 'vitest'

import {largeSchema} from '../test/largeSchema'
import type {FlowNode} from './flowModel'
import {
  layeredLayout,
  type LayeredEdge,
  type LayeredNode,
  type LayeredOptions,
} from './layeredLayout'
import {layoutEngineFor, layoutGraph, NODE_WIDTH} from './layout'
import {schemaToGraph} from './schemaToGraph'

const options = (direction: 'LR' | 'TB'): LayeredOptions => ({
  direction,
  nodeSep: 64,
  rankSep: 160,
  clusterPadding: 24,
  clusterLabelHeight: 28,
  clusterSep: 80,
})

const card = (id: string, group = 'document', height = 100): LayeredNode => ({
  id,
  group,
  width: NODE_WIDTH,
  height,
})

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

function rects(nodes: readonly LayeredNode[], positions: Map<string, {x: number; y: number}>) {
  return nodes.map((n) => ({id: n.id, ...positions.get(n.id)!, width: n.width, height: n.height}))
}

/** The synthetic 331-type page builder, as the canvas would receive it. */
function largeFlow(): {
  nodes: FlowNode[]
  edges: Array<{id: string; source: string; target: string}>
} {
  const graph = schemaToGraph(largeSchema())
  const user = graph.nodes.filter((n) => !n.isSystem)
  const ids = new Set(user.map((n) => n.id))
  return {
    nodes: user.map((node) => ({
      id: node.id,
      type: 'typeNode',
      position: {x: 0, y: 0},
      data: {
        node,
        fieldCount: node.fields.length,
        expanded: false,
        connectionCount: 0,
        warningCount: 0,
        infoCount: 0,
        annotations: {},
        onToggleExpand: () => {},
      },
    })),
    edges: graph.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({id: e.id, source: e.source, target: e.target})),
  }
}

describe('layeredLayout', () => {
  it.each(['LR', 'TB'] as const)('ranks a chain along the %s direction', (direction) => {
    const nodes = ['a', 'b', 'c'].map((id) => card(id))
    const edges = [
      {source: 'a', target: 'b'},
      {source: 'b', target: 'c'},
    ]
    const {positions} = layeredLayout(nodes, edges, options(direction))
    const along = (id: string) => (direction === 'LR' ? positions.get(id)!.x : positions.get(id)!.y)

    expect(along('a')).toBeLessThan(along('b'))
    expect(along('b')).toBeLessThan(along('c'))
  })

  it('terminates on a cycle and still places every node', () => {
    const nodes = ['a', 'b', 'c'].map((id) => card(id))
    const edges = [
      {source: 'a', target: 'b'},
      {source: 'b', target: 'c'},
      {source: 'c', target: 'a'},
    ]
    const {positions} = layeredLayout(nodes, edges, options('LR'))

    expect([...positions.keys()].sort()).toEqual(['a', 'b', 'c'])
  })

  it('ignores self-loops, duplicate pairs and edges to nodes it was not given', () => {
    const nodes = [card('a'), card('b')]
    const edges = [
      {source: 'a', target: 'a'},
      {source: 'a', target: 'b'},
      {source: 'a', target: 'b'},
      {source: 'a', target: 'gone'},
    ]
    const {positions} = layeredLayout(nodes, edges, options('LR'))

    expect(positions.get('a')!.x).toBeLessThan(positions.get('b')!.x)
  })

  it('wraps a rank too long to read into several columns', () => {
    // 40 leaves under one root: one rank of 40 cards, capped per column.
    const nodes = [card('root'), ...Array.from({length: 40}, (_, i) => card(`leaf${i}`))]
    const edges = nodes.slice(1).map((n) => ({source: 'root', target: n.id}))
    const {positions} = layeredLayout(nodes, edges, options('LR'))

    const leafColumns = new Set(nodes.slice(1).map((n) => positions.get(n.id)!.x))
    expect(leafColumns.size).toBeGreaterThan(1)
  })

  it('boxes each group around its own members, without the boxes overlapping', () => {
    const nodes = [card('post'), card('author'), card('seo', 'object'), card('link', 'object')]
    const edges = [
      {source: 'post', target: 'author'},
      {source: 'post', target: 'seo'},
      {source: 'seo', target: 'link'},
    ]
    const {positions, groups} = layeredLayout(nodes, edges, options('LR'))

    expect([...groups.keys()]).toEqual(['document', 'object'])
    expect(overlap(groups.get('document')!, groups.get('object')!)).toBe(false)
    for (const rect of rects(nodes, positions)) {
      const box = groups.get(nodes.find((n) => n.id === rect.id)!.group)!
      expect(rect.x).toBeGreaterThanOrEqual(box.x)
      expect(rect.y).toBeGreaterThanOrEqual(box.y)
      expect(rect.x + rect.width).toBeLessThanOrEqual(box.x + box.width)
      expect(rect.y + rect.height).toBeLessThanOrEqual(box.y + box.height)
    }
  })

  it('places the group that points at the others first', () => {
    // Listed object-first; the documents reference the objects, so they lead.
    const nodes = [card('seo', 'object'), card('post'), card('page')]
    const edges: LayeredEdge[] = [
      {source: 'post', target: 'seo'},
      {source: 'page', target: 'seo'},
    ]
    const {groups} = layeredLayout(nodes, edges, options('LR'))

    expect(groups.get('document')!.x).toBeLessThan(groups.get('object')!.x)
  })
})

describe('layoutGraph on a large schema', () => {
  it('switches to the layered engine past the dagre limits', () => {
    expect(layoutEngineFor(7, 9)).toBe('dagre')
    expect(layoutEngineFor(331, 1966)).toBe('layered')
    // Few types, but densely connected, is just as slow for dagre.
    expect(layoutEngineFor(50, 1000)).toBe('layered')
  })

  it.each(['LR', 'TB'] as const)(
    'lays out 331 types with no overlapping cards (%s)',
    (direction) => {
      const {nodes, edges} = largeFlow()
      const result = layoutGraph(nodes, edges, direction)

      const placed = result.nodes.map((n) => ({
        id: n.id,
        ...n.position,
        width: NODE_WIDTH,
        height: result.heights.get(n.id)!,
      }))
      const overlapping = placed.flatMap((a, i) =>
        placed
          .slice(i + 1)
          .filter((b) => overlap(a, b))
          .map((b) => `${a.id}/${b.id}`),
      )
      expect(overlapping).toEqual([])
      expect(result.clusters.map((c) => c.kind).sort()).toEqual(['document', 'object', 'other'])
    },
  )

  it('keeps the canvas roughly screen-shaped rather than a strip', () => {
    const {nodes, edges} = largeFlow()
    const result = layoutGraph(nodes, edges, 'LR')
    const xs = result.nodes.map((n) => n.position.x)
    const ys = result.nodes.map((n) => n.position.y)
    const aspect =
      (Math.max(...xs) + NODE_WIDTH - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys))

    expect(aspect).toBeLessThan(4)
    expect(aspect).toBeGreaterThan(0.25)
  })

  // The budget the canvas is held to: dagre took ~50s here. Generous against a
  // loaded CI box — the layout itself runs in single-digit milliseconds.
  it('lays out 331 types within 250ms', () => {
    const {nodes, edges} = largeFlow()
    layoutGraph(nodes, edges, 'LR') // warm up the JIT

    const start = performance.now()
    layoutGraph(nodes, edges, 'LR')
    expect(performance.now() - start).toBeLessThan(250)
  })
})
