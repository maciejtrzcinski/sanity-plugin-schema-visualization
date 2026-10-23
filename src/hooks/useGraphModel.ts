import {useMemo} from 'react'
import type {Schema} from 'sanity'

import {useConfig} from '../config'
import type {FilterContext} from '../filters'
import {runHealthRules, type HealthIssue} from '../healthRules'
import type {NodeKindDef} from '../kinds'
import {buildGraph} from '../schemaToGraph'
import type {GraphNode, GraphNodeKind, SchemaGraph} from '../types'
import {useTranslate} from './useTranslate'

/** Headline counts for the toolbar's stats line. */
export interface GraphStats {
  /**
   * How many types the author registered, per kind, in registry order — built
   * from the kind registry rather than fixed `documents`/`objects`/`other`
   * fields, so a custom kind gets its own count instead of disappearing into
   * a bucket. Types naming a kind the registry no longer has are counted
   * under the catch-all.
   */
  byKind: Array<{kind: NodeKindDef; count: number}>
  edges: number
  /** Sanity's built-in types, which `customNodes` never includes. */
  system: number
}

export interface GraphModel {
  graph: SchemaGraph
  healthIssues: HealthIssue[]
  nodesById: Map<string, GraphNode>
  issuesByNodeId: Map<string, HealthIssue[]>
  /** Everything a filter predicate needs beyond the node itself. */
  filterContext: FilterContext
  stats: GraphStats
}

/**
 * The graph for the compiled schema. Field labels and badges are built here,
 * so it is derived again when the Studio's locale changes — `t` is a stable
 * callback per locale, so nothing rebuilds while it stays put.
 */
export function useSchemaGraph(schema: Schema): SchemaGraph {
  // The resolved config is memoised on the options object's identity, so it
  // is as stable a dependency as its individual fields would be.
  const config = useConfig()
  const t = useTranslate()
  return useMemo(() => buildGraph(schema, config, t), [schema, config, t])
}

/**
 * Everything the toolbar, canvas and panels read off the graph, computed once
 * — so the canvas and the health rules can't disagree about what counts as an
 * orphan. Takes the live document counts because some health rules judge
 * them; with none loaded the map is simply empty.
 */
export function useGraphModel(
  graph: SchemaGraph,
  docCountByType: ReadonlyMap<string, number>,
): GraphModel {
  const config = useConfig()
  const {kinds, kindById, catchAll} = config
  const t = useTranslate()

  const healthIssues = useMemo(
    () => runHealthRules(graph, config, t, docCountByType),
    [graph, config, t, docCountByType],
  )

  const nodesById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph])

  const issuesByNodeId = useMemo(() => {
    const map = new Map<string, HealthIssue[]>()
    for (const issue of healthIssues) {
      const list = map.get(issue.nodeId)
      if (list) list.push(issue)
      else map.set(issue.nodeId, [issue])
    }
    return map
  }, [healthIssues])

  const filterContext = useMemo<FilterContext>(() => {
    const issueCountByNodeId = new Map<string, number>()
    const warningCountByNodeId = new Map<string, number>()
    for (const [nodeId, issues] of issuesByNodeId) {
      issueCountByNodeId.set(nodeId, issues.length)
      const warnings = issues.filter((issue) => issue.severity === 'warning').length
      if (warnings > 0) warningCountByNodeId.set(nodeId, warnings)
    }

    // Connectivity is judged against the whole schema, not just what's
    // currently visible — otherwise toggling an unrelated filter could flip a
    // node in and out of "orphan" for reasons unrelated to its own edges.
    const connectedNodeIds = new Set<string>()
    for (const edge of graph.edges) {
      connectedNodeIds.add(edge.source)
      connectedNodeIds.add(edge.target)
    }

    return {
      graph,
      issueCountByNodeId,
      warningCountByNodeId,
      connectedNodeIds,
      docCountByType,
      t,
    }
  }, [graph, issuesByNodeId, docCountByType, t])

  const stats = useMemo<GraphStats>(() => {
    const custom = graph.nodes.filter((n) => !n.isSystem)
    const countById = new Map<GraphNodeKind, number>()
    for (const node of custom) {
      const id = (kindById.get(node.kind) ?? catchAll).id
      countById.set(id, (countById.get(id) ?? 0) + 1)
    }
    return {
      byKind: kinds.map((kind) => ({kind, count: countById.get(kind.id) ?? 0})),
      edges: graph.edges.length,
      system: graph.nodes.length - custom.length,
    }
  }, [graph, kinds, kindById, catchAll])

  return {graph, healthIssues, nodesById, issuesByNodeId, filterContext, stats}
}
