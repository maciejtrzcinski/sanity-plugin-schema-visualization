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
 * Dimming is CSS, not per-card data, so a click touches only what it changes.
 * Per-card `dimmed` re-rendered every card: over a second on 331 types.
 */
export const DIM_CLASSES = {
  selecting: 'sv-selecting',
  lit: 'sv-lit',
  miss: 'sv-miss',
} as const

/** An unchanged node keeps its object, so React Flow skips it. */
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

/** Labels only on hovered or selected edges; every other edge keeps its object. */
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
