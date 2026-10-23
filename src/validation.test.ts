import {createSchema, defineField, defineType, isObjectSchemaType, type SchemaType} from 'sanity'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {resetBrokenAssumptions} from './compat'
import {readValidation} from './validation'

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetBrokenAssumptions()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => warn.mockRestore())

function fieldType(field: ReturnType<typeof defineField>): SchemaType {
  const schema = createSchema({
    name: 'test',
    types: [defineType({name: 'post', type: 'document', fields: [field]})],
  })
  const post = schema.get('post')
  if (!post || !isObjectSchemaType(post)) throw new Error('Expected `post` to compile')
  return post.fields[0].type
}

describe('readValidation', () => {
  it('reads `required` and every other constraint in one pass', () => {
    const type = fieldType(
      defineField({
        name: 'tags',
        type: 'array',
        of: [{type: 'string'}],
        validation: (Rule) => Rule.required().unique().min(1).max(5),
      }),
    )

    expect(readValidation(type)).toEqual({
      required: true,
      constraints: [
        {flag: 'unique', level: 'error'},
        {flag: 'min', value: 1, level: 'error'},
        {flag: 'max', value: 5, level: 'error'},
      ],
    })
  })

  it('keeps each rule’s level and reads a regex by name, inverted or not', () => {
    const type = fieldType(
      defineField({
        name: 'code',
        type: 'string',
        validation: (Rule) => [
          Rule.regex(/^[a-z]+$/, {name: 'lowercase'}).warning(),
          Rule.regex(/admin/, {invert: true}).info(),
        ],
      }),
    )

    expect(readValidation(type).constraints).toEqual([
      {flag: 'regex', value: 'lowercase', level: 'warning'},
      {flag: 'regex', value: '/admin/', inverted: true, level: 'info'},
    ])
  })

  it('reads a comparison against another field as that field’s path', () => {
    const type = fieldType(
      defineField({
        name: 'end',
        type: 'datetime',
        validation: (Rule) => Rule.min(Rule.valueOfField('start')),
      }),
    )

    expect(readValidation(type).constraints).toEqual([
      {flag: 'min', value: {field: 'start'}, level: 'error'},
    ])
  })

  it('reads a field with no validation as unconstrained, without warning', () => {
    expect(readValidation(fieldType(defineField({name: 'title', type: 'string'})))).toEqual({
      required: false,
      constraints: [],
    })
    expect(warn).not.toHaveBeenCalled()
  })

  // A compiled Rule always carries `_rules`; finding none means Sanity moved it.
  it('reports once when the Rule shape moved', () => {
    const type = fieldType(defineField({name: 'title', type: 'string'}))
    // A Rule instance that no longer carries `_rules` under that name.
    Reflect.set(type, 'validation', [{someNewShape: []}])

    expect(readValidation(type)).toEqual({required: false, constraints: []})
    readValidation(type)
    expect(warn).toHaveBeenCalledOnce()
  })
})
