import type {Tone} from './registry'

/**
 * Which category a schema type falls into. The built-ins are `document`,
 * `object` and `other`; the union stays open so a consumer can register
 * extra kinds (see `NodeKindDef`) without patching this type — the
 * `(string & {})` arm keeps editor autocomplete for the built-ins.
 *
 * @public
 */
export type GraphNodeKind = 'document' | 'object' | 'other' | (string & {})

/** @public */
export interface FieldOptionSummary {
  /** e.g. "list", "required", "readOnly", "hidden", "weak", "layout: radio" */
  label: string
  tone?: Tone
}

/**
 * An option plus the id it was collected under — the field badge's def id, or
 * the position the describer emitted it at. A stable React key for the
 * surfaces that render the list, since two of them can share a label.
 *
 * @public
 */
export interface CollectedFieldOption extends FieldOptionSummary {
  id: string
}

/**
 * One validation constraint beyond `required`, as the compiled `Rule` declares
 * it.
 *
 * @public
 */
export interface FieldConstraint {
  /**
   * The rule's flag: `min`, `max`, `length`, `regex`, `integer`, `precision`,
   * `lessThan`, `greaterThan`, `unique`, `uri`, `email`, `assetRequired` or
   * `custom`.
   */
  flag: string
  /**
   * The rule's argument, when it takes one: a number, a regex (its `name`, or
   * its source between slashes), or `{field}` when it compares against another
   * field's value.
   */
  value?: number | string | {field: string}
  /** Set on a `regex` rule that must *not* match. */
  inverted?: boolean
  level: 'error' | 'warning' | 'info'
}

/** @public */
export interface FieldSummary {
  name: string
  title?: string
  /** Human readable type, e.g. "string", "array of reference", "seo (object)" */
  typeLabel: string
  options: CollectedFieldOption[]
  /** Names of schema types this field points to via a reference. */
  referencesTo: string[]
  /** Names of named custom types this field reuses (object/array member types). */
  reusesTypes: string[]
  /** True when validation statically requires this field (best-effort). */
  required: boolean
  /** True when `hidden` is the literal `true` (unconditional) — not a conditional callback. */
  hidden: boolean
  /** Deprecation reason, when this field's type is marked `deprecated`. */
  deprecated?: string
  /** The built-in Sanity type the field is ultimately declared as: `slug`, `string`, `reference`, `object`… */
  intrinsicType?: string
  /** Validation constraints other than `required` (best-effort, like `required`). */
  validation?: FieldConstraint[]
  /** Names of the field groups (tabs) the field appears in. */
  groups?: string[]
  /** Name of the fieldset the field is rendered inside. */
  fieldset?: string
  /** Whether the field declares an initial value, and whether it's computed. */
  initialValue?: 'value' | 'function'
  /** `options.source` — what a slug generates from: a field path, or `'(function)'` when computed. */
  source?: string
}

/** @public */
export interface FieldGroupSummary {
  name: string
  title?: string
  /** The group the document form opens on. */
  isDefault?: boolean
}

/**
 * A fieldset holding more than one field. Sanity also wraps every ungrouped
 * field in a single-field fieldset; those are left out.
 *
 * @public
 */
export interface FieldsetSummary {
  name: string
  title?: string
  fields: string[]
}

/**
 * One `preview.select` entry and how many references the preview has to
 * follow to resolve it — `author.company.name` follows two.
 *
 * @public
 */
export interface PreviewSelection {
  /** The preview's own key: `title`, `subtitle`, `media`, or anything `prepare` reads. */
  key: string
  path: string
  dereferences: number
}

/**
 * How many distinct attribute paths (path + data type pairs) documents of a
 * schema can write, estimated from the schema alone. Sanity limits these per
 * dataset; see `attributePathsRule`.
 *
 * @public
 */
export interface AttributePathEstimate {
  count: number
  /** Counting stopped at the cap, so the real figure is higher. */
  capped: boolean
  /** Types that can contain themselves. They are counted one level deep, so `count` is a floor. */
  recursiveTypes: string[]
}

/** @public */
export interface GraphNode {
  id: string
  name: string
  title: string
  kind: GraphNodeKind
  /** The immediate base type this was declared as, e.g. "document", "object", "string". */
  baseType: string
  fields: FieldSummary[]
  /** Whether this type has no schema.get()-able fields (e.g. primitive alias). */
  isLeaf: boolean
  /** True for Sanity's built-in intrinsic/system types (image, slug, sanity.imageAsset, …) rather than something the user registered. */
  isSystem: boolean
  deprecated?: string
  /** The type's field groups (tabs), in declaration order. */
  groups?: FieldGroupSummary[]
  /** Fieldsets holding more than one field. */
  fieldsets?: FieldsetSummary[]
  /** Whether the type declares a document-level initial value, and whether it's computed. */
  initialValue?: 'value' | 'function'
  /** The type's `preview.select`, for registered types that have one. */
  previewSelect?: PreviewSelection[]
  /** Distinct attribute paths a document of this type can write. Document types only. */
  attributePaths?: number
}

/**
 * Which kind of connection an edge represents. The built-ins are `reference`,
 * `external-reference` (a cross-dataset or global document reference) and
 * `reuses`; the union stays open so a consumer can register extra kinds
 * (see `EdgeKindDef`) without patching this type — the `(string & {})` arm
 * keeps editor autocomplete for the built-ins.
 *
 * @public
 */
export type GraphEdgeKind = 'reference' | 'external-reference' | 'reuses' | (string & {})

/**
 * A connection found while walking a field's type, at any depth. `path` is
 * rooted at the field name — `"author"` for a top-level reference,
 * `"body[].markDefs[].author"` for one reached through portable text.
 *
 * @public
 */
export interface FieldLink {
  kind: GraphEdgeKind
  /** Name of the schema type on the other end. */
  target: string
  path: string
  /** True when the reference is a weak reference. */
  weak?: boolean
}

/** @public */
export interface GraphEdge {
  id: string
  source: string
  target: string
  kind: GraphEdgeKind
  /** Field name on the source type that produced this edge. */
  fieldName: string
  /**
   * Full path to the connection when it sits below the top level of the
   * field, e.g. `"body[].markDefs[].author"`. Omitted when it would just
   * repeat `fieldName`.
   */
  fieldPath?: string
  /** True when the reference is a weak reference. */
  weak?: boolean
}

/** @public */
export interface SchemaGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** Set by `schemaToGraph` on the whole schema; absent on a filtered subgraph. */
  attributePaths?: AttributePathEstimate
}
