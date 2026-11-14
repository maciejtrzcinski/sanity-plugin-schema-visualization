import {createSchema, defineField, defineType} from 'sanity'
import {describe, expect, it} from 'vitest'

import {spyOnWarnings, warningAt} from '../test/warnings'
import {
  baseTypeFor,
  catchAllKind,
  classifyKind,
  defaultNodeKinds,
  documentKind,
  kindIdsWith,
  objectKind,
  otherKind,
  type NodeKindDef,
} from './kinds'
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

describe('a kind whose callback throws', () => {
  const nope = () => {
    throw new Error('nope')
  }

  it('is passed over by `classify`, and warns once', () => {
    const warn = spyOnWarnings()
    const broken: NodeKindDef = {...documentKind, id: 'broken', classify: nope}
    const kinds = [broken, ...defaultNodeKinds]

    expect(classifyKind(postType, kinds)).toBe(documentKind)
    expect(classifyKind(postType, kinds)).toBe(documentKind)
    expect(warn).toHaveBeenCalledOnce()
    expect(warningAt(warn)).toContain(
      "`broken` kind's `classify` failed on type `post`, so the next kind is tried",
    )
  })

  it('falls through to the catch-all when no other kind claims the type', () => {
    spyOnWarnings()
    const broken: NodeKindDef = {...documentKind, id: 'broken', classify: nope}

    expect(classifyKind(postType, [broken, otherKind])).toBe(otherKind)
  })

  it('reads the kind id as the base type when `baseTypeOf` throws, and warns once', () => {
    const warn = spyOnWarnings()
    const broken: NodeKindDef = {...documentKind, id: 'broken', baseTypeOf: nope}

    expect(baseTypeFor(postType, broken)).toBe('broken')
    expect(baseTypeFor(postType, broken)).toBe('broken')
    expect(warn).toHaveBeenCalledOnce()
    expect(warningAt(warn)).toContain("`broken` kind's `baseTypeOf` failed on type `post`")
  })
})

describe('baseTypeFor', () => {
  it('asks the kind, or falls back to its id when it has no `baseTypeOf`', () => {
    expect(baseTypeFor(postType, otherKind)).toBe('object')
    expect(baseTypeFor(postType, {...otherKind, baseTypeOf: undefined})).toBe('other')
  })
})
