/**
 * The plumbing every registry shares — node kinds, edge kinds, field badges,
 * field describers, filters and health rules are all arrays of `{id, …}`
 * objects needing an id index, a fallback entry, a duplicate-id check, the
 * ordering helpers consumers extend them with, and a themed colour.
 */

/**
 * What the ordering helpers key on: every registry entry carries an `id`.
 *
 * @public
 */
export interface Identified {
  id: string
}

/**
 * The minimum every registry entry carries. `isCatchAll` marks the entry that
 * stands in when nothing else matches; registries without a fallback (field
 * badges, health rules — every entry runs) simply never set it.
 */
export interface Registered extends Identified {
  isCatchAll?: boolean
}

/**
 * Indexes a registry by id, for the `Record`-style lookups the UI does.
 * On a duplicate id the last entry wins, which is what `duplicateIds` warns
 * about.
 */
export function indexById<T extends Registered>(defs: readonly T[]): Map<T['id'], T> {
  return new Map(defs.map((def) => [def.id, def] as const))
}

/**
 * Where an unrecognised id resolves: the registry's `isCatchAll` entry, its
 * last entry (where a catch-all belongs) if none is flagged, or `fallback`
 * when the registry is empty. An id can outlive its entry — a stale URL, a
 * cached preference, a config change — and the catch-all beats a crash.
 */
export function catchAllOf<T extends Registered>(defs: readonly T[], fallback: T): T {
  return defs.find((def) => def.isCatchAll) ?? defs[defs.length - 1] ?? fallback
}

/** The ids appearing more than once in a registry, each reported once. */
export function duplicateIds(defs: readonly Identified[]): string[] {
  return duplicates(defs.map((def) => def.id))
}

/**
 * A copy of `defs` with `entries` placed just ahead of the entry with id
 * `anchorId`, in the order given. This is how a first-match registry is
 * extended without knowing its layout: to pre-empt `namedTypeDescriber`,
 * name it instead of counting where it sits in `defaultFieldDescribers`.
 *
 * Throws when no entry carries `anchorId`. Silently appending would put the
 * new entry behind the registry's catch-all, where it can never match — the
 * exact mistake the anchor is there to prevent — and a wrong id is a typo in
 * the consumer's own config, best caught the first time the Studio boots.
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
 * A copy of `defs` with the entry sharing `replacement`'s id swapped for
 * `replacement`, in the same position. For changing one thing about a
 * built-in — a health rule's severity, a badge's tone — without restating
 * the order of everything around it.
 *
 * Throws when no entry carries that id, for the same reason as
 * {@link insertBefore}: a replacement that matches nothing is a typo.
 *
 * @public
 */
export function replaceById<T extends Identified>(defs: readonly T[], replacement: T): T[] {
  const at = indexOfId(defs, replacement.id, 'replaceById')
  return defs.map((def, i) => (i === at ? replacement : def))
}

/**
 * A copy of `defs` without the entries carrying any of `ids`.
 *
 * Throws when an id matches nothing. Dropping a badge that isn't there is
 * harmless in itself, but the id was written to remove something, and a
 * silent no-op leaves the consumer believing it did.
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

/** The values appearing more than once, each reported once. */
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
 * A colour for canvas chrome that can't take a Sanity UI tone — minimap blips,
 * cluster tints, legend swatches, edge strokes. A CSS custom property so it
 * follows the Studio theme, with a literal fallback for the canvas export,
 * which rasterizes outside the Studio's CSS scope.
 *
 * Use a saturated variable such as `--card-badge-primary-dot-color`. The
 * `-bg-color` variables are the pale fill behind a badge, close enough to the
 * canvas background that lines and labels drawn in them all but disappear.
 *
 * @public
 */
export interface ThemeColor {
  cssVar: string
  fallback: string
}

/** `var(--x, fallback)`, so canvas chrome tracks the Studio theme. */
export function cssColor(color: ThemeColor): string {
  return `var(${color.cssVar}, ${color.fallback})`
}

/**
 * A Sanity UI tone, as accepted by `Card` and `Badge` — the full set both
 * share, so one tone can style either. (`Card` also takes `transparent`, which
 * nothing here has a use for.)
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
