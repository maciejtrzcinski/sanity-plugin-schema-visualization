// @vitest-environment jsdom
import {renderHook, waitFor} from '@testing-library/react'
import type {ReactNode} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {makeNode} from '../../test/fixtures'
import {ConfigProvider} from '../config'
import {useCreateDocumentTarget} from './useCreateDocumentTarget'

const resolveNewDocumentOptions = vi.fn()
const workspace = {document: {resolveNewDocumentOptions}}

/** An observable that answers once, like the grants store does once it has the user's grants. */
const answer = {granted: true}
const checkDocumentPermission = vi.fn(() => ({
  subscribe: ({next}: {next: (result: {granted: boolean; reason: string}) => void}) => {
    next({granted: answer.granted, reason: ''})
    return {unsubscribe: () => {}}
  },
}))
const grants = {checkDocumentPermission}

vi.mock('sanity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sanity')>()),
  useWorkspace: () => workspace,
  useGrantsStore: () => grants,
}))

const options = {}
function wrapper({children}: {children: ReactNode}) {
  return <ConfigProvider options={options}>{children}</ConfigProvider>
}

const post = makeNode({id: 'post'})

beforeEach(() => {
  vi.clearAllMocks()
  answer.granted = true
  resolveNewDocumentOptions.mockReturnValue([{templateId: 'post', schemaType: 'post'}])
})

describe('useCreateDocumentTarget', () => {
  it('offers the link once the user may create the type', async () => {
    const {result} = renderHook(() => useCreateDocumentTarget(post), {wrapper})

    await waitFor(() => expect(result.current).toEqual({params: {type: 'post'}}))
    expect(resolveNewDocumentOptions).toHaveBeenCalledWith({type: 'global'})
    expect(checkDocumentPermission).toHaveBeenCalledWith('create', {
      _id: 'dummy-id',
      _type: 'post',
    })
  })

  it('hides it when the user’s grants don’t allow creating one', () => {
    answer.granted = false
    const {result} = renderHook(() => useCreateDocumentTarget(post), {wrapper})

    expect(result.current).toBeUndefined()
  })

  it('hides it when the Studio’s new-document options throw', () => {
    resolveNewDocumentOptions.mockImplementation(() => {
      throw new Error('bad newDocumentOptions')
    })
    const {result} = renderHook(() => useCreateDocumentTarget(post), {wrapper})

    expect(result.current).toBeUndefined()
    expect(checkDocumentPermission).not.toHaveBeenCalled()
  })

  it('asks nothing when no node is selected', () => {
    const {result} = renderHook(() => useCreateDocumentTarget(null), {wrapper})

    expect(result.current).toBeUndefined()
    expect(resolveNewDocumentOptions).not.toHaveBeenCalled()
  })
})
