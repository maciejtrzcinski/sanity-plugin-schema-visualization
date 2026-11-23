import {useMemo} from 'react'
import type {Schema} from 'sanity'

import {useConfig} from '../config'
import type {FilterContext} from '../filters'
import {
  buildFilterContext,
  computeGraphStats,
  groupIssuesByNode,
  type GraphStats,
} from '../graphModel'
import {runHealthRules, type HealthIssue} from '../healthRules'
import {buildGraph} from '../schemaToGraph'
import type {GraphNode, SchemaGraph} from '../types'
import {useTranslate} from './useTranslate'

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
  const issuesByNodeId = useMemo(() => groupIssuesByNode(healthIssues), [healthIssues])
  const filterContext = useMemo(
    () => buildFilterContext(graph, issuesByNodeId, docCountByType, t),
    [graph, issuesByNodeId, docCountByType, t],
  )
  const stats = useMemo(
    () => computeGraphStats(graph, {kinds, kindById, catchAll}),
    [graph, kinds, kindById, catchAll],
  )

  return {graph, healthIssues, nodesById, issuesByNodeId, filterContext, stats}
}
