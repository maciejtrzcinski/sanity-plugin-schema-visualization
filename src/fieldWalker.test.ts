import {createSchema, defineField, defineType, isObjectSchemaType, type SchemaType} from 'sanity'
import {describe, expect, it} from 'vitest'

import {
  arrayDescriber,
  crossDatasetReferenceDescriber,
  DEFAULT_MAX_DEPTH,
  defaultFieldDescribers,
  fallbackDescriber,
  getTypeOptions,
  globalDocumentReferenceDescriber,
  isAnonymousType,
  namedTypeDescriber,
  objectDescriber,
  referenceDescriber,
  rootWalkContext,
  walkFieldType,
  type DescribeResult,
  type FieldDescriber,
  type Recurse,
} from './fieldWalker'
import type {TranslateFn} from './i18n'

type TypeDef = ReturnType<typeof defineType>

/**
 * The walker reads *compiled* types — aliases resolved, `to` entries turned
 * into schema types, intrinsics spliced into the chain — so every fixture
 * goes through `createSchema` rather than being hand-built.
 */
function registeredType(types: TypeDef[], name: string): SchemaType {
  const compiled = createSchema({name: 'test', types}).get(name)
  if (!compiled) throw new Error(`Expected "${name}" to compile`)
  return compiled
}

/** The compiled type of one field — what `describeField` hands the walker. */
function fieldType(types: TypeDef[], typeName: string, fieldName: string): SchemaType {
  const owner = registeredType(types, typeName)
  if (!isObjectSchemaType(owner)) throw new Error(`Expected "${typeName}" to be an object type`)
  const field = owner.fields.find((f) => f.name === fieldName)
  if (!field) throw new Error(`Expected "${typeName}" to have a field "${fieldName}"`)
  return field.type
}

interface WalkOptions {
  /** Names `isRegistered` answers true for. */
  registered?: string[]
  maxDepth?: number
  selfName?: string
  t?: TranslateFn
  fieldName?: string
  describers?: readonly FieldDescriber[]
}

function walk(type: SchemaType, options: WalkOptions = {}): DescribeResult {
  const registered = new Set(options.registered ?? [])
  return walkFieldType(
    type,
    rootWalkContext(
      options.fieldName ?? 'field',
      (name) => registered.has(name),
      options.maxDepth,
      options.selfName,
      options.t,
    ),
    options.describers,
  )
}

/** A recurse that proves a describer is terminal: calling it fails the test. */
const noRecurse: Recurse = () => {
  throw new Error('Expected this describer not to descend')
}

const author = defineType({
  name: 'author',
  type: 'document',
  fields: [defineField({name: 'name', type: 'string'})],
})

const seo = defineType({
  name: 'seo',
  type: 'object',
  fields: [defineField({name: 'metaTitle', type: 'string'})],
})

function post(...fields: ReturnType<typeof defineField>[]): TypeDef {
  return defineType({name: 'post', type: 'document', fields})
}

/** Paths are the readable half of a link; most assertions only need these. */
function paths(result: DescribeResult): string[] {
  return result.links.map((link) => link.path)
}

describe('rootWalkContext', () => {
  it('roots the path at the field name, with the default depth budget', () => {
    const ctx = rootWalkContext('title', () => false)

    expect(ctx.path).toBe('title')
    expect(ctx.depth).toBe(0)
    expect(ctx.maxDepth).toBe(DEFAULT_MAX_DEPTH)
    expect(ctx.seen.size).toBe(0)
    expect(ctx.selfName).toBeUndefined()
    // Defaults to the English bundle, so a headless walk still reads properly.
    expect(ctx.t('field.weak-ref')).toBe('weak ref')
  })

  it('carries an explicit depth budget, self name and translator', () => {
    const ctx = rootWalkContext(
      'title',
      () => true,
      2,
      'post',
      (key) => key.toUpperCase(),
    )

    expect(ctx.maxDepth).toBe(2)
    expect(ctx.selfName).toBe('post')
    expect(ctx.isRegistered('anything')).toBe(true)
    expect(ctx.t('field.weak-ref')).toBe('FIELD.WEAK-REF')
  })
})

describe('getTypeOptions', () => {
  it('returns the options object a type was declared with', () => {
    const cover = fieldType(
      [
        post(
          defineField({
            name: 'cover',
            type: 'image',
            options: {hotspot: true},
          }),
        ),
      ],
      'post',
      'cover',
    )

    expect(getTypeOptions(cover)).toMatchObject({hotspot: true})
  })

  it('returns undefined for a type declared without options', () => {
    const title = fieldType([post(defineField({name: 'title', type: 'string'}))], 'post', 'title')

    expect(getTypeOptions(title)).toBeUndefined()
  })
})

