import type {NodeKindDef} from './kinds'
import type {GraphNode} from './types'

export interface NewDocumentOption {
  templateId: string
  schemaType: string
  parameters?: Record<string, unknown>
}

export interface CreateDocumentTarget {
  params: {type: string; template?: string}
  payload?: Record<string, unknown>
}

/**
 * `options` are what the Studio's global "Create" menu offers; following them
 * keeps the button off singletons.
 */
export function createDocumentTarget(
  node: GraphNode,
  kind: NodeKindDef,
  options: readonly NewDocumentOption[],
): CreateDocumentTarget | undefined {
  if (!kind.createsDocuments || node.isSystem) return undefined
  const forType = options.filter((option) => option.schemaType === node.name)
  const option = forType.find((o) => o.templateId === node.name) ?? forType[0]
  if (!option) return undefined

  const params =
    option.templateId === node.name
      ? {type: node.name}
      : {type: node.name, template: option.templateId}
  const hasPayload = option.parameters && Object.keys(option.parameters).length > 0
  return hasPayload ? {params, payload: option.parameters} : {params}
}
