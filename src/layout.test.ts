import {Position} from '@xyflow/react'
import {describe, expect, it} from 'vitest'

import type {FlowNode, TypeNodeData} from './flowModel'
import {
  estimateNodeHeight,
  layoutGraph,
  MAX_VISIBLE_FIELDS,
  NODE_WIDTH,
  reflowHeights,
  type ClusterBox,
} from './layout'
import type {FieldSummary, GraphNode, GraphNodeKind} from './types'

function fields(count: number): FieldSummary[] {
  return Array.from({length: count}, (_, i) => ({
    name: `field${i}`,
    typeLabel: 'string',
    options: [],
    referencesTo: [],
    reusesTypes: [],
    required: false,
    hidden: false,
  }))
}

function nodeData(
  id: string,
  kind: GraphNodeKind,
  fieldCount = 0,
  expanded = false,
  overrides: {node?: Partial<GraphNode>; data?: Partial<TypeNodeData>} = {},
): TypeNodeData {
  const node: GraphNode = {
    id,
    name: id,
    title: id,
    kind,
    baseType: kind,
    fields: fields(fieldCount),
    isLeaf: fieldCount === 0,
    isSystem: false,
    ...overrides.node,
  }
  return {
    node,
    fieldCount,
    expanded,
    connectionCount: 0,
    warningCount: 0,
    infoCount: 0,
    annotations: {},
    onToggleExpand: () => {},
    ...overrides.data,
  }
}

function flowNode(id: string, kind: GraphNodeKind, fieldCount = 0, expanded = false): FlowNode {
  return {
    id,
    type: 'typeNode',
    position: {x: 0, y: 0},
    selected: false,
    data: nodeData(id, kind, fieldCount, expanded),
  }
}

function edge(source: string, target: string) {
  return {id: `${source}->${target}`, source, target}
}

describe('estimateNodeHeight', () => {
  it('reserves the header and the leaf note, and no badge row, for a fieldless type', () => {
    // header padding (24) + title row (32) + leaf note (40); no badge applies
    // to a plain collapsed leaf, so the row isn't rendered and costs nothing.
    expect(estimateNodeHeight(nodeData('slug', 'other'))).toBe(96)
  })

  it('reserves the "no fields" note every leaf renders, expanded or not', () => {
    for (const expanded of [false, true]) {
      const leaf = nodeData('slug', 'other', 0, expanded)
      const nonLeaf = nodeData('slug', 'other', 0, expanded, {node: {isLeaf: false}})
      expect(estimateNodeHeight(leaf)).toBeGreaterThan(estimateNodeHeight(nonLeaf))
    }
  })

  it('reserves a second header line when the type name differs from its title', () => {
    const titled = nodeData('post', 'document', 3, true, {
      node: {title: 'Blog post'},
    })
    const untitled = nodeData('post', 'document', 3, true)
    expect(estimateNodeHeight(titled)).toBeGreaterThan(estimateNodeHeight(untitled))
  })

  it('reserves the badge row an expanded card only renders when it has badges', () => {
    const plain = nodeData('post', 'document', 3, true)
    expect(
      estimateNodeHeight(nodeData('post', 'document', 3, true, {node: {isSystem: true}})),
    ).toBeGreaterThan(estimateNodeHeight(plain))
    expect(
      estimateNodeHeight(
        nodeData('post', 'document', 3, true, {
          node: {deprecated: 'use v2'},
        }),
      ),
    ).toBeGreaterThan(estimateNodeHeight(plain))
    expect(
      estimateNodeHeight(
        nodeData('post', 'document', 3, true, {data: {annotations: {docCount: 12}}}),
      ),
    ).toBeGreaterThan(estimateNodeHeight(plain))
  })

  it('reserves a second badge line once the badges no longer fit on one', () => {
    const one = nodeData('post', 'document', 3, false)
    const many = nodeData('post', 'document', 3, false, {
      node: {isSystem: true, deprecated: 'use v2'},
      data: {annotations: {docCount: 1234}, connectionCount: 7},
    })
    expect(estimateNodeHeight(many)).toBeGreaterThan(estimateNodeHeight(one))
  })

  it('adds a summary line for a collapsed node that has fields', () => {
    const withFields = estimateNodeHeight(nodeData('post', 'document', 8, false))
    const withoutFields = estimateNodeHeight(
      nodeData('post', 'document', 0, false, {node: {isLeaf: false}}),
    )
    expect(withFields).toBeGreaterThan(withoutFields)
  })

  it('grows with each field while under the visible-row cap', () => {
    expect(estimateNodeHeight(nodeData('post', 'document', 2, true))).toBeGreaterThan(
      estimateNodeHeight(nodeData('post', 'document', 1, true)),
    )
  })

  it('is taller expanded than collapsed for any type that has fields', () => {
    for (const count of [1, 5, 20, 100]) {
      expect(estimateNodeHeight(nodeData('post', 'document', count, true))).toBeGreaterThan(
        estimateNodeHeight(nodeData('post', 'document', count, false)),
      )
    }
  })

  it('is the same height expanded or collapsed for a fieldless type', () => {
    // A fieldless card has nothing to expand and no summary badge to show for
    // it, so the badge row isn't rendered either way — and the estimate has to
    // agree, or the card would jump by a row's margin for nothing.
    expect(estimateNodeHeight(nodeData('slug', 'other', 0, false))).toBe(
      estimateNodeHeight(nodeData('slug', 'other', 0, true)),
    )
  })

  it('stops growing past the cap, allowing one row for the "+N more" line', () => {
    const atCap = estimateNodeHeight(nodeData('post', 'document', MAX_VISIBLE_FIELDS, true))
    const overCap = estimateNodeHeight(nodeData('post', 'document', MAX_VISIBLE_FIELDS + 1, true))
    const wayOverCap = estimateNodeHeight(
      nodeData('post', 'document', MAX_VISIBLE_FIELDS + 500, true),
    )

    expect(overCap).toBeGreaterThan(atCap)
    // Everything past the cap renders identically, so it must measure identically.
    expect(wayOverCap).toBe(overCap)
  })

  it('reserves no field rows when collapsed, however many fields there are', () => {
    const short = estimateNodeHeight(nodeData('post', 'document', 3, false))
    const long = estimateNodeHeight(nodeData('post', 'document', 200, false))
    // Only the summary text's own width can differ, never a per-field row.
    expect(long - short).toBeLessThanOrEqual(24)
  })
})

