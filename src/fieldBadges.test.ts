import {createSchema, defineField, defineType, isObjectSchemaType, type SchemaType} from 'sanity'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {resetBrokenAssumptions} from './compat'
import {
  collectFieldBadges,
  defaultFieldBadges,
  hotspotBadge,
  requiredBadge,
  type FieldBadgeDef,
} from './fieldBadges'
import {schemaToGraph} from './schemaToGraph'
import {readValidation} from './validation'

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  // Warnings are once-per-session, so each case starts from a clean slate.
  resetBrokenAssumptions()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
})

/**
 * The compiled type of one field on `post`. Badges read a *compiled* type —
 * `hidden`, `readOnly` and `deprecated` all get normalized on the way in — so
 * the fixtures go through `createSchema` rather than being hand-built.
 */
function fieldType(field: ReturnType<typeof defineField>): SchemaType {
  const schema = createSchema({
    name: 'test',
    types: [defineType({name: 'post', type: 'document', fields: [field]})],
  })
  const post = schema.get('post')
  if (!post || !isObjectSchemaType(post)) throw new Error('Expected `post` to compile as an object')
  const compiled = post.fields[0]
  if (!compiled) throw new Error('Expected `post` to have one field')
  return compiled.type
}

function labels(field: ReturnType<typeof defineField>, required = false): string[] {
  const type = fieldType(field)
  return collectFieldBadges(type, {name: 'field', required}).map((badge) => badge.label)
}

/** Labels with validation read the way `schemaToGraph` reads it. */
function validatedLabels(field: ReturnType<typeof defineField>): string[] {
  const type = fieldType(field)
  const {required, constraints} = readValidation(type)
  return collectFieldBadges(type, {name: 'field', required, validation: constraints}).map(
    (badge) => badge.label,
  )
}

describe('defaultFieldBadges', () => {
  it('badges a field required by validation', () => {
    // `required` is resolved centrally from the compiled Rule and handed in,
    // rather than each badge re-reading `type.validation`.
    expect(labels(defineField({name: 'title', type: 'string'}), true)).toEqual(['required'])
    expect(labels(defineField({name: 'title', type: 'string'}), false)).toEqual([])
  })

  it('badges unconditional `hidden` and `readOnly`', () => {
    expect(labels(defineField({name: 'slug', type: 'string', readOnly: true}))).toEqual([
      'read-only',
    ])
    expect(labels(defineField({name: 'slug', type: 'string', hidden: true}))).toEqual(['hidden'])
  })

  // A callback can't be evaluated statically, so it gets its own label rather
  // than being read as an unconditional flag.
  it('tells a conditional `hidden` apart from an unconditional one', () => {
    expect(labels(defineField({name: 'slug', type: 'string', hidden: () => true}))).toEqual([
      'conditionally hidden',
    ])
  })

  it('badges a deprecated field', () => {
    const field = defineField({
      name: 'legacy',
      type: 'string',
      deprecated: {reason: 'Use `title`.'},
    })
    expect(labels(field)).toEqual(['deprecated'])
  })

  it('badges the options that change how a field is edited', () => {
    const list = defineField({
      name: 'status',
      type: 'string',
      options: {list: ['draft', 'live'], layout: 'radio'},
    })
    expect(labels(list)).toEqual(['list (2)', 'layout: radio'])

    const slug = defineField({name: 'slug', type: 'slug', options: {source: 'title'}})
    expect(labels(slug)).toEqual(['source: title'])

    const image = defineField({name: 'cover', type: 'image', options: {hotspot: true}})
    expect(labels(image)).toEqual(['hotspot'])
  })

  it('names a computed slug source rather than printing the function', () => {
    const slug = defineField({
      name: 'slug',
      type: 'slug',
      options: {source: (doc) => (typeof doc.title === 'string' ? doc.title : '')},
    })
    expect(labels(slug)).toEqual(['source: computed'])
  })

  it('sums up validation beyond `required` in one badge', () => {
    const title = defineField({
      name: 'title',
      type: 'string',
      validation: (Rule) => Rule.required().min(3).max(120),
    })
    expect(validatedLabels(title)).toEqual(['required', 'min 3 · max 120'])

    const code = defineField({
      name: 'code',
      type: 'string',
      validation: (Rule) => Rule.regex(/^[a-z]+$/, {name: 'lowercase'}).warning(),
    })
    expect(validatedLabels(code)).toEqual(['matches lowercase (warning)'])

    const end = defineField({
      name: 'end',
      type: 'number',
      validation: (Rule) => Rule.integer().greaterThan(Rule.valueOfField('start')),
    })
    expect(validatedLabels(end)).toEqual(['integer · > field start'])
  })

  // Every slug carries a validator Sanity adds itself; it isn't the author's.
  it('does not call Sanity’s own slug validator a custom rule', () => {
    expect(validatedLabels(defineField({name: 'slug', type: 'slug'}))).toEqual([])
    expect(
      validatedLabels(
        defineField({name: 'slug', type: 'slug', validation: (Rule) => Rule.custom(() => true)}),
      ),
    ).toEqual(['custom'])
  })

  it('badges an initial value, spelling out a short literal', () => {
    expect(labels(defineField({name: 'status', type: 'string', initialValue: 'draft'}))).toEqual([
      'initial: draft',
    ])
    expect(labels(defineField({name: 'n', type: 'number', initialValue: () => 5}))).toEqual([
      'initial value: computed',
    ])
    expect(
      labels(
        defineField({
          name: 'seo',
          type: 'object',
          fields: [{name: 'title', type: 'string'}],
          initialValue: {title: 'Untitled'},
        }),
      ),
    ).toEqual(['initial value'])
  })

  it('emits badges in registry order, not in the order the flags were declared', () => {
    const field = defineField({
      name: 'status',
      type: 'string',
      readOnly: true,
      options: {list: ['a']},
    })
    expect(labels(field, true)).toEqual(['required', 'read-only', 'list (1)'])
  })
})

