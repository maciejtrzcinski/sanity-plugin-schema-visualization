import {
  isArraySchemaType,
  isDeprecatedSchemaType,
  isDocumentSchemaType,
  isObjectSchemaType,
  type Schema,
  type SchemaType,
} from 'sanity'

import {estimateAttributePaths} from './attributePaths'
import type {ResolvedConfig} from './config'
import {collectFieldBadges, defaultFieldBadges, type FieldBadgeDef} from './fieldBadges'
import {
  DEFAULT_MAX_DEPTH,
  defaultFieldDescribers,
  getTypeOptions,
  rootWalkContext,
  walkFieldType,
  type FieldDescriber,
} from './fieldWalker'
import {defaultTranslate, type TranslateFn} from './i18n'
import {checkIntrinsicFieldTypes, getRegisteredTypeNames, INTRINSIC_TYPE_NAMES} from './intrinsics'
import {baseTypeFor, classifyKind, defaultNodeKinds, type NodeKindDef} from './kinds'
import {readPreviewSelect} from './previewSelect'
import type {
  CollectedFieldOption,
  FieldGroupSummary,
  FieldLink,
  FieldSummary,
  FieldsetSummary,
  GraphEdge,
  GraphNode,
  GraphNodeKind,
  SchemaGraph,
} from './types'
import {readValidation} from './validation'

/** @public */
export interface SchemaToGraphOptions {
  /** Rules for reading a compiled type's label and connections. */
  fieldDescribers?: readonly FieldDescriber[]
  /** Badges describing how a field behaves. Every entry runs, in order. */
  fieldBadges?: readonly FieldBadgeDef[]
  /** How deep to descend into anonymous nested types. Defaults to 8. */
  maxDepth?: number
  /** Categories to sort types into. First match wins, so the catch-all goes last. */
  kinds?: readonly NodeKindDef[]
}

type GraphBuildConfig = Pick<ResolvedConfig, keyof SchemaToGraphOptions>

/** The one owner of the graph-shaping defaults, for `resolveConfig` and `schemaToGraph`. */
export function resolveGraphOptions(options: SchemaToGraphOptions = {}): GraphBuildConfig {
  return {
    fieldDescribers: options.fieldDescribers ?? defaultFieldDescribers,
    fieldBadges: options.fieldBadges ?? defaultFieldBadges,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    kinds: options.kinds ?? defaultNodeKinds,
  }
}

function intrinsicTypeOf(type: SchemaType): string {
  let current: SchemaType | undefined = type
  for (let depth = 0; current && depth <= 32; depth++) {
    if (INTRINSIC_TYPE_NAMES.has(current.name)) return current.name
    if (!current.type) return current.jsonType
    current = current.type
  }
  return type.jsonType
}

function initialValueKind(value: unknown): 'value' | 'function' | undefined {
  if (value === undefined) return undefined
  return typeof value === 'function' ? 'function' : 'value'
}

function sourceOf(type: SchemaType): string | undefined {
  const source = getTypeOptions(type)?.source
  if (typeof source === 'function') return '(function)'
  return typeof source === 'string' && source ? source : undefined
}

function asList(value: unknown): string[] | undefined {
  if (typeof value === 'string' && value) return [value]
  if (Array.isArray(value)) {
    const names = value.filter((v): v is string => typeof v === 'string')
    return names.length > 0 ? names : undefined
  }
  return undefined
}

function readGroups(type: SchemaType): FieldGroupSummary[] | undefined {
  const groups: unknown = 'groups' in type ? type.groups : undefined
  if (!Array.isArray(groups) || groups.length === 0) return undefined
  return groups.flatMap((group: unknown) => {
    if (typeof group !== 'object' || group === null || !('name' in group)) return []
    const {name} = group
    if (typeof name !== 'string') return []
    const title = 'title' in group && typeof group.title === 'string' ? group.title : undefined
    const isDefault = 'default' in group && group.default === true
    return [{name, ...(title ? {title} : {}), ...(isDefault ? {isDefault} : {})}]
  })
}

/** Multi-field fieldsets only; Sanity wraps every other field in a `single` one. */
function readFieldsets(type: SchemaType): FieldsetSummary[] | undefined {
  const fieldsets: unknown = 'fieldsets' in type ? type.fieldsets : undefined
  if (!Array.isArray(fieldsets)) return undefined
  const multi = fieldsets.flatMap((fieldset: unknown) => {
    if (typeof fieldset !== 'object' || fieldset === null) return []
    if ('single' in fieldset && fieldset.single) return []
    if (!('name' in fieldset) || typeof fieldset.name !== 'string') return []
    const fields =
      'fields' in fieldset && Array.isArray(fieldset.fields)
        ? fieldset.fields.flatMap((field: unknown) =>
            typeof field === 'object' && field !== null && 'name' in field
              ? [String(field.name)]
              : [],
          )
        : []
    const title =
      'title' in fieldset && typeof fieldset.title === 'string' ? fieldset.title : undefined
    return [{name: fieldset.name, ...(title ? {title} : {}), fields}]
  })
  return multi.length > 0 ? multi : undefined
}

interface DescribableField {
  name: string
  type: SchemaType
  selfName?: string
  group?: unknown
  fieldset?: unknown
}

interface DescribedField {
  summary: FieldSummary
  links: FieldLink[]
}

