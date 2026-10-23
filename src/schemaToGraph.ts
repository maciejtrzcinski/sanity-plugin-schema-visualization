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
  /**
   * Rules for turning a compiled schema type into a label and the connections
   * it implies. Splice a custom describer in ahead of the built-in it needs to
   * pre-empt — the last default matches everything.
   */
  fieldDescribers?: readonly FieldDescriber[]
  /**
   * Badges describing how a field behaves — `required`, `read-only`, `list`.
   * Every entry runs; order is the order badges appear on the field row.
   */
  fieldBadges?: readonly FieldBadgeDef[]
  /** How deep to descend into anonymous nested types. Defaults to 8. */
  maxDepth?: number
  /** Categories to sort types into. First match wins, so the catch-all goes last. */
  kinds?: readonly NodeKindDef[]
}

/**
 * The slice of the resolved plugin config that building a graph reads. Keyed
 * by the public options so the two can't drift apart, typed by the config so
 * the tool can hand its `ResolvedConfig` straight in.
 */
type GraphBuildConfig = Pick<ResolvedConfig, keyof SchemaToGraphOptions>

/**
 * Fills in the defaults for the options that shape the graph. The single
 * owner of those defaults: `resolveConfig` spreads this into the plugin
 * config, and `schemaToGraph` applies it for callers with no config at all.
 */
export function resolveGraphOptions(options: SchemaToGraphOptions = {}): GraphBuildConfig {
  return {
    fieldDescribers: options.fieldDescribers ?? defaultFieldDescribers,
    fieldBadges: options.fieldBadges ?? defaultFieldBadges,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    kinds: options.kinds ?? defaultNodeKinds,
  }
}

/** The built-in type a compiled type is ultimately declared as. */
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
  /** See `WalkContext.selfName`. */
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

  // Field badges carry the id of the def that produced them; a describer's own
  // options have none, so they take the position it emitted them at. Both need
  // one: the card and the panel render the list as React children, and two
  // options on one field can share a label.
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

/** `fields` without its `undefined` entries — keeps unset optional fields out of the graph's JSON. */
function withDefined<T extends Record<string, unknown>>(fields: T): Partial<T> {
  const defined: Partial<T> = {}
  for (const key of Object.keys(fields) as Array<keyof T>) {
    if (fields[key] !== undefined) defined[key] = fields[key]
  }
  return defined
}

/** Keeps the shallowest path per (kind, target) — the clearest one to label an edge with. */
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
 * The fields to show for a type. Object and document types expose their own;
 * a registered *array* type (`blockContent`, `tags`) has no fields of its own,
 * so it gets a single synthetic row standing in for its members — without it,
 * references reachable only through that array (portable-text annotations,
 * most commonly) would have nowhere to hang.
 */
function getDescribableFields(typeName: string, type: SchemaType): DescribableField[] {
  // Some intrinsic object types (`document`, `object`) compile with no
  // `fields` array at all, so this can't assume the property is present.
  if (isObjectSchemaType(type)) {
    return (type.fields ?? []).map((f) => ({
      name: f.name,
      type: f.type,
      group: 'group' in f ? f.group : undefined,
      fieldset: 'fieldset' in f ? f.fieldset : undefined,
    }))
  }
  // `selfName` keeps the walk from stopping at "this field reuses
  // `blockContent`" when `blockContent` is the type we're describing.
  if (isArraySchemaType(type)) return [{name: 'of', type, selfName: typeName}]
  return []
}

function edgeId(source: string, fieldName: string, kind: string, target: string): string {
  return `${source}::${fieldName}::${kind}::${target}`
}

/**
 * Transforms a compiled Sanity Studio schema into a graph of nodes (types)
 * and edges (reference / reused-type connections) suitable for rendering
 * on a canvas.
 *
 * Field types are walked recursively, so a reference nested inside an inline
 * object, a customized `image`, an array member, or a portable-text
 * annotation produces an edge just like a top-level one does.
 *
 * A thin wrapper over `buildGraph` for library consumers; the tool
 * itself calls `buildGraph` with the config it has already resolved.
 *
 * `t` is handed to every field describer and field badge, so the labels and
 * badges they produce follow the Studio's locale. It defaults to this
 * plugin's English bundle, which is what a headless caller gets.
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

/** {@link schemaToGraph} for a caller that already holds a resolved config. */
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
        // A type pointing at itself — a recursive object, or a reference
        // like "related posts" — is structurally fine, but dagre skips
        // self-loops and React Flow draws them as a degenerate squiggle on
        // the card. The field's own badges (`referencesTo`/`reusesTypes`)
        // still show the target, so drop the edge.
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
          // Carried through for whatever kind sets it, rather than only for
          // `reference` — a custom describer's own kind can mean something by
          // it too. The built-in reference describer always sets it, so a
          // reference edge still always has the flag.
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

  // Drop edges that point at a type we didn't end up creating a node for
  // (can happen for `to`/`of` entries referencing an unregistered type name).
  const nodeIds = new Set(nodes.map((n) => n.id))
  const filteredEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))

  return {nodes, edges: filteredEdges, attributePaths: attributePaths.total}
}
