/**
 * Per-node data the compiled schema can't supply, e.g. live document counts.
 * Keys belong to whatever produces them; a {@link NodeBadgeDef} renders them.
 *
 * @public
 */
export interface NodeAnnotations {
  [key: string]: unknown
}

export const NO_ANNOTATIONS: NodeAnnotations = {}

export function sameAnnotations(a: NodeAnnotations, b: NodeAnnotations): boolean {
  if (a === b) return true
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => Object.is(a[key], b[key]))
}
