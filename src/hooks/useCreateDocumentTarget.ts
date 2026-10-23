import {useEffect, useMemo, useState} from 'react'
import {useGrantsStore, useWorkspace} from 'sanity'

import {warnOnce} from '../compat'
import {useConfig} from '../config'
import {createDocumentTarget, type CreateDocumentTarget} from '../createDocument'
import type {GraphNode} from '../types'

/**
 * Where the detail panel's "New <type>" link leads, once the Studio agrees the
 * current user may create one — `undefined` while that is being checked, and
 * whenever the answer is no.
 *
 * Two Studio checks, both of which the Studio's own create menu makes: the
 * type must be among its global new-document options (see
 * `createDocumentTarget`), and the user's grants must allow `create` on it.
 * Either failing hides the link; the Studio still enforces permissions on
 * save, so this only decides what's offered.
 */
export function useCreateDocumentTarget(node: GraphNode | null): CreateDocumentTarget | undefined {
  const workspace = useWorkspace()
  const grants = useGrantsStore()
  const {kindById, catchAll} = useConfig()

  const target = useMemo(() => {
    if (!node) return undefined
    try {
      const options = workspace.document.resolveNewDocumentOptions({type: 'global'})
      return createDocumentTarget(node, kindById.get(node.kind) ?? catchAll, options)
    } catch (err) {
      // A Studio's own `newDocumentOptions` threw — offer nothing rather than
      // guess what it meant to allow.
      warnOnce(
        'create-document:new-document-options',
        `Could not resolve the Studio's new-document options, so the detail panel offers no "New" link: ${String(err)}`,
      )
      return undefined
    }
  }, [node, workspace, kindById, catchAll])

  const typeName = target?.params.type
  const [granted, setGranted] = useState<{typeName: string; granted: boolean} | null>(null)
  useEffect(() => {
    if (!typeName) return undefined
    const subscription = grants
      .checkDocumentPermission('create', {_id: 'dummy-id', _type: typeName})
      .subscribe({
        next: (result) => setGranted({typeName, granted: result.granted}),
        error: () => setGranted({typeName, granted: false}),
      })
    return () => subscription.unsubscribe()
  }, [grants, typeName])

  return target && granted !== null && granted.typeName === typeName && granted.granted
    ? target
    : undefined
}