describe('isAnonymousType', () => {
  it('is true for an inline type, whose compiled name is just its jsonType', () => {
    const meta = fieldType(
      [
        post(
          defineField({
            name: 'meta',
            type: 'object',
            fields: [defineField({name: 'note', type: 'string'})],
          }),
        ),
      ],
      'post',
      'meta',
    )

    expect(meta.name).toBe(meta.jsonType)
    expect(isAnonymousType(meta)).toBe(true)
  })

  it('is false for a registered type', () => {
    expect(isAnonymousType(registeredType([seo], 'seo'))).toBe(false)
  })
})

describe('walkFieldType', () => {
  it('stops descending past maxDepth, keeping the label it already has', () => {
    // `body` is an array (depth 0) of inline objects (1) holding a reference (2).
    const body = fieldType(
      [
        author,
        post(
          defineField({
            name: 'body',
            type: 'array',
            of: [
              {
                type: 'object',
                fields: [
                  defineField({
                    name: 'author',
                    type: 'reference',
                    to: [{type: 'author'}],
                  }),
                ],
              },
            ],
          }),
        ),
      ],
      'post',
      'body',
    )

    expect(paths(walk(body, {registered: ['author'], maxDepth: 2}))).toEqual(['field[].author'])
    expect(paths(walk(body, {registered: ['author'], maxDepth: 1}))).toEqual([])
    // The label is the walker's own, so cutting the descent short still names
    // the shape as far as it got.
    expect(walk(body, {registered: ['author'], maxDepth: 1}).typeLabel).toBe('array of object')
  })

  it('names each link by the path that reached it', () => {
    const body = fieldType(
      [
        author,
        post(
          defineField({
            name: 'body',
            type: 'array',
            of: [
              {
                type: 'object',
                fields: [
                  defineField({
                    name: 'markDefs',
                    type: 'array',
                    of: [
                      {
                        type: 'object',
                        fields: [
                          defineField({
                            name: 'author',
                            type: 'reference',
                            to: [{type: 'author'}],
                          }),
                        ],
                      },
                    ],
                  }),
                ],
              },
            ],
          }),
        ),
      ],
      'post',
      'body',
    )

    expect(paths(walk(body, {registered: ['author'], fieldName: 'body'}))).toEqual([
      'body[].markDefs[].author',
    ])
  })

  it('roots the first segment when the context carries no path yet', () => {
    const meta = fieldType(
      [
        author,
        post(
          defineField({
            name: 'meta',
            type: 'object',
            fields: [
              defineField({
                name: 'author',
                type: 'reference',
                to: [{type: 'author'}],
              }),
            ],
          }),
        ),
      ],
      'post',
      'meta',
    )

    expect(paths(walk(meta, {registered: ['author'], fieldName: ''}))).toEqual(['author'])
  })

  it('stops at a type already on the descent path', () => {
    // A self-nesting type: without the `seen` guard this recurses until the
    // depth budget runs out, repeating `owner` at every level.
    const node = defineType({
      name: 'node',
      type: 'object',
      fields: [
        defineField({name: 'child', type: 'node'}),
        defineField({
          name: 'owner',
          type: 'reference',
          to: [{type: 'author'}],
        }),
      ],
    })

    const result = walk(registeredType([author, node], 'node'), {
      registered: ['author'],
    })

    // Compiling an alias makes one fresh type object per level, so the guard
    // bites on the second `child` rather than the first — bounded either way,
    // and far short of the depth budget it would otherwise run to.
    expect(paths(result)).toEqual(['field.child.owner', 'field.owner'])
  })

  it('takes the first describer that matches, ahead of the built-ins', () => {
    const shout: FieldDescriber = {
      id: 'shout',
      match: (type) => type.jsonType === 'string',
      describe: (type, ctx) => ({
        typeLabel: type.name.toUpperCase(),
        links: [{kind: 'reuses', target: 'shouted', path: ctx.path}],
        options: [],
      }),
    }
    const title = fieldType([post(defineField({name: 'title', type: 'string'}))], 'post', 'title')

    expect(walk(title, {describers: [shout, ...defaultFieldDescribers]})).toMatchObject({
      typeLabel: 'STRING',
      links: [{target: 'shouted', path: 'field'}],
    })
  })

  it('hands a describer a recurse that extends the path and the depth', () => {
    const seenDepths: number[] = []
    const spy: FieldDescriber = {
      id: 'spy',
      match: () => true,
      describe(type, ctx, recurse) {
        seenDepths.push(ctx.depth)
        if (!isObjectSchemaType(type)) return {typeLabel: ctx.path, links: [], options: []}
        const links = type.fields.flatMap((field) => recurse(field.type, field.name).links)
        return {
          typeLabel: ctx.path,
          links: [...links, {kind: 'reuses', target: ctx.path, path: ctx.path}],
          options: [],
        }
      },
    }
    const meta = fieldType(
      [
        post(
          defineField({
            name: 'meta',
            type: 'object',
            fields: [defineField({name: 'note', type: 'string'})],
          }),
        ),
      ],
      'post',
      'meta',
    )

    expect(paths(walk(meta, {describers: [spy], fieldName: 'meta'}))).toEqual(['meta'])
    expect(seenDepths).toEqual([0, 1])
  })

  it('falls back to the catch-all when no describer matches', () => {
    const title = fieldType([post(defineField({name: 'title', type: 'string'}))], 'post', 'title')

    expect(walk(title, {describers: []})).toEqual({
      typeLabel: 'string',
      links: [],
      options: [],
    })
  })

  it('routes the words of a label through the context translator', () => {
    const t: TranslateFn = (key) => key.toUpperCase()
    const ref = fieldType(
      [
        author,
        post(
          defineField({
            name: 'author',
            type: 'reference',
            to: [{type: 'author'}],
          }),
        ),
      ],
      'post',
      'author',
    )

    // Only the words are translated — the type names interpolated into them
    // come from the schema, so a `t` that ignores its values loses them.
    expect(walk(ref, {registered: ['author'], t}).typeLabel).toBe('FIELD.REFERENCE-LABEL')
  })
})

