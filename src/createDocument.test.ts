import {describe, expect, it} from 'vitest'

import {makeNode} from '../test/fixtures'
import {createDocumentTarget, type NewDocumentOption} from './createDocument'
import {documentKind, objectKind} from './kinds'

const post = makeNode({id: 'post'})
const option = (overrides: Partial<NewDocumentOption> = {}): NewDocumentOption => ({
  templateId: 'post',
  schemaType: 'post',
  ...overrides,
})

describe('createDocumentTarget', () => {
  it('opens the type’s default template', () => {
    expect(createDocumentTarget(post, documentKind, [option()])).toEqual({params: {type: 'post'}})
  })

  // The singleton recipes either drop the type's template or filter it out of
  // `newDocumentOptions`; both leave nothing for the type here.
  it('offers nothing when the Studio’s own create menu doesn’t offer the type', () => {
    expect(createDocumentTarget(post, documentKind, [])).toBeUndefined()
    expect(
      createDocumentTarget(post, documentKind, [
        option({templateId: 'author', schemaType: 'author'}),
      ]),
    ).toBeUndefined()
  })

  it('falls back to another template for the type, with its parameters', () => {
    const fromTemplate = option({templateId: 'post-by-author', parameters: {authorId: 'a1'}})

    expect(createDocumentTarget(post, documentKind, [fromTemplate])).toEqual({
      params: {type: 'post', template: 'post-by-author'},
      payload: {authorId: 'a1'},
    })
  })

  it('prefers the default template when the type has several', () => {
    const options = [option({templateId: 'post-draft'}), option()]

    expect(createDocumentTarget(post, documentKind, options)).toEqual({params: {type: 'post'}})
  })

  it('follows the kind registry rather than the built-in `document` id', () => {
    expect(createDocumentTarget(post, objectKind, [option()])).toBeUndefined()
    expect(
      createDocumentTarget(post, {...objectKind, createsDocuments: true}, [option()]),
    ).toBeDefined()
  })

  it('stays away from Sanity’s own system types', () => {
    const asset = makeNode({id: 'sanity.imageAsset', isSystem: true})

    expect(
      createDocumentTarget(asset, documentKind, [option({schemaType: 'sanity.imageAsset'})]),
    ).toBeUndefined()
  })
})
