import {nodeMatchesFilters, type FilterContext, type FilterDef, type FilterValues} from './filters'
import type {GraphNode, SchemaGraph} from './types'

interface FilterInputs {
  filters: FilterValues
  filterDefs: readonly FilterDef[]
  filterContext: FilterContext
}

export interface VisibleGraphInputs extends FilterInputs {
  focusNodeId: string | null
  selectedNodeId: string | null
}

export type FocusCandidate = Pick<GraphNode, 'id' | 'title' | 'isSystem' | 'kind'>

function isolateNode(graph: SchemaGraph, focusNodeId: string): SchemaGraph {
  const keep = new Set<string>([focusNodeId])
  for (const edge of graph.edges) {
    if (edge.source === focusNodeId) keep.add(edge.target)
    if (edge.target === focusNodeId) keep.add(edge.source)
  }
  return {
    nodes: graph.nodes.filter((n) => keep.has(n.id)),
    edges: graph.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  }
}

/**
 * What the canvas draws: the filtered graph, narrowed to the focus and its
 * neighbours. Filters never drop the focused or selected type, so each keeps a card.
 */
export function visibleSubgraph(
  graph: SchemaGraph,
  {filters, filterDefs, filterContext, focusNodeId, selectedNodeId}: VisibleGraphInputs,
): SchemaGraph {
  const keep = new Set(
    graph.nodes
      .filter((n) => nodeMatchesFilters(n, filters, filterDefs, filterContext))
      .map((n) => n.id),
  )
  if (focusNodeId) keep.add(focusNodeId)
  if (selectedNodeId) keep.add(selectedNodeId)
  let g: SchemaGraph = {
    nodes: graph.nodes.filter((n) => keep.has(n.id)),
    edges: graph.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  }
  // A focus from a stale URL names no type, so there's nothing to isolate.
  if (focusNodeId && g.nodes.some((n) => n.id === focusNodeId)) {
    g = isolateNode(g, focusNodeId)
    if (selectedNodeId && !g.nodes.some((n) => n.id === selectedNodeId)) {
      const selected = graph.nodes.find((n) => n.id === selectedNodeId)
      if (selected) g = {nodes: [...g.nodes, selected], edges: g.edges}
    }
  }
  return g
}

/** The focus picker's options, by title: types the filters show, plus the current focus. */
export function focusCandidates(
  graph: SchemaGraph,
  {filters, filterDefs, filterContext, focusNodeId}: FilterInputs & {focusNodeId: string | null},
): FocusCandidate[] {
  return graph.nodes
    .filter(
      (n) => n.id === focusNodeId || nodeMatchesFilters(n, filters, filterDefs, filterContext),
    )
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((n) => ({id: n.id, title: n.title, isSystem: n.isSystem, kind: n.kind}))
}
