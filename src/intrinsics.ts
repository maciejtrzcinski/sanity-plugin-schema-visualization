import type {Schema, SchemaTypeDefinition} from 'sanity'

import {reportBrokenAssumption} from './compat'

/** Sanity's built-in types; the system-type fallback when `schema._original` is missing. */
export const INTRINSIC_TYPE_NAMES: ReadonlySet<string> = new Set([
  'any',
  'document',
  'object',
  'array',
  'string',
  'text',
  'number',
  'boolean',
  'date',
  'datetime',
  'url',
  'email',
  'telephone',
  'geopoint',
  'slug',
  'image',
  'file',
  'reference',
  'crossDatasetReference',
  'globalDocumentReference',
  'block',
  'span',
])

/**
 * Sub-fields of an intrinsic's own shape, not the author's — e.g. `image.asset`.
 * The compiled schema can't tell them apart, hence a list. `block` is absent on
 * purpose: its `markDefs` and `children` are where portable-text references live.
 */
export const INTRINSIC_FIELD_NAMES: Readonly<Record<string, ReadonlySet<string>>> = {
  image: new Set(['asset', 'media', 'hotspot', 'crop']),
  file: new Set(['asset', 'media']),
  span: new Set(['text', 'marks']),
  slug: new Set(['current', 'source']),
  geopoint: new Set(['lat', 'lng', 'alt']),
}

/** `schema._original`, or `undefined` if Sanity stops providing it. */
export function getAuthoredTypes(schema: Schema): readonly SchemaTypeDefinition[] | undefined {
  const original = schema._original?.types
  return Array.isArray(original) ? original : undefined
}

export function getRegisteredTypeNames(schema: Schema): Set<string> {
  // An empty list is real (the `clean` template); only a missing one is drift.
  const original = getAuthoredTypes(schema)
  if (original) {
    return new Set(original.map((t) => t.name))
  }
  reportBrokenAssumption(
    'schema._original',
    'Falling back to a hardcoded list of built-in type names, so any built-in missing from that list will be drawn as if you had written it.',
  )
  return new Set(
    schema
      .getTypeNames()
      .filter((name) => !INTRINSIC_TYPE_NAMES.has(name) && !name.startsWith('sanity.')),
  )
}

/** A renamed intrinsic would silently turn its `INTRINSIC_FIELD_NAMES` entry dead. */
export function checkIntrinsicFieldTypes(schema: Schema): void {
  const present = new Set(schema.getTypeNames())
  const missing = Object.keys(INTRINSIC_FIELD_NAMES).filter((name) => !present.has(name))
  if (missing.length === 0) return
  reportBrokenAssumption(
    'INTRINSIC_FIELD_NAMES',
    `The compiled schema no longer has: ${missing.join(', ')} — the built-in fields listed for those types are no longer being skipped.`,
  )
}
