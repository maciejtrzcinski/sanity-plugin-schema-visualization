import {createSchema, defineField, defineType, isObjectSchemaType, type Schema} from 'sanity'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {reportBrokenAssumption, resetBrokenAssumptions} from './compat'
import {checkIntrinsicFieldTypes, getRegisteredTypeNames, INTRINSIC_TYPE_NAMES} from './intrinsics'
import {schemaToGraph} from './schemaToGraph'

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetBrokenAssumptions()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
})

function postSchema(): Schema {
  return createSchema({
    name: 'test',
    types: [
      defineType({
        name: 'post',
        type: 'document',
        fields: [
          defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
          defineField({name: 'body', type: 'string'}),
        ],
      }),
    ],
  })
}

describe('reportBrokenAssumption', () => {
  it('warns once per assumption, however often the read runs', () => {
    reportBrokenAssumption('rule._rules', 'Nothing works.')
    reportBrokenAssumption('rule._rules', 'Nothing works.')
    reportBrokenAssumption('schema._original', 'Something else broke.')

    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[0]?.[0]).toContain('rule._rules')
    expect(warn.mock.calls[0]?.[0]).toContain('Nothing works.')
    expect(warn.mock.calls[1]?.[0]).toContain('schema._original')
  })
})

describe('getRegisteredTypeNames', () => {
  it('stays quiet on a normal compiled schema', () => {
    expect(getRegisteredTypeNames(postSchema())).toEqual(new Set(['post']))
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns and falls back to the intrinsic list when `_original` is gone', () => {
    const schema = postSchema()
    Reflect.deleteProperty(schema, '_original')

    const names = getRegisteredTypeNames(schema)

    expect(names.has('post')).toBe(true)
    expect(names.has('image')).toBe(false)
    expect(names.has('any')).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('schema._original')
  })
})

describe('checkIntrinsicFieldTypes', () => {
  it('warns when a type `INTRINSIC_FIELD_NAMES` is keyed by has disappeared', () => {
    const schema = postSchema()
    schema.getTypeNames = () => ['image', 'file', 'span', 'slug']

    checkIntrinsicFieldTypes(schema)

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('geopoint')
  })

  it('stays quiet on a real compiled schema', () => {
    checkIntrinsicFieldTypes(postSchema())
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('isFieldRequired, via schemaToGraph', () => {
  it('reads `required` from a compiled Rule without warning', () => {
    const graph = schemaToGraph(postSchema())
    const title = graph.nodes.find((n) => n.id === 'post')?.fields.find((f) => f.name === 'title')

    expect(title?.required).toBe(true)
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns once when Rule no longer exposes `_rules`', () => {
    const schema = postSchema()
    const post = schema.get('post')
    if (!post || !isObjectSchemaType(post))
      throw new Error('expected a compiled `post` object type')
    for (const field of post.fields) Reflect.set(field.type, 'validation', [{someNewShape: []}])

    const graph = schemaToGraph(schema)
    const title = graph.nodes.find((n) => n.id === 'post')?.fields.find((f) => f.name === 'title')

    expect(title?.required).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('rule._rules')
  })
})

// Canaries: CI runs these against Sanity 5.x, `latest` and `next`.
describe('against the installed Sanity', () => {
  const blankSchema = () => createSchema({name: 'blank', types: []})

  it('draws a schema with no user types as system types only, with no edges', () => {
    const graph = schemaToGraph(blankSchema())

    expect(graph.nodes.length).toBeGreaterThan(0)
    expect(graph.nodes.filter((n) => !n.isSystem).map((n) => n.id)).toEqual([])
    expect(graph.edges).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it('knows every built-in type the fallback would otherwise draw as user-written', () => {
    const unknown = blankSchema()
      .getTypeNames()
      .filter((name) => !INTRINSIC_TYPE_NAMES.has(name) && !name.startsWith('sanity.'))

    expect(unknown).toEqual([])
  })

  it('draws only the connections the author modelled, not asset plumbing', () => {
    const schema = createSchema({
      name: 'test',
      types: [
        defineType({name: 'author', type: 'document', fields: [{name: 'name', type: 'string'}]}),
        defineType({
          name: 'post',
          type: 'document',
          fields: [
            defineField({name: 'cover', type: 'image', options: {hotspot: true}}),
            defineField({name: 'attachment', type: 'file'}),
            defineField({name: 'slug', type: 'slug'}),
            defineField({name: 'location', type: 'geopoint'}),
            defineField({name: 'author', type: 'reference', to: [{type: 'author'}]}),
            defineField({name: 'body', type: 'array', of: [{type: 'block'}]}),
          ],
        }),
      ],
    })

    const graph = schemaToGraph(schema)

    expect(graph.edges.map((e) => `${e.source} -> ${e.target} (${e.kind})`)).toEqual([
      'post -> author (reference)',
    ])
    expect(warn).not.toHaveBeenCalled()
  })
})
