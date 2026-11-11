import type {Edge, Node} from '@xyflow/react'

import {defaultTranslate, type TranslateFn} from './i18n'
import type {NodeAnnotations} from './nodeAnnotations'
import type {NodeBadgeContext} from './nodeBadges'
import type {GraphNode} from './types'

export interface TypeNodeData extends Record<string, unknown> {
  node: GraphNode
  fieldCount: number
  expanded: boolean
  connectionCount: number
  warningCount: number
  infoCount: number
  annotations: NodeAnnotations
  onToggleExpand: (nodeId: string) => void
}

/** Shared by `TypeNode` and `estimateNodeHeight`, so badges and reserved height can't drift. */
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
