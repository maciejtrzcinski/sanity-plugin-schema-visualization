import type {StoredDocumentCounts} from './documentCounts'
import {sanitizeFilterValues, type FilterDef, type FilterValues} from './filters'

/** Older versions are dropped, not migrated: prefs and cache are cheap to recreate. */
const STORAGE_VERSION = 3

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export interface ViewPrefsScope {
  projectId: string
  dataset: string
  apiHost?: string
  workspaceName: string
  basePath: string
  toolName: string
}

export interface SessionPrefs {
  compactMode: boolean
  direction: 'LR' | 'TB'
  filters: FilterValues
}

/** One key per feature. The feature owns its shape and validator; this module never looks. */
export interface FeatureCache {
  documentCounts?: StoredDocumentCounts
}

export interface ViewPrefs {
  prefs: SessionPrefs
  cache: FeatureCache
}

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
    filters: Record<string, string[]>
  }
  cache: {
    documentCounts?: StoredDocumentCounts
  }
}

function readStoredFilters(raw: unknown): Record<string, string[]> {
  if (!isRecord(raw)) return {}
  const result: Record<string, string[]> = {}
  for (const [id, value] of Object.entries(raw)) {
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) result[id] = value
  }
  return result
}

/** `null` on anything unexpected. Fields are checked one by one, so a bad one degrades alone. */
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

/** Best-effort: `localStorage` can throw (private mode, quota, disabled). */
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
    // Ignored.
  }
}
