/**
 * A layered layout for graphs dagre can't lay out in interactive time (50s on a
 * 331-type schema). React Flow routes edges itself, so only card positions are
 * computed: break cycles, rank by longest path, order by barycentre, stack ranks.
 */

export interface LayeredNode {
  id: string
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
  nodeSep: number
  rankSep: number
  clusterPadding: number
  clusterLabelHeight: number
  clusterSep: number
}

interface LayeredBox {
  x: number
  y: number
  width: number
  height: number
}

export interface LayeredResult {
  positions: Map<string, {x: number; y: number}>
  groups: Map<string, LayeredBox>
}

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

  const orderedGroups = [...groupOrder].sort((a, b) => flow.get(b)! - flow.get(a)!)

  const positions = new Map<string, {x: number; y: number}>()
  const groups = new Map<string, LayeredBox>()
  const {direction, clusterPadding, clusterLabelHeight, clusterSep} = options
  const single = orderedGroups.length === 1
  let offset = 0

  for (const group of orderedGroups) {
    const local = layoutGroup(members.get(group)!, intra.get(group) ?? [], options)
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

/** Iterative: a deep reference chain must not blow the stack. */
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

/** Sources move down beside their nearest child, or every unreferenced type piles into rank 0. */
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

function orderRanks(
  ids: readonly string[],
  rank: Map<string, number>,
  out: Map<string, string[]>,
  inn: Map<string, string[]>,
): string[][] {
  // Merge consecutive ranks down to about √n, so a long reference chain can't make a strip.
  const ranksPresent = [...new Set(rank.values())].sort((a, b) => a - b)
  const maxRanks = Math.max(6, Math.round(Math.sqrt(ids.length) * 0.9))
  const merged = Math.min(ranksPresent.length, maxRanks)
  const indexOfRank = new Map(
    ranksPresent.map((r, i) => [r, Math.floor((i * merged) / ranksPresent.length)]),
  )
  const ranks: string[][] = Array.from({length: merged}, () => [])
  for (const id of ids) ranks[indexOfRank.get(rank.get(id)!)!].push(id)

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

function place(
  ranks: readonly string[][],
  nodeById: Map<string, LayeredNode>,
  {direction, nodeSep, rankSep}: LayeredOptions,
): GroupLayout {
  const total = ranks.reduce((sum, r) => sum + r.length, 0)
  const perColumn = Math.max(8, Math.ceil(Math.sqrt(total) * 1.5))
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