describe('layoutGraph', () => {
  it('assigns every node a position and returns edges untouched', () => {
    const nodes = [flowNode('post', 'document'), flowNode('author', 'document')]
    const edges = [edge('post', 'author')]

    const result = layoutGraph(nodes, edges)

    expect(result.nodes).toHaveLength(2)
    for (const node of result.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true)
      expect(Number.isFinite(node.position.y)).toBe(true)
    }
    expect(result.edges).toBe(edges)
  })

  it('separates nodes rather than stacking them at the origin', () => {
    const result = layoutGraph(
      [flowNode('post', 'document'), flowNode('author', 'document')],
      [edge('post', 'author')],
    )
    const [a, b] = result.nodes
    expect(a.position).not.toEqual(b.position)
  })

  it('lays connected nodes out left-to-right for LR and top-to-bottom for TB', () => {
    const nodes = () => [flowNode('post', 'document'), flowNode('author', 'document')]
    const edges = [edge('post', 'author')]

    const lr = layoutGraph(nodes(), edges, 'LR')
    const [lrPost, lrAuthor] = lr.nodes
    expect(lrAuthor.position.x).toBeGreaterThan(lrPost.position.x)

    const tb = layoutGraph(nodes(), edges, 'TB')
    const [tbPost, tbAuthor] = tb.nodes
    expect(tbAuthor.position.y).toBeGreaterThan(tbPost.position.y)
  })

  it('puts the handles on the sides the layout direction runs in', () => {
    const nodes = () => [flowNode('post', 'document'), flowNode('author', 'document')]
    const edges = [edge('post', 'author')]

    for (const node of layoutGraph(nodes(), edges, 'LR').nodes) {
      expect(node.sourcePosition).toBe(Position.Right)
      expect(node.targetPosition).toBe(Position.Left)
    }

    for (const node of layoutGraph(nodes(), edges, 'TB').nodes) {
      expect(node.sourcePosition).toBe(Position.Bottom)
      expect(node.targetPosition).toBe(Position.Top)
    }
  })

  it('emits no clusters when every node is the same kind', () => {
    const result = layoutGraph(
      [flowNode('post', 'document'), flowNode('author', 'document')],
      [edge('post', 'author')],
    )
    expect(result.clusters).toEqual([])
  })

  it('emits one cluster per kind once kinds are mixed', () => {
    const result = layoutGraph(
      [flowNode('post', 'document'), flowNode('seo', 'object')],
      [edge('post', 'seo')],
    )

    expect(result.clusters).toHaveLength(2)
    expect(result.clusters.map((c) => c.kind).sort()).toEqual(['document', 'object'])
    for (const cluster of result.clusters) {
      expect(cluster.width).toBeGreaterThan(0)
      expect(cluster.height).toBeGreaterThan(0)
    }
  })

  it('does not let a self-referencing node break the layout', () => {
    const result = layoutGraph([flowNode('post', 'document')], [edge('post', 'post')])

    expect(result.nodes).toHaveLength(1)
    expect(Number.isFinite(result.nodes[0].position.x)).toBe(true)
    expect(Number.isFinite(result.nodes[0].position.y)).toBe(true)
  })

  it('leaves a full card width between ranks so nodes never overlap', () => {
    const result = layoutGraph(
      [flowNode('post', 'document'), flowNode('author', 'document')],
      [edge('post', 'author')],
      'LR',
    )
    const [post, author] = result.nodes
    // Positions are top-left corners, so the next rank has to start at least a
    // full `NODE_WIDTH` further right or the cards would paint on top of each other.
    expect(author.position.x - post.position.x).toBeGreaterThanOrEqual(NODE_WIDTH)
  })

  it('handles an empty graph', () => {
    const result = layoutGraph([], [])
    expect(result.nodes).toEqual([])
    expect(result.clusters).toEqual([])
  })
})

