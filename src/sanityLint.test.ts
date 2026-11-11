import {missingIcon, missingSlugSource, missingTitle, rules} from '@sanity-labs/schema-lint'
import {createSchema, defineArrayMember, defineField, defineType, type Schema} from 'sanity'
import {describe, expect, it} from 'vitest'

import {computeHealthIssues} from './healthRules'
import {fromSanityLint, type SanityLintRule, type SanityLintType} from './sanityLint'
import {schemaToGraph} from './schemaToGraph'

function compile(types: Parameters<typeof createSchema>[0]['types']): Schema {
  return createSchema({name: 'test', types})
}

function lint(schema: Schema, lintRules: readonly SanityLintRule[]) {
  return computeHealthIssues(schemaToGraph(schema), {schema, rules: fromSanityLint(lintRules)})
}

const Icon = () => null

const author = defineType({
  name: 'author',
  title: 'Author',
  type: 'document',
  icon: Icon,
  fields: [defineField({name: 'name', type: 'string'})],
})

/**
 * A document type with no title or icon. It still needs a field: Sanity
 * rejects an empty one, and a schema with any error compiles to no types.
 */
function bare(name: string) {
  return defineType({name, type: 'document', fields: [defineField({name: 'body', type: 'text'})]})
}

/** Records what the adapter hands a rule, to check the conversion itself. */
function capture(): {rule: SanityLintRule; seen: SanityLintType[]} {
  const seen: SanityLintType[] = []
  return {
    seen,
    rule: {id: 'capture', name: 'Capture', severity: 'info', check: (type) => void seen.push(type)},
  }
}

describe('fromSanityLint', () => {
  it('adapts the package’s rules, minus the two that need source files', () => {
    const ids = fromSanityLint(rules).map((rule) => rule.id)

    expect(ids).toContain('sanity-lint/missing-icon')
    expect(ids).toContain('sanity-lint/missing-slug-source')
    expect(ids).not.toContain('sanity-lint/missing-define-type')
    expect(ids).not.toContain('sanity-lint/missing-define-field')
    expect(ids).toHaveLength(rules.length - 2)
  })

  it('labels each group with the rule’s own name', () => {
    expect(fromSanityLint([missingIcon])[0]?.label).toBe(missingIcon.name)
  })

  it('reports a finding against the type it was raised on, with its advice', () => {
    const post = defineType({
      name: 'post',
      title: 'Post',
      type: 'document',
      fields: [defineField({name: 'slug', type: 'slug'})],
    })

    const issues = lint(compile([post, author]), [missingIcon, missingSlugSource])

    expect(issues.map((issue) => [issue.category, issue.nodeId])).toEqual([
      ['sanity-lint/missing-icon', 'post'],
      ['sanity-lint/missing-slug-source', 'post'],
    ])
    expect(issues[1]?.message).toBe(
      'Slug field "slug" should have options.source. Add options: { source: "title" } or a source function (e.g. for nested fields)',
    )
  })

  it('judges what the author wrote, not the title compilation fills in', () => {
    const untitled = bare('untitled')
    const schema = compile([untitled, author])

    // Compilation titles every type, which is why the adapter reads the
    // authored definitions.
    expect(schema.get('untitled')?.title).toBe('Untitled')
    expect(lint(schema, [missingTitle]).map((issue) => issue.nodeId)).toEqual(['untitled'])
  })

  it('shows errors as warnings and keeps info as info', () => {
    const report = (severity: SanityLintRule['severity']): SanityLintRule => ({
      id: severity,
      name: severity,
      severity,
      check: (_type, ctx) => ctx.report({message: 'found'}),
    })

    const severities = fromSanityLint([report('error'), report('warning'), report('info')]).map(
      (rule) => rule.severity,
    )

    expect(severities).toEqual(['warning', 'warning', 'info'])
  })

  it('reports nothing without a schema, as a headless call with only a graph has none', () => {
    const schema = compile([bare('post')])
    const graph = schemaToGraph(schema)
    const iconRules = fromSanityLint([missingIcon])

    expect(computeHealthIssues(graph, {schema, rules: iconRules})).toHaveLength(1)
    expect(computeHealthIssues(graph, {rules: iconRules})).toEqual([])
  })

  it('skips types the graph left out, since an issue has to land on a card', () => {
    const schema = compile([bare('post'), author])
    const full = schemaToGraph(schema)
    const graph = {...full, nodes: full.nodes.filter((node) => node.id !== 'post')}
    const iconRules = fromSanityLint([missingIcon])

    expect(computeHealthIssues(full, {schema, rules: iconRules})).toHaveLength(1)
    expect(computeHealthIssues(graph, {schema, rules: iconRules})).toEqual([])
  })

  it('keeps going past a definition the rule throws on', () => {
    const picky: SanityLintRule = {
      id: 'picky',
      name: 'Picky',
      severity: 'warning',
      check: (type, ctx) => {
        if (type.name === 'author') throw new Error('unreadable')
        ctx.report({message: `${type.name} flagged`})
      },
    }
    const schema = compile([author, bare('post')])

    expect(lint(schema, [picky]).map((issue) => issue.message)).toEqual(['post flagged'])
  })

  it('reports a repeated finding once', () => {
    const echo: SanityLintRule = {
      id: 'echo',
      name: 'Echo',
      severity: 'info',
      check: (_type, ctx) => {
        ctx.report({message: 'twice'})
        ctx.report({message: 'twice'})
      },
    }

    expect(lint(compile([author]), [echo])).toHaveLength(1)
  })

  it('hands rules the authored definition in Sanity Lint’s shape', () => {
    const {rule, seen} = capture()
    const page = defineType({
      name: 'page',
      type: 'document',
      icon: Icon,
      groups: [{name: 'seo', title: 'SEO'}],
      fields: [
        defineField({name: 'title', type: 'string', validation: (r) => r.required()}),
        defineField({name: 'note', type: 'string', hidden: ({document}) => !document?.title}),
        defineField({name: 'legacy', type: 'string', hidden: true}),
        defineField({name: 'owner', type: 'reference', to: {type: 'author'}}),
        defineField({
          name: 'body',
          type: 'array',
          of: [defineArrayMember({type: 'block'})],
          options: {sortable: false},
        }),
      ],
    })

    lint(compile([page, author]), [rule])
    const converted = seen.find((type) => type.name === 'page')

    expect(converted).toMatchObject({
      type: 'document',
      title: undefined,
      hasIcon: true,
      hasPreview: false,
      groups: [{name: 'seo', title: 'SEO'}],
    })
    expect(converted?.fields).toMatchObject([
      {name: 'title', hasValidation: true, hidden: false},
      // A conditional `hidden` is visible some of the time.
      {name: 'note', hasValidation: false, hidden: false},
      {name: 'legacy', hidden: true},
      {name: 'owner', type: 'reference', to: [{type: 'author'}]},
      {name: 'body', of: [{name: 'block', type: 'block'}], options: {sortable: false}},
    ])
  })
})
