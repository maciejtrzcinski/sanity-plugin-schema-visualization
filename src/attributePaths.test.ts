import {
  createSchema,
  defineArrayMember,
  defineField,
  defineType,
  type SchemaTypeDefinition,
} from 'sanity'
import {describe, expect, it} from 'vitest'

import {estimateAttributePaths} from './attributePaths'

function estimate(types: SchemaTypeDefinition[], roots: string[]) {
  const schema = createSchema({name: 'test', types})
  const registered = new Set(types.map((t) => t.name))
  const rootTypes = roots.map((name) => {
    const type = schema.get(name)
    if (!type) throw new Error(`no type ${name}`)
    return type
  })
  return estimateAttributePaths(rootTypes, (name) => registered.has(name))
}

/** The five every document carries: `_id`, `_type`, `_rev`, `_createdAt`, `_updatedAt`. */
const SYSTEM = 5

describe('estimateAttributePaths', () => {
  it('counts each path and data type a document can write', () => {
    const {total, byType} = estimate(
      [
        defineType({
          name: 'page',
          type: 'document',
          fields: [
            defineField({name: 'title', type: 'string'}),
            defineField({
              name: 'sections',
              type: 'array',
              of: [
                defineArrayMember({
                  type: 'object',
                  name: 'section',
                  fields: [
                    defineField({name: 'heading', type: 'string'}),
                    defineField({name: 'body', type: 'string'}),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
      ['page'],
    )

    // title · sections · sections[] · sections[]._key · sections[]._type ·
    // sections[].heading · sections[].body
    expect(byType.get('page')).toBe(SYSTEM + 7)
    expect(total).toEqual({count: SYSTEM + 7, capped: false, recursiveTypes: []})
  })

  it('counts a path shared by two document types once', () => {
    const doc = (name: string) =>
      defineType({name, type: 'document', fields: [defineField({name: 'title', type: 'string'})]})

    const {total, byType} = estimate([doc('a'), doc('b')], ['a', 'b'])

    expect(byType.get('a')).toBe(SYSTEM + 1)
    expect(total.count).toBe(SYSTEM + 1)
  })

  it('expands a reused object type wherever it is used', () => {
    const {byType} = estimate(
      [
        defineType({
          name: 'seo',
          type: 'object',
          fields: [defineField({name: 'title', type: 'string'})],
        }),
        defineType({
          name: 'page',
          type: 'document',
          fields: [
            defineField({name: 'seo', type: 'seo'}),
            defineField({name: 'social', type: 'seo'}),
          ],
        }),
      ],
      ['page'],
    )

    // seo · seo._type · seo.title, and the same three under social
    expect(byType.get('page')).toBe(SYSTEM + 6)
  })

  it('counts a reference as the reference object, not its target', () => {
    const {byType} = estimate(
      [
        defineType({name: 'author', type: 'document', fields: [{name: 'name', type: 'string'}]}),
        defineType({
          name: 'post',
          type: 'document',
          fields: [defineField({name: 'author', type: 'reference', to: [{type: 'author'}]})],
        }),
      ],
      ['post'],
    )

    // author · author._ref · author._type
    expect(byType.get('post')).toBe(SYSTEM + 3)
  })

  it('names a type that contains itself, and counts it one level deep', () => {
    const {total} = estimate(
      [
        defineType({
          name: 'menuItem',
          type: 'object',
          fields: [
            defineField({name: 'label', type: 'string'}),
            defineField({name: 'children', type: 'array', of: [{type: 'menuItem'}]}),
          ],
        }),
        defineType({
          name: 'menu',
          type: 'document',
          fields: [defineField({name: 'items', type: 'array', of: [{type: 'menuItem'}]})],
        }),
      ],
      ['menu'],
    )

    expect(total.recursiveTypes).toEqual(['menuItem'])
    expect(total.capped).toBe(false)
  })
})
