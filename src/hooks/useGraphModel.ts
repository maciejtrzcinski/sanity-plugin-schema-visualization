import {useMemo} from 'react'
import type {Schema} from 'sanity'

import {useConfig} from '../config'
import type {FilterContext} from '../filters'
import {runHealthRules, type HealthIssue} from '../healthRules'
import type {NodeKindDef} from '../kinds'
import {buildGraph} from '../schemaToGraph'
import type {GraphNode, GraphNodeKind, SchemaGraph} from '../types'
import {useTranslate} from './useTranslate'

export interface GraphStats {
  byKind: Array<{kind: NodeKindDef; count: number}>
  edges: number
  system: number
}

export interface GraphModel {
  graph: SchemaGraph
  healthIssues: HealthIssue[]
  nodesById: Map<string, GraphNode>
  issuesByNodeId: Map<string, HealthIssue[]>
  filterContext: FilterContext
  stats: GraphStats
}

export function useSchemaGraph(schema: Schema): SchemaGraph {
  const config = useConfig()
  const t = useTranslate()
  return useMemo(() => buildGraph(schema, config, t), [schema, config, t])
}

export function useGraphModel(
  graph: SchemaGraph,
  docCountByType: ReadonlyMap<string, number>,
  schema: Schema,
): GraphModel {
  const config = useConfig()
  const {kinds, kindById, catchAll} = config
  const t = useTranslate()

  const healthIssues = useMemo(
    () => runHealthRules(graph, config, {t, docCountByType, schema}),
    [graph, config, t, docCountByType, schema],
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

    // Judged against the whole schema, so an unrelated filter can't flip a node's "orphan" status.
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
