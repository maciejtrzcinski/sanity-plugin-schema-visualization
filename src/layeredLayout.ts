/**
 * A layered layout that scales linearly-ish with the schema, for graphs dagre
 * can't lay out in interactive time.
 *
 * dagre's cost is dominated by crossing minimisation over long edges, each of
 * which it threads through a dummy node per rank it spans — on a 331-type
 * page-builder schema with ~2,000 connections that took 50 seconds. And the
 * canvas throws that work away: React Flow routes every edge itself, so all
 * that is used from a layout is where the cards go.
 *
 * So this computes only that, in four cheap passes per cluster:
 *
 * 1. break cycles (a DFS reverses back edges),
 * 2. rank by longest path, pull each source up next to its nearest child, and
 *    merge ranks down to about √n so a long reference chain can't stretch the
 *    graph into a strip,
 * 3. order each rank by the barycentre of its neighbours, a few sweeps each way,
 *    looking at neighbours on *any* rank rather than threading dummies through
 *    the ones in between,
 * 4. stack each rank as a column (a row, top-to-bottom), wrapping a rank too
 *    long to read into side-by-side sub-columns.
 *
 * Clusters are laid out independently and placed side by side along the rank
 * axis, the ones whose types mostly point at other clusters first — so
 * documents sit upstream of the objects they reuse, as they do under dagre.
 */

export interface LayeredNode {
  id: string
  /** Nodes sharing a group are laid out together, inside one cluster box. */
  group: string
  width: number
  height: number
}

export interface LayeredEdge {
  source: string
  target: string
}

export interface LayeredOptions {
  direction: 'LR' | 'TB'
  /** Gap between neighbouring cards in one rank. */
  nodeSep: number
  /** Gap between ranks. */
  rankSep: number
  /** Inner padding of a cluster box; the top edge also leaves room for its label. */
  clusterPadding: number
  clusterLabelHeight: number
  /** Gap between two cluster boxes. */
  clusterSep: number
}

export interface LayeredBox {
  x: number
  y: number
  width: number
  height: number
}

export interface LayeredResult {
  /** Top-left corner of each node. */
  positions: Map<string, {x: number; y: number}>
  /** Bounding box of each group, padding included. */
  groups: Map<string, LayeredBox>
}

/** How many barycentre sweeps, each one down and one up the ranks. */
const ORDERING_SWEEPS = 4

export function layeredLayout(
  nodes: readonly LayeredNode[],
  edges: readonly LayeredEdge[],
  options: LayeredOptions,
): LayeredResult {
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const groupOrder: string[] = []
  const members = new Map<string, LayeredNode[]>()
  for (const node of nodes) {
    const list = members.get(node.group)
    if (list) list.push(node)
    else {
      members.set(node.group, [node])
      groupOrder.push(node.group)
    }
  }

  // Intra-group adjacency for layering; cross-group edge counts for ordering
  // the groups themselves.
  const pairs = new Set<string>()
  const intra = new Map<string, LayeredEdge[]>()
  const flow = new Map<string, number>(groupOrder.map((g) => [g, 0]))
  for (const edge of edges) {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target || source === target) continue
    const key = `${edge.source}\0${edge.target}`
    if (pairs.has(key)) continue
    pairs.add(key)
    if (source.group === target.group) {
      const list = intra.get(source.group)
      if (list) list.push(edge)
      else intra.set(source.group, [edge])
    } else {
      flow.set(source.group, flow.get(source.group)! + 1)
      flow.set(target.group, flow.get(target.group)! - 1)
    }
  }

  // Upstream clusters first. Stable, so equal flows keep first-seen order.
  const orderedGroups = [...groupOrder].sort((a, b) => flow.get(b)! - flow.get(a)!)

  const positions = new Map<string, {x: number; y: number}>()
  const groups = new Map<string, LayeredBox>()
  const {direction, clusterPadding, clusterLabelHeight, clusterSep} = options
  const single = orderedGroups.length === 1
  let offset = 0

  for (const group of orderedGroups) {
    const local = layoutGroup(members.get(group)!, intra.get(group) ?? [], options)
    // A lone group gets no cluster box, so no padding either — the same rule
    // `layoutGraph` applies under dagre.
    const pad = single ? 0 : clusterPadding
    const top = single ? 0 : clusterPadding + clusterLabelHeight
    const box =
      direction === 'LR'
        ? {x: offset, y: 0, width: local.width + 2 * pad, height: local.height + top + pad}
        : {x: 0, y: offset, width: local.width + 2 * pad, height: local.height + top + pad}
    for (const [id, at] of local.positions) {
      positions.set(id, {x: box.x + pad + at.x, y: box.y + top + at.y})
    }
    groups.set(group, box)
    offset += (direction === 'LR' ? box.width : box.height) + clusterSep
  }

  // Centre the clusters on each other across the rank axis, so a short one
  // doesn't hang off the top (or left) of a tall neighbour.
  if (!single) {
    const across = (box: LayeredBox) => (direction === 'LR' ? box.height : box.width)
    const tallest = Math.max(...[...groups.values()].map(across))
    for (const [group, box] of groups) {
      const shift = (tallest - across(box)) / 2
      if (shift === 0) continue
      groups.set(
        group,
        direction === 'LR' ? {...box, y: box.y + shift} : {...box, x: box.x + shift},
      )
      for (const node of members.get(group)!) {
        const at = positions.get(node.id)!
        positions.set(
          node.id,
          direction === 'LR' ? {x: at.x, y: at.y + shift} : {x: at.x + shift, y: at.y},
        )
      }
    }
  }

  return {positions, groups}
}

