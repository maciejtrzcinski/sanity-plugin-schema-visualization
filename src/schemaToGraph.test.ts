import {createSchema, defineArrayMember, defineField, defineType} from 'sanity'
import {describe, expect, it} from 'vitest'

import {resolveConfig} from './config'
import {defaultFieldDescribers, type FieldDescriber} from './fieldWalker'
import {insertBefore} from './registry'
import {buildGraph, schemaToGraph} from './schemaToGraph'
import type {GraphNode} from './types'

function findNode(nodes: GraphNode[], id: string): GraphNode {
  const found = nodes.find((n) => n.id === id)
  if (!found)
    throw new Error(`Expected a node with id "${id}", got: ${nodes.map((n) => n.id).join(', ')}`)
  return found
}

describe('schemaToGraph', () => {
  it('classifies document and object types, and marks custom types as non-system', () => {
    const schema = createSchema({
      name: 'test',
      types: [
        defineType({
          name: 'seo',
          type: 'object',
          fields: [defineField({name: 'metaTitle', type: 'string'})],
        }),
        defineType({
          name: 'post',
          type: 'document',
          fields: [defineField({name: 'title', type: 'string'})],
        }),
      ],
    })

    const graph = schemaToGraph(schema)

    const post = findNode(graph.nodes, 'post')
    expect(post.kind).toBe('document')
    expect(post.isSystem).toBe(false)

    const seo = findNode(graph.nodes, 'seo')
    expect(seo.kind).toBe('object')
    expect(seo.isSystem).toBe(false)

    // Sanity's built-in intrinsics (image, slug, block, …) always ride along
    // on a compiled schema — they should be present, but flagged as system.
    const image = findNode(graph.nodes, 'image')
    expect(image.isSystem).toBe(true)
  })

  it('creates a reference edge for a `reference` field, weak flag included', () => {
    const schema = createSchema({
      name: 'test',
      types: [
        defineType({
          name: 'author',
          type: 'document',
          fields: [defineField({name: 'name', type: 'string'})],
        }),
        defineType({
          name: 'post',
          type: 'document',
          fields: [
            defineField({name: 'author', type: 'reference', to: [{type: 'author'}], weak: true}),
          ],
        }),
      ],
    })

    const graph = schemaToGraph(schema)
    const edge = graph.edges.find((e) => e.source === 'post' && e.target === 'author')

    expect(edge).toMatchObject({kind: 'reference', fieldName: 'author', weak: true})
  })

  it('creates a reference edge for each member of an array of references', () => {
    const schema = createSchema({
      name: 'test',
      types: [
        defineType({
          name: 'category',
          type: 'document',
          fields: [defineField({name: 'title', type: 'string'})],
        }),
        defineType({
          name: 'post',
          type: 'document',
          fields: [
            defineField({
              name: 'categories',
              type: 'array',
              of: [{type: 'reference', to: [{type: 'category'}]}],
            }),
          ],
        }),
      ],
    })

    const graph = schemaToGraph(schema)
    const edge = graph.edges.find((e) => e.source === 'post' && e.target === 'category')

    expect(edge).toMatchObject({kind: 'reference', fieldName: 'categories'})
  })

  it('creates a "reuses" edge when a field reuses another named custom type', () => {
    const schema = createSchema({
      name: 'test',
      types: [
        defineType({
          name: 'seo',
          type: 'object',
          fields: [defineField({name: 'metaTitle', type: 'string'})],
        }),
        defineType({
          name: 'post',
          type: 'document',
          fields: [defineField({name: 'seo', type: 'seo'})],
        }),
      ],
    })

    const graph = schemaToGraph(schema)
    const edge = graph.edges.find((e) => e.source === 'post' && e.target === 'seo')

    expect(edge).toMatchObject({kind: 'reuses', fieldName: 'seo'})
  })

  describe('external references', () => {
    it('describes a cross-dataset reference and draws it as its own edge kind', () => {
      const schema = createSchema({
        name: 'test',
        types: [
          defineType({
            name: 'author',
            type: 'document',
            fields: [defineField({name: 'name', type: 'string'})],
          }),
          defineType({
            name: 'post',
            type: 'document',
            fields: [
              defineField({
                name: 'sharedAuthor',
                type: 'crossDatasetReference',
                dataset: 'shared',
                weak: true,
                to: [{type: 'author', preview: {select: {title: 'name'}}}],
              }),
            ],
          }),
        ],
      })

      const graph = schemaToGraph(schema)

      const field = findNode(graph.nodes, 'post').fields[0]
      expect(field.typeLabel).toBe('cross-dataset reference → author')
      expect(field.options.map((o) => o.label)).toEqual(
        expect.arrayContaining(['weak ref', 'dataset: shared']),
      )
      // A cross-dataset target is not a local reference, so it stays out of
      // the field's `referencesTo` and off the health rules built on it.
      expect(field.referencesTo).toEqual([])
      expect(field.reusesTypes).toEqual([])

      expect(graph.edges.find((e) => e.source === 'post')).toMatchObject({
        target: 'author',
        kind: 'external-reference',
        fieldName: 'sharedAuthor',
        weak: true,
      })
    })

    it('still labels the field when the other dataset’s type is not in this schema', () => {
      const schema = createSchema({
        name: 'test',
        types: [
          defineType({
            name: 'post',
            type: 'document',
            fields: [
              defineField({
                name: 'sharedAuthor',
                type: 'crossDatasetReference',
                dataset: 'shared',
                to: [{type: 'author', preview: {select: {title: 'name'}}}],
              }),
            ],
          }),
        ],
      })

      const graph = schemaToGraph(schema)

      expect(findNode(graph.nodes, 'post').fields[0].typeLabel).toBe(
        'cross-dataset reference → author',
      )
      // Nothing to point at, so the edge is dropped rather than left dangling.
      expect(graph.edges.filter((e) => e.source === 'post')).toEqual([])
    })

    it('describes a global document reference by its resource', () => {
      const schema = createSchema({
        name: 'test',
        types: [
          defineType({
            name: 'author',
            type: 'document',
            fields: [defineField({name: 'name', type: 'string'})],
          }),
          defineType({
            name: 'post',
            type: 'document',
            fields: [
              defineField({
                name: 'globalAuthor',
                type: 'globalDocumentReference',
                resourceType: 'dataset',
                resourceId: 'myProject.shared',
                to: [{type: 'author', preview: {select: {title: 'name'}}}],
              }),
            ],
          }),
        ],
      })

      const graph = schemaToGraph(schema)

      const field = findNode(graph.nodes, 'post').fields[0]
      expect(field.typeLabel).toBe('global document reference → author')
      expect(field.options.map((o) => o.label)).toContain('dataset: myProject.shared')

      expect(graph.edges.find((e) => e.source === 'post')).toMatchObject({
        target: 'author',
        kind: 'external-reference',
        fieldName: 'globalAuthor',
      })
    })

    // A registered alias compiles to a chain ending at the intrinsic, and
    // `namedTypeDescriber` would otherwise claim it as a plain reuse of a type
    // whose own card shows nothing but `_ref`/`_weak`.
    it('claims a registered type declared as a cross-dataset reference', () => {
      const schema = createSchema({
        name: 'test',
        types: [
          defineType({
            name: 'author',
            type: 'document',
            fields: [defineField({name: 'name', type: 'string'})],
          }),
          defineType({
            name: 'sharedAuthorRef',
            type: 'crossDatasetReference',
            dataset: 'shared',
            to: [{type: 'author', preview: {select: {title: 'name'}}}],
          }),
          defineType({
            name: 'post',
            type: 'document',
            fields: [defineField({name: 'sharedAuthor', type: 'sharedAuthorRef'})],
          }),
        ],
      })

      const graph = schemaToGraph(schema)

      const field = findNode(graph.nodes, 'post').fields[0]
      expect(field.typeLabel).toBe('cross-dataset reference → author')
      expect(field.reusesTypes).toEqual([])
      expect(graph.edges.find((e) => e.source === 'post')).toMatchObject({
        target: 'author',
        kind: 'external-reference',
      })
    })
  })

  describe('custom field describers', () => {
    const schema = createSchema({
      name: 'test',
      types: [
        defineType({
          name: 'post',
          type: 'document',
          fields: [defineField({name: 'slug', type: 'slug', options: {source: 'title'}})],
        }),
      ],
    })

    const slugDescriber: FieldDescriber = {
      id: 'slug',
      match: (type) => type.name === 'slug',
      describe: () => ({typeLabel: 'slug (from title)', links: [], options: []}),
    }

    // The example in docs/extending.md: pre-empt `namedTypeDescriber` without knowing that
    // it is second in the default registry.
    it('lets a describer inserted ahead of a built-in claim the field', () => {
      const graph = schemaToGraph(schema, {
        fieldDescribers: insertBefore(defaultFieldDescribers, 'namedType', slugDescriber),
      })
      expect(findNode(graph.nodes, 'post').fields[0].typeLabel).toBe('slug (from title)')
    })
  })

  it('does not create a "reuses" edge for a plain, unnamed built-in field type', () => {
    const schema = createSchema({
      name: 'test',
      types: [
        defineType({
          name: 'post',
          type: 'document',
          fields: [defineField({name: 'mainImage', type: 'image'})],
        }),
      ],
    })

    const graph = schemaToGraph(schema)
    // `image` is a built-in — using it should not be reported as "reusing" a
    // custom type, even though `image` is technically in the type registry.
    expect(graph.edges.filter((e) => e.source === 'post')).toEqual([])
  })

  it('marks a field required only when validation statically requires it', () => {
    const schema = createSchema({
      name: 'test',
      types: [
        defineType({
          name: 'post',
          type: 'document',
          fields: [
            defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
            defineField({name: 'subtitle', type: 'string'}),
          ],
        }),
      ],
    })

    const graph = schemaToGraph(schema)
    const post = findNode(graph.nodes, 'post')
    const title = post.fields.find((f) => f.name === 'title')!
    const subtitle = post.fields.find((f) => f.name === 'subtitle')!

    expect(title.required).toBe(true)
    expect(subtitle.required).toBe(false)
  })

  it('marks a field hidden only when `hidden` is the literal `true`, not a conditional callback', () => {
    const schema = createSchema({
      name: 'test',
      types: [
        defineType({
          name: 'post',
          type: 'document',
          fields: [
            defineField({name: 'internalNotes', type: 'string', hidden: true}),
            defineField({name: 'conditionallyHidden', type: 'string', hidden: () => true}),
            defineField({name: 'visible', type: 'string'}),
          ],
        }),
      ],
    })

    const graph = schemaToGraph(schema)
    const post = findNode(graph.nodes, 'post')

    expect(post.fields.find((f) => f.name === 'internalNotes')!.hidden).toBe(true)
    expect(post.fields.find((f) => f.name === 'conditionallyHidden')!.hidden).toBe(false)
    expect(post.fields.find((f) => f.name === 'visible')!.hidden).toBe(false)
  })

  it('carries the deprecation reason onto the node', () => {
    const schema = createSchema({
      name: 'test',
      types: [
        defineType({
          name: 'legacyThing',
          type: 'object',
          deprecated: {reason: 'use "newThing" instead'},
          fields: [defineField({name: 'label', type: 'string'})],
        }),
      ],
    })

    const graph = schemaToGraph(schema)
    expect(findNode(graph.nodes, 'legacyThing').deprecated).toBe('use "newThing" instead')
  })

  it('carries the deprecation reason onto an individual field', () => {
    const schema = createSchema({
      name: 'test',
      types: [
        defineType({
          name: 'post',
          type: 'document',
          fields: [
            defineField({
              name: 'oldField',
              type: 'string',
              deprecated: {reason: 'use "newField" instead'},
            }),
            defineField({name: 'currentField', type: 'string'}),
          ],
        }),
      ],
    })

    const graph = schemaToGraph(schema)
    const post = findNode(graph.nodes, 'post')

    expect(post.fields.find((f) => f.name === 'oldField')!.deprecated).toBe(
      'use "newField" instead',
    )
    expect(post.fields.find((f) => f.name === 'currentField')!.deprecated).toBeUndefined()
  })

  it('does not duplicate edges when the same field references the same type twice', () => {
    const schema = createSchema({
      name: 'test',
      types: [
        defineType({
          name: 'category',
          type: 'document',
          fields: [defineField({name: 'title', type: 'string'})],
        }),
        defineType({
          name: 'post',
          type: 'document',
          fields: [
            defineField({
              name: 'related',
              type: 'array',
              of: [{type: 'reference', to: [{type: 'category'}]}],
            }),
          ],
        }),
      ],
    })

    const graph = schemaToGraph(schema)
    const matching = graph.edges.filter((e) => e.source === 'post' && e.target === 'category')
    expect(matching).toHaveLength(1)
  })

  describe('maxDepth', () => {
    const schema = createSchema({
      name: 'test',
      types: [
        defineType({
          name: 'author',
          type: 'document',
          fields: [defineField({name: 'name', type: 'string'})],
        }),
        defineType({
          name: 'post',
          type: 'document',
          fields: [
            defineField({
              name: 'byline',
              type: 'object',
              fields: [defineField({name: 'writer', type: 'reference', to: [{type: 'author'}]})],
            }),
          ],
        }),
      ],
    })

    it('stops descending into anonymous nested types past the given depth', () => {
      const shallow = schemaToGraph(schema, {maxDepth: 0})
      expect(shallow.edges.filter((e) => e.source === 'post' && e.target === 'author')).toEqual([])
    })

    it('descends far enough by default to find the same reference', () => {
      const graph = schemaToGraph(schema)
      expect(graph.edges.some((e) => e.source === 'post' && e.target === 'author')).toBe(true)
    })

    // The tool builds its graph from the resolved plugin config rather than
    // re-resolving the options, so a plugin-level `maxDepth` has to reach it
    // by that route.
    it('is read from the resolved plugin config by `buildGraph`', () => {
      const graph = buildGraph(schema, resolveConfig({maxDepth: 0}))
      expect(graph.edges.filter((e) => e.source === 'post' && e.target === 'author')).toEqual([])
      expect(buildGraph(schema, resolveConfig())).toEqual(schemaToGraph(schema))
    })
  })

  describe('nested field types', () => {
    it('creates a reference edge for a reference inside an inline object', () => {
      const schema = createSchema({
        name: 'test',
        types: [
          defineType({
            name: 'author',
            type: 'document',
            fields: [defineField({name: 'name', type: 'string'})],
          }),
          defineType({
            name: 'post',
            type: 'document',
            fields: [
              defineField({
                name: 'byline',
                type: 'object',
                fields: [defineField({name: 'writer', type: 'reference', to: [{type: 'author'}]})],
              }),
            ],
          }),
        ],
      })

      const graph = schemaToGraph(schema)
      const edge = graph.edges.find((e) => e.source === 'post' && e.target === 'author')

      expect(edge).toMatchObject({
        kind: 'reference',
        fieldName: 'byline',
        fieldPath: 'byline.writer',
      })
    })

    it('creates a reference edge for a custom field added to an image', () => {
      const schema = createSchema({
        name: 'test',
        types: [
          defineType({
            name: 'author',
            type: 'document',
            fields: [defineField({name: 'name', type: 'string'})],
          }),
          defineType({
            name: 'post',
            type: 'document',
            fields: [
              defineField({
                name: 'cover',
                type: 'image',
                fields: [defineField({name: 'credit', type: 'reference', to: [{type: 'author'}]})],
              }),
            ],
          }),
        ],
      })

      const graph = schemaToGraph(schema)
      const edge = graph.edges.find((e) => e.source === 'post' && e.target === 'author')

      expect(edge).toMatchObject({kind: 'reference', fieldName: 'cover', fieldPath: 'cover.credit'})
    })

    it('creates a "reuses" edge for a field whose type is a registered array type', () => {
      const schema = createSchema({
        name: 'test',
        types: [
          defineType({name: 'tags', type: 'array', of: [defineArrayMember({type: 'string'})]}),
          defineType({
            name: 'post',
            type: 'document',
            fields: [defineField({name: 'tags', type: 'tags'})],
          }),
        ],
      })

      const graph = schemaToGraph(schema)
      const edge = graph.edges.find((e) => e.source === 'post' && e.target === 'tags')

      expect(edge).toMatchObject({kind: 'reuses', fieldName: 'tags'})
    })

    it('reaches a reference declared in a portable-text annotation', () => {
      const schema = createSchema({
        name: 'test',
        types: [
          defineType({
            name: 'author',
            type: 'document',
            fields: [defineField({name: 'name', type: 'string'})],
          }),
          defineType({
            name: 'blockContent',
            type: 'array',
            of: [
              defineArrayMember({
                type: 'block',
                marks: {
                  annotations: [
                    {
                      name: 'authorLink',
                      type: 'object',
                      fields: [{name: 'author', type: 'reference', to: [{type: 'author'}]}],
                    },
                  ],
                },
              }),
            ],
          }),
          defineType({
            name: 'post',
            type: 'document',
            fields: [defineField({name: 'body', type: 'blockContent'})],
          }),
        ],
      })

      const graph = schemaToGraph(schema)

      // The annotation lives inside `blockContent`, so that's where the
      // reference belongs — `post` connects to it by reusing the type.
      expect(
        graph.edges.find((e) => e.source === 'post' && e.target === 'blockContent'),
      ).toMatchObject({kind: 'reuses', fieldName: 'body'})
      expect(
        graph.edges.find((e) => e.source === 'blockContent' && e.target === 'author'),
      ).toMatchObject({kind: 'reference'})
    })

    it('does not descend into a registered type, leaving its edges on its own node', () => {
      const schema = createSchema({
        name: 'test',
        types: [
          defineType({
            name: 'author',
            type: 'document',
            fields: [defineField({name: 'name', type: 'string'})],
          }),
          defineType({
            name: 'seo',
            type: 'object',
            fields: [defineField({name: 'owner', type: 'reference', to: [{type: 'author'}]})],
          }),
          defineType({
            name: 'post',
            type: 'document',
            fields: [defineField({name: 'seo', type: 'seo'})],
          }),
        ],
      })

      const graph = schemaToGraph(schema)

      expect(graph.edges.find((e) => e.source === 'post' && e.target === 'seo')).toBeDefined()
      expect(graph.edges.find((e) => e.source === 'seo' && e.target === 'author')).toBeDefined()
      // `post` reuses `seo`; it does not itself reference `author`.
      expect(graph.edges.find((e) => e.source === 'post' && e.target === 'author')).toBeUndefined()
    })
    it('omits fieldPath when the connection is at the top level of the field', () => {
      const schema = createSchema({
        name: 'test',
        types: [
          defineType({
            name: 'author',
            type: 'document',
            fields: [defineField({name: 'name', type: 'string'})],
          }),
          defineType({
            name: 'post',
            type: 'document',
            fields: [defineField({name: 'author', type: 'reference', to: [{type: 'author'}]})],
          }),
        ],
      })

      const graph = schemaToGraph(schema)
      expect(graph.edges.find((e) => e.source === 'post')!.fieldPath).toBeUndefined()
    })
  })
})

