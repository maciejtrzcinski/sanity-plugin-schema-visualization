import type {NodeChange} from '@xyflow/react'
import {describe, expect, it, vi} from 'vitest'

import {authorEdge, graph, makeNode, seoEdge} from '../test/fixtures'
import {catchAllEdgeKind, defaultEdgeKinds} from './edgeKinds'
import type {FlowNode} from './flowModel'
import {LayoutController, type CardOptions, type RebuildOptions} from './layoutController'
import {indexById} from './registry'
import type {SchemaGraph} from './types'

/** Flat heights, so a test can say exactly what it expects a card to be worth. */
const COLLAPSED = 100
const EXPANDED = 300
const byExpanded = (node: FlowNode) => (node.data.expanded ? EXPANDED : COLLAPSED)

/** Stable, like the `useCallback` the canvas passes: a new one changes every card. */
const onToggleExpand = () => {}

function rebuildOptions(overrides: Partial<RebuildOptions> = {}): RebuildOptions {
  return {
    direction: 'LR',
    compactMode: false,
    expandedNodeIds: new Set(),
    annotations: new Map(),
    onToggleExpand,
    issueCountByNodeId: new Map(),
    warningCountByNodeId: new Map(),
    edgeKindById: indexById(defaultEdgeKinds),
    catchAllEdge: catchAllEdgeKind(),
    estimate: byExpanded,
    ...overrides,
  }
}

function cardOptions(overrides: Partial<CardOptions> = {}): CardOptions {
  return {
    compactMode: false,
    expandedNodeIds: new Set(),
    annotations: new Map(),
    issueCountByNodeId: new Map(),
    warningCountByNodeId: new Map(),
    estimate: byExpanded,
    ...overrides,
  }
}

/**
 * Two unconnected types of the same kind. Dagre ranks both at x = 0, one above
 * the other and with no cluster bands in the way — the simplest shape in which
 * "a card grew, so what's under it moves down" is a statement about one number.
 */
const stacked: SchemaGraph = {
  nodes: [makeNode({id: 'a'}), makeNode({id: 'b'})],
  edges: [],
}

function positionsById(nodes: FlowNode[]): Map<string, {x: number; y: number}> {
  return new Map(nodes.map((n) => [n.id, n.position]))
}

/** The stacked pair, top one first. */
function topAndBottom(nodes: FlowNode[]): [FlowNode, FlowNode] {
  const [top, bottom] = [...nodes].sort((x, y) => x.position.y - y.position.y)
  return [top, bottom]
}

function dimensionChange(id: string, height: number): NodeChange<FlowNode> {
  return {id, type: 'dimensions', dimensions: {width: 260, height}}
}

