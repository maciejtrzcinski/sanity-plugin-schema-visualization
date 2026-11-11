import {applyNodeChanges, MarkerType, type NodeChange, type Rect} from '@xyflow/react'

import type {EdgeKindDef} from './edgeKinds'
import type {FlowEdge, FlowNode, TypeNodeData} from './flowModel'
import {layoutGraph, NODE_WIDTH, reflowHeights, type ClusterBox, type HeightOf} from './layout'
import {NO_ANNOTATIONS, sameAnnotations, type NodeAnnotations} from './nodeAnnotations'
import {cssColor} from './registry'
import type {GraphEdgeKind, SchemaGraph} from './types'

/** A call that changed nothing returns the same object, so React bails out. */
export interface LayoutState {
  nodes: FlowNode[]
  edges: FlowEdge[]
  clusters: ClusterBox[]
}

const EMPTY_STATE: LayoutState = {nodes: [], edges: [], clusters: []}

export interface CardOptions {
  compactMode: boolean
  expandedNodeIds: ReadonlySet<string>
  annotations: ReadonlyMap<string, NodeAnnotations>
  issueCountByNodeId: ReadonlyMap<string, number>
  warningCountByNodeId: ReadonlyMap<string, number>
  estimate: HeightOf
}

export interface RebuildOptions extends CardOptions {
  direction: 'LR' | 'TB'
  onToggleExpand: (nodeId: string) => void
  edgeKindById: ReadonlyMap<GraphEdgeKind, EdgeKindDef>
  catchAllEdge: EdgeKindDef
}

function sameNodeData(a: TypeNodeData, b: TypeNodeData): boolean {
  return (
    a.node === b.node &&
    a.fieldCount === b.fieldCount &&
    a.expanded === b.expanded &&
    a.connectionCount === b.connectionCount &&
    a.warningCount === b.warningCount &&
    a.infoCount === b.infoCount &&
    // By value: the annotation map is rebuilt whenever any node's data arrives.
    sameAnnotations(a.annotations, b.annotations) &&
    a.onToggleExpand === b.onToggleExpand
  )
}

/** An unchanged node comes back as the same object, so `TypeNode`'s memo holds. */
function buildBaseElements(
  graph: SchemaGraph,
  options: RebuildOptions,
  previousNodes: Map<string, FlowNode>,
): {nodes: FlowNode[]; edges: FlowEdge[]} {
  const {
    compactMode,
    expandedNodeIds,
    onToggleExpand,
    issueCountByNodeId,
    warningCountByNodeId,
    annotations,
    edgeKindById,
    catchAllEdge,
  } = options

  const connectionCounts = new Map<string, number>()
  for (const edge of graph.edges) {
    connectionCounts.set(edge.source, (connectionCounts.get(edge.source) ?? 0) + 1)
    connectionCounts.set(edge.target, (connectionCounts.get(edge.target) ?? 0) + 1)
  }

  const nodes: FlowNode[] = graph.nodes.map((node) => {
    const warningCount = warningCountByNodeId.get(node.id) ?? 0
    const data = {
      node,
      fieldCount: node.fields.length,
      expanded: !compactMode || expandedNodeIds.has(node.id),
      connectionCount: connectionCounts.get(node.id) ?? 0,
      warningCount,
      infoCount: (issueCountByNodeId.get(node.id) ?? 0) - warningCount,
      annotations: annotations.get(node.id) ?? NO_ANNOTATIONS,
      onToggleExpand,
    } satisfies TypeNodeData

    const previous = previousNodes.get(node.id)
    if (previous && sameNodeData(previous.data, data)) return previous

    return {
      id: node.id,
      type: 'typeNode',
      position: previous?.position ?? {x: 0, y: 0},
      // Explicit: `undefined` would defeat `computeStyledNodes`' identity check.
      selected: previous?.selected ?? false,
      data,
    }
  })

  const edges: FlowEdge[] = graph.edges.map((edge) => {
    const edgeKind = edgeKindById.get(edge.kind) ?? catchAllEdge
    const color = cssColor(edgeKind.color)
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'field',
      data: {fieldName: edge.fieldName},
      style: {
        strokeWidth: 1.5,
        stroke: color,
        strokeDasharray: edgeKind.dash,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color,
      },
      animated: false,
      zIndex: 0,
    }
  })

  return {nodes, edges}
}

function patchNodeData(nodes: FlowNode[], options: CardOptions): FlowNode[] {
  const {compactMode, expandedNodeIds, annotations, issueCountByNodeId, warningCountByNodeId} =
    options
  let changed = false
  const next = nodes.map((node) => {
    const expanded = !compactMode || expandedNodeIds.has(node.id)
    const nodeAnnotations = annotations.get(node.id) ?? NO_ANNOTATIONS
    const warningCount = warningCountByNodeId.get(node.id) ?? 0
    const infoCount = (issueCountByNodeId.get(node.id) ?? 0) - warningCount
    if (
      node.data.expanded === expanded &&
      node.data.warningCount === warningCount &&
      node.data.infoCount === infoCount &&
      sameAnnotations(node.data.annotations, nodeAnnotations)
    ) {
      return node
    }
    changed = true
    return {
      ...node,
      data: {...node.data, expanded, warningCount, infoCount, annotations: nodeAnnotations},
    }
  })
  return changed ? next : nodes
}

