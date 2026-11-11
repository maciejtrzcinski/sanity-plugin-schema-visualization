import {Graph, layout} from '@dagrejs/dagre'
import {Position, type Edge} from '@xyflow/react'

import {nodeBadgeContext, type FlowNode, type TypeNodeData} from './flowModel'
import {defaultTranslate, type TranslateFn} from './i18n'
import {layeredLayout} from './layeredLayout'
import {collectNodeBadges, defaultNodeBadges, type NodeBadgeDef} from './nodeBadges'
import type {GraphNodeKind} from './types'

export interface ClusterBox {
  id: string
  kind: GraphNodeKind
  x: number
  y: number
  width: number
  height: number
}

export interface LaidOutGraph<E extends Edge> {
  nodes: FlowNode[]
  edges: E[]
  clusters: ClusterBox[]
  heights: Map<string, number>
}

const NODE_WIDTH = 260
const FIELD_ROW_HEIGHT = 22
const FIELD_LIST_PADDING = 16

/** Header metrics, mirroring what `TypeNode` paints. */
const HEADER_PADDING = 24
const TITLE_ROW_HEIGHT = 32
const SUBTITLE_ROW_HEIGHT = 20
const BADGE_ROW_MARGIN = 8
const BADGE_LINE_HEIGHT = 24
const BADGE_ROW_WIDTH = NODE_WIDTH - 24
const BADGE_GAP = 4
const LEAF_NOTE_HEIGHT = 40

/** Past this, an expanded card renders "+N more" instead of rows. */
export const MAX_VISIBLE_FIELDS = 20

function chipWidth(label: string): number {
  return Math.round(label.length * 5.5) + 16
}

/** Runs the same registry as `TypeNode`, so a new badge can't reserve no room for itself. */
function badgeRowHeight(
  data: TypeNodeData,
  badges: readonly NodeBadgeDef[],
  t: TranslateFn,
): number {
  const chips = collectNodeBadges(data.node, nodeBadgeContext(data, t), badges)
  if (chips.length === 0) return 0

  const total =
    chips.reduce((sum, chip) => sum + chipWidth(chip.label), 0) + BADGE_GAP * (chips.length - 1)
  const lines = Math.max(1, Math.ceil(total / BADGE_ROW_WIDTH))
  return BADGE_ROW_MARGIN + lines * BADGE_LINE_HEIGHT
}

/** Errs generous: under-reserving overlaps cards. Only holds until the card is first measured. */
export function estimateNodeHeight(
  data: TypeNodeData,
  badges: readonly NodeBadgeDef[] = defaultNodeBadges,
  t: TranslateFn = defaultTranslate,
): number {
  const {node, expanded, fieldCount} = data

  let height = HEADER_PADDING + TITLE_ROW_HEIGHT
  if (node.title !== node.name) height += SUBTITLE_ROW_HEIGHT
  height += badgeRowHeight(data, badges, t)

  if (expanded && fieldCount > 0) {
    const rows = fieldCount > MAX_VISIBLE_FIELDS ? MAX_VISIBLE_FIELDS + 1 : fieldCount
    height += rows * FIELD_ROW_HEIGHT + FIELD_LIST_PADDING
  }

  if (node.isLeaf) height += LEAF_NOTE_HEIGHT

  return height
}

const CLUSTER_PREFIX = 'cluster:'

export type HeightOf = (node: FlowNode) => number

const estimatedHeightOf: HeightOf = (node) => estimateNodeHeight(node.data)

function handleSides(direction: 'LR' | 'TB'): {
  sourcePosition: Position
  targetPosition: Position
} {
  return direction === 'TB'
    ? {sourcePosition: Position.Bottom, targetPosition: Position.Top}
    : {sourcePosition: Position.Right, targetPosition: Position.Left}
}

/** Past this many types or connections dagre stops being interactive (50s at 331 types). */
const DAGRE_MAX_NODES = 60
const DAGRE_MAX_EDGES = 240

