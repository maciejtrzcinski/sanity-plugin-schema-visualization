/**
 * Reads of things Sanity doesn't publicly promise. Each degrades rather than
 * throwing, and reports once, since a silent degradation looks like nothing.
 */

export type AssumptionId = 'schema._original' | 'rule._rules' | 'INTRINSIC_FIELD_NAMES'

const reported = new Set<string>()

/** `cause`, when given, is logged after the message so the console shows its stack. */
export function warnOnce(key: string, message: string, cause?: unknown): void {
  if (reported.has(key)) return
  reported.add(key)
  const prefixed = `[schema-visualization] ${message}`
  if (cause === undefined) console.warn(prefixed)
  else console.warn(prefixed, cause)
}

export function reportBrokenAssumption(id: AssumptionId, consequence: string): void {
  warnOnce(
    id,
    `Expected shape not found for \`${id}\`. ${consequence} ` +
      `This usually means the plugin needs updating for your version of Sanity.`,
  )
}

export function resetBrokenAssumptions(): void {
  reported.clear()
}
