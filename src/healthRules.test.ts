import {describe, expect, it} from 'vitest'

import {
  computeHealthIssues,
  createAttributePathsRule,
  defaultHealthRules,
  emptyDocumentTypeRule,
  groupIssuesByRule,
  previewDereferenceRule,
  severityTone,
  slugWithoutSourceRule,
  type HealthIssue,
  type HealthRule,
} from './healthRules'
import {documentKind, objectKind, otherKind, type NodeKindDef} from './kinds'
import type {FieldSummary, GraphEdge, GraphNode, GraphNodeKind, SchemaGraph} from './types'

function field(overrides: Partial<FieldSummary> & Pick<FieldSummary, 'name'>): FieldSummary {
  return {
    typeLabel: 'string',
    options: [],
    referencesTo: [],
    reusesTypes: [],
    required: false,
    hidden: false,
    ...overrides,
  }
}

function node(overrides: Partial<GraphNode> & Pick<GraphNode, 'id' | 'kind'>): GraphNode {
  return {
    name: overrides.id,
    title: overrides.id,
    baseType: overrides.kind,
    fields: [],
    isLeaf: true,
    isSystem: false,
    ...overrides,
  }
}

function edge(
  overrides: Partial<GraphEdge> & Pick<GraphEdge, 'source' | 'target' | 'kind' | 'fieldName'>,
): GraphEdge {
  return {
    id: `${overrides.source}::${overrides.fieldName}::${overrides.kind}::${overrides.target}`,
    ...overrides,
  }
}

function graph(nodes: GraphNode[], edges: GraphEdge[] = []): SchemaGraph {
  return {nodes, edges}
}

describe('severityTone', () => {
  it('separates a warning from an advisory note', () => {
    // The whole point of the helper: every surface that paints an issue reads
    // it, so `info` can never come out looking like `warning`.
    expect(severityTone('warning')).toBe('caution')
    expect(severityTone('info')).not.toBe(severityTone('warning'))
  })
})

