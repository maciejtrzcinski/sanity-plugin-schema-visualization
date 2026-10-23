import type {GraphEdgeKind, GraphNodeKind, SchemaGraph} from './types'

/**
 * Exports built from the graph model rather than from the rendered canvas:
 * no DOM, no culling to lift, the same output in a browser, in Node and in a
 * test — which is what a future CLI export needs. The SVG export stays
 * DOM-based on purpose (see `exportSvg.ts`): it is a picture of the cards,
 * and a second hand-drawn copy of `TypeNode` would drift from the real one.
 */

/**
 * Version of the JSON shape below. Bump it on any change a reader could trip
 * over — a renamed or retyped field — so a consumer can refuse a file it
 * doesn't understand instead of misreading it.
 *
 * @beta
 */
export const GRAPH_JSON_VERSION = 1

/** @beta */
export interface GraphJson extends SchemaGraph {
  schemaVersion: typeof GRAPH_JSON_VERSION
  generator: 'sanity-plugin-schema-visualization'
}

/**
 * The graph as a versioned JSON document: every node with its fields, every
 * edge with the field path that produced it.
 *
 * @beta
 */
export function graphToJson(graph: SchemaGraph): string {
  const doc: GraphJson = {
    schemaVersion: GRAPH_JSON_VERSION,
    generator: 'sanity-plugin-schema-visualization',
    nodes: graph.nodes,
    edges: graph.edges,
  }
  return `${JSON.stringify(doc, null, 2)}\n`
}

/** @beta */
export interface MermaidOptions {
  direction?: 'LR' | 'TB'
  /** Heading for a kind's subgraph. Defaults to the kind id. */
  kindLabel?: (kind: GraphNodeKind) => string
}

/** Arrow per built-in edge kind; anything else draws as a plain link. */
const ARROWS: Partial<Record<GraphEdgeKind, string>> = {
  'reference': '-->',
  'external-reference': '==>',
  'reuses': '-.->',
}

/**
 * Mermaid's entity syntax for the characters that would end a quoted label or
 * be read as markup inside one.
 */
function mermaidText(text: string): string {
  return text
    .replace(/#/g, '#35;')
    .replace(/"/g, '#quot;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;')
    .replace(/\|/g, '#124;')
}

/**
 * The graph as a Mermaid flowchart — for a README, a docs page or a pull
 * request, all of which render Mermaid natively. Types become nodes (grouped
 * into one subgraph per kind when there is more than one), connections become
 * links labelled with the field they come from: solid for a reference, thick
 * for a reference into another dataset, dotted for a reused type.
 *
 * Node ids are positional (`n0`, `n1`, …) because type names can hold
 * characters Mermaid ids can't. Mermaid refuses to render more than 500 links
 * by default; its `maxEdges` setting is only accepted from whoever renders the
 * diagram (`mermaid.initialize`), not from inside it, so a large schema's
 * export parses everywhere but renders only where that limit was raised.
 *
 * @beta
 */
export function graphToMermaid(graph: SchemaGraph, options: MermaidOptions = {}): string {
  const {direction = 'LR', kindLabel = (kind) => kind} = options
  const idOf = new Map(graph.nodes.map((node, i) => [node.id, `n${i}`]))
  const lines = [`flowchart ${direction}`]

  const label = (node: SchemaGraph['nodes'][number]) =>
    node.title === node.name ? node.name : `${node.title} (${node.name})`
  const nodeLine = (node: SchemaGraph['nodes'][number], indent: string) =>
    `${indent}${idOf.get(node.id)}["${mermaidText(label(node))}"]`

  const kinds = [...new Set(graph.nodes.map((n) => n.kind))]
  if (kinds.length > 1) {
    kinds.forEach((kind, i) => {
      lines.push(`  subgraph k${i}["${mermaidText(kindLabel(kind))}"]`)
      for (const node of graph.nodes) if (node.kind === kind) lines.push(nodeLine(node, '    '))
      lines.push('  end')
    })
  } else {
    for (const node of graph.nodes) lines.push(nodeLine(node, '  '))
  }

  for (const edge of graph.edges) {
    const source = idOf.get(edge.source)
    const target = idOf.get(edge.target)
    if (!source || !target) continue
    const field = (edge.fieldPath ?? edge.fieldName) + (edge.weak ? ' (weak)' : '')
    lines.push(`  ${source} ${ARROWS[edge.kind] ?? '-->'}|"${mermaidText(field)}"| ${target}`)
  }

  return `${lines.join('\n')}\n`
}
