import {useEffect, useMemo, useState} from 'react'
import {useGrantsStore, useWorkspace} from 'sanity'

import {warnOnce} from '../compat'
import {useConfig} from '../config'
import {createDocumentTarget, type CreateDocumentTarget} from '../createDocument'
import type {GraphNode} from '../types'

/** `undefined` while checking, and whenever the user may not create the type. */
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
      warnOnce(
        'create-document:new-document-options',
        `Could not resolve the Studio's new-document options, so the detail panel offers no "New" link.`,
        err,
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