describe('computeHealthIssues', () => {
  it('returns no issues for a clean schema', () => {
    const post = node({
      id: 'post',
      kind: 'document',
      fields: [field({name: 'author', referencesTo: ['author']})],
    })
    const author = node({id: 'author', kind: 'document'})
    const issues = computeHealthIssues(
      graph(
        [post, author],
        [edge({source: 'post', target: 'author', kind: 'reference', fieldName: 'author'})],
      ),
    )
    expect(issues).toEqual([])
  })

  it('flags an object type with no incoming edges as orphaned', () => {
    const unused = node({id: 'unused', kind: 'object'})
    const issues = computeHealthIssues(graph([unused]))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({category: 'orphaned-type', nodeId: 'unused'})
  })

  it('does not flag a document type with no incoming edges', () => {
    // Documents are entry points into the content lake — they aren't expected
    // to be referenced by other schema types to be "used".
    const post = node({id: 'post', kind: 'document'})
    expect(computeHealthIssues(graph([post]))).toEqual([])
  })

  it('does not flag an "other" (system/primitive alias) kind type as orphaned', () => {
    const alias = node({id: 'myAlias', kind: 'other'})
    expect(computeHealthIssues(graph([alias]))).toEqual([])
  })

  it('does not flag a system type even when unreferenced', () => {
    const systemType = node({id: 'sanity.imageAsset', kind: 'object', isSystem: true})
    expect(computeHealthIssues(graph([systemType]))).toEqual([])
  })

  it('does not flag an object type once something reuses it', () => {
    const seo = node({id: 'seo', kind: 'object'})
    const post = node({
      id: 'post',
      kind: 'document',
      fields: [field({name: 'seo', reusesTypes: ['seo']})],
    })
    const issues = computeHealthIssues(
      graph([post, seo], [edge({source: 'post', target: 'seo', kind: 'reuses', fieldName: 'seo'})]),
    )
    expect(issues).toEqual([])
  })

  it('flags a reference field that targets a non-document type', () => {
    const seo = node({id: 'seo', kind: 'object'})
    const post = node({
      id: 'post',
      kind: 'document',
      fields: [field({name: 'badRef', referencesTo: ['seo']})],
    })
    const issues = computeHealthIssues(
      graph(
        [post, seo],
        [edge({source: 'post', target: 'seo', kind: 'reference', fieldName: 'badRef'})],
      ),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      category: 'reference-target',
      nodeId: 'post',
      fieldName: 'badRef',
    })
    expect(issues[0].message).toContain('badRef')
    expect(issues[0].message).toContain('seo')
  })

  it('does not flag a reference field that targets a document type', () => {
    const author = node({id: 'author', kind: 'document'})
    const post = node({
      id: 'post',
      kind: 'document',
      fields: [field({name: 'author', referencesTo: ['author']})],
    })
    const issues = computeHealthIssues(
      graph(
        [post, author],
        [edge({source: 'post', target: 'author', kind: 'reference', fieldName: 'author'})],
      ),
    )
    expect(issues).toEqual([])
  })

  it.each<GraphNodeKind>(['document', 'object'])(
    'flags a field that references or reuses a deprecated %s type',
    (kind) => {
      const edgeKind = kind === 'document' ? 'reference' : 'reuses'
      const legacy = node({id: 'legacy', kind, deprecated: 'use "current" instead'})
      const post = node({
        id: 'post',
        kind: 'document',
        fields: [
          field({
            name: 'oldField',
            referencesTo: edgeKind === 'reference' ? ['legacy'] : [],
            reusesTypes: edgeKind === 'reuses' ? ['legacy'] : [],
          }),
        ],
      })
      const issues = computeHealthIssues(
        graph(
          [post, legacy],
          [edge({source: 'post', target: 'legacy', kind: edgeKind, fieldName: 'oldField'})],
        ),
      )
      expect(issues).toHaveLength(1)
      expect(issues[0]).toMatchObject({
        category: 'deprecated-target',
        nodeId: 'post',
        fieldName: 'oldField',
      })
      expect(issues[0].message).toContain('use "current" instead')
    },
  )

  it('flags a field that is required and unconditionally hidden', () => {
    const post = node({
      id: 'post',
      kind: 'document',
      fields: [field({name: 'secretNote', required: true, hidden: true})],
    })
    const issues = computeHealthIssues(graph([post]))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      category: 'required-hidden',
      nodeId: 'post',
      fieldName: 'secretNote',
    })
  })

  it.each([
    {required: true, hidden: false},
    {required: false, hidden: true},
    {required: false, hidden: false},
  ])(
    'does not flag a field that is only partially required/hidden ($required, $hidden)',
    ({required, hidden}) => {
      const post = node({
        id: 'post',
        kind: 'document',
        fields: [field({name: 'note', required, hidden})],
      })
      expect(computeHealthIssues(graph([post]))).toEqual([])
    },
  )

  it('skips every check for system types entirely, even if they would otherwise trigger one', () => {
    const seo = node({id: 'seo', kind: 'object', isSystem: false})
    const systemDoc = node({
      id: 'sanity.imageAsset',
      kind: 'document',
      isSystem: true,
      fields: [
        field({name: 'badRef', referencesTo: ['seo']}),
        field({name: 'stuck', required: true, hidden: true}),
      ],
    })
    const issues = computeHealthIssues(
      graph(
        [systemDoc, seo],
        [
          edge({
            source: 'sanity.imageAsset',
            target: 'seo',
            kind: 'reference',
            fieldName: 'badRef',
          }),
        ],
      ),
    )
    expect(issues).toEqual([])
  })

  describe('rule registry', () => {
    it('runs only the rules it is given', () => {
      const g = graph([node({id: 'unused', kind: 'object'})])
      expect(computeHealthIssues(g)).toHaveLength(1)
      expect(computeHealthIssues(g, {rules: []})).toEqual([])
    })

    it('runs a custom rule alongside the built-ins', () => {
      const namingRule: HealthRule = {
        id: 'naming',
        label: 'Type name should be camelCase',
        severity: 'info',
        check: ({customNodes}) =>
          customNodes
            .filter((n) => n.name[0] === n.name[0]?.toUpperCase())
            .map((n) => ({key: n.id, nodeId: n.id, message: `"${n.name}" should be camelCase.`})),
      }

      const g = graph([node({id: 'Post', kind: 'document'})])
      const issues = computeHealthIssues(g, {rules: [...defaultHealthRules, namingRule]})

      expect(issues).toHaveLength(1)
      expect(issues[0]).toMatchObject({id: 'naming:Post', category: 'naming', severity: 'info'})
    })

    it('skips a rule that throws rather than failing the whole run', () => {
      const exploding: HealthRule = {
        id: 'boom',
        label: 'Boom',
        severity: 'warning',
        check: () => {
          throw new Error('bad custom rule')
        },
      }

      const g = graph([node({id: 'unused', kind: 'object'})])
      const issues = computeHealthIssues(g, {rules: [exploding, ...defaultHealthRules]})

      expect(issues.map((i) => i.category)).toEqual(['orphaned-type'])
    })
  })

  describe('kind registry', () => {
    // A consumer who replaces `kinds` gets their own categories here: the rules
    // read `reportsOrphans` / `isReferenceTarget` off the registry rather than
    // testing `node.kind` against the built-in ids.
    const block: NodeKindDef = {...objectKind, id: 'block', label: 'Blocks', singular: 'block'}
    const collection: NodeKindDef = {
      ...documentKind,
      id: 'collection',
      label: 'Collections',
      singular: 'collection',
    }
    const customKinds: readonly NodeKindDef[] = [collection, block, otherKind]

    it('reports orphans for the kinds that opt into it, not for `object`', () => {
      const g = graph([node({id: 'unused', kind: 'object'}), node({id: 'stray', kind: 'block'})])
      const issues = computeHealthIssues(g, {kinds: customKinds})

      expect(issues.map((i) => ({category: i.category, nodeId: i.nodeId}))).toEqual([
        {category: 'orphaned-type', nodeId: 'stray'},
      ])
    })

    it('accepts a reference to any kind flagged `isReferenceTarget`', () => {
      const post = node({
        id: 'post',
        kind: 'collection',
        fields: [field({name: 'series', referencesTo: ['series']})],
      })
      const series = node({id: 'series', kind: 'collection'})
      const g = graph(
        [post, series],
        [edge({source: 'post', target: 'series', kind: 'reference', fieldName: 'series'})],
      )

      expect(computeHealthIssues(g, {kinds: customKinds})).toEqual([])
    })

    it('names the expected target kinds in the reference-target message', () => {
      const post = node({
        id: 'post',
        kind: 'collection',
        fields: [field({name: 'hero', referencesTo: ['hero']})],
      })
      const hero = node({id: 'hero', kind: 'block', baseType: 'block'})
      const g = graph(
        [post, hero],
        [edge({source: 'post', target: 'hero', kind: 'reference', fieldName: 'hero'})],
      )
      const issues = computeHealthIssues(g, {kinds: customKinds})

      expect(issues.map((i) => i.category)).toContain('reference-target')
      expect(issues.find((i) => i.category === 'reference-target')?.message).toContain(
        'references should target collection types',
      )
    })

    it('stands down when no kind claims to be a reference target', () => {
      const noTargets: readonly NodeKindDef[] = [
        {...documentKind, isReferenceTarget: false},
        {...objectKind, reportsOrphans: false},
        otherKind,
      ]
      const post = node({
        id: 'post',
        kind: 'document',
        fields: [field({name: 'seo', referencesTo: ['seo']})],
      })
      const seo = node({id: 'seo', kind: 'object'})
      const g = graph(
        [post, seo],
        [edge({source: 'post', target: 'seo', kind: 'reference', fieldName: 'seo'})],
      )

      expect(computeHealthIssues(g, {kinds: noTargets})).toEqual([])
    })
  })
})

