import type {Schema} from 'sanity'

import {reportBrokenAssumption} from './compat'

/**
 * Names of Sanity's built-in intrinsic types. `schema.getTypeNames()` always
 * includes these alongside whatever the user registered, since they're part
 * of the base type hierarchy every custom type is compiled against. Used as
 * a fallback for detecting "system" types when `schema._original` (the raw,
 * as-authored type list) isn't available.
 */
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
 * Sub-fields that belong to an intrinsic type's own built-in shape rather than
 * to anything the schema author wrote. The field walker descends into object
 * types to find references the author added (`image` with a `credit`
 * reference, an inline object holding a `reference`) — but an untouched
 * `image` field would otherwise report a reference to `sanity.imageAsset`
 * through its built-in `asset` field, which is asset-system plumbing, not a
 * modelled relationship.
 *
 * A compiled schema gives us no way to derive this: the registry entries for
 * `image`/`file`/… carry an empty `fields` array, and a customized `image`
 * field's own `fields` list interleaves built-ins with author-added ones with
 * no marker distinguishing them. Hence an explicit list.
 *
 * `block` is deliberately absent — its `markDefs` (annotations) and `children`
 * (inline objects) are exactly where authors put references inside portable
 * text, so it is traversed in full.
 */
export const INTRINSIC_FIELD_NAMES: Readonly<Record<string, ReadonlySet<string>>> = {
  image: new Set(['asset', 'media', 'hotspot', 'crop']),
  file: new Set(['asset', 'media']),
  span: new Set(['text', 'marks']),
  slug: new Set(['current', 'source']),
  geopoint: new Set(['lat', 'lng', 'alt']),
}

/**
 * The set of type names the user actually registered in `schema.types`, as
 * opposed to Sanity's built-in intrinsic/system types that ride along on
 * every compiled schema (image, slug, sanity.imageAsset, …).
 */
export function getRegisteredTypeNames(schema: Schema): Set<string> {
  // An empty list is a real answer — a Studio started from the `clean`
  // template registers no types — so only a missing one counts as drift.
  const original = schema._original?.types
  if (Array.isArray(original)) {
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

/**
 * `INTRINSIC_FIELD_NAMES` is keyed by intrinsic type name, so a rename or
 * removal on Sanity's side silently turns an entry into dead weight and lets
 * that type's built-in fields be drawn as if the author had added them. The
 * keys are all long-standing types, so anything missing from a compiled schema
 * is drift rather than a version difference. Cheap enough to check per build.
 */
export function checkIntrinsicFieldTypes(schema: Schema): void {
  const present = new Set(schema.getTypeNames())
  const missing = Object.keys(INTRINSIC_FIELD_NAMES).filter((name) => !present.has(name))
  if (missing.length === 0) return
  reportBrokenAssumption(
    'INTRINSIC_FIELD_NAMES',
    `The compiled schema no longer has: ${missing.join(', ')} — the built-in fields listed for those types are no longer being skipped.`,
  )
}
