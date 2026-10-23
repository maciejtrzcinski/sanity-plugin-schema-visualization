// @vitest-environment jsdom
import {act, renderHook, waitFor} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useDocumentCounts} from './useDocumentCounts'

/** One fetch per perspective, so a test can answer the two queries separately. */
const fetchIn = {current: vi.fn(), raw: vi.fn()}
const withConfig = vi.fn(({perspective}: {perspective: unknown}) => ({
  fetch: perspective === 'raw' ? fetchIn.raw : fetchIn.current,
}))
/** The Studio caches one client per apiVersion, so this identity is stable. */
const studioClient = {fetch: vi.fn(), withConfig}
const useClient = vi.fn((_options: {apiVersion: string}) => studioClient)

/** Stable per perspective, as the Studio's own context value is. */
const DRAFTS = {perspectiveStack: ['drafts']}
const RELEASE = {perspectiveStack: ['rSpring', 'drafts']}
const perspective = {current: DRAFTS}

const typeNames = ['post']

// No Studio locale in these tests: i18next's own fallback is the English
// template `useTranslate` hands it as `defaultValue`. Stable, as i18next's `t`
// is per locale — `load` depends on it.
const translation = {t: (_key: string, options: {defaultValue: string}) => options.defaultValue}

vi.mock('sanity', () => ({
  useClient: (options: {apiVersion: string}) => useClient(options),
  usePerspective: () => perspective.current,
  useTranslation: () => translation,
}))
const toast = {push: vi.fn()}
vi.mock('@sanity/ui/toast', () => ({useToast: () => toast}))

beforeEach(() => {
  vi.clearAllMocks()
  perspective.current = DRAFTS
  fetchIn.current.mockResolvedValue({post: 2})
  fetchIn.raw.mockResolvedValue({post: {published: 1, drafts: 2}})
})

describe('useDocumentCounts', () => {
  it('counts in the Studio’s perspective, and splits published from drafts in raw', async () => {
    const {result} = renderHook(() => useDocumentCounts({enabled: true, typeNames}))

    // `useClient` caches by apiVersion alone, so perspectives have to be
    // layered on the returned client rather than asked for by config.
    expect(useClient).toHaveBeenCalledWith({apiVersion: '2025-02-19'})
    expect(withConfig).toHaveBeenCalledWith({perspective: ['drafts']})
    expect(withConfig).toHaveBeenCalledWith({perspective: 'raw'})

    await act(() => result.current.load())

    await waitFor(() => expect(result.current.state.status).toBe('loaded'))
    expect(fetchIn.current).toHaveBeenCalledOnce()
    expect(fetchIn.raw).toHaveBeenCalledOnce()
    expect(result.current.state.counts.get('post')).toBe(2)
    expect(result.current.state.breakdown.get('post')).toEqual({published: 1, drafts: 2})
    expect(result.current.state.perspective).toBe('drafts')
  })

  it('follows a release perspective, and never shows one perspective’s counts in another', async () => {
    const {result, rerender} = renderHook(() => useDocumentCounts({enabled: true, typeNames}))
    await act(() => result.current.load())
    await waitFor(() => expect(result.current.state.status).toBe('loaded'))

    perspective.current = RELEASE
    rerender()

    expect(withConfig).toHaveBeenCalledWith({perspective: ['rSpring', 'drafts']})
    expect(result.current.state.status).toBe('idle')
    expect(result.current.state.counts.size).toBe(0)

    fetchIn.current.mockResolvedValueOnce({post: 5})
    await act(() => result.current.load())
    await waitFor(() => expect(result.current.state.counts.get('post')).toBe(5))
    expect(result.current.state.perspective).toBe('rSpring,drafts')
  })

  it('restores a cache only into the perspective it was counted in', () => {
    const cached = {counts: {post: 7}, perspective: 'drafts', fetchedAt: 1}

    const drafts = renderHook(() => useDocumentCounts({enabled: true, typeNames, cached}))
    expect(drafts.result.current.state.counts.get('post')).toBe(7)

    perspective.current = RELEASE
    const release = renderHook(() => useDocumentCounts({enabled: true, typeNames, cached}))
    expect(release.result.current.state.status).toBe('idle')
  })

  it('keeps one pair of clients across re-renders, so `load` stays stable', () => {
    const {result, rerender} = renderHook(() => useDocumentCounts({enabled: true, typeNames}))
    const first = result.current.load

    rerender()

    expect(withConfig).toHaveBeenCalledTimes(2)
    expect(result.current.load).toBe(first)
  })

  it('reports a failed load in a localized toast and keeps the counts it had', async () => {
    const {result} = renderHook(() => useDocumentCounts({enabled: true, typeNames}))
    await act(() => result.current.load())
    await waitFor(() => expect(result.current.state.status).toBe('loaded'))

    fetchIn.raw.mockRejectedValueOnce(new Error('Request timed out'))
    await act(() => result.current.load())

    expect(result.current.state.status).toBe('error')
    expect(result.current.state.counts.get('post')).toBe(2)
    expect(toast.push).toHaveBeenCalledExactlyOnceWith({
      status: 'error',
      title: 'Could not load document counts',
      description: 'Request timed out',
    })
  })
})