interface GroupLayout {
  positions: Map<string, {x: number; y: number}>
  width: number
  height: number
}

function layoutGroup(
  nodes: readonly LayeredNode[],
  edges: readonly LayeredEdge[],
  options: LayeredOptions,
): GroupLayout {
  const ids = nodes.map((n) => n.id)
  const out = new Map<string, string[]>(ids.map((id) => [id, []]))
  const inn = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const {source, target} of acyclic(ids, edges)) {
    out.get(source)!.push(target)
    inn.get(target)!.push(source)
  }

  const rank = assignRanks(ids, out, inn)
  const ranks = orderRanks(ids, rank, out, inn)
  return place(ranks, new Map(nodes.map((n) => [n.id, n])), options)
}

/**
 * The same edges with every back edge a DFS finds reversed, so ranking can
 * treat the graph as a DAG. Iterative: a deep reference chain must not blow
 * the stack.
 */
function acyclic(ids: readonly string[], edges: readonly LayeredEdge[]): LayeredEdge[] {
  const next = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const edge of edges) next.get(edge.source)!.push(edge.target)

  const state = new Map<string, 'active' | 'done'>()
  const back = new Set<string>()
  for (const root of ids) {
    if (state.has(root)) continue
    const stack: Array<{id: string; i: number}> = [{id: root, i: 0}]
    state.set(root, 'active')
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      const children = next.get(frame.id)!
      if (frame.i < children.length) {
        const child = children[frame.i++]
        const seen = state.get(child)
        if (seen === 'active') back.add(`${frame.id}\0${child}`)
        else if (!seen) {
          state.set(child, 'active')
          stack.push({id: child, i: 0})
        }
      } else {
        state.set(frame.id, 'done')
        stack.pop()
      }
    }
  }

  return edges.map((edge) =>
    back.has(`${edge.source}\0${edge.target}`) ? {source: edge.target, target: edge.source} : edge,
  )
}

/**
 * Longest-path ranks (Kahn's order, so O(nodes + edges)), then every source
 * moved down to sit just above its nearest child — otherwise every type that
 * nothing references piles into rank 0, however far its targets are.
 */
function assignRanks(
  ids: readonly string[],
  out: Map<string, string[]>,
  inn: Map<string, string[]>,
): Map<string, number> {
  const rank = new Map<string, number>(ids.map((id) => [id, 0]))
  const remaining = new Map(ids.map((id) => [id, inn.get(id)!.length]))
  const queue = ids.filter((id) => remaining.get(id) === 0)
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head]
    for (const child of out.get(id)!) {
      rank.set(child, Math.max(rank.get(child)!, rank.get(id)! + 1))
      const left = remaining.get(child)! - 1
      remaining.set(child, left)
      if (left === 0) queue.push(child)
    }
  }

  for (const id of ids) {
    const children = out.get(id)!
    if (inn.get(id)!.length > 0 || children.length === 0) continue
    rank.set(id, Math.min(...children.map((child) => rank.get(child)!)) - 1)
  }
  return rank
}