describe('defaultFieldDescribers', () => {
  it('orders terminal rules first, structural recursion after, catch-all last', () => {
    expect(defaultFieldDescribers.map((describer) => describer.id)).toEqual([
      'reference',
      'crossDatasetReference',
      'globalDocumentReference',
      'namedType',
      'array',
      'object',
      'fallback',
    ])
  })

  /**
   * `walkFieldType` only ever calls `describe` on a describer whose own `match`
   * returned true, so what matters about a non-match is that the type falls
   * through to the next describer — not what the declining one would have
   * returned. `isRegistered` answers true for everything here, which is the
   * permissive end: `namedTypeDescriber` has to decline on anonymity alone.
   */
  it('leaves a primitive to the catch-all, whatever the registry says', () => {
    const ctx = rootWalkContext('title', () => true)
    const title = fieldType([post(defineField({name: 'title', type: 'string'}))], 'post', 'title')

    const claimed = defaultFieldDescribers
      .filter((describer) => describer !== fallbackDescriber)
      .filter((describer) => describer.match(title, ctx))

    expect(claimed.map((describer) => describer.id)).toEqual([])
    expect(walkFieldType(title, ctx)).toEqual({typeLabel: 'string', links: [], options: []})
  })
})

describe('referenceDescriber', () => {
  const ctx = rootWalkContext('author', () => false)

  it('labels every target and emits one link each', () => {
    const editor = defineType({
      name: 'editor',
      type: 'document',
      fields: [defineField({name: 'name', type: 'string'})],
    })
    const ref = fieldType(
      [
        author,
        editor,
        post(
          defineField({
            name: 'author',
            type: 'reference',
            to: [{type: 'author'}, {type: 'editor'}],
          }),
        ),
      ],
      'post',
      'author',
    )

    expect(referenceDescriber.match(ref, ctx)).toBe(true)
    expect(referenceDescriber.describe(ref, ctx, noRecurse)).toEqual({
      typeLabel: 'reference → author | editor',
      links: [
        {kind: 'reference', target: 'author', path: 'author', weak: false},
        {kind: 'reference', target: 'editor', path: 'author', weak: false},
      ],
      options: [],
    })
  })

  it('badges a weak reference and a filtered one', () => {
    const ref = fieldType(
      [
        author,
        post(
          defineField({
            name: 'author',
            type: 'reference',
            to: [{type: 'author'}],
            weak: true,
            options: {filter: 'defined(name)'},
          }),
        ),
      ],
      'post',
      'author',
    )

    const result = referenceDescriber.describe(ref, ctx, noRecurse)

    expect(result.options).toEqual([
      {label: 'weak ref', tone: 'caution'},
      {label: 'filtered', tone: 'default'},
    ])
    expect(result.links[0]).toMatchObject({weak: true})
  })
})

