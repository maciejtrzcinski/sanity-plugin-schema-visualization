import type {NodeKindDef} from './kinds'
import type {GraphNode} from './types'

/** The slice of Sanity's `InitialValueTemplateItem` this reads. */
export interface NewDocumentOption {
  templateId: string
  schemaType: string
  parameters?: Record<string, unknown>
}

/** What the detail panel's `create` intent link is built from. */
export interface CreateDocumentTarget {
  params: {type: string; template?: string}
  /** Template parameters, passed as the intent's payload. */
  payload?: Record<string, unknown>
}

/**
 * Where "New <type>" should lead, or `undefined` when the panel shouldn't
 * offer it at all.
 *
 * `options` are the Studio's own new-document options for a global context —
 * what its navbar "Create" menu offers. Following them is what keeps the
 * button off a singleton: the usual recipes remove the type's template, or
 * filter it out of `newDocumentOptions`, and either way it's missing here.
 * The type's default template (id = type name) wins when it's allowed;
 * otherwise the first template that is.
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
