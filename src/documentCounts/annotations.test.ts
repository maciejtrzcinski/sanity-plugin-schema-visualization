import {describe, expect, it} from 'vitest'

import type {GraphNode} from '../types'
import {documentCountAnnotations} from './annotations'

function node(id: string, kind: string): GraphNode {
  return {
    id,
    name: id,
    title: id,
    kind,
    baseType: kind,
    fields: [],
    isLeaf: false,
    isSystem: false,
  }
}

const documentKinds = new Set(['document'])

describe('documentCountAnnotations', () => {
  it('annotates only the kinds that count documents', () => {
    const annotations = documentCountAnnotations(
      [node('post', 'document'), node('seo', 'object')],
      documentKinds,
      new Map([
        ['post', 7],
        ['seo', 3],
      ]),
    )

    expect(annotations.get('post')).toEqual({docCount: 7})
    expect(annotations.has('seo')).toBe(false)
  })

  it('leaves a node out entirely when the counts do not cover it', () => {
    const annotations = documentCountAnnotations(
      [node('post', 'document'), node('author', 'document')],
      documentKinds,
      new Map([['post', 0]]),
    )

    // Zero is a real count and gets annotated; `author` is simply unknown.
    expect(annotations.get('post')).toEqual({docCount: 0})
    expect(annotations.has('author')).toBe(false)
  })

  it('carries the published/draft split alongside the count', () => {
    const annotations = documentCountAnnotations(
      [node('post', 'document')],
      documentKinds,
      new Map([['post', 4]]),
      new Map([['post', {published: 3, drafts: 2}]]),
    )

    expect(annotations.get('post')).toEqual({docCount: 4, publishedCount: 3, draftCount: 2})
  })

  it('is empty before anyone has loaded counts', () => {
    expect(
      documentCountAnnotations([node('post', 'document')], documentKinds, new Map()).size,
    ).toBe(0)
  })
})
