import type {NodeAnnotations} from '../nodeAnnotations'
import type {GraphNode, GraphNodeKind} from '../types'
import type {DocumentStatusCounts} from './index'

export function documentCountAnnotations(
  nodes: readonly GraphNode[],
  docCountKinds: ReadonlySet<GraphNodeKind>,
  counts: ReadonlyMap<string, number>,
  breakdown: ReadonlyMap<string, DocumentStatusCounts> = new Map(),
): Map<string, NodeAnnotations> {
  const annotations = new Map<string, NodeAnnotations>()
  if (counts.size === 0) return annotations
  for (const node of nodes) {
    if (!docCountKinds.has(node.kind)) continue
    const docCount = counts.get(node.name)
    if (docCount === undefined) continue
    const split = breakdown.get(node.name)
    annotations.set(
      node.id,
      split ? {docCount, publishedCount: split.published, draftCount: split.drafts} : {docCount},
    )
  }
  return annotations
}
