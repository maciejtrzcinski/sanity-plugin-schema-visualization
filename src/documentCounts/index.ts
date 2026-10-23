import {defaultTranslate, type TranslateFn} from '../i18n'

export type DocumentCountsStatus = 'idle' | 'loading' | 'loaded' | 'error'

/** How many of a type's documents are published, and how many have a draft. */
export interface DocumentStatusCounts {
  published: number
  drafts: number
}

export interface DocumentCountsState {
  status: DocumentCountsStatus
  /** Document type name -> count in {@link perspective}. Empty until the first successful load. */
  counts: Map<string, number>
  /** Document type name -> published and draft counts, independent of the perspective. */
  breakdown: Map<string, DocumentStatusCounts>
  /** The perspective the counts were loaded under — see `perspectiveKey`. */
  perspective?: string
  /** When `counts` was last successfully populated — either just fetched, or restored from a previous session's cache. */
  fetchedAt?: number
  error?: string
}

export const INITIAL_DOCUMENT_COUNTS_STATE: DocumentCountsState = {
  status: 'idle',
  counts: new Map(),
  breakdown: new Map(),
}

/**
 * One string per perspective stack (`drafts`, `published`, `rSpring,drafts`),
 * so counts loaded under one are never shown under another.
 */
export function perspectiveKey(stack: readonly string[]): string {
  return stack.join(',')
}

/** What every cache written before counts followed the perspective was loaded under. */
const LEGACY_PERSPECTIVE = 'drafts'

/**
 * One GROQ query counting every given document type, e.g.
 * `{"post": count(*[_type == "post"])}`. `count()` is resolved from the index
 * rather than by fetching documents, so it stays cheap on large datasets.
 *
 * It runs in the Studio's current perspective (see `useDocumentCounts`), so
 * the API resolves a document's draft, release versions and published copy to
 * one document before `count()` sees them.
 */
export function buildDocumentCountsQuery(typeNames: string[]): string {
  const fields = typeNames.map((name) => {
    const literal = JSON.stringify(name)
    return `${literal}: count(*[_type == ${literal}])`
  })
  return `{${fields.join(', ')}}`
}

/**
 * The published/draft split, which only the `raw` perspective can see:
 * `{"post": {"published": count(…), "drafts": count(…)}}`.
 */
export function buildDocumentStatusQuery(typeNames: string[]): string {
  const fields = typeNames.map((name) => {
    const literal = JSON.stringify(name)
    const published = `count(*[_type == ${literal} && !(_id in path("drafts.**")) && !(_id in path("versions.**"))])`
    const drafts = `count(*[_type == ${literal} && _id in path("drafts.**")])`
    return `${literal}: {"published": ${published}, "drafts": ${drafts}}`
  })
  return `{${fields.join(', ')}}`
}

/** Parses the object `client.fetch(buildDocumentStatusQuery(...))` resolves to. */
export function parseDocumentStatusResponse(response: unknown): Map<string, DocumentStatusCounts> {
  const breakdown = new Map<string, DocumentStatusCounts>()
  if (!response || typeof response !== 'object') return breakdown
  for (const [typeName, value] of Object.entries(response)) {
    if (typeof value !== 'object' || value === null) continue
    const published: unknown = 'published' in value ? value.published : undefined
    const drafts: unknown = 'drafts' in value ? value.drafts : undefined
    if (typeof published === 'number' && typeof drafts === 'number') {
      breakdown.set(typeName, {published, drafts})
    }
  }
  return breakdown
}

/** Parses the object `client.fetch(buildDocumentCountsQuery(...))` resolves to. */
export function parseDocumentCountsResponse(response: unknown): Map<string, number> {
  const counts = new Map<string, number>()
  if (!response || typeof response !== 'object') return counts
  for (const [typeName, value] of Object.entries(response)) {
    if (typeof value === 'number') counts.set(typeName, value)
  }
  return counts
}

/**
 * This feature's slice of the persisted view preferences: the last successful
 * result, kept so a new session shows counts before anyone presses the button
 * again. Declared here rather than beside the storage layer because the shape
 * is the feature's — `viewPrefs.ts` writes it and never looks inside.
 */
export interface StoredDocumentCounts {
  counts: Record<string, number>
  breakdown?: Record<string, DocumentStatusCounts>
  perspective: string
  fetchedAt: number
}

/**
 * Validates one of these back off disk. Anything that isn't the shape this
 * feature wrote reads as `undefined`, which costs the cache rather than the
 * whole preferences entry — one button press restores it either way.
 *
 * Reuses the network parser deliberately: a stored `counts` *is* a parsed
 * response, so the same per-key "is it a number?" check is the right one, and
 * a second copy of it here could drift from what the fetch path accepts.
 */
export function readStoredDocumentCounts(raw: unknown): StoredDocumentCounts | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  if (!('fetchedAt' in raw) || typeof raw.fetchedAt !== 'number') return undefined
  const counts = 'counts' in raw ? raw.counts : undefined
  const breakdown = 'breakdown' in raw ? parseDocumentStatusResponse(raw.breakdown) : undefined
  const perspective =
    'perspective' in raw && typeof raw.perspective === 'string'
      ? raw.perspective
      : LEGACY_PERSPECTIVE
  return {
    counts: Object.fromEntries(parseDocumentCountsResponse(counts)),
    ...(breakdown && breakdown.size > 0 ? {breakdown: Object.fromEntries(breakdown)} : {}),
    perspective,
    fetchedAt: raw.fetchedAt,
  }
}

/** Short "3m ago" / "2h ago" label for how stale a cached count is. */
export function formatRelativeTime(
  fromMs: number,
  nowMs: number = Date.now(),
  t: TranslateFn = defaultTranslate,
): string {
  const diffSeconds = Math.max(0, Math.round((nowMs - fromMs) / 1000))
  if (diffSeconds < 60) return t('relative-time.just-now')
  const diffMinutes = Math.round(diffSeconds / 60)
  if (diffMinutes < 60) return t('relative-time.minutes', {count: diffMinutes})
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return t('relative-time.hours', {count: diffHours})
  const diffDays = Math.round(diffHours / 24)
  return t('relative-time.days', {count: diffDays})
}
