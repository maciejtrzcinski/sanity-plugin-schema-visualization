/**
 * Three things this plugin reads are not part of Sanity's public contract:
 * `schema._original` (the as-authored type list), the `_rules` array inside a
 * compiled validation `Rule`, and our own list of intrinsic type names. Each
 * is read defensively, so a change on Sanity's side degrades a feature rather
 * than throwing — and reports itself once, since a silent degradation (system
 * types drawn as authored ones, `required` badges gone) looks like nothing at
 * all.
 */

/** The assumptions worth reporting on, named by where they're made. */
export type AssumptionId = 'schema._original' | 'rule._rules' | 'INTRINSIC_FIELD_NAMES'

const reported = new Set<string>()

/**
 * Warns once per `key`, then stays quiet about it for the rest of the session.
 * These checks run per type, per field or per render, so a warning each would
 * be unreadable.
 */
export function warnOnce(key: string, message: string): void {
  if (reported.has(key)) return
  reported.add(key)
  console.warn(`[schema-visualization] ${message}`)
}

/**
 * Reports a defensive read that found something other than what it expected.
 * `consequence` should say what the user loses, in one sentence.
 */
export function reportBrokenAssumption(id: AssumptionId, consequence: string): void {
  warnOnce(
    id,
    `Expected shape not found for \`${id}\`. ${consequence} ` +
      `This usually means the plugin needs updating for your version of Sanity.`,
  )
}

/** Test seam: forgets everything {@link warnOnce} has already reported. */
export function resetBrokenAssumptions(): void {
  reported.clear()
}