describe('crossDatasetReferenceDescriber', () => {
  const ctx = rootWalkContext('sharedAuthor', () => false)

  const crossField = defineField({
    name: 'sharedAuthor',
    type: 'crossDatasetReference',
    dataset: 'shared',
    weak: true,
    to: [{type: 'author', preview: {select: {title: 'name'}}}],
  })

  it('names the external target and badges the dataset it lives in', () => {
    const cross = fieldType([author, post(crossField)], 'post', 'sharedAuthor')

    expect(crossDatasetReferenceDescriber.match(cross, ctx)).toBe(true)
    expect(crossDatasetReferenceDescriber.describe(cross, ctx, noRecurse)).toEqual({
      typeLabel: 'cross-dataset reference → author',
      // A distinct edge kind: the target is in another dataset, so this must
      // not read as a local reference even when a type of that name is here.
      links: [
        {
          kind: 'external-reference',
          target: 'author',
          path: 'sharedAuthor',
          weak: true,
        },
      ],
      options: [
        {label: 'weak ref', tone: 'caution'},
        {label: 'dataset: shared', tone: 'default'},
      ],
    })
  })

  it('matches a registered type declared as a cross-dataset reference', () => {
    // The alias compiles to a chain ending at the intrinsic; `isAliasOf` walks
    // it, which is what keeps `namedTypeDescriber` from claiming it first.
    const alias = defineType({
      name: 'sharedAuthorRef',
      type: 'crossDatasetReference',
      dataset: 'shared',
      to: [{type: 'author', preview: {select: {title: 'name'}}}],
    })
    const aliasType = registeredType([author, alias], 'sharedAuthorRef')

    expect(crossDatasetReferenceDescriber.match(aliasType, ctx)).toBe(true)
    expect(walk(aliasType, {registered: ['author', 'sharedAuthorRef']}).typeLabel).toBe(
      'cross-dataset reference → author',
    )
  })
})

describe('globalDocumentReferenceDescriber', () => {
  const ctx = rootWalkContext('globalAuthor', () => false)

  it('names the external target and badges the resource it lives in', () => {
    const global = fieldType(
      [
        author,
        post(
          defineField({
            name: 'globalAuthor',
            type: 'globalDocumentReference',
            resourceType: 'dataset',
            resourceId: 'myProject.shared',
            to: [{type: 'author', preview: {select: {title: 'name'}}}],
          }),
        ),
      ],
      'post',
      'globalAuthor',
    )

    expect(globalDocumentReferenceDescriber.match(global, ctx)).toBe(true)
    expect(globalDocumentReferenceDescriber.describe(global, ctx, noRecurse)).toEqual({
      typeLabel: 'global document reference → author',
      links: [
        {
          kind: 'external-reference',
          target: 'author',
          path: 'globalAuthor',
          weak: false,
        },
      ],
      options: [{label: 'dataset: myProject.shared', tone: 'default'}],
    })
  })
})

describe('namedTypeDescriber', () => {
  const seoType = () =>
    fieldType([seo, post(defineField({name: 'seo', type: 'seo'}))], 'post', 'seo')

  it('claims a registered type and stops there, since it has a node of its own', () => {
    const ctx = rootWalkContext('seo', (name) => name === 'seo')

    expect(namedTypeDescriber.match(seoType(), ctx)).toBe(true)
    expect(namedTypeDescriber.describe(seoType(), ctx, noRecurse)).toEqual({
      typeLabel: 'seo (object)',
      links: [{kind: 'reuses', target: 'seo', path: 'seo'}],
      options: [],
    })
  })

  it('leaves unregistered and anonymous types to the structural describers', () => {
    expect(
      namedTypeDescriber.match(
        seoType(),
        rootWalkContext('seo', () => false),
      ),
    ).toBe(false)

    // `object`/`image`/… are registered names too, so an inline type would be
    // claimed as a reuse of the intrinsic it compiles to without this guard.
    const meta = fieldType(
      [
        post(
          defineField({
            name: 'meta',
            type: 'object',
            fields: [defineField({name: 'note', type: 'string'})],
          }),
        ),
      ],
      'post',
      'meta',
    )
    expect(
      namedTypeDescriber.match(
        meta,
        rootWalkContext('meta', () => true),
      ),
    ).toBe(false)
  })

  it('does not claim the type that owns the field being walked', () => {
    const withSelf = rootWalkContext('seo', () => true, DEFAULT_MAX_DEPTH, 'seo')

    expect(namedTypeDescriber.match(seoType(), withSelf)).toBe(false)
  })

  it('drops the jsonType suffix below the top level, where it is just noise', () => {
    const tags = fieldType(
      [seo, post(defineField({name: 'tags', type: 'array', of: [{type: 'seo'}]}))],
      'post',
      'tags',
    )

    // "array of seo", not "array of seo (object)".
    expect(walk(tags, {registered: ['seo'], fieldName: 'tags'})).toEqual({
      typeLabel: 'array of seo',
      links: [{kind: 'reuses', target: 'seo', path: 'tags[]'}],
      options: [],
    })
  })
})

