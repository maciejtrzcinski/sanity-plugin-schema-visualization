import {describe, expect, it, vi} from 'vitest'

import {defaultTranslate} from './i18n'
import {
  collectNodeBadges,
  defaultNodeBadges,
  docCountBadge,
  fieldSummaryBadge,
  initialValueTypeBadge,
  type NodeBadgeContext,
  type NodeBadgeDef,
} from './nodeBadges'
import type {GraphNode} from './types'

function node(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'post',
    name: 'post',
    title: 'Blog post',
    kind: 'document',
    baseType: 'document',
    fields: [],
    isLeaf: false,
    isSystem: false,
    ...overrides,
  }
}

function ctx(overrides: Partial<NodeBadgeContext> = {}): NodeBadgeContext {
  return {
    annotations: {},
    connectionCount: 0,
    issueCount: 0,
    warningCount: 0,
    infoCount: 0,
    expanded: true,
    surface: 'card',
    t: defaultTranslate,
    ...overrides,
  }
}

function fields(count: number): GraphNode['fields'] {
  return Array.from({length: count}, (_, i) => ({
    name: `field${i}`,
    typeLabel: 'string',
    options: [],
    referencesTo: [],
    reusesTypes: [],
    required: false,
    hidden: false,
  }))
}

const labels = (badges: {label: string}[]) => badges.map((b) => b.label)

describe('defaultNodeBadges', () => {
  it('badges nothing on a plain expanded type', () => {
    expect(collectNodeBadges(node(), ctx())).toEqual([])
  })

  it('badges system and deprecated types in registry order', () => {
    const badges = collectNodeBadges(node({isSystem: true, deprecated: 'use `article`'}), ctx())
    expect(labels(badges)).toEqual(['system', 'deprecated'])
    // The card has no room for the reason, so it hangs off a tooltip.
    expect(badges[1].tooltip).toBe('use `article`')
  })

  it('spells the deprecation reason out on the panel, which has the room', () => {
    const badges = collectNodeBadges(node({deprecated: 'use `article`'}), ctx({surface: 'panel'}))
    expect(labels(badges)).toEqual(['deprecated: use `article`'])
  })

  it('carries the id of the def that produced each badge', () => {
    expect(collectNodeBadges(node({isSystem: true}), ctx())[0].id).toBe('system')
  })
})

describe('docCountBadge', () => {
  it('says nothing until a count has been loaded — absent is not zero', () => {
    expect(docCountBadge.badge(node(), ctx())).toBeUndefined()
  })

  it('pluralises, and flags a type nobody has created a document of', () => {
    expect(docCountBadge.badge(node(), ctx({annotations: {docCount: 1}}))).toMatchObject({
      label: '1 doc',
      tone: 'default',
    })
    expect(docCountBadge.badge(node(), ctx({annotations: {docCount: 0}}))).toMatchObject({
      label: '0 docs',
      tone: 'caution',
    })
  })

  it('spells the count out on the panel', () => {
    expect(
      docCountBadge.badge(node(), ctx({annotations: {docCount: 4}, surface: 'panel'})),
    ).toMatchObject({label: '4 documents'})
  })

  it('splits the count into published and drafts when it has both', () => {
    const annotations = {docCount: 4, publishedCount: 3, draftCount: 2}

    expect(docCountBadge.badge(node(), ctx({annotations, surface: 'panel'}))).toMatchObject({
      label: '4 documents — 3 published · 2 drafts',
    })
    expect(docCountBadge.badge(node(), ctx({annotations}))?.tooltip).toMatch(
      /^3 published · 2 drafts\. /,
    )
  })

  // `NodeAnnotations` names no keys, so `docCount` is `unknown` to every
  // reader — a stale cache or another annotation source can put anything
  // under it, and the badge has to stay away rather than render "NaN docs".
  it('ignores a docCount that is not a number', () => {
    expect(docCountBadge.badge(node(), ctx({annotations: {docCount: '7'}}))).toBeUndefined()
    expect(docCountBadge.badge(node(), ctx({annotations: {docCount: null}}))).toBeUndefined()
  })
})

describe('initialValueTypeBadge', () => {
  it('shows a document-level initial value on the panel only', () => {
    const withInitial = node({initialValue: 'function'})

    expect(initialValueTypeBadge.badge(withInitial, ctx({surface: 'panel'}))).toMatchObject({
      label: 'initial value: computed',
    })
    expect(initialValueTypeBadge.badge(withInitial, ctx())).toBeUndefined()
    expect(initialValueTypeBadge.badge(node(), ctx({surface: 'panel'}))).toBeUndefined()
  })
})

describe('fieldSummaryBadge', () => {
  it('summarises a collapsed card, as muted text rather than a chip', () => {
    const badge = fieldSummaryBadge.badge(
      node({fields: fields(3)}),
      ctx({expanded: false, connectionCount: 2}),
    )
    expect(badge).toEqual({label: '3 fields · 2 connections', variant: 'text'})
  })

  it('leaves the connections off when there are none', () => {
    expect(
      fieldSummaryBadge.badge(node({fields: fields(1)}), ctx({expanded: false})),
    ).toMatchObject({label: '1 field'})
  })

  it('says nothing for an expanded card, or one with no fields to summarise', () => {
    expect(fieldSummaryBadge.badge(node({fields: fields(3)}), ctx())).toBeUndefined()
    expect(fieldSummaryBadge.badge(node(), ctx({expanded: false}))).toBeUndefined()
  })
})

describe('collectNodeBadges', () => {
  it('runs every def in order and skips the ones that do not apply', () => {
    const badges: NodeBadgeDef[] = [
      {id: 'a', badge: () => ({label: 'a'})},
      {id: 'skipped', badge: () => undefined},
      {id: 'b', badge: () => ({label: 'b'})},
    ]
    expect(labels(collectNodeBadges(node(), ctx(), badges))).toEqual(['a', 'b'])
  })

  it('skips a throwing badge instead of taking the canvas down, and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const badges: NodeBadgeDef[] = [
      {
        id: 'boom',
        badge: () => {
          throw new Error('nope')
        },
      },
      {id: 'fine', badge: () => ({label: 'fine'})},
    ]

    expect(labels(collectNodeBadges(node(), ctx(), badges))).toEqual(['fine'])
    expect(labels(collectNodeBadges(node({id: 'author'}), ctx(), badges))).toEqual(['fine'])
    expect(warn).toHaveBeenCalledOnce()

    warn.mockRestore()
  })

  it('lets a caller drop or replace exactly one built-in by id', () => {
    const without = defaultNodeBadges.filter((badge) => badge.id !== 'doc-count')
    const annotations = {docCount: 9}
    expect(labels(collectNodeBadges(node(), ctx({annotations}), without))).toEqual([])
    expect(labels(collectNodeBadges(node(), ctx({annotations})))).toEqual(['9 docs'])
  })
})
