import {Graph, layout} from '@dagrejs/dagre'
import {Position, type Edge} from '@xyflow/react'

import {nodeBadgeContext, type FlowNode, type TypeNodeData} from './flowModel'
import {defaultTranslate, type TranslateFn} from './i18n'
import {layeredLayout} from './layeredLayout'
import {collectNodeBadges, defaultNodeBadges, type NodeBadgeDef} from './nodeBadges'
import type {GraphNodeKind} from './types'

export interface ClusterBox {
  id: string
  /** The band's heading is the kind's `clusterLabel`, resolved where it's painted — `ClusterBackgrounds` is the one place that knows the current locale. */
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
  /** Height reserved per node id, so a later re-flow can tell what changed. */
  heights: Map<string, number>
}

const NODE_WIDTH = 260
const FIELD_ROW_HEIGHT = 22
const FIELD_LIST_PADDING = 16

/**
 * Header metrics, mirroring what `TypeNode` actually paints. The header is a
 * `<Box padding={3}>` holding a title row, an optional second line with the
 * type name, and an optional badge row — one to three stacked lines.
 */
const HEADER_PADDING = 24
/** Title line; its height comes from the `<Button padding={1}>` expand toggle beside it. */
const TITLE_ROW_HEIGHT = 32
/** The muted `node.name` line, rendered only when it differs from the title. */
const SUBTITLE_ROW_HEIGHT = 20
/** `marginTop={2}` above the badge row, paid only when the row has something in it. */
const BADGE_ROW_MARGIN = 8
/** One line of badges, including the `wrap="wrap"` gap to the line below it. */
const BADGE_LINE_HEIGHT = 24
/** Usable width inside the header, i.e. `NODE_WIDTH` minus its `padding={3}`. */
const BADGE_ROW_WIDTH = NODE_WIDTH - 24
/** Gap between badges (`gap={1}`). */
const BADGE_GAP = 4
/** `<Box padding={3}>` plus one muted line — the "no fields" note every leaf renders. */
const LEAF_NOTE_HEIGHT = 40

/**
 * How many field rows an expanded card shows before it stops growing. Beyond
 * this the card renders a "+N more" line instead of the remaining rows, so
 * `estimateNodeHeight` and the rendered card agree at every field count.
 */
export const MAX_VISIBLE_FIELDS = 20

/** Rough rendered width of a badge/label, at ~5.5px per character plus padding. */
function chipWidth(label: string): number {
  return Math.round(label.length * 5.5) + 16
}

/**
 * Height of the badge row under the title. `TypeNode` renders whatever the
 * node-badge registry produces — system, deprecated, a doc count, a collapsed
 * card's "N fields · M connections" summary — and lets it wrap on a 260px-wide
 * card, so a card carrying several badges gets two lines. This runs the same
 * registry over the same context rather than restating the built-ins, which is
 * what stops a new badge from silently reserving no room for itself.
 */
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

/**
 * Reserves the height `TypeNode` will paint for this node: the header (title,
 * optional name line, optional badge row), the field list when the card is
 * expanded, and the "no fields" note every leaf type carries. Collapsed cards
 * render no field rows at all — just the header and its one-line summary.
 *
 * These are approximations of Sanity UI's metrics, deliberately erring on the
 * generous side: over-reserving leaves a little dead space between cards,
 * while under-reserving makes dagre pack cards that then overlap on screen.
 * They only have to hold until a card first renders — `GraphCanvas` feeds the
 * heights React Flow measures on the real DOM back into `layoutGraph` and
 * `reflowHeights`, which correct any drift between this model and Sanity UI.
 */
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
    // The "+N more" line occupies one row's worth of height, so an over-long
    // field list costs exactly MAX_VISIBLE_FIELDS + 1 rows.
    const rows = fieldCount > MAX_VISIBLE_FIELDS ? MAX_VISIBLE_FIELDS + 1 : fieldCount
    height += rows * FIELD_ROW_HEIGHT + FIELD_LIST_PADDING
  }

  if (node.isLeaf) height += LEAF_NOTE_HEIGHT

  return height
}

const CLUSTER_PREFIX = 'cluster:'

