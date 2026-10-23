import type {FlowEdge, FlowNode} from './flowModel'
import type {GraphNode} from './types'

export function matchesQuery(node: GraphNode, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  if (node.name.toLowerCase().includes(q) || node.title.toLowerCase().includes(q)) return true
  return node.fields.some(
    (f) => f.name.toLowerCase().includes(q) || f.typeLabel.toLowerCase().includes(q),
  )
}

/**
 * Class names the canvas stylesheet dims by (see `CANVAS_CSS` in
 * `GraphCanvas`). Dimming is CSS rather than per-node data so a click touches
 * only what it changes: the selected node, its neighbours and their edges get
 * `LIT`, the canvas gets `SELECTING`, and the stylesheet fades everything
 * else. Carrying `dimmed` in each card's data instead re-rendered every card's
 * Sanity UI tree on every click — over a second on a 331-type schema.
 */
export const DIM_CLASSES = {
  /** On the canvas while a node is selected. */
  selecting: 'sv-selecting',
  /** On the selected node, its neighbours, and the edges between them. */
  lit: 'sv-lit',
  /** On a node the current search does not match. */
  miss: 'sv-miss',
} as const

/**
 * Marks nodes for the canvas stylesheet: lit around the selection, missed by
 * the search. A node whose marks and selection are unchanged keeps its object,
 * so React Flow skips it — on a selection change that is everything but the
 * selection's neighbourhood.
 */
export function computeStyledNodes(
  nodes: FlowNode[],
  searchQuery: string,
  selectedNodeId: string | null,
  adjacency: Map<string, Set<string>>,
): FlowNode[] {
  const searching = searchQuery.trim().length > 0
  const neighbors = selectedNodeId ? adjacency.get(selectedNodeId) : undefined

  return nodes.map((n) => {
    const lit =
      selectedNodeId !== null && (n.id === selectedNodeId || Boolean(neighbors?.has(n.id)))
    const miss = searching && !matchesQuery(n.data.node, searchQuery)
    const className =
      [lit && DIM_CLASSES.lit, miss && DIM_CLASSES.miss].filter(Boolean).join(' ') || undefined
    const selected = n.id === selectedNodeId

    if (n.className === className && n.selected === selected) return n
    return {...n, className, selected}
  })
}

/**
 * Lights the edges touching the selected node (raised above the rest, which
 * the stylesheet fades), and only shows an edge's field-name label when it's
 * worth reading — hovered, or connected to the current selection — rather
 * than on every edge all the time (a labeled edge costs an extra DOM node per
 * edge, which adds up on a schema with a lot of cross-references).
 *
 * Every other edge keeps its object, so a selection change re-renders only the
 * edges it lights or unlights instead of recomputing every path on the canvas.
 */
export function computeStyledEdges(
  baseEdges: FlowEdge[],
  selectedNodeId: string | null,
  hoveredEdgeId: string | null,
): FlowEdge[] {
  if (!selectedNodeId && !hoveredEdgeId) return baseEdges

  return baseEdges.map((e) => {
    const connected =
      selectedNodeId !== null && (e.source === selectedNodeId || e.target === selectedNodeId)
    const className = connected ? DIM_CLASSES.lit : undefined
    const zIndex = connected ? 1 : 0
    const label = connected || e.id === hoveredEdgeId ? e.data?.fieldName : undefined

    if (e.className === className && e.zIndex === zIndex && e.label === label) return e
    return {...e, className, zIndex, label}
  })
}