describe('LayoutController', () => {
  it('lays out a card per node and an edge per connection', () => {
    const controller = new LayoutController()
    const state = controller.rebuild(graph, rebuildOptions())

    expect(state.nodes.map((n) => n.id)).toEqual(['post', 'author', 'seo', 'sanity.imageAsset'])
    expect(state.edges.map((e) => e.id)).toEqual([authorEdge.id, seoEdge.id])
    // Three kinds are present, so dagre gives each its own band.
    expect(state.clusters.map((c) => c.kind).sort()).toEqual(['document', 'object', 'other'])
    expect(controller.state).toBe(state)
  })

  it('hands back untouched cards as the same objects across a re-layout', () => {
    const controller = new LayoutController()
    const first = controller.rebuild(graph, rebuildOptions())

    const second = controller.rebuild(
      graph,
      rebuildOptions({warningCountByNodeId: new Map([['post', 2]])}),
    )

    const changed = second.nodes.find((n) => n.id === 'post')!
    expect(changed).not.toBe(first.nodes.find((n) => n.id === 'post'))
    expect(changed.data.warningCount).toBe(2)
    for (const id of ['author', 'seo', 'sanity.imageAsset']) {
      expect(second.nodes.find((n) => n.id === id)).toBe(first.nodes.find((n) => n.id === id))
    }
  })

  it('keeps a card the user dragged where they dropped it, until an explicit re-layout', () => {
    const controller = new LayoutController()
    const laidOut = positionsById(controller.rebuild(graph, rebuildOptions()).nodes)

    controller.dragged('author', {x: 1000, y: 500})
    const dragged = controller.rebuild(graph, rebuildOptions({direction: 'TB'}))
    expect(dragged.nodes.find((n) => n.id === 'author')!.position).toEqual({x: 1000, y: 500})

    controller.forgetDragged()
    const relaid = controller.rebuild(graph, rebuildOptions())
    expect(relaid.nodes.find((n) => n.id === 'author')!.position).toEqual(laidOut.get('author'))
  })

  it('returns the state it already had when a patch changes nothing', () => {
    const controller = new LayoutController()
    const state = controller.rebuild(graph, rebuildOptions())

    expect(controller.patch(cardOptions())).toBe(state)
    expect(controller.patch(cardOptions({annotations: new Map()}))).toBe(state)
  })

  it('expands one card and pushes what sits under it down, without re-running dagre', () => {
    const controller = new LayoutController(true)
    const collapsed = controller.rebuild(stacked, rebuildOptions({compactMode: true}))
    const [top, bottom] = topAndBottom(collapsed.nodes)

    const patched = controller.patch(
      cardOptions({compactMode: true, expandedNodeIds: new Set([top.id])}),
    )

    const after = positionsById(patched.nodes)
    expect(after.get(top.id)).toEqual(top.position)
    // The card above it grew by EXPANDED - COLLAPSED, and the gap dagre chose
    // is preserved exactly.
    expect(after.get(bottom.id)!.y).toBe(bottom.position.y + EXPANDED - COLLAPSED)
    expect(after.get(bottom.id)!.x).toBe(bottom.position.x)
  })

  // Loading doc counts can raise health issues; the card's issue badge has to
  // follow without dagre re-running and the viewport re-framing.
  it('patches a card whose health issues changed, leaving the rest alone', () => {
    const controller = new LayoutController()
    const state = controller.rebuild(graph, rebuildOptions())

    const patched = controller.patch(
      cardOptions({
        issueCountByNodeId: new Map([['post', 2]]),
        warningCountByNodeId: new Map([['post', 1]]),
      }),
    )

    const post = patched.nodes.find((n) => n.id === 'post')
    expect(post?.data).toMatchObject({warningCount: 1, infoCount: 1})
    expect(patched.nodes.find((n) => n.id === 'author')).toBe(
      state.nodes.find((n) => n.id === 'author'),
    )
    expect(patched.edges).toBe(state.edges)
  })

  it('leaves a compact-mode switch to the re-layout that owns it', () => {
    const controller = new LayoutController(false)
    const expanded = controller.rebuild(stacked, rebuildOptions())

    // Both effects fire for a compact-mode change; the patch declines, so the
    // cards keep the positions the rebuild is about to replace.
    expect(controller.patch(cardOptions({compactMode: true}))).toBe(expanded)
    expect(expanded.nodes.every((n) => n.data.expanded)).toBe(true)

    // Once the switch has been seen, a later patch in that mode is honoured.
    const compact = controller.rebuild(stacked, rebuildOptions({compactMode: true}))
    const [top] = topAndBottom(compact.nodes)
    const patched = controller.patch(
      cardOptions({compactMode: true, expandedNodeIds: new Set([top.id])}),
    )
    expect(patched.nodes.find((n) => n.id === top.id)!.data.expanded).toBe(true)
  })

  it('prefers a measured height over the estimate, and re-flows when one arrives', () => {
    const controller = new LayoutController(true)
    const laidOut = controller.rebuild(stacked, rebuildOptions({compactMode: true}))
    const [top, bottom] = topAndBottom(laidOut.nodes)

    // The layout reserved COLLAPSED for it; React Flow says it renders taller.
    const {state, remeasured} = controller.applyChanges([dimensionChange(top.id, EXPANDED + 0.4)])
    expect(remeasured).toBe(true)
    expect(state.nodes.find((n) => n.id === top.id)!.measured?.height).toBe(EXPANDED + 0.4)

    // The measurement is rounded, so sub-pixel jitter can't re-trigger this
    // forever: the same height again is not news.
    expect(controller.applyChanges([dimensionChange(top.id, EXPANDED + 0.2)]).remeasured).toBe(
      false,
    )

    const estimate = vi.fn(byExpanded)
    const reflowed = controller.reflow(estimate)
    expect(estimate).not.toHaveBeenCalledWith(expect.objectContaining({id: top.id}))
    const after = positionsById(reflowed.nodes)
    expect(after.get(bottom.id)!.y).toBe(bottom.position.y + EXPANDED - COLLAPSED)

    // Nothing measured since, so there is nothing to move.
    expect(controller.reflow(estimate)).toBe(reflowed)
  })

  it('forgets the measurement of a card whose content changed, and only that card', () => {
    const controller = new LayoutController(true)
    const laidOut = controller.rebuild(stacked, rebuildOptions({compactMode: true}))
    const [top, bottom] = topAndBottom(laidOut.nodes)
    controller.applyChanges([dimensionChange(top.id, 120), dimensionChange(bottom.id, 130)])

    const estimate = vi.fn(byExpanded)
    controller.patch(cardOptions({compactMode: true, expandedNodeIds: new Set([top.id]), estimate}))

    // The expanded card is about to render taller than it measured, so its
    // measurement is dropped and it is sized by estimate again; the card that
    // didn't change keeps the height React Flow measured on it.
    expect(estimate).toHaveBeenCalledWith(expect.objectContaining({id: top.id}))
    expect(estimate).not.toHaveBeenCalledWith(expect.objectContaining({id: bottom.id}))
  })

  it('keeps the measurement of a card a re-layout did not change', () => {
    const controller = new LayoutController()
    controller.rebuild(stacked, rebuildOptions())
    controller.applyChanges([dimensionChange('a', 120)])

    const estimate = vi.fn(byExpanded)
    controller.rebuild(stacked, rebuildOptions({estimate}))
    expect(estimate).not.toHaveBeenCalledWith(expect.objectContaining({id: 'a'}))

    // A card whose data changed is about to render differently, so its
    // measurement goes.
    const changed = vi.fn(byExpanded)
    controller.rebuild(
      stacked,
      rebuildOptions({estimate: changed, warningCountByNodeId: new Map([['a', 1]])}),
    )
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({id: 'a'}))
  })

  it('remembers a drag from React Flow and applies it to the card', () => {
    const controller = new LayoutController()
    controller.rebuild(stacked, rebuildOptions())

    const {state, remeasured} = controller.applyChanges([
      {id: 'a', type: 'position', position: {x: 42, y: 24}, dragging: true},
    ])
    expect(remeasured).toBe(false)
    expect(state.nodes.find((n) => n.id === 'a')!.position).toEqual({x: 42, y: 24})

    const relaid = controller.rebuild(stacked, rebuildOptions({direction: 'TB'}))
    expect(relaid.nodes.find((n) => n.id === 'a')!.position).toEqual({x: 42, y: 24})
  })
})
