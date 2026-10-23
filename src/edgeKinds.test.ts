import {describe, expect, it} from 'vitest'

import {
  catchAllEdgeKind,
  defaultEdgeKinds,
  edgeBadgeLabel,
  externalReferenceKind,
  referenceKind,
  reusesKind,
  type EdgeKindDef,
} from './edgeKinds'
import {defaultTranslate} from './i18n'
import type {GraphEdge} from './types'

function edge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id: 'post::author::reference::author',
    source: 'post',
    target: 'author',
    kind: 'reference',
    fieldName: 'author',
    ...overrides,
  }
}

describe('catchAllEdgeKind', () => {
  it('finds the kind flagged `isCatchAll`', () => {
    expect(catchAllEdgeKind(defaultEdgeKinds)).toBe(reusesKind)
    expect(catchAllEdgeKind([reusesKind, referenceKind])).toBe(reusesKind)
  })

  it('falls back to the last kind when nothing is flagged', () => {
    const unflagged: EdgeKindDef = {...reusesKind, isCatchAll: false}
    expect(catchAllEdgeKind([referenceKind, unflagged])).toBe(unflagged)
  })

  // `resolveConfig` warns about this rather than rejecting it, so every
  // `?? catchAllEdge` site still has to have something to draw with.
  it('falls back to the built-in catch-all for an empty registry', () => {
    expect(catchAllEdgeKind([])).toBe(reusesKind)
  })
})

describe('edgeBadgeLabel', () => {
  it('calls out a weak reference through the kind’s own `badgeLabel`', () => {
    expect(edgeBadgeLabel(edge({weak: true}), referenceKind, defaultTranslate)).toBe('weak ref')
    expect(edgeBadgeLabel(edge({weak: false}), referenceKind, defaultTranslate)).toBe('reference')
  })

  it('names a cross-dataset or global document reference as external', () => {
    const external = edge({kind: 'external-reference'})
    expect(edgeBadgeLabel(external, externalReferenceKind, defaultTranslate)).toBe('external ref')
    expect(edgeBadgeLabel({...external, weak: true}, externalReferenceKind, defaultTranslate)).toBe(
      'weak external ref',
    )
  })

  it('falls back to the edge’s kind id when the def has no `badgeLabel`', () => {
    expect(edgeBadgeLabel(edge({kind: 'reuses'}), reusesKind, defaultTranslate)).toBe('reuses')
    // An edge drawn as the catch-all still says what it actually is.
    expect(edgeBadgeLabel(edge({kind: 'cross-dataset'}), reusesKind, defaultTranslate)).toBe(
      'cross-dataset',
    )
  })
})
