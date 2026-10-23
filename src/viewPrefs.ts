import type {StoredDocumentCounts} from './documentCounts'
import {sanitizeFilterValues, type FilterDef, type FilterValues} from './filters'

/**
 * Bumped to 2 when filters moved from a fixed struct to the filter registry,
 * and to 3 when the flat record split into {@link SessionPrefs} and
 * {@link FeatureCache}. An entry from an older version describes a shape that
 * no longer exists, and is dropped rather than migrated: `prefs` are three
 * toggles a user resets in seconds, and `cache` is one button press away from
 * being refetched. Neither is user data, and a migration per version is a
 * standing cost to save someone a click.
 */
const STORAGE_VERSION = 3

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** What identifies "the same Studio view" for persistence purposes. */
export interface ViewPrefsScope {
  projectId: string
  dataset: string
  /** The workspace's explicitly configured API host (custom CNAMEs, non-default environments) — undefined on the default env. */
  apiHost?: string
  workspaceName: string
  /** URL base path the workspace is mounted at, e.g. `/staging` — distinguishes multiple workspaces that otherwise share everything else. */
  basePath: string
  /** This tool instance's configured name (`schemaVisualization({name: ...})`), in case it's registered more than once. */
  toolName: string
}

/**
 * The half of {@link ViewPrefs} that is a preference: chosen deliberately,
 * changed rarely, and worth writing on every change.
 */
export interface SessionPrefs {
  compactMode: boolean
  direction: 'LR' | 'TB'
  filters: FilterValues
}

/**
 * The half that is a cache: what an optional feature fetched, kept only so a
 * new session doesn't start blank. Written on a different schedule from
 * {@link SessionPrefs} — a feature in a loading or error state has nothing
 * worth persisting, so `usePersistedViewPrefs` holds the last good value
 * rather than writing the transition.
 *
 * One key per feature, and the feature owns its key end to end: the shape
 * ({@link StoredDocumentCounts}), the validator that reads it back
 * (`readStoredDocumentCounts`), and the code that fills it. This module
 * stores the result and never looks inside — see the `readCache` argument to
 * {@link loadViewPrefs}, which is how a feature's validator gets here without
 * the storage layer importing the feature.
 */
export interface FeatureCache {
  documentCounts?: StoredDocumentCounts
}

/**
 * Split by lifecycle rather than by feature. The two halves are persisted
 * together but written on different triggers, and every consumer wants one or
 * the other — never the union — so a flat record meant spelling
 * `Omit<ViewPrefs, 'documentCounts'>` at each of the four places that handle
 * preferences without the cache.
 */
export interface ViewPrefs {
  prefs: SessionPrefs
  cache: FeatureCache
}

/**
 * Scopes the localStorage key to one project + dataset + environment + tool
 * instance. This matters most in local dev, where many unrelated Sanity
 * projects' Studios are all served from the same `localhost:3333` origin —
 * without this, plain `localStorage` would silently share (and clobber) one
 * project's view prefs with another's.
 */
export function buildViewPrefsStorageKey(scope: ViewPrefsScope): string {
  const parts = [
    scope.projectId,
    scope.dataset,
    scope.apiHost ?? '',
    scope.workspaceName,
    scope.basePath,
    scope.toolName,
  ]
  return `sanity-plugin-schema-visualization:v${STORAGE_VERSION}:${parts.join(':')}`
}

interface SerializedViewPrefs {
  version: number
  prefs: {
    compactMode: boolean
    direction: 'LR' | 'TB'
    /** Filter id -> selected values, validated against the live filter defs on read. */
    filters: Record<string, string[]>
  }
  cache: {
    documentCounts?: StoredDocumentCounts
  }
}

/** Keeps only `string[]` entries — anything else is a corrupted or hand-edited value. */
function readStoredFilters(raw: unknown): Record<string, string[]> {
  if (!isRecord(raw)) return {}
  const result: Record<string, string[]> = {}
  for (const [id, value] of Object.entries(raw)) {
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) result[id] = value
  }
  return result
}

/**
 * Reads back what {@link saveViewPrefs} wrote. Returns `null` on anything
 * unexpected — missing key, a different `STORAGE_VERSION`, corrupted JSON,
 * storage access denied — so the caller can fall back to hardcoded defaults
 * without special-casing each failure mode. Deliberately avoids casting the
 * parsed JSON to `SerializedViewPrefs` wholesale (that type only documents
 * what `saveViewPrefs` writes) — every field is checked individually instead,
 * so a corrupted or hand-edited single field degrades to its default rather
 * than discarding the whole entry. The two nested records get the same
 * treatment as the root: a missing or non-object `prefs`/`cache` reads as
 * empty rather than sinking the entry.
 *
 * `readCache` turns the stored cache record into a {@link FeatureCache}. It is
 * an argument rather than something this module does because validating a
 * feature's slice means knowing that feature's shape, and a storage layer that
 * imported one would have to import every future one. What arrives here is
 * whatever it returns.
 */
export function loadViewPrefs(
  storage: Storage,
  key: string,
  defs: readonly FilterDef[],
  readCache: (raw: Record<string, unknown>) => FeatureCache,
): ViewPrefs | null {
  try {
    const raw = storage.getItem(key)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION) return null

    const rawPrefs = isRecord(parsed.prefs) ? parsed.prefs : {}
    const rawCache = isRecord(parsed.cache) ? parsed.cache : {}

    return {
      prefs: {
        compactMode: rawPrefs.compactMode === true,
        direction: rawPrefs.direction === 'TB' ? 'TB' : 'LR',
        filters: sanitizeFilterValues(readStoredFilters(rawPrefs.filters), defs),
      },
      cache: readCache(rawCache),
    }
  } catch {
    return null
  }
}

/**
 * Best-effort write — `localStorage` can throw (Safari private mode, quota
 * exceeded, storage disabled entirely), and persisting view prefs is a
 * nice-to-have never worth crashing the tool over.
 */
export function saveViewPrefs(storage: Storage, key: string, viewPrefs: ViewPrefs): void {
  try {
    const {prefs, cache} = viewPrefs
    const serialized: SerializedViewPrefs = {
      version: STORAGE_VERSION,
      prefs: {
        compactMode: prefs.compactMode,
        direction: prefs.direction,
        filters: Object.fromEntries(
          Object.entries(prefs.filters).map(([id, values]) => [id, [...values]]),
        ),
      },
      cache: {documentCounts: cache.documentCounts},
    }
    storage.setItem(key, JSON.stringify(serialized))
  } catch {
    // Ignored — see doc comment above.
  }
}
