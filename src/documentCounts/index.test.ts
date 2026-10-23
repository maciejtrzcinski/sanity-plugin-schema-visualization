import {describe, expect, it} from 'vitest'

import {
  buildDocumentCountsQuery,
  buildDocumentStatusQuery,
  formatRelativeTime,
  parseDocumentCountsResponse,
  parseDocumentStatusResponse,
  perspectiveKey,
  readStoredDocumentCounts,
} from './index'

describe('buildDocumentCountsQuery', () => {
  it('builds one count() field per type', () => {
    expect(buildDocumentCountsQuery(['post', 'author'])).toBe(
      '{"post": count(*[_type == "post"]), "author": count(*[_type == "author"])}',
    )
  })

  it('returns an empty object query for no types', () => {
    expect(buildDocumentCountsQuery([])).toBe('{}')
  })

  it('safely quotes type names containing special characters', () => {
    const query = buildDocumentCountsQuery(['weird"type'])
    expect(query).toBe('{"weird\\"type": count(*[_type == "weird\\"type"])}')
  })
})

describe('buildDocumentStatusQuery', () => {
  it('counts published documents and drafts per type, leaving release versions out', () => {
    expect(buildDocumentStatusQuery(['post'])).toBe(
      '{"post": {"published": count(*[_type == "post" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]), ' +
        '"drafts": count(*[_type == "post" && _id in path("drafts.**")])}}',
    )
  })
})

describe('parseDocumentStatusResponse', () => {
  it('keeps types with both numbers and drops the rest', () => {
    const breakdown = parseDocumentStatusResponse({
      post: {published: 3, drafts: 1},
      author: {published: 2},
      page: 'nope',
    })

    expect([...breakdown]).toEqual([['post', {published: 3, drafts: 1}]])
    expect(parseDocumentStatusResponse(null).size).toBe(0)
  })
})

describe('perspectiveKey', () => {
  it('names a perspective stack by its members, in order', () => {
    expect(perspectiveKey(['drafts'])).toBe('drafts')
    expect(perspectiveKey(['rSpring', 'drafts'])).toBe('rSpring,drafts')
  })
})

describe('parseDocumentCountsResponse', () => {
  it('extracts numeric fields into a map', () => {
    const counts = parseDocumentCountsResponse({post: 47, author: 3})
    expect(counts.get('post')).toBe(47)
    expect(counts.get('author')).toBe(3)
    expect(counts.size).toBe(2)
  })

  it('ignores non-numeric fields and returns an empty map for invalid input', () => {
    expect(parseDocumentCountsResponse({post: 'oops'}).size).toBe(0)
    expect(parseDocumentCountsResponse(null).size).toBe(0)
    expect(parseDocumentCountsResponse(undefined).size).toBe(0)
    expect(parseDocumentCountsResponse('nope').size).toBe(0)
  })
})

describe('formatRelativeTime', () => {
  const now = 1700000000000

  it('formats seconds, minutes, hours, and days', () => {
    expect(formatRelativeTime(now - 10_000, now)).toBe('just now')
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5m ago')
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3h ago')
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe('2d ago')
  })

  it('never goes negative for a clock skewed slightly into the future', () => {
    expect(formatRelativeTime(now + 5_000, now)).toBe('just now')
  })
})

describe('readStoredDocumentCounts', () => {
  it('round-trips what the feature wrote', () => {
    const written = {
      counts: {post: 47, author: 3},
      breakdown: {post: {published: 40, drafts: 9}},
      perspective: 'rSpring,drafts',
      fetchedAt: 1700000000000,
    }

    expect(readStoredDocumentCounts(written)).toEqual(written)
  })

  // Every cache written before counts followed the perspective was counted
  // under `drafts`, so that is what it still describes.
  it('reads a cache with no perspective as a drafts count', () => {
    expect(readStoredDocumentCounts({counts: {post: 1}, fetchedAt: 1})).toEqual({
      counts: {post: 1},
      perspective: 'drafts',
      fetchedAt: 1,
    })
  })

  // Without a `fetchedAt` there is nothing to say how stale the counts are, and
  // the toolbar tooltip is built entirely out of that — so the slice is dropped
  // rather than shown with an invented timestamp.
  it('rejects an entry with no usable fetchedAt', () => {
    expect(readStoredDocumentCounts({counts: {post: 1}})).toBeUndefined()
    expect(readStoredDocumentCounts({counts: {post: 1}, fetchedAt: 'yesterday'})).toBeUndefined()
  })

  it('returns undefined for anything that is not the shape it wrote', () => {
    expect(readStoredDocumentCounts(undefined)).toBeUndefined()
    expect(readStoredDocumentCounts(null)).toBeUndefined()
    expect(readStoredDocumentCounts('nope')).toBeUndefined()
    expect(readStoredDocumentCounts(42)).toBeUndefined()
  })

  // A corrupted `counts` costs only the bad keys: the same per-key check the
  // fetch path uses drops them and keeps the rest.
  it('drops non-numeric counts but keeps the entry', () => {
    expect(readStoredDocumentCounts({counts: {post: 47, author: 'three'}, fetchedAt: 1})).toEqual({
      counts: {post: 47},
      perspective: 'drafts',
      fetchedAt: 1,
    })
    expect(readStoredDocumentCounts({fetchedAt: 1})).toEqual({
      counts: {},
      perspective: 'drafts',
      fetchedAt: 1,
    })
  })
})
