/**
 * Per-node data the compiled schema can't supply — anything fetched, measured
 * or computed after the graph is built. Live document counts are the one
 * built-in entry.
 *
 * A bag rather than named fields, so a new datum travels the canvas, card,
 * height estimate and panel as one `Map<nodeId, NodeAnnotations>` instead of a
 * prop on each; a {@link NodeBadgeDef} turns an entry into something on
 * screen. No key is named here: each belongs to whatever produces it and is
 * documented on the badge that reads it (see `docCountBadge`).
 *
 * @public
 */
export interface NodeAnnotations {
  [key: string]: unknown
}

/** Shared empty bag, so an unannotated node doesn't allocate one per build. */
export const NO_ANNOTATIONS: NodeAnnotations = {}

/**
 * Shallow value equality over own keys. The annotation map is rebuilt whenever
 * any annotation changes, so comparing by identity would re-render every card
 * whenever one node's datum arrived.
 */
export function sameAnnotations(a: NodeAnnotations, b: NodeAnnotations): boolean {
  if (a === b) return true
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => Object.is(a[key], b[key]))
}
