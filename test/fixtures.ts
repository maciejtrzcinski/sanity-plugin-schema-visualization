/**
 * A hand-written graph for the component tests. Small enough to assert against
 * exactly, and built by hand rather than through `schemaToGraph` so a component
 * test fails for a rendering reason and never because schema compilation moved.
 */
import type {FilterContext} from '../src/filters'
import {defaultTranslate} from '../src/i18n'
import type {GraphEdge, GraphNode, SchemaGraph} from '../src/types'

export function makeNode(overrides: Partial<GraphNode> & Pick<GraphNode, 'id'>): GraphNode {
  return {
    name: overrides.id,
    title: overrides.id,
    kind: 'document',
    baseType: 'document',
    fields: [],
    isLeaf: false,
    isSystem: false,
    ...overrides,
  }
}

export function makeEdge(overrides: Partial<GraphEdge> & Pick<GraphEdge, 'source' | 'target'>) {
  const kind = overrides.kind ?? 'reference'
  const fieldName = overrides.fieldName ?? 'link'
  return {
    id: `${overrides.source}-${fieldName}-${overrides.target}`,
    kind,
    fieldName,
    ...overrides,
  } satisfies GraphEdge
}

export const postNode = makeNode({
  id: 'post',
  title: 'Blog post',
  fields: [
    {
      name: 'title',
      typeLabel: 'string',
      options: [{id: 'required', label: 'required', tone: 'primary'}],
      referencesTo: [],
      reusesTypes: [],
      required: true,
      hidden: false,
    },
    {
      name: 'author',
      typeLabel: 'reference → author',
      options: [{id: 'type-option:0', label: 'weak ref', tone: 'caution'}],
      referencesTo: ['author'],
      reusesTypes: [],
      required: false,
      hidden: false,
    },
    {
      name: 'seo',
      typeLabel: 'seo (object)',
      options: [],
      referencesTo: [],
      reusesTypes: ['seo'],
      required: false,
      hidden: false,
    },
  ],
})

export const authorNode = makeNode({id: 'author', title: 'Author'})

export const seoNode = makeNode({
  id: 'seo',
  title: 'SEO',
  kind: 'object',
  baseType: 'object',
  fields: [
    {
      name: 'metaTitle',
      typeLabel: 'string',
      options: [],
      referencesTo: [],
      reusesTypes: [],
      required: false,
      hidden: false,
    },
  ],
})

export const assetNode = makeNode({
  id: 'sanity.imageAsset',
  title: 'Image asset',
  kind: 'other',
  baseType: 'object',
  isSystem: true,
})

export const authorEdge = makeEdge({
  source: 'post',
  target: 'author',
  kind: 'reference',
  fieldName: 'author',
  weak: true,
})

export const seoEdge = makeEdge({
  source: 'post',
  target: 'seo',
  kind: 'reuses',
  fieldName: 'seo',
  fieldPath: 'seo',
})

export const graph: SchemaGraph = {
  nodes: [postNode, authorNode, seoNode, assetNode],
  edges: [authorEdge, seoEdge],
}

/** The context `useGraphModel` would derive from {@link graph}, with no issues. */
export function makeFilterContext(overrides: Partial<FilterContext> = {}): FilterContext {
  const source = overrides.graph ?? graph
  const connectedNodeIds = new Set<string>()
  for (const edge of source.edges) {
    connectedNodeIds.add(edge.source)
    connectedNodeIds.add(edge.target)
  }
  return {
    graph: source,
    issueCountByNodeId: new Map(),
    warningCountByNodeId: new Map(),
    connectedNodeIds,
    docCountByType: new Map(),
    t: defaultTranslate,
    ...overrides,
  }
}
