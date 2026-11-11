import {useToast} from '@sanity/ui/toast'
import {useCallback, useMemo, useState} from 'react'
import {useClient, usePerspective} from 'sanity'

import {useTranslate} from '../hooks/useTranslate'
import {
  buildDocumentCountsQuery,
  buildDocumentStatusQuery,
  INITIAL_DOCUMENT_COUNTS_STATE,
  parseDocumentCountsResponse,
  parseDocumentStatusResponse,
  perspectiveKey,
  type DocumentCountsState,
  type StoredDocumentCounts,
} from './index'

/** The Studio's own default, and the first to take a perspective stack with release ids. */
const API_VERSION = '2025-02-19'

export interface DocumentCounts {
  /** The counts for the Studio's current perspective — idle while none are loaded for it. */
  state: DocumentCountsState
  /** Fires the count queries. Called only from the toolbar button, never from an effect. */
  load: () => Promise<void>
}

function fromCache(cached: StoredDocumentCounts): DocumentCountsState {
  return {
    status: 'loaded',
    counts: new Map(Object.entries(cached.counts)),
    breakdown: new Map(Object.entries(cached.breakdown ?? {})),
    perspective: cached.perspective,
    fetchedAt: cached.fetchedAt,
  }
}

/**
 * Never fetches on its own. Perspectives go through `withConfig`, not
 * `useClient`: the Studio caches clients by `apiVersion` alone.
 */
export function useDocumentCounts({
  enabled,
  typeNames,
  cached,
}: {
  enabled: boolean
  typeNames: string[]
  cached?: StoredDocumentCounts
}): DocumentCounts {
  const {perspectiveStack} = usePerspective()
  const perspective = perspectiveKey(perspectiveStack)
  const baseClient = useClient({apiVersion: API_VERSION})
  const clients = useMemo(
    () => ({
      current: baseClient.withConfig({perspective: perspectiveStack}),
      raw: baseClient.withConfig({perspective: 'raw'}),
    }),
    [baseClient, perspectiveStack],
  )
  const toast = useToast()
  const t = useTranslate()

  const [loaded, setLoaded] = useState<DocumentCountsState>(() =>
    enabled && cached ? fromCache(cached) : INITIAL_DOCUMENT_COUNTS_STATE,
  )

  const load = useCallback(async () => {
    if (typeNames.length === 0) return
    const requested = perspective
    setLoaded((prev) =>
      prev.perspective === requested
        ? {...prev, status: 'loading'}
        : {...INITIAL_DOCUMENT_COUNTS_STATE, status: 'loading', perspective: requested},
    )
    try {
      const [counts, breakdown] = await Promise.all([
        clients.current.fetch(buildDocumentCountsQuery(typeNames)),
        clients.raw.fetch(buildDocumentStatusQuery(typeNames)),
      ])
      setLoaded({
        status: 'loaded',
        counts: parseDocumentCountsResponse(counts),
        breakdown: parseDocumentStatusResponse(breakdown),
        perspective: requested,
        fetchedAt: Date.now(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : t('document-counts.error-unknown')
      // Keep the counts already on screen: a failed refresh shouldn't blank them.
      setLoaded((prev) => ({...prev, status: 'error', error: message}))
      toast.push({status: 'error', title: t('document-counts.error-title'), description: message})
    }
  }, [clients, perspective, typeNames, toast, t])

  const state = useMemo(
    () =>
      loaded.perspective === undefined || loaded.perspective === perspective
        ? loaded
        : INITIAL_DOCUMENT_COUNTS_STATE,
    [loaded, perspective],
  )

  return {state, load}
}