describe('reflowHeights', () => {
  function placed(id: string, x: number, y: number, expanded: boolean): FlowNode {
    return {...flowNode(id, 'document', 5, expanded), position: {x, y}}
  }

  function heightsOf(nodes: FlowNode[]): Map<string, number> {
    return new Map(nodes.map((n) => [n.id, estimateNodeHeight(n.data)]))
  }

  /** Two cards stacked in one column, plus one on its own in a second column. */
  function stack(expanded: string[] = []) {
    return [
      placed('top', 0, 0, expanded.includes('top')),
      placed('bottom', 0, 300, expanded.includes('bottom')),
      placed('aside', 400, 0, expanded.includes('aside')),
    ]
  }

  it('returns its input untouched when no card changed height', () => {
    const nodes = stack()
    const clusters: ClusterBox[] = []
    const result = reflowHeights(nodes, heightsOf(nodes), clusters)

    expect(result.nodes).toBe(nodes)
    expect(result.clusters).toBe(clusters)
  })

  it('pushes cards below a grown one down by exactly what it grew', () => {
    const before = stack()
    const heights = heightsOf(before)
    const after = stack(['top'])
    const grew = estimateNodeHeight(after[0].data) - heights.get('top')!
    expect(grew).toBeGreaterThan(0)

    const result = reflowHeights(after, heights, [])
    const byId = new Map(result.nodes.map((n) => [n.id, n]))

    expect(byId.get('top')!.position.y).toBe(0)
    expect(byId.get('bottom')!.position.y).toBe(300 + grew)
  })

  it('keeps the gap the layout chose between stacked cards', () => {
    const heights = heightsOf(stack())
    const after = stack(['top'])
    const gapBefore = 300 - heights.get('top')!

    const result = reflowHeights(after, heights, [])
    const byId = new Map(result.nodes.map((n) => [n.id, n]))
    const gapAfter =
      byId.get('bottom')!.position.y - (byId.get('top')!.position.y + result.heights.get('top')!)

    expect(gapAfter).toBe(gapBefore)
  })

  it('leaves cards in other columns alone, object identity included', () => {
    const after = stack(['top'])
    const result = reflowHeights(after, heightsOf(stack()), [])

    expect(result.nodes[2]).toBe(after[2])
    expect(result.nodes[2].position).toEqual({x: 400, y: 0})
  })

  it('never moves the card above the one that changed', () => {
    const after = stack(['bottom'])
    const result = reflowHeights(after, heightsOf(stack()), [])

    expect(result.nodes[0]).toBe(after[0])
  })

  it('pulls cards back up when the card above them collapses again', () => {
    const collapsed = stack()
    const expanded = reflowHeights(stack(['top']), heightsOf(collapsed), [])
    const backAgain = reflowHeights(
      collapsed.map((n, i) => ({...n, position: expanded.nodes[i].position})),
      expanded.heights,
      [],
    )

    expect(backAgain.nodes.map((n) => n.position)).toEqual(collapsed.map((n) => n.position))
  })

  it('grows the cluster band so it still contains its cards', () => {
    const before = stack()
    const heights = heightsOf(before)
    const bottomEdge = 300 + heights.get('bottom')!
    const cluster: ClusterBox = {
      id: 'cluster:document',
      kind: 'document',
      x: -48,
      y: -48,
      width: NODE_WIDTH + 96,
      height: bottomEdge + 96,
    }
    const after = stack(['top'])
    const grew = estimateNodeHeight(after[0].data) - heights.get('top')!

    const result = reflowHeights(after, heights, [cluster])

    expect(result.clusters[0].y).toBe(cluster.y)
    expect(result.clusters[0].height).toBe(cluster.height + grew)
  })

  it('re-flows a graph dagre actually laid out without introducing overlaps', () => {
    const laidOut = layoutGraph(
      [
        flowNode('post', 'document', 6),
        flowNode('author', 'document', 4),
        flowNode('page', 'document', 3),
      ],
      [edge('post', 'author'), edge('post', 'page')],
      'LR',
    )
    const expanded = laidOut.nodes.map((n) =>
      n.id === 'author' ? {...n, data: {...n.data, expanded: true}} : n,
    )

    const result = reflowHeights(expanded, laidOut.heights, laidOut.clusters)

    for (const a of result.nodes) {
      for (const b of result.nodes) {
        if (a.id === b.id) continue
        const overlapsX =
          a.position.x < b.position.x + NODE_WIDTH && b.position.x < a.position.x + NODE_WIDTH
        if (!overlapsX) continue
        const overlapsY =
          a.position.y < b.position.y + result.heights.get(b.id)! &&
          b.position.y < a.position.y + result.heights.get(a.id)!
        expect(overlapsY).toBe(false)
      }
    }
  })

  describe('measured heights via heightOf', () => {
    it('re-flows from measured heights instead of the estimate when supplied', () => {
      const nodes = stack()
      const estimates = heightsOf(nodes)
      // The rendered card came out 30px taller than the estimate promised.
      const measured = new Map([['top', estimates.get('top')! + 30]])
      const heightOf = (node: FlowNode) => measured.get(node.id) ?? estimateNodeHeight(node.data)

      const result = reflowHeights(nodes, estimates, [], heightOf)
      const byId = new Map(result.nodes.map((n) => [n.id, n]))

      expect(result.heights.get('top')).toBe(estimates.get('top')! + 30)
      expect(byId.get('bottom')!.position.y).toBe(300 + 30)
      expect(byId.get('aside')!).toBe(nodes[2])
    })

    it('is a no-op when the measurements agree with what was reserved', () => {
      const nodes = stack()
      const reserved = heightsOf(nodes)
      const heightOf = (node: FlowNode) => reserved.get(node.id)!

      const result = reflowHeights(nodes, reserved, [], heightOf)
      expect(result.nodes).toBe(nodes)
    })

    it('feeds measured heights into a full dagre layout', () => {
      const tall = 999
      const heightOf = (node: FlowNode) =>
        node.id === 'post' ? tall : estimateNodeHeight(node.data)

      const laidOut = layoutGraph(
        [flowNode('post', 'document', 3), flowNode('author', 'document', 3)],
        [edge('post', 'author')],
        'LR',
        heightOf,
      )

      expect(laidOut.heights.get('post')).toBe(tall)
      expect(laidOut.heights.get('author')).toBe(
        estimateNodeHeight(flowNode('author', 'document', 3).data),
      )
    })
  })
})
