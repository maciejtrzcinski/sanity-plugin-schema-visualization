import {createSchema, defineArrayMember, defineField, defineType} from 'sanity'
import {describe, expect, it} from 'vitest'

import {countDereferences, readPreviewSelect} from './previewSelect'

const schema = createSchema({
  name: 'test',
  types: [
    defineType({
      name: 'company',
      type: 'document',
      fields: [defineField({name: 'name', type: 'string'})],
    }),
    defineType({
      name: 'author',
      type: 'document',
      fields: [
        defineField({name: 'name', type: 'string'}),
        defineField({name: 'company', type: 'reference', to: [{type: 'company'}]}),
      ],
    }),
    defineType({
      name: 'post',
      type: 'document',
      fields: [
        defineField({name: 'title', type: 'string'}),
        defineField({name: 'author', type: 'reference', to: [{type: 'author'}]}),
        defineField({name: 'cover', type: 'image'}),
        defineField({
          name: 'authors',
          type: 'array',
          of: [defineArrayMember({type: 'reference', to: [{type: 'author'}]})],
        }),
      ],
      preview: {select: {title: 'title', subtitle: 'author.company.name', media: 'cover'}},
    }),
  ],
})

const compiledPost = schema.get('post')
if (!compiledPost) throw new Error('Expected `post` to compile')
const post = compiledPost

describe('countDereferences', () => {
  it('counts each reference the path reads past', () => {
    expect(countDereferences(post, 'title')).toBe(0)
    expect(countDereferences(post, 'author.name')).toBe(1)
    expect(countDereferences(post, 'author.company.name')).toBe(2)
  })

  it('does not count selecting the reference itself, or its own keys', () => {
    expect(countDereferences(post, 'author')).toBe(0)
    expect(countDereferences(post, 'author._ref')).toBe(0)
  })

  it('follows an image’s asset reference and array indexes', () => {
    expect(countDereferences(post, 'cover.asset.url')).toBe(1)
    expect(countDereferences(post, 'authors.0.company.name')).toBe(2)
  })

  it('stops counting at a segment it can’t follow', () => {
    expect(countDereferences(post, 'nope.author.company')).toBe(0)
  })
})

describe('readPreviewSelect', () => {
  it('reads every select entry with its dereference count', () => {
    expect(readPreviewSelect(post)).toEqual([
      {key: 'title', path: 'title', dereferences: 0},
      {key: 'subtitle', path: 'author.company.name', dereferences: 2},
      {key: 'media', path: 'cover', dereferences: 0},
    ])
  })
})
