import {applyNodeChanges, MarkerType, type NodeChange} from '@xyflow/react'

import type {EdgeKindDef} from './edgeKinds'
import type {FlowEdge, FlowNode, TypeNodeData} from './flowModel'
import {layoutGraph, reflowHeights, type ClusterBox, type HeightOf} from './layout'
import {NO_ANNOTATIONS, sameAnnotations, type NodeAnnotations} from './nodeAnnotations'
import {cssColor} from './registry'
import type {GraphEdgeKind, SchemaGraph} from './types'

/**
 * Everything the canvas paints, as one object. A controller call returns the
 * *same* object when it changed nothing, so `GraphCanvas` can hand the result
 * straight to `setState` and let React bail out of the render.
 */
export interface LayoutState {
  nodes: FlowNode[]
  edges: FlowEdge[]
  clusters: ClusterBox[]
}

const EMPTY_STATE: LayoutState = {nodes: [], edges: [], clusters: []}

/** The card inputs that change what a card shows without changing the graph's shape. */
export interface CardOptions {
  compactMode: boolean
  /** Node ids individually expanded to show full field data, overriding `compactMode`. */
  expandedNodeIds: ReadonlySet<string>
  annotations: ReadonlyMap<string, NodeAnnotations>
  issueCountByNodeId: ReadonlyMap<string, number>
  warningCountByNodeId: ReadonlyMap<string, number>
  /**
   * Height to reserve for a card React Flow has not measured yet — normally
   * `estimateNodeHeight` bound to the live badge registry and locale. The
   * controller layers the real measurements it collects on top of this.
   */
  estimate: HeightOf
}

/** Everything {@link LayoutController.rebuild} needs beyond the graph itself. */
export interface RebuildOptions extends CardOptions {
  direction: 'LR' | 'TB'
  onToggleExpand: (nodeId: string) => void
  /** How each connection kind is drawn — `ResolvedConfig.edgeKindById`. */
  edgeKindById: ReadonlyMap<GraphEdgeKind, EdgeKindDef>
  /** Style for an edge kind the registry doesn't have — `ResolvedConfig.catchAllEdge`. */
  catchAllEdge: EdgeKindDef
}

/** True when nothing `TypeNode` reads has changed. */
function sameNodeData(a: TypeNodeData, b: TypeNodeData): boolean {
  return (
    a.node === b.node &&
    a.fieldCount === b.fieldCount &&
    a.expanded === b.expanded &&
    a.connectionCount === b.connectionCount &&
    a.warningCount === b.warningCount &&
    a.infoCount === b.infoCount &&
    // By value: the annotation map is rebuilt whenever any node's data
    // arrives, so identity here would re-render every card for one.
    sameAnnotations(a.annotations, b.annotations) &&
    a.onToggleExpand === b.onToggleExpand
  )
}

/**
 * Turns the visible graph into React Flow elements. `previousNodes` holds the
 * nodes from the last build, by id: a node whose data is unchanged is handed
 * back as the same object so `layoutGraph` can see its position is unchanged
 * too, all the way down to `TypeNode`'s `React.memo` — otherwise every filter
 * toggle re-renders every card, including the ones it didn't touch.
 */
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
      // Explicit — matches `computeStyledNodes`' comparison, which would
      // otherwise never find `n.selected === selected` true (undefined never
      // strictly-equals a computed boolean), silently defeating its identity
      // preservation for every node, always.
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
      // `FieldEdge`: a smoothstep path with an HTML label.
      type: 'field',
      // No `label` here — `computeStyledEdges` only shows it for a hovered or
      // selection-connected edge, so a busy schema isn't wall-to-wall field-name
      // text (and doesn't pay for a label DOM node per edge) until it's useful.
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

/**
 * Applies the per-node data that changes without the graph's shape changing —
 * one card's expand chevron, annotations (doc counts, anything a consumer
 * adds) arriving for the badges, and health issues moving with them. Nodes it
 * doesn't touch come back as the same objects, and the array itself is
 * returned unchanged when nothing at all differs, so callers can bail out.
 */
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

/**
 * Puts cards the user dragged back where they left them, so a re-layout
 * triggered by something else (a filter toggle, a direction switch) doesn't
 * silently undo manual placement.
 */
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
 * Owns what's on the canvas and the rules for changing it, with no React in
 * sight: the laid-out nodes, edges and cluster bands, the height reserved per
 * card, the heights React Flow measured on the real DOM, and the positions the
 * user dragged cards to.
 *
 * `GraphCanvas` is left with "call the controller, schedule frames": it
 * subscribes with `useSyncExternalStore` and every method that changes
 * something publishes the next {@link LayoutState}. The ordering rules between
 * a re-layout and a re-flow (which measurements survive, and which pass owns a
 * compact-mode switch) live here, where they are unit-testable, rather than in
 * comments beside two effects.
 */
