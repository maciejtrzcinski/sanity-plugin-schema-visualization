import type {ResolvedConfig} from './config'
import type {FilterContext} from './filters'
import type {HealthIssue} from './healthRules'
import type {TranslateFn} from './i18n'
import type {NodeKindDef} from './kinds'
import type {GraphNodeKind, SchemaGraph} from './types'

export interface GraphStats {
  byKind: Array<{kind: NodeKindDef; count: number}>
  edges: number
  system: number
}

type StatsConfig = Pick<ResolvedConfig, 'kinds' | 'kindById' | 'catchAll'>

/** Custom types per kind, in registry order. System types are counted apart, not by kind. */
export function computeGraphStats(graph: SchemaGraph, config: StatsConfig): GraphStats {
  const custom = graph.nodes.filter((n) => !n.isSystem)
  const countById = new Map<GraphNodeKind, number>()
  for (const node of custom) {
    const id = (config.kindById.get(node.kind) ?? config.catchAll).id
    countById.set(id, (countById.get(id) ?? 0) + 1)
  }
  return {
    byKind: config.kinds.map((kind) => ({kind, count: countById.get(kind.id) ?? 0})),
    edges: graph.edges.length,
    system: graph.nodes.length - custom.length,
  }
}

export function groupIssuesByNode(issues: readonly HealthIssue[]): Map<string, HealthIssue[]> {
  const map = new Map<string, HealthIssue[]>()
  for (const issue of issues) {
    const list = map.get(issue.nodeId)
    if (list) list.push(issue)
    else map.set(issue.nodeId, [issue])
  }
  return map
}

export function countWarnings(issues: readonly HealthIssue[]): number {
  return issues.filter((issue) => issue.severity === 'warning').length
}

export function buildFilterContext(
  graph: SchemaGraph,
  issuesByNodeId: ReadonlyMap<string, readonly HealthIssue[]>,
  docCountByType: ReadonlyMap<string, number>,
  t: TranslateFn,
): FilterContext {
  const issueCountByNodeId = new Map<string, number>()
  const warningCountByNodeId = new Map<string, number>()
  for (const [nodeId, issues] of issuesByNodeId) {
    issueCountByNodeId.set(nodeId, issues.length)
    const warnings = countWarnings(issues)
    if (warnings > 0) warningCountByNodeId.set(nodeId, warnings)
  }

  // Judged against the whole schema, so an unrelated filter can't flip a node's "orphan" status.
  const connectedNodeIds = new Set<string>()
  for (const edge of graph.edges) {
    connectedNodeIds.add(edge.source)
    connectedNodeIds.add(edge.target)
  }

  return {graph, issueCountByNodeId, warningCountByNodeId, connectedNodeIds, docCountByType, t}
}