export function layoutEngineFor(nodeCount: number, edgeCount: number): 'dagre' | 'layered' {
  return nodeCount <= DAGRE_MAX_NODES && edgeCount <= DAGRE_MAX_EDGES ? 'dagre' : 'layered'
}

const NODE_SEP = 64
const RANK_SEP = 160

interface Placement {
  topLeft: Map<string, {x: number; y: number}>
  clusters: ClusterBox[]
}

export function layoutGraph<E extends Edge>(
  nodes: FlowNode[],
  edges: E[],
  direction: 'LR' | 'TB' = 'LR',
  heightOf: HeightOf = estimatedHeightOf,
): LaidOutGraph<E> {
  const kindsPresent = new Set(nodes.map((n) => n.data.node.kind))
  const useClusters = kindsPresent.size > 1

  const heightByNodeId = new Map<string, number>()
  for (const node of nodes) heightByNodeId.set(node.id, heightOf(node))

  const placement =
    layoutEngineFor(nodes.length, edges.length) === 'dagre'
      ? placeWithDagre(nodes, edges, direction, heightByNodeId, useClusters)
      : placeLayered(nodes, edges, direction, heightByNodeId, useClusters)

  const {sourcePosition, targetPosition} = handleSides(direction)

  const laidOutNodes = nodes.map((node) => {
    const {x, y} = placement.topLeft.get(node.id) ?? {x: 0, y: 0}
    // Same object when unmoved: `TypeNode` is memoised.
    if (
      node.position.x === x &&
      node.position.y === y &&
      node.sourcePosition === sourcePosition &&
      node.targetPosition === targetPosition
    ) {
      return node
    }
    return {...node, position: {x, y}, sourcePosition, targetPosition}
  })

  return {nodes: laidOutNodes, edges, clusters: placement.clusters, heights: heightByNodeId}
}

function placeWithDagre(
  nodes: FlowNode[],
  edges: Edge[],
  direction: 'LR' | 'TB',
  heights: Map<string, number>,
  useClusters: boolean,
): Placement {
  const g = new Graph({compound: true})
  g.setDefaultEdgeLabel(() => ({}))
  g.setDefaultNodeLabel(() => ({}))
  g.setGraph({rankdir: direction, nodesep: NODE_SEP, ranksep: RANK_SEP, marginx: 48, marginy: 48})

  const kinds = new Set(nodes.map((n) => n.data.node.kind))
  if (useClusters) {
    for (const kind of kinds) g.setNode(CLUSTER_PREFIX + kind, {})
  }
  for (const node of nodes) {
    g.setNode(node.id, {width: NODE_WIDTH, height: heights.get(node.id)!})
    if (useClusters) g.setParent(node.id, CLUSTER_PREFIX + node.data.node.kind)
  }
  for (const edge of edges) {
    if (edge.source === edge.target) continue
    g.setEdge(edge.source, edge.target)
  }

  layout(g)

  const topLeft = new Map<string, {x: number; y: number}>()
  for (const node of nodes) {
    const pos = g.node(node.id)
    topLeft.set(node.id, {
      x: (pos?.x ?? 0) - NODE_WIDTH / 2,
      y: (pos?.y ?? 0) - heights.get(node.id)! / 2,
    })
  }

  const clusters: ClusterBox[] = useClusters
    ? Array.from(kinds).map((kind) => {
        const box = g.node(CLUSTER_PREFIX + kind)
        const width = box?.width ?? 0
        const height = box?.height ?? 0
        return {
          id: CLUSTER_PREFIX + kind,
          kind,
          x: (box?.x ?? 0) - width / 2,
          y: (box?.y ?? 0) - height / 2,
          width,
          height,
        }
      })
    : []

  return {topLeft, clusters}
}