export class LayoutController {
  private current: LayoutState = EMPTY_STATE
  /** Height the last layout or re-flow reserved per node id. */
  private heights = new Map<string, number>()
  /**
   * Heights React Flow actually measured on the rendered cards, by node id.
   * `estimate` only has to be right for a card's very first paint: once a card
   * has rendered, its real height lands here (via `measured`) and every later
   * layout and re-flow uses it instead — so a Sanity UI or font-size change can
   * drift the estimates without cards silently overlapping. Entries are dropped
   * when a card's data changes (it's about to render at a different height) or
   * it leaves the graph.
   */
  private measuredHeights = new Map<string, number>()
  /**
   * Positions the user dragged a card to, kept across re-layouts so a filter
   * toggle doesn't throw away manual placement. Cleared only by
   * {@link forgetDragged} — the toolbar's explicit "re-layout" is the one
   * action that means "forget this".
   */
  private draggedPositions = new Map<string, {x: number; y: number}>()
  /** The compact mode {@link current} was built for — see {@link patch}. */
  private compactMode: boolean
  private listeners = new Set<() => void>()

  constructor(compactMode = false) {
    this.compactMode = compactMode
  }

  /**
   * Subscribes to the canvas state, for `useSyncExternalStore`. Bound, because
   * the hook re-subscribes whenever this function's identity changes.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** The current canvas state, for `useSyncExternalStore`. Stable between changes. */
  getSnapshot = (): LayoutState => this.current

  get state(): LayoutState {
    return this.current
  }

  /**
   * Runs dagre over the visible graph — the full pass, for when the graph's
   * shape or the layout direction changed. Cards the user dragged keep their
   * positions; measurements that no longer describe what will render are
   * dropped first, so the layout sizes those cards by estimate again.
   */
  rebuild(graph: SchemaGraph, options: RebuildOptions): LayoutState {
    const previousNodes = new Map(this.current.nodes.map((n) => [n.id, n]))
    const {nodes: baseNodes, edges} = buildBaseElements(graph, options, previousNodes)

    // Drop measurements that no longer describe what will render: cards that
    // left the graph, and cards whose data changed (`buildBaseElements` hands
    // back the previous object only when nothing did). The rest feed the
    // layout their real heights.
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

  /**
   * Absorbs a change to what some cards render — a chevron toggled, or
   * annotations and the health issues they raise arriving — without re-running
   * dagre: the cards are patched in place and the re-flow pushes whatever sits
   * below them up or down, rather than re-laying-out (and re-framing) a graph
   * whose shape didn't change.
   */
  patch(options: CardOptions): LayoutState {
    const {compactMode, estimate} = options

    // A compact-mode switch resizes every card at once and resets the per-node
    // overrides, which is a `rebuild` — don't also re-flow the old positions
    // underneath it. The caller runs both paths for that change; this one
    // declines, and the rebuild that follows is what adopts the new mode.
    if (this.compactMode !== compactMode) {
      this.compactMode = compactMode
      return this.current
    }

    const nodes = this.current.nodes
    const patched = patchNodeData(nodes, options)
    if (patched === nodes) return this.current

    // A patched card renders new content, so its old measurement is stale —
    // this re-flow sizes it by estimate, and the measurement that follows the
    // re-render corrects the stack via `measured` + `reflow`.
    for (let i = 0; i < patched.length; i++) {
      if (patched[i] !== nodes[i]) this.measuredHeights.delete(patched[i].id)
    }

    return this.reflowFrom(patched, estimate)
  }

  /**
   * Re-flows the current cards against the heights measured so far. Callers
   * debounce this to one pass per frame: a mount measures every visible card
   * in a burst.
   */
  reflow(estimate: HeightOf): LayoutState {
    return this.reflowFrom(this.current.nodes, estimate)
  }

  /**
   * Records what React Flow reports about the rendered cards — where a drag
   * left one, and how tall each actually is — and applies the changes to the
   * nodes. `remeasured` is true when a height disagreed with what was on
   * record, i.e. when a {@link reflow} is owed.
   */
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

  /**
   * Records the height React Flow measured on a rendered card. Rounded, so
   * sub-pixel jitter can't retrigger the re-flow forever; returns true when
   * this is news.
   */
  measured(id: string, height: number): boolean {
    const rounded = Math.round(height)
    if (this.measuredHeights.get(id) === rounded) return false
    this.measuredHeights.set(id, rounded)
    return true
  }

  /** Records where the user dropped a card, for the next {@link rebuild}. */
  dragged(id: string, position: {x: number; y: number}): void {
    this.draggedPositions.set(id, position)
  }

  /** Forgets every manual placement — what an explicit "re-layout" means. */
  forgetDragged(): void {
    this.draggedPositions.clear()
  }

  /** Measured height when there is one, the caller's estimate otherwise. */
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

  /** Publishes the next state to whoever is subscribed. */
  private commit(state: LayoutState): LayoutState {
    this.current = state
    for (const listener of this.listeners) listener()
    return state
  }
}
