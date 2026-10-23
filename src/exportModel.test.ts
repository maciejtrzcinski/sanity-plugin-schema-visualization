import {describe, expect, it} from 'vitest'

import {graph as fixtureGraph, makeEdge, makeNode} from '../test/fixtures'
import {GRAPH_JSON_VERSION, graphToJson, graphToMermaid} from './exportModel'

describe('graphToJson', () => {
  it('wraps the graph in a versioned document that reads back to the same graph', () => {
    const doc = JSON.parse(graphToJson(fixtureGraph))

    expect(doc.schemaVersion).toBe(GRAPH_JSON_VERSION)
    expect(doc.generator).toBe('sanity-plugin-schema-visualization')
    expect(doc.nodes).toEqual(fixtureGraph.nodes)
    expect(doc.edges).toEqual(fixtureGraph.edges)
  })
})

describe('graphToMermaid', () => {
  const graph = {
    nodes: [
      makeNode({id: 'post', title: 'Blog post'}),
      makeNode({id: 'author'}),
      makeNode({id: 'seo', kind: 'object'}),
    ],
    edges: [
      makeEdge({source: 'post', target: 'author', fieldName: 'author', weak: true}),
      makeEdge({source: 'post', target: 'seo', fieldName: 'seo', kind: 'reuses'}),
      makeEdge({
        source: 'post',
        target: 'author',
        fieldName: 'body',
        fieldPath: 'body[].markDefs[].author',
      }),
    ],
  }

  it('groups types by kind and draws each connection kind with its own arrow', () => {
    expect(graphToMermaid(graph, {kindLabel: (kind) => `${kind}s`})).toBe(
      [
        'flowchart LR',
        '  subgraph k0["documents"]',
        '    n0["Blog post (post)"]',
        '    n1["author"]',
        '  end',
        '  subgraph k1["objects"]',
        '    n2["seo"]',
        '  end',
        '  n0 -->|"author (weak)"| n1',
        '  n0 -.->|"seo"| n2',
        '  n0 -->|"body[].markDefs[].author"| n1',
        '',
      ].join('\n'),
    )
  })

  it('skips the subgraphs when every type is of one kind', () => {
    const single = {nodes: [makeNode({id: 'a'}), makeNode({id: 'b'})], edges: []}
    expect(graphToMermaid(single, {direction: 'TB'})).toBe('flowchart TB\n  n0["a"]\n  n1["b"]\n')
  })

  it('escapes what would break out of a quoted label', () => {
    const tricky = {nodes: [makeNode({id: 'x', title: 'Say "hi" <b>|#'})], edges: []}
    expect(graphToMermaid(tricky)).toContain('n0["Say #quot;hi#quot; #lt;b#gt;#124;#35; (x)"]')
  })
})