function placeLayered(
  nodes: FlowNode[],
  edges: Edge[],
  direction: 'LR' | 'TB',
  heights: Map<string, number>,
  useClusters: boolean,
): Placement {
  const kindOf = new Map(nodes.map((n) => [n.id, n.data.node.kind]))
  const {positions, groups} = layeredLayout(
    nodes.map((node) => ({
      id: node.id,
      group: useClusters ? kindOf.get(node.id)! : '',
      width: NODE_WIDTH,
      height: heights.get(node.id)!,
    })),
    edges,
    {
      direction,
      nodeSep: NODE_SEP,
      rankSep: RANK_SEP,
      clusterPadding: 24,
      clusterLabelHeight: 28,
      clusterSep: RANK_SEP / 2,
    },
  )

  const clusters: ClusterBox[] = useClusters
    ? [...groups].map(([kind, {x, y, width, height}]) => ({
        id: CLUSTER_PREFIX + kind,
        kind,
        x,
        y,
        width,
        height,
      }))
    : []

  return {topLeft: positions, clusters}
}

function overlapsHorizontally(a: FlowNode, b: FlowNode): boolean {
  return a.position.x < b.position.x + NODE_WIDTH && b.position.x < a.position.x + NODE_WIDTH
}

/** Redistributes vertical space below changed cards only; every x stays put. */
export function reflowHeights(
  nodes: FlowNode[],
  previousHeights: Map<string, number>,
  clusters: ClusterBox[],
  heightOf: HeightOf = estimatedHeightOf,
): {nodes: FlowNode[]; clusters: ClusterBox[]; heights: Map<string, number>} {
  const heights = new Map<string, number>()
  let anyChanged = false
  for (const node of nodes) {
    const height = heightOf(node)
    heights.set(node.id, height)
    if ((previousHeights.get(node.id) ?? height) !== height) anyChanged = true
  }
  if (!anyChanged) return {nodes, clusters, heights}

  const oldHeight = (node: FlowNode) => previousHeights.get(node.id) ?? heights.get(node.id)!

  const order = [...nodes].sort((a, b) => a.position.y - b.position.y)
  const newTops = new Map<string, number>()
  for (let i = 0; i < order.length; i++) {
    const node = order[i]
    let top = node.position.y
    let constrained = false
    for (let j = 0; j < i; j++) {
      const above = order[j]
      if (!overlapsHorizontally(node, above)) continue
      const gap = node.position.y - (above.position.y + oldHeight(above))
      // Negative: dagre already overlapped them (it lays out around centers).
      if (gap < 0) continue
      const candidate = newTops.get(above.id)! + heights.get(above.id)! + gap
      if (!constrained || candidate > top) top = candidate
      constrained = true
    }
    newTops.set(node.id, top)
  }

  const reflowed = nodes.map((node) => {
    const y = newTops.get(node.id)!
    if (y === node.position.y) return node
    return {...node, position: {x: node.position.x, y}}
  })

  const nodesByCluster = new Map<string, FlowNode[]>()
  for (const node of nodes) {
    const id = CLUSTER_PREFIX + node.data.node.kind
    const list = nodesByCluster.get(id)
    if (list) list.push(node)
    else nodesByCluster.set(id, [node])
  }

  const resized = clusters.map((cluster) => {
    const members = nodesByCluster.get(cluster.id)
    if (!members || members.length === 0) return cluster
    const oldTop = Math.min(...members.map((n) => n.position.y))
    const oldBottom = Math.max(...members.map((n) => n.position.y + oldHeight(n)))
    const top = Math.min(...members.map((n) => newTops.get(n.id)!))
    const bottom = Math.max(...members.map((n) => newTops.get(n.id)! + heights.get(n.id)!))
    const y = top - (oldTop - cluster.y)
    const height = bottom + (cluster.y + cluster.height - oldBottom) - y
    if (y === cluster.y && height === cluster.height) return cluster
    return {...cluster, y, height}
  })

  return {nodes: reflowed, clusters: resized, heights}
}

export {NODE_WIDTH}