describe('collectFieldBadges', () => {
  it('runs every def in a registry, unlike the first-match registries', () => {
    const localized: FieldBadgeDef = {
      id: 'localized',
      badge: (type) => (type.name.startsWith('i18n') ? {label: 'localized'} : undefined),
    }
    const always: FieldBadgeDef = {id: 'always', badge: () => ({label: 'always'})}

    const type = fieldType(defineField({name: 'title', type: 'string'}))
    // Each badge is stamped with the id of the def that produced it, so the
    // card and the panel have a stable key for a list where two options can
    // share a label.
    expect(collectFieldBadges(type, {name: 'title', required: false}, [always, localized])).toEqual(
      [{id: 'always', label: 'always'}],
    )
  })

  it('lets a caller drop one built-in by id', () => {
    const badges = defaultFieldBadges.filter((badge) => badge.id !== hotspotBadge.id)
    const type = fieldType(defineField({name: 'cover', type: 'image', options: {hotspot: true}}))
    expect(collectFieldBadges(type, {name: 'cover', required: false}, badges)).toEqual([])
  })

  it('passes the field name through, so a badge can key off it', () => {
    const seen: string[] = []
    const spy: FieldBadgeDef = {
      id: 'spy',
      badge: (_type, ctx) => {
        seen.push(ctx.name)
        return undefined
      },
    }
    collectFieldBadges(
      fieldType(defineField({name: 'title', type: 'string'})),
      {
        name: 'title',
        required: false,
      },
      [spy],
    )
    expect(seen).toEqual(['title'])
  })

  // A bad badge should cost its own badge, not the graph — the same bargain
  // `computeHealthIssues` strikes for a throwing rule.
  it('skips a throwing badge, keeps the rest, and warns once', () => {
    const broken: FieldBadgeDef = {
      id: 'broken',
      badge: () => {
        throw new Error('nope')
      },
    }
    const type = fieldType(defineField({name: 'title', type: 'string'}))
    const ctx = {name: 'title', required: true}

    expect(collectFieldBadges(type, ctx, [broken, requiredBadge])).toEqual([
      {id: 'required', label: 'required', tone: 'critical'},
    ])
    collectFieldBadges(type, ctx, [broken, requiredBadge])

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('`broken` field badge threw')
  })
})

describe('schemaToGraph', () => {
  it('badges fields through the registry it was given', () => {
    const schema = createSchema({
      name: 'test',
      types: [
        defineType({
          name: 'post',
          type: 'document',
          fields: [defineField({name: 'title', type: 'string', readOnly: true})],
        }),
      ],
    })

    const uppercase: FieldBadgeDef = {
      id: 'json-type',
      badge: (type) => ({label: type.jsonType, tone: 'primary'}),
    }

    const graph = schemaToGraph(schema, {fieldBadges: [uppercase]})
    const title = graph.nodes.find((n) => n.id === 'post')?.fields[0]

    // The built-in `read-only` badge is gone: the option replaces the registry
    // rather than merging with it, like every other extension point.
    expect(title?.options).toEqual([{id: 'json-type', label: 'string', tone: 'primary'}])
  })
})