/** Nodes grouped by rank, each rank ordered to keep neighbours level with each other. */
function orderRanks(
  ids: readonly string[],
  rank: Map<string, number>,
  out: Map<string, string[]>,
  inn: Map<string, string[]>,
): string[][] {
  // Long reference chains (a `parent` on every document) rank a graph far
  // deeper than it is wide — 80 ranks of four cards is a strip nobody can
  // read. Consecutive ranks are merged, in proportion, down to about √n: rank
  // order is kept, so no edge starts pointing backwards, and an edge between
  // two merged ranks simply runs along the column.
  const ranksPresent = [...new Set(rank.values())].sort((a, b) => a - b)
  // Never below 6: a small cluster's chain reads fine at its real depth.
  const maxRanks = Math.max(6, Math.round(Math.sqrt(ids.length) * 0.9))
  const merged = Math.min(ranksPresent.length, maxRanks)
  const indexOfRank = new Map(
    ranksPresent.map((r, i) => [r, Math.floor((i * merged) / ranksPresent.length)]),
  )
  const ranks: string[][] = Array.from({length: merged}, () => [])
  for (const id of ids) ranks[indexOfRank.get(rank.get(id)!)!].push(id)

  // Position within a rank, as a fraction, so ranks of different sizes compare.
  const position = new Map<string, number>()
  const record = (layer: string[]) =>
    layer.forEach((id, i) => position.set(id, (i + 0.5) / layer.length))
  ranks.forEach(record)

  const reorder = (layer: string[], neighbours: (id: string) => string[]) => {
    const keyed = layer.map((id, i) => {
      const placed = neighbours(id)
      const key =
        placed.length === 0
          ? position.get(id)!
          : placed.reduce((sum, n) => sum + position.get(n)!, 0) / placed.length
      return {id, key, i}
    })
    keyed.sort((a, b) => a.key - b.key || a.i - b.i)
    keyed.forEach(({id}, i) => (layer[i] = id))
    record(layer)
  }

  for (let sweep = 0; sweep < ORDERING_SWEEPS; sweep++) {
    for (let r = 1; r < ranks.length; r++) reorder(ranks[r], (id) => inn.get(id)!)
    for (let r = ranks.length - 2; r >= 0; r--) reorder(ranks[r], (id) => out.get(id)!)
  }
  return ranks
}

/**
 * Coordinates: each rank a column (a row under `TB`) of cards spaced by
 * `nodeSep`, centred across the group; a rank longer than a readable column
 * wraps into several side by side.
 */
function place(
  ranks: readonly string[][],
  nodeById: Map<string, LayeredNode>,
  {direction, nodeSep, rankSep}: LayeredOptions,
): GroupLayout {
  const total = ranks.reduce((sum, r) => sum + r.length, 0)
  const perColumn = Math.max(8, Math.ceil(Math.sqrt(total) * 1.5))
  // Along the rank axis a card is as thick as it is wide (LR) or tall (TB).
  const along = (n: LayeredNode) => (direction === 'LR' ? n.width : n.height)
  const across = (n: LayeredNode) => (direction === 'LR' ? n.height : n.width)

  const columns: Array<{ids: string[]; thickness: number; length: number}> = []
  for (const layer of ranks) {
    for (let start = 0; start < layer.length; start += perColumn) {
      const ids = layer.slice(start, start + perColumn)
      const cards = ids.map((id) => nodeById.get(id)!)
      columns.push({
        ids,
        thickness: Math.max(...cards.map(along)),
        length: cards.reduce((sum, n) => sum + across(n), 0) + nodeSep * (ids.length - 1),
      })
    }
  }

  const longest = Math.max(0, ...columns.map((c) => c.length))
  const positions = new Map<string, {x: number; y: number}>()
  let rankOffset = 0
  for (const column of columns) {
    let crossOffset = (longest - column.length) / 2
    for (const id of column.ids) {
      const node = nodeById.get(id)!
      positions.set(
        id,
        direction === 'LR' ? {x: rankOffset, y: crossOffset} : {x: crossOffset, y: rankOffset},
      )
      crossOffset += across(node) + nodeSep
    }
    rankOffset += column.thickness + rankSep
  }
  const depth = Math.max(0, rankOffset - rankSep)

  return direction === 'LR'
    ? {positions, width: depth, height: longest}
    : {positions, width: longest, height: depth}
}