function describeField(
  {name, type: fieldType, selfName, group, fieldset}: DescribableField,
  isRegistered: (typeName: string) => boolean,
  config: GraphBuildConfig,
  t: TranslateFn,
): DescribedField {
  const walked = walkFieldType(
    fieldType,
    rootWalkContext(name, isRegistered, config.maxDepth, selfName, t),
    config.fieldDescribers,
  )

  const links = dedupeLinks(walked.links)
  const {required, constraints} = readValidation(fieldType)

  // Ids give the card and panel a stable React key: two options on one field can share a label.
  const options: CollectedFieldOption[] = collectFieldBadges(
    fieldType,
    {name, required, validation: constraints, t},
    config.fieldBadges,
  )
  for (const [i, option] of walked.options.entries()) {
    options.push({...option, id: `type-option:${i}`})
  }

  return {
    summary: {
      name,
      title: fieldType.title,
      typeLabel: walked.typeLabel,
      options,
      referencesTo: uniqueTargets(links, 'reference'),
      reusesTypes: uniqueTargets(links, 'reuses'),
      required,
      hidden: fieldType.hidden === true,
      deprecated: isDeprecatedSchemaType(fieldType) ? fieldType.deprecated.reason : undefined,
      intrinsicType: intrinsicTypeOf(fieldType),
      validation: constraints,
      ...withDefined({
        groups: asList(group),
        fieldset: typeof fieldset === 'string' ? fieldset : undefined,
        initialValue: initialValueKind(fieldType.initialValue),
        source: sourceOf(fieldType),
      }),
    },
    links,
  }
}

function withDefined<T extends Record<string, unknown>>(fields: T): Partial<T> {
  const defined: Partial<T> = {}
  for (const key of Object.keys(fields) as Array<keyof T>) {
    if (fields[key] !== undefined) defined[key] = fields[key]
  }
  return defined
}

function dedupeLinks(links: FieldLink[]): FieldLink[] {
  const byTarget = new Map<string, FieldLink>()
  for (const link of links) {
    const key = `${link.kind}::${link.target}`
    const existing = byTarget.get(key)
    if (!existing || link.path.length < existing.path.length) byTarget.set(key, link)
  }
  return [...byTarget.values()]
}

function uniqueTargets(links: FieldLink[], kind: FieldLink['kind']): string[] {
  return [...new Set(links.filter((l) => l.kind === kind).map((l) => l.target))]
}

/**
 * A registered array type gets one synthetic row for its members, or references
 * through it would have nowhere to hang.
 */
function getDescribableFields(typeName: string, type: SchemaType): DescribableField[] {
  // `document` and `object` can compile with no `fields` at all.
  if (isObjectSchemaType(type)) {
    return (type.fields ?? []).map((f) => ({
      name: f.name,
      type: f.type,
      group: 'group' in f ? f.group : undefined,
      fieldset: 'fieldset' in f ? f.fieldset : undefined,
    }))
  }
  if (isArraySchemaType(type)) return [{name: 'of', type, selfName: typeName}]
  return []
}

function edgeId(source: string, fieldName: string, kind: string, target: string): string {
  return `${source}::${fieldName}::${kind}::${target}`
}

/**
 * Turns a compiled Studio schema into a graph of types and their connections,
 * walking field types recursively. `t` defaults to the English bundle.
 *
 * @public
 */
export function schemaToGraph(
  schema: Schema,
  options: SchemaToGraphOptions = {},
  t: TranslateFn = defaultTranslate,
): SchemaGraph {
  return buildGraph(schema, resolveGraphOptions(options), t)
}

export function buildGraph(
  schema: Schema,
  config: GraphBuildConfig,
  t: TranslateFn = defaultTranslate,
): SchemaGraph {
  checkIntrinsicFieldTypes(schema)
  const registeredTypeNames = getRegisteredTypeNames(schema)
  const isRegistered = (name: string) => registeredTypeNames.has(name)

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const seenEdgeIds = new Set<string>()
  const documentTypes: SchemaType[] = []

  for (const name of schema.getTypeNames()) {
    const type = schema.get(name)
    if (!type) continue

    const kindDef = classifyKind(type, config.kinds)
    const kind: GraphNodeKind = kindDef.id

    const fields: FieldSummary[] = []

    for (const field of getDescribableFields(name, type)) {
      const {summary, links} = describeField(field, isRegistered, config, t)
      fields.push(summary)

      for (const link of links) {
        // Self-loops are dropped: dagre skips them and React Flow draws a squiggle.
        if (link.target === name) continue

        const id = edgeId(name, field.name, link.kind, link.target)
        if (seenEdgeIds.has(id)) continue
        seenEdgeIds.add(id)
        edges.push({
          id,
          source: name,
          target: link.target,
          kind: link.kind,
          fieldName: field.name,
          fieldPath: link.path === field.name ? undefined : link.path,
          ...(link.weak === undefined ? {} : {weak: link.weak}),
        })
      }
    }

    const isSystem = !registeredTypeNames.has(name)
    if (isDocumentSchemaType(type)) documentTypes.push(type)
    nodes.push({
      id: name,
      name,
      title: type.title || name,
      kind,
      baseType: baseTypeFor(type, kindDef),
      fields,
      isLeaf: fields.length === 0,
      isSystem,
      deprecated: isDeprecatedSchemaType(type) ? type.deprecated.reason : undefined,
      ...withDefined({
        groups: readGroups(type),
        fieldsets: readFieldsets(type),
        initialValue: initialValueKind(type.initialValue),
        previewSelect: isSystem ? undefined : readPreviewSelect(type),
      }),
    })
  }

  const attributePaths = estimateAttributePaths(documentTypes, isRegistered)
  for (const node of nodes) {
    const count = attributePaths.byType.get(node.name)
    if (count !== undefined) node.attributePaths = count
  }

  const nodeIds = new Set(nodes.map((n) => n.id))
  const filteredEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))

  return {nodes, edges: filteredEdges, attributePaths: attributePaths.total}
}
