import type {GraphEdgeKind, GraphNodeKind, SchemaGraph} from './types'

// Built from the graph model, not the canvas: no DOM, same output in Node.

/**
 * Bump on any change a reader could trip over.
 *
 * @beta
 */
export const GRAPH_JSON_VERSION = 1

/** @beta */
export interface GraphJson extends SchemaGraph {
  schemaVersion: typeof GRAPH_JSON_VERSION
  generator: 'sanity-plugin-schema-visualization'
}

/** @beta */
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

const ARROWS: Partial<Record<GraphEdgeKind, string>> = {
  'reference': '-->',
  'external-reference': '==>',
  'reuses': '-.->',
}

function mermaidText(text: string): string {
  return text
    .replace(/#/g, '#35;')
    .replace(/"/g, '#quot;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;')
    .replace(/\|/g, '#124;')
}

/**
 * The graph as a Mermaid flowchart. Node ids are positional because type names
 * can hold characters Mermaid ids can't. Mermaid renders at most 500 links
 * unless the renderer raises `maxEdges`.
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
