import {warnOnce} from './compat'

/**
 * What the ordering helpers key on: every registry entry carries an `id`.
 *
 * @public
 */
export interface Identified {
  id: string
}

export interface Registered extends Identified {
  isCatchAll?: boolean
}

export function indexById<T extends Registered>(defs: readonly T[]): Map<T['id'], T> {
  return new Map(defs.map((def) => [def.id, def] as const))
}

export function catchAllOf<T extends Registered>(defs: readonly T[], fallback: T): T {
  return defs.find((def) => def.isCatchAll) ?? defs[defs.length - 1] ?? fallback
}

export function duplicateIds(defs: readonly Identified[]): string[] {
  return duplicates(defs.map((def) => def.id))
}

/**
 * A copy of `defs` with `entries` placed just ahead of the entry with id
 * `anchorId`. Throws when no entry carries it: appending would land behind the
 * catch-all, where nothing matches.
 *
 * @public
 */
export function insertBefore<T extends Identified>(
  defs: readonly T[],
  anchorId: string,
  ...entries: readonly T[]
): T[] {
  const at = indexOfId(defs, anchorId, 'insertBefore')
  return [...defs.slice(0, at), ...entries, ...defs.slice(at)]
}

/**
 * A copy of `defs` with the entry sharing `replacement`'s id swapped in place.
 * Throws when no entry carries that id.
 *
 * @public
 */
export function replaceById<T extends Identified>(defs: readonly T[], replacement: T): T[] {
  const at = indexOfId(defs, replacement.id, 'replaceById')
  return defs.map((def, i) => (i === at ? replacement : def))
}

/**
 * A copy of `defs` without the entries carrying any of `ids`. Throws when an id
 * matches nothing.
 *
 * @public
 */
export function without<T extends Identified>(defs: readonly T[], ...ids: readonly string[]): T[] {
  for (const id of ids) indexOfId(defs, id, 'without')
  const drop = new Set(ids)
  return defs.filter((def) => !drop.has(def.id))
}

function indexOfId(defs: readonly Identified[], id: string, helper: string): number {
  const at = defs.findIndex((def) => def.id === id)
  if (at === -1) {
    const known = defs.map((def) => `\`${def.id}\``).join(', ')
    throw new Error(
      `${helper}: no entry with id \`${id}\`. ` +
        (known ? `The registry has ${known}.` : 'The registry is empty.'),
    )
  }
  return at
}

/** What a warning says about one registry callback that threw. */
export interface EntryFailure {
  /** The registry's name for an entry: `field badge`, `kind`. */
  registry: string
  id: string
  /** Named when the entry has more than one callback. */
  callback?: string
  /** What it was called on. Left out when the call covers the whole graph. */
  subject?: string
  /** What the tool does instead. */
  outcome: string
}

/**
 * `run()`, or `fallback` when it throws: a broken custom entry costs its own
 * output, not the tool. Warns once per entry and callback; `failure` is only
 * built once something has thrown.
 */
export function guarded<T>(run: () => T, fallback: T, failure: () => EntryFailure): T {
  try {
    return run()
  } catch (error) {
    const {registry, id, callback, subject, outcome} = failure()
    const name = callback ? `\`${id}\` ${registry}'s \`${callback}\`` : `\`${id}\` ${registry}`
    warnOnce(
      callback ? `${registry}:${id}:${callback}` : `${registry}:${id}`,
      `The ${name} threw${subject ? ` on ${subject}` : ''}, so ${outcome}. ` +
        `Further failures from it are not reported.`,
      error,
    )
    return fallback
  }
}

export function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) repeated.add(value)
    seen.add(value)
  }
  return [...repeated]
}

/**
 * A colour for canvas chrome that can't take a tone: a CSS variable that follows
 * the Studio theme, plus a literal fallback for the export. Use a saturated
 * variable like `--card-badge-primary-dot-color`; `-bg-color` ones all but vanish.
 *
 * @public
 */
export interface ThemeColor {
  cssVar: string
  fallback: string
}

export function cssColor(color: ThemeColor): string {
  return `var(${color.cssVar}, ${color.fallback})`
}

/**
 * A Sanity UI tone that both `Card` and `Badge` accept.
 *
 * @public
 */
export type Tone =
  | 'default'
  | 'neutral'
  | 'primary'
  | 'suggest'
  | 'positive'
  | 'caution'
  | 'critical'