function restoreDraggedPositions(
  nodes: FlowNode[],
  dragged: Map<string, {x: number; y: number}>,
): FlowNode[] {
  if (dragged.size === 0) return nodes
  return nodes.map((node) => {
    const at = dragged.get(node.id)
    if (!at || (at.x === node.position.x && at.y === node.position.y)) return node
    return {...node, position: at}
  })
}

/**
 * What's on the canvas and the rules for changing it, outside React.
 * `GraphCanvas` subscribes through `useSyncExternalStore`.
 */
export class LayoutController {
  private current: LayoutState = EMPTY_STATE
  private heights = new Map<string, number>()
  /** Real heights by node id; dropped when a card's data changes or it leaves the graph. */
  private measuredHeights = new Map<string, number>()
  private draggedPositions = new Map<string, {x: number; y: number}>()
  private compactMode: boolean
  private listeners = new Set<() => void>()

  constructor(compactMode = false) {
    this.compactMode = compactMode
  }

  /** Bound: `useSyncExternalStore` re-subscribes when its identity changes. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): LayoutState => this.current

  get state(): LayoutState {
    return this.current
  }

  rebuild(graph: SchemaGraph, options: RebuildOptions): LayoutState {
    const previousNodes = new Map(this.current.nodes.map((n) => [n.id, n]))
    const {nodes: baseNodes, edges} = buildBaseElements(graph, options, previousNodes)

    const present = new Set(baseNodes.map((n) => n.id))
    for (const id of this.measuredHeights.keys()) {
      if (!present.has(id)) this.measuredHeights.delete(id)
    }
    for (const node of baseNodes) {
      if (node !== previousNodes.get(node.id)) this.measuredHeights.delete(node.id)
    }

    const laidOut = layoutGraph(
      baseNodes,
      edges,
      options.direction,
      this.heightOf(options.estimate),
    )
    this.heights = laidOut.heights
    this.compactMode = options.compactMode
    return this.commit({
      nodes: restoreDraggedPositions(laidOut.nodes, this.draggedPositions),
      edges: laidOut.edges,
      clusters: laidOut.clusters,
    })
  }

  patch(options: CardOptions): LayoutState {
    const {compactMode, estimate} = options

    // A compact-mode switch is a `rebuild`; this declines, and the rebuild adopts the mode.
    if (this.compactMode !== compactMode) {
      this.compactMode = compactMode
      return this.current
    }

    const nodes = this.current.nodes
    const patched = patchNodeData(nodes, options)
    if (patched === nodes) return this.current

    for (let i = 0; i < patched.length; i++) {
      if (patched[i] !== nodes[i]) this.measuredHeights.delete(patched[i].id)
    }

    return this.reflowFrom(patched, estimate)
  }

  reflow(estimate: HeightOf): LayoutState {
    return this.reflowFrom(this.current.nodes, estimate)
  }

  applyChanges(changes: NodeChange<FlowNode>[]): {state: LayoutState; remeasured: boolean} {
    let remeasured = false
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        this.dragged(change.id, change.position)
      }
      if (change.type === 'dimensions' && change.dimensions && change.dimensions.height > 0) {
        if (this.measured(change.id, change.dimensions.height)) remeasured = true
      }
    }
    const nodes = applyNodeChanges(changes, this.current.nodes)
    const state =
      nodes === this.current.nodes ? this.current : this.commit({...this.current, nodes})
    return {state, remeasured}
  }

  /** Rounded, so sub-pixel jitter can't retrigger the re-flow forever. */
  measured(id: string, height: number): boolean {
    const rounded = Math.round(height)
    if (this.measuredHeights.get(id) === rounded) return false
    this.measuredHeights.set(id, rounded)
    return true
  }

  dragged(id: string, position: {x: number; y: number}): void {
    this.draggedPositions.set(id, position)
  }

  forgetDragged(): void {
    this.draggedPositions.clear()
  }

  neighbourhoodBounds(nodeId: string): Rect | null {
    if (!this.current.nodes.some((n) => n.id === nodeId)) return null
    const ids = new Set([nodeId])
    for (const edge of this.current.edges) {
      if (edge.source === nodeId) ids.add(edge.target)
      if (edge.target === nodeId) ids.add(edge.source)
    }
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    for (const node of this.current.nodes) {
      if (!ids.has(node.id)) continue
      left = Math.min(left, node.position.x)
      top = Math.min(top, node.position.y)
      right = Math.max(right, node.position.x + NODE_WIDTH)
      bottom = Math.max(bottom, node.position.y + (this.heights.get(node.id) ?? 0))
    }
    return {x: left, y: top, width: right - left, height: bottom - top}
  }

  private heightOf(estimate: HeightOf): HeightOf {
    return (node) => this.measuredHeights.get(node.id) ?? estimate(node)
  }

  private reflowFrom(nodes: FlowNode[], estimate: HeightOf): LayoutState {
    const reflowed = reflowHeights(
      nodes,
      this.heights,
      this.current.clusters,
      this.heightOf(estimate),
    )
    this.heights = reflowed.heights
    if (reflowed.nodes === this.current.nodes && reflowed.clusters === this.current.clusters) {
      return this.current
    }
    return this.commit({
      nodes: reflowed.nodes,
      edges: this.current.edges,
      clusters: reflowed.clusters,
    })
  }

  private commit(state: LayoutState): LayoutState {
    this.current = state
    for (const listener of this.listeners) listener()
    return state
  }
}