/**
 * How tall to reserve a node. `layoutGraph` and `reflowHeights` default to
 * {@link estimateNodeHeight}, but a caller that knows better — `GraphCanvas`
 * feeds back the heights React Flow actually measured on the rendered cards —
 * can supply real numbers, so the estimate's hand-mirrored Sanity UI metrics
 * only ever decide a card's very first paint.
 */
export type HeightOf = (node: FlowNode) => number

const estimatedHeightOf: HeightOf = (node) => estimateNodeHeight(node.data)

/**
 * Which sides of a card its edges leave from and arrive at, for the direction
 * dagre is ranking in. Hardcoding left/right made a `TB` graph draw every edge
 * out of a card's right side and back into the left side of the card directly
 * below it.
 */
function handleSides(direction: 'LR' | 'TB'): {
  sourcePosition: Position
  targetPosition: Position
} {
  return direction === 'TB'
    ? {sourcePosition: Position.Bottom, targetPosition: Position.Top}
    : {sourcePosition: Position.Right, targetPosition: Position.Left}
}

/**
 * Above this many visible types, or this many connections, dagre stops being
 * interactive: its crossing minimisation grows far faster than the graph
 * (0.5s at 51 types and 292 connections, 13s at 199 and 1,179, 50s at 331 and
 * 1,966 on the synthetic page-builder fixture). Past either line the layout
 * switches to {@link layeredLayout}, which keeps the same shape — ranks along
 * the direction, one band per kind — at a cost of milliseconds.
 */
export const DAGRE_MAX_NODES = 60
export const DAGRE_MAX_EDGES = 240

/** Which engine {@link layoutGraph} uses for a graph of this size. */
export function layoutEngineFor(nodeCount: number, edgeCount: number): 'dagre' | 'layered' {
  return nodeCount <= DAGRE_MAX_NODES && edgeCount <= DAGRE_MAX_EDGES ? 'dagre' : 'layered'
}

const NODE_SEP = 64
const RANK_SEP = 160

interface Placement {
  topLeft: Map<string, {x: number; y: number}>
  clusters: ClusterBox[]
}

/**
 * Lays out nodes and returns new nodes with `position` set. Nodes are grouped
 * into a "cluster" per `GraphNodeKind` (document / object / other) so
 * same-kind types stay together in their own padded region instead of
 * interleaving — this is what keeps busy graphs from crowding unrelated nodes
 * on top of each other. Small graphs go through dagre; large ones through
 * {@link layeredLayout} (see {@link DAGRE_MAX_NODES}). Edges are returned
 * unchanged: the canvas routes them itself.
 */
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
    // Keep the existing object when the layout puts the node back where it
    // already was — same reason as `computeStyledNodes`: `TypeNode` is
    // `React.memo`'d, so a re-layout that only moves half the graph shouldn't
    // re-render all of it.
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
      // Room for the band's heading, which `ClusterBackgrounds` paints 10px in.
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

/** Two cards can only collide vertically if their 260px-wide columns overlap. */
function overlapsHorizontally(a: FlowNode, b: FlowNode): boolean {
  return a.position.x < b.position.x + NODE_WIDTH && b.position.x < a.position.x + NODE_WIDTH
}

/**
 * Re-flows an already laid-out graph after some cards changed height — a
 * chevron toggled, or doc-count badges arriving — without re-running dagre.
 *
 * Only vertical space is redistributed, and only downstream of what changed: a
 * card that grew pushes down the cards stacked under it, keeping the exact gap
 * dagre chose, and a card that shrank pulls them back up. Every x stays put, so
 * one click can't reshuffle the graph the user is reading, and nothing that
 * isn't below a changed card moves at all.
 *
 * `previousHeights` is what the last layout (or re-flow) reserved; nodes take
 * their new height from `heightOf` — by default `estimateNodeHeight` against
 * their current data, so callers patch node data first and re-flow after.
 */
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

  // Sorted by their laid-out top edge, so everything a node can be stacked
  // under has already been placed by the time it is reached.
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
      // Negative means dagre already had them overlapping (it lays out around
      // node centers, not these estimates) — not a stacking relationship worth
      // preserving.
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

  // Grow (or shrink) each band to keep holding its nodes, with the same
  // padding dagre gave it.
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
