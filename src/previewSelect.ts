import {isArraySchemaType, isObjectSchemaType, isReferenceSchemaType, type SchemaType} from 'sanity'

import type {PreviewSelection} from './types'

/** Reading one of these off a reference reads the reference itself, not its target. */
const REFERENCE_OWN_KEYS = new Set(['_ref', '_type', '_weak', '_key'])

function fieldType(type: SchemaType, name: string): SchemaType | undefined {
  return isObjectSchemaType(type) ? type.fields.find((f) => f.name === name)?.type : undefined
}

/**
 * How many references resolving `path` from `root` crosses. A reference is
 * only crossed when the path reads past it (`author.name`, not `author`).
 * Stops counting at the first segment it can't follow — an unknown field, a
 * computed value — since nothing past it can be judged.
 */
export function countDereferences(root: SchemaType, path: string): number {
  let current: SchemaType | undefined = root
  let dereferences = 0
  for (const segment of path.split('.')) {
    if (!current) break
    if (isReferenceSchemaType(current)) {
      if (REFERENCE_OWN_KEYS.has(segment)) break
      dereferences++
      const targets: SchemaType[] = current.to
      current = targets.find((target) => fieldType(target, segment)) ?? targets[0]
      if (!current) break
    }
    if (isArraySchemaType(current)) {
      // Previews index into arrays (`images.0.asset`); anything else is unreadable.
      if (!/^\d+$/.test(segment)) break
      current = current.of[0]
      continue
    }
    current = fieldType(current, segment)
  }
  return dereferences
}

/** The type's `preview.select`, with each path's dereference count. */
export function readPreviewSelect(type: SchemaType): PreviewSelection[] | undefined {
  const preview: unknown = 'preview' in type ? type.preview : undefined
  if (typeof preview !== 'object' || preview === null || !('select' in preview)) return undefined
  const {select} = preview
  if (typeof select !== 'object' || select === null) return undefined

  const selections: PreviewSelection[] = []
  for (const [key, path] of Object.entries(select)) {
    if (typeof path !== 'string' || !path) continue
    selections.push({key, path, dereferences: countDereferences(type, path)})
  }
  return selections.length > 0 ? selections : undefined
}