describe('what the form and validation say about a type', () => {
  const schema = createSchema({
    name: 'test',
    types: [
      defineType({
        name: 'author',
        type: 'document',
        fields: [defineField({name: 'name', type: 'string'})],
      }),
      defineType({
        name: 'post',
        type: 'document',
        groups: [
          {name: 'content', title: 'Content', default: true},
          {name: 'seo', title: 'SEO'},
        ],
        fieldsets: [{name: 'meta', title: 'Meta'}],
        initialValue: () => ({title: 'Untitled'}),
        preview: {select: {title: 'title', subtitle: 'author.name'}},
        fields: [
          defineField({
            name: 'title',
            type: 'string',
            group: 'content',
            validation: (Rule) => Rule.required().max(120),
          }),
          defineField({
            name: 'slug',
            type: 'slug',
            group: ['content', 'seo'],
            options: {source: 'title'},
          }),
          defineField({name: 'code', type: 'string', fieldset: 'meta', initialValue: 'abc'}),
          defineField({name: 'other', type: 'string', fieldset: 'meta'}),
          defineField({
            name: 'author',
            type: 'reference',
            to: [{type: 'author'}],
            options: {disableNew: true},
          }),
        ],
      }),
    ],
  })
  const graph = schemaToGraph(schema)
  const post = findNode(graph.nodes, 'post')
  const field = (name: string) => post.fields.find((f) => f.name === name)!

  it('carries the type’s groups and multi-field fieldsets', () => {
    expect(post.groups).toEqual([
      {name: 'content', title: 'Content', isDefault: true},
      {name: 'seo', title: 'SEO'},
    ])
    expect(post.fieldsets).toEqual([{name: 'meta', title: 'Meta', fields: ['code', 'other']}])
    expect(field('slug').groups).toEqual(['content', 'seo'])
    expect(field('code').fieldset).toBe('meta')
    expect(field('author').groups).toBeUndefined()
  })

  it('carries validation, initial values and the built-in type each field is', () => {
    expect(field('title').validation).toEqual([{flag: 'max', value: 120, level: 'error'}])
    expect(field('code').initialValue).toBe('value')
    expect(post.initialValue).toBe('function')
    expect(field('slug')).toMatchObject({intrinsicType: 'slug', source: 'title'})
    expect(field('author').intrinsicType).toBe('reference')
  })

  it('badges a reference whose input can’t create new documents', () => {
    expect(field('author').options.map((o) => o.label)).toContain('no create')
  })

  it('reads the preview’s select paths, and only for types the author registered', () => {
    expect(post.previewSelect).toContainEqual({
      key: 'subtitle',
      path: 'author.name',
      dereferences: 1,
    })
    expect(findNode(graph.nodes, 'sanity.imageAsset').previewSelect).toBeUndefined()
  })

  it('estimates the attribute paths each document type and the schema can write', () => {
    expect(post.attributePaths).toBeGreaterThan(5)
    expect(findNode(graph.nodes, 'author').attributePaths).toBe(6)
    expect(graph.attributePaths?.count).toBeGreaterThanOrEqual(post.attributePaths!)
    expect(findNode(graph.nodes, 'slug').attributePaths).toBeUndefined()
  })
})
