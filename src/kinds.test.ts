import {createSchema, defineField, defineType} from 'sanity'
import {describe, expect, it} from 'vitest'

import {
  catchAllKind,
  classifyKind,
  defaultNodeKinds,
  documentKind,
  kindIdsWith,
  objectKind,
  otherKind,
  type NodeKindDef,
} from './kinds'
/** A real compiled type — the stub kinds below ignore it, they just need one. */
const postType = createSchema({
  name: 'test',
  types: [
    defineType({
      name: 'post',
      type: 'document',
      fields: [defineField({name: 'title', type: 'string'})],
    }),
  ],
}).get('post')!

describe('catchAllKind', () => {
  it('finds the kind flagged `isCatchAll`', () => {
    expect(catchAllKind(defaultNodeKinds)).toBe(otherKind)
    expect(catchAllKind([otherKind, documentKind])).toBe(otherKind)
  })

  it('falls back to the last kind when nothing is flagged', () => {
    const unflagged: NodeKindDef = {...otherKind, isCatchAll: false}
    expect(catchAllKind([documentKind, unflagged])).toBe(unflagged)
  })

  // `resolveConfig` doesn't stop a consumer handing over an empty list, and
  // every `?? catchAll` site would then have nothing to render.
  it('falls back to the built-in catch-all for an empty registry', () => {
    expect(catchAllKind([])).toBe(otherKind)
  })
})

describe('kindIdsWith', () => {
  it('collects the ids that opt into a capability', () => {
    expect(kindIdsWith(defaultNodeKinds, 'countsDocuments')).toEqual(new Set(['document']))
    expect(kindIdsWith(defaultNodeKinds, 'reportsOrphans')).toEqual(new Set(['object']))
    expect(kindIdsWith(defaultNodeKinds, 'isReferenceTarget')).toEqual(new Set(['document']))
  })

  it('follows a replaced registry rather than the built-in ids', () => {
    const entry: NodeKindDef = {...documentKind, id: 'entry'}
    const block: NodeKindDef = {...objectKind, id: 'block', countsDocuments: true}
    expect(kindIdsWith([entry, block, otherKind], 'countsDocuments')).toEqual(
      new Set(['entry', 'block']),
    )
  })

  it('is empty when no kind opts in', () => {
    expect(kindIdsWith([{...documentKind, isReferenceTarget: false}], 'isReferenceTarget')).toEqual(
      new Set(),
    )
  })
})

describe('classifyKind', () => {
  it('takes the first kind whose `classify` claims the type', () => {
    const claimsEverything: NodeKindDef = {...objectKind, id: 'first', classify: () => true}
    expect(classifyKind(postType, [claimsEverything, otherKind])).toBe(claimsEverything)
  })

  it('falls back to the catch-all when nothing classifies the type', () => {
    const claimsNothing: NodeKindDef = {...objectKind, classify: () => false}
    const catchAll: NodeKindDef = {...otherKind, classify: () => false, isCatchAll: true}
    expect(classifyKind(postType, [claimsNothing, catchAll])).toBe(catchAll)
  })
})