describe('previewDereferenceRule', () => {
  const run = (n: GraphNode) => computeHealthIssues(graph([n]), {rules: [previewDereferenceRule]})

  it('flags a preview that crosses more than one reference', () => {
    const post = node({
      id: 'post',
      kind: 'document',
      previewSelect: [
        {key: 'title', path: 'title', dereferences: 0},
        {key: 'subtitle', path: 'author.company.name', dereferences: 2},
      ],
    })

    const [issue] = run(post)

    expect(issue).toMatchObject({nodeId: 'post', severity: 'warning'})
    expect(issue.message).toContain('author.company.name')
  })

  it('leaves a single hop alone — `author.name` is the everyday case', () => {
    const post = node({
      id: 'post',
      kind: 'document',
      previewSelect: [{key: 'subtitle', path: 'author.name', dereferences: 1}],
    })

    expect(run(post)).toEqual([])
  })
})

describe('slugWithoutSourceRule', () => {
  const run = (fields: FieldSummary[]) =>
    computeHealthIssues(graph([node({id: 'post', kind: 'document', fields})]), {
      rules: [slugWithoutSourceRule],
    })

  it('notes a slug editors have to type by hand', () => {
    const issues = run([field({name: 'slug', intrinsicType: 'slug'})])

    expect(issues).toEqual([expect.objectContaining({fieldName: 'slug', severity: 'info'})])
  })

  it('stays quiet when the slug has a source, or nobody sees it', () => {
    expect(run([field({name: 'slug', intrinsicType: 'slug', source: 'title'})])).toEqual([])
    expect(run([field({name: 'slug', intrinsicType: 'slug', source: '(function)'})])).toEqual([])
    expect(run([field({name: 'slug', intrinsicType: 'slug', hidden: true})])).toEqual([])
  })
})