describe('arrayDescriber', () => {
  it('labels an array by its members and collects their links', () => {
    const tags = fieldType(
      [
        seo,
        post(
          defineField({
            name: 'tags',
            type: 'array',
            of: [{type: 'seo'}, {type: 'image'}],
          }),
        ),
      ],
      'post',
      'tags',
    )

    expect(
      arrayDescriber.match(
        tags,
        rootWalkContext('tags', () => false),
      ),
    ).toBe(true)
    // Every member contributes to the label; only the registered one is a link.
    expect(walk(tags, {registered: ['seo'], fieldName: 'tags'})).toEqual({
      typeLabel: 'array of seo, image',
      links: [{kind: 'reuses', target: 'seo', path: 'tags[]'}],
      options: [],
    })
  })

  it('descends into a registered array type’s own members when it owns the walk', () => {
    // Without `selfName`, `namedTypeDescriber` would claim `tags` as a reuse
    // of itself and the array would never reach its members.
    const tagsType = registeredType(
      [seo, defineType({name: 'tags', type: 'array', of: [{type: 'seo'}]})],
      'tags',
    )

    expect(walk(tagsType, {registered: ['tags', 'seo'], selfName: 'tags'})).toEqual({
      typeLabel: 'array of seo',
      links: [{kind: 'reuses', target: 'seo', path: 'field[]'}],
      options: [],
    })
  })

  it('falls back to the unknown-target marker for an array with no members', () => {
    const empty = fieldType(
      [post(defineField({name: 'tags', type: 'array', of: []}))],
      'post',
      'tags',
    )

    expect(walk(empty).typeLabel).toBe('array of ?')
  })
})

describe('objectDescriber', () => {
  it('descends into the fields the author wrote', () => {
    const meta = fieldType(
      [
        author,
        post(
          defineField({
            name: 'meta',
            type: 'object',
            fields: [
              defineField({name: 'note', type: 'string'}),
              defineField({
                name: 'author',
                type: 'reference',
                to: [{type: 'author'}],
              }),
            ],
          }),
        ),
      ],
      'post',
      'meta',
    )

    expect(
      objectDescriber.match(
        meta,
        rootWalkContext('meta', () => false),
      ),
    ).toBe(true)
    expect(walk(meta, {registered: ['author'], fieldName: 'meta'})).toEqual({
      typeLabel: 'object',
      links: [
        {
          kind: 'reference',
          target: 'author',
          path: 'meta.author',
          weak: false,
        },
      ],
      options: [],
    })
  })

  it('skips an intrinsic’s built-in shape, keeping asset plumbing off the graph', () => {
    const cover = fieldType(
      [
        author,
        post(
          defineField({
            name: 'cover',
            type: 'image',
            fields: [
              defineField({
                name: 'credit',
                type: 'reference',
                to: [{type: 'author'}],
              }),
            ],
          }),
        ),
      ],
      'post',
      'cover',
    )

    // `asset` would otherwise report a reference to `sanity.imageAsset`.
    expect(walk(cover, {registered: ['author'], fieldName: 'cover'})).toEqual({
      typeLabel: 'image',
      links: [
        {
          kind: 'reference',
          target: 'author',
          path: 'cover.credit',
          weak: false,
        },
      ],
      options: [],
    })
  })
})

describe('fallbackDescriber', () => {
  it('matches anything and reports the bare type name', () => {
    const ctx = rootWalkContext('title', () => false)
    const title = fieldType([post(defineField({name: 'title', type: 'string'}))], 'post', 'title')

    expect(fallbackDescriber.match(title, ctx)).toBe(true)
    expect(fallbackDescriber.match(registeredType([seo], 'seo'), ctx)).toBe(true)
    expect(fallbackDescriber.describe(title, ctx, noRecurse)).toEqual({
      typeLabel: 'string',
      links: [],
      options: [],
    })
  })
})
