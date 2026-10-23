import type {Edge, Node} from '@xyflow/react'

import {defaultTranslate, type TranslateFn} from './i18n'
import type {NodeAnnotations} from './nodeAnnotations'
import type {NodeBadgeContext} from './nodeBadges'
import type {GraphNode} from './types'

/**
 * What the canvas carries per node and per edge, on React Flow's own generic
 * types. It lives in the core rather than beside the component that renders it
 * because the core owns it: `layout.ts` sizes a card from this data and
 * `graphStyling.ts` dims it, both without React in sight. `TypeNode.tsx` reads
 * the same shape when it paints one — so this file is the contract between
 * them, not a re-export of the shell.
 */

export interface TypeNodeData extends Record<string, unknown> {
  node: GraphNode
  fieldCount: number
  /** Whether this node's field list is currently shown (compact-mode override or global full-detail mode). */
  expanded: boolean
  connectionCount: number
  /** Health issues raised against this type, split by severity — the badge is painted from the worse of the two. */
  warningCount: number
  infoCount: number
  /** Per-node data loaded after the graph was built, e.g. live document counts. */
  annotations: NodeAnnotations
  onToggleExpand: (nodeId: string) => void
}

/**
 * The header badges a card carries, derived from what the canvas already knows
 * about it. Shared by `TypeNode`, which renders the list, and
 * `estimateNodeHeight`, which reserves room for it, so the two can't drift.
 */
export function nodeBadgeContext(
  data: TypeNodeData,
  t: TranslateFn = defaultTranslate,
): NodeBadgeContext {
  return {
    t,
    annotations: data.annotations,
    connectionCount: data.connectionCount,
    issueCount: data.warningCount + data.infoCount,
    warningCount: data.warningCount,
    infoCount: data.infoCount,
    expanded: data.expanded,
    surface: 'card',
  }
}

export type FlowNode = Node<TypeNodeData>

export type FlowEdge = Edge<{fieldName: string}>