describe('emptyDocumentTypeRule', () => {
  const post = node({id: 'post', kind: 'document'})
  const seo = node({id: 'seo', kind: 'object'})
  const run = (docCountByType?: ReadonlyMap<string, number>) =>
    computeHealthIssues(graph([post, seo]), {rules: [emptyDocumentTypeRule], docCountByType})

  it('notes a document type with no documents, once counts are loaded', () => {
    expect(run(new Map([['post', 0]]))).toEqual([
      expect.objectContaining({nodeId: 'post', severity: 'info'}),
    ])
  })

  it('reads a missing count as unknown rather than zero', () => {
    expect(run()).toEqual([])
    expect(run(new Map([['post', 3]]))).toEqual([])
  })

  it('only judges kinds that count documents', () => {
    expect(run(new Map([['seo', 0]]))).toEqual([])
  })
})

describe('createAttributePathsRule', () => {
  const heavy = node({id: 'page', title: 'Page', kind: 'document', attributePaths: 7000})
  const light = node({id: 'post', kind: 'document', attributePaths: 900})
  const withEstimate = (count: number, extra: Partial<SchemaGraph['attributePaths']> = {}) => ({
    ...graph([light, heavy]),
    attributePaths: {count, capped: false, recursiveTypes: [], ...extra},
  })

  it('warns near the limit, on the document type that contributes the most', () => {
    const issues = computeHealthIssues(withEstimate(8500), {rules: [createAttributePathsRule()]})

    expect(issues).toEqual([expect.objectContaining({nodeId: 'page', severity: 'warning'})])
    expect(issues[0].message).toMatch(/8,500.*10,000.*"Page".*7,000/)
  })

  it('stays quiet well under the limit', () => {
    const rule = createAttributePathsRule()

    expect(computeHealthIssues(withEstimate(3000), {rules: [rule]})).toEqual([])
  })

  it('takes the limit of the plan the project is on', () => {
    const free = createAttributePathsRule({limit: 2000})

    expect(computeHealthIssues(withEstimate(3000), {rules: [free]})).toHaveLength(1)
  })

  it('says when the estimate is a floor because a type contains itself', () => {
    const [issue] = computeHealthIssues(withEstimate(9000, {recursiveTypes: ['menuItem']}), {
      rules: [createAttributePathsRule()],
    })

    expect(issue.message).toContain('menuItem')
  })
})

/**
 * What the health panel renders from. The panel has no category-to-label map of
 * its own — it walks these groups — so the ordering and labelling contract lives
 * here rather than in a jsdom test.
 */
describe('groupIssuesByRule', () => {
  const issue = (category: string, nodeId: string): HealthIssue => ({
    id: `${category}:${nodeId}`,
    severity: 'warning',
    category,
    nodeId,
    message: `${nodeId} has a problem`,
  })

  it('groups in the order the rules were given, not the order the issues arrived', () => {
    const [first, second] = defaultHealthRules
    const issues = [issue(second.id, 'a'), issue(first.id, 'b'), issue(second.id, 'c')]

    const grouped = groupIssuesByRule(issues, defaultHealthRules)

    expect(grouped.map((group) => group.rule.id)).toEqual([first.id, second.id])
    expect(grouped[1].issues.map((i) => i.nodeId)).toEqual(['a', 'c'])
  })

  it('leaves out a rule with nothing to report, rather than showing an empty section', () => {
    const grouped = groupIssuesByRule([issue(defaultHealthRules[0].id, 'a')], defaultHealthRules)

    expect(grouped).toHaveLength(1)
    expect(groupIssuesByRule([], defaultHealthRules)).toEqual([])
  })

  /**
   * The grouping is keyed by rule, so an issue whose rule is not in the list
   * has no section to sit in and is dropped. That is what makes the panel's
   * labels trustworthy — every heading comes from a rule that is installed —
   * but it means the panel can show fewer issues than the toolbar's badge
   * counts, which is `healthIssues.length`. Pinned deliberately: a future
   * "other issues" bucket would be a visible change, not a silent one.
   */
  it('drops an issue no installed rule claims', () => {
    const issues = [issue(defaultHealthRules[0].id, 'a'), issue('rule-since-removed', 'b')]

    const grouped = groupIssuesByRule(issues, defaultHealthRules)

    expect(grouped.flatMap((group) => group.issues.map((i) => i.nodeId))).toEqual(['a'])
    expect(issues).toHaveLength(2)
  })
})
