/**
 * A synthetic schema at the size where layout cost starts to matter: a
 * multi-brand page builder with 100+ document types, 200+ section and object
 * types, references between documents, sections reused across pages, and
 * portable text whose annotations point at documents. Deterministic — the same
 * arguments always produce the same schema — so timings and snapshots taken
 * against it are comparable run to run.
 */
import {createSchema, defineField, defineType, type Schema, type SchemaTypeDefinition} from 'sanity'

export interface LargeSchemaSize {
  documents: number
  sections: number
  objects: number
}

export const LARGE_SCHEMA_SIZE: LargeSchemaSize = {documents: 110, sections: 140, objects: 80}

/** Park–Miller: small, seedable, and the same in every runtime. */
function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 48271) % 2147483647
    return state / 2147483647
  }
}

export function largeSchema(size: LargeSchemaSize = LARGE_SCHEMA_SIZE, seed = 42): Schema {
  return createSchema({name: 'large', types: largeSchemaTypes(size, seed)})
}

/** The type definitions behind {@link largeSchema}, for a Studio to register. */
export function largeSchemaTypes(
  size: LargeSchemaSize = LARGE_SCHEMA_SIZE,
  seed = 42,
): SchemaTypeDefinition[] {
  const next = random(seed)
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]
  const some = <T>(items: readonly T[], count: number): T[] => [
    ...new Set(Array.from({length: count}, () => pick(items))),
  ]

  const documentNames = Array.from({length: size.documents}, (_, i) => `doc${i}`)
  const sectionNames = Array.from({length: size.sections}, (_, i) => `section${i}`)
  const objectNames = Array.from({length: size.objects}, (_, i) => `object${i}`)

  const objects = objectNames.map((name, i) =>
    defineType({
      name,
      type: 'object',
      fields: [
        defineField({name: 'label', type: 'string'}),
        defineField({name: 'image', type: 'image', options: {hotspot: true}}),
        // Every fourth object nests another, so some chains run deep.
        ...(i % 4 === 0 && i + 1 < objectNames.length
          ? [defineField({name: 'child', type: objectNames[i + 1]})]
          : []),
        ...(i % 3 === 0
          ? [defineField({name: 'link', type: 'reference', to: [{type: pick(documentNames)}]})]
          : []),
      ],
    }),
  )

  const sections = sectionNames.map((name) =>
    defineType({
      name,
      type: 'object',
      fields: [
        defineField({name: 'heading', type: 'string', validation: (rule) => rule.required()}),
        defineField({name: 'body', type: 'blockContent'}),
        defineField({
          name: 'items',
          type: 'array',
          of: some(objectNames, 2).map((type) => ({type})),
        }),
        defineField({
          name: 'featured',
          type: 'array',
          of: [{type: 'reference', to: some(documentNames, 3).map((type) => ({type}))}],
        }),
      ],
    }),
  )

  const blockContent = defineType({
    name: 'blockContent',
    type: 'array',
    of: [
      {
        type: 'block',
        marks: {
          annotations: [
            {
              name: 'internalLink',
              type: 'object',
              fields: [
                {
                  name: 'target',
                  type: 'reference',
                  to: some(documentNames, 5).map((type) => ({type})),
                },
              ],
            },
          ],
        },
      },
      {type: 'image'},
    ],
  })

  const documents = documentNames.map((name) =>
    defineType({
      name,
      type: 'document',
      fields: [
        defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
        defineField({name: 'slug', type: 'slug', options: {source: 'title'}}),
        defineField({name: 'parent', type: 'reference', to: [{type: pick(documentNames)}]}),
        defineField({
          name: 'related',
          type: 'array',
          of: [{type: 'reference', to: some(documentNames, 2).map((type) => ({type}))}],
        }),
        defineField({
          name: 'sections',
          type: 'array',
          of: some(sectionNames, 6).map((type) => ({type})),
        }),
        defineField({name: 'seo', type: pick(objectNames)}),
      ],
    }),
  )

  return [blockContent, ...objects, ...sections, ...documents]
}
