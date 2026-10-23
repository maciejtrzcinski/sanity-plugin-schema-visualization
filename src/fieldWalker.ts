import {
  isArraySchemaType,
  isObjectSchemaType,
  isReferenceSchemaType,
  type CrossDatasetReferenceSchemaType,
  type GlobalDocumentReferenceSchemaType,
  type SchemaType,
} from 'sanity'

import {defaultTranslate, type TranslateFn} from './i18n'
import {INTRINSIC_FIELD_NAMES} from './intrinsics'
import type {FieldLink, FieldOptionSummary} from './types'

/** How deep the walker descends into anonymous nested types before giving up. */
export const DEFAULT_MAX_DEPTH = 8

/** @public */
export interface WalkContext {
  /**
   * Path to the type being described, rooted at the field name — e.g.
   * `"cover.credit"`, `"body[].markDefs[].author"`. Used to label edges.
   */
  path: string
  depth: number
  maxDepth: number
  /** True for a type the user registered in `schema.types`; it gets its own node. */
  isRegistered: (name: string) => boolean
  /** Types already on the current descent path, guarding against cyclic compiled types. */
  seen: ReadonlySet<SchemaType>
  /**
   * A type name that must not be treated as "a registered type this field
   * reuses". Set when walking the type that *owns* the field, so the walk
   * descends into it instead of stopping at a self-referential reuse edge —
   * how a registered array type reaches its own members.
   */
  selfName?: string
  /**
   * Translates against this plugin's namespace, for the parts of a
   * `typeLabel` that are words rather than type names ("array of …") and for
   * a describer's own option badges. A custom describer localises through
   * this; one that ignores it simply returns the string it always did.
   */
  t: TranslateFn
}

/** @public */
export interface DescribeResult {
  /** Human-readable type label. Only the top-level result's label is surfaced. */
  typeLabel: string
  /** Reference/reuse connections found at this level and below. */
  links: FieldLink[]
  /** Badges for this type. Only the top-level result's options are surfaced. */
  options: FieldOptionSummary[]
}

/**
 * Descends into a nested type, extending the current path by one segment.
 *
 * @public
 */
export type Recurse = (type: SchemaType, segment: string) => DescribeResult

/**
 * The two functions a describer is made of — see {@link FieldDescriber} for
 * the whole entry.
 *
 * @public
 */
export interface FieldDescriberRule {
  match: (type: SchemaType, ctx: WalkContext) => boolean
  describe: (type: SchemaType, ctx: WalkContext, recurse: Recurse) => DescribeResult
}

/**
 * One rule for turning a compiled schema type into a label plus the
 * connections it implies. The first describer whose `match` returns true
 * wins, so order is significant — see {@link defaultFieldDescribers}.
 *
 * Keyed by `id` like every other registry, which is what `insertBefore`,
 * `replaceById` and `without` look up.
 *
 * @public
 */
export interface FieldDescriber extends FieldDescriberRule {
  id: string
}

interface CommonFieldOptions {
  list?: unknown[]
  layout?: string
  source?: unknown
  hotspot?: boolean
  filter?: unknown
  disableNew?: boolean
}

export function getTypeOptions(type: SchemaType): CommonFieldOptions | undefined {
  const options: unknown = 'options' in type ? type.options : undefined
  return options && typeof options === 'object' ? options : undefined
}

/**
 * True when a compiled type's name is just its own jsonType (an inline, unnamed alias).
 */
export function isAnonymousType(type: SchemaType): boolean {
  return type.name === type.jsonType
}

function childPath(path: string, segment: string): string {
  if (segment === '[]') return `${path}[]`
  return path ? `${path}.${segment}` : segment
}

const empty = (typeLabel: string): DescribeResult => ({typeLabel, links: [], options: []})

/**
 * True when `type` is the named intrinsic, or an alias of it — a registered
 * type declared as `{type: 'crossDatasetReference', …}` compiles to a chain
 * ending at the intrinsic, the same shape `isReferenceSchemaType` walks.
 *
 * Sanity ships no usable guard for either of the two reference-like intrinsics
 * this covers: `isCrossDatasetReferenceSchemaType` lives in `@sanity/types`
 * but isn't re-exported by `sanity`, and there is no
 * `isGlobalDocumentReferenceSchemaType` at all. The walk is bounded rather
 * than recursive so that a self-referential `type` link degrades to "no match"
 * instead of hanging the graph build.
 */
export function isAliasOf(type: SchemaType, name: string): boolean {
  let current: SchemaType | undefined = type
  for (let depth = 0; current && depth <= 32; depth++) {
    if (current.name === name) return true
    current = current.type
  }
  return false
}

/**
 * Narrowed to Sanity's own declared shape rather than to a local guess at it,
 * so a rename on their side (`dataset`, `resourceId`, `to`) fails this build
 * instead of quietly reading `undefined` in a user's Studio. Both are `@beta`
 * there; the intersection is what makes the predicate assignable to
 * `SchemaType`, since neither is a member of that union.
 */
function isCrossDatasetReference(
  type: SchemaType,
): type is SchemaType & CrossDatasetReferenceSchemaType {
  return isAliasOf(type, 'crossDatasetReference')
}

function isGlobalDocumentReference(
  type: SchemaType,
): type is SchemaType & GlobalDocumentReferenceSchemaType {
  return isAliasOf(type, 'globalDocumentReference')
}

/**
 * The badges every reference-like type shares: a weak reference doesn't keep
 * the target from being deleted, a `filter` narrows what the input offers, and
 * `disableNew` takes away the input's "Create new" button.
 */
function referenceOptions(type: SchemaType, weak: boolean, ctx: WalkContext): FieldOptionSummary[] {
  const options: FieldOptionSummary[] = []
  const typeOptions = getTypeOptions(type)
  if (weak) options.push({label: ctx.t('field.weak-ref'), tone: 'caution'})
  if (typeOptions?.filter) options.push({label: ctx.t('field.filtered'), tone: 'default'})
  if (typeOptions?.disableNew === true) {
    options.push({label: ctx.t('field.disable-new'), tone: 'default'})
  }
  return options
}

/**
 * Target type names off a cross-dataset or global document reference. Unlike
 * `reference`, whose `to` entries are compiled schema types, these carry the
 * target as a plain `type` string — the target lives in another dataset, so
 * there is no compiled type here to point at.
 */
function externalTargets(to: readonly {type?: string}[] | undefined): string[] {
  return (to ?? []).map((entry) => entry.type).filter((name): name is string => Boolean(name))
}

/**
 * A `reference` field. Always terminal — the target types get their own
 * nodes, so there is nothing below this worth descending into. Ordered first
 * so that a registered reference alias — a type declared directly as
 * `type: 'reference'` — still surfaces what it actually points at, rather
 * than only a "reuses" edge to a type with no visible targets.
 *
 * @beta
 */
export const referenceDescriber: FieldDescriber = {
  id: 'reference',
  match: (type) => isReferenceSchemaType(type),
  describe(type, ctx) {
    if (!isReferenceSchemaType(type)) return empty(type.name)
    const to = type.to.map((t) => t.name).filter(Boolean)
    const weak = Boolean(type.weak)

    return {
      typeLabel: ctx.t('field.reference-label', {
        targets: to.join(' | ') || ctx.t('field.unknown-target'),
      }),
      links: to.map((target) => ({kind: 'reference', target, path: ctx.path, weak})),
      options: referenceOptions(type, weak, ctx),
    }
  },
}

/**
 * A `crossDatasetReference` field — a pointer at a document in another dataset
 * of the same project. Terminal, like `reference`, and ordered beside it so a
 * registered alias (`{name: 'sharedAuthor', type: 'crossDatasetReference'}`)
 * still reports what it points at.
 *
 * The target type is named by a string rather than a compiled type, because it
 * belongs to the *other* dataset's schema — Sanity can't resolve it here,
 * which is why `to` entries carry their own `preview`. So the `external-reference`
 * link it emits only becomes a drawn edge when this schema happens to hold a
 * type of that name, the common case being one schema deployed to both
 * datasets; otherwise the connection lives on in the field's label and its
 * `dataset` badge, and `buildGraph` drops the dangling edge. The distinct edge
 * kind is what keeps that edge from reading as a local reference.
 *
 * @beta
 */
export const crossDatasetReferenceDescriber: FieldDescriber = {
  id: 'crossDatasetReference',
  match: isCrossDatasetReference,
  describe(type, ctx) {
    if (!isCrossDatasetReference(type)) return empty(type.name)
    const {to, dataset, weak} = type
    const targets = externalTargets(to)
    const options = referenceOptions(type, Boolean(weak), ctx)
    if (dataset) options.push({label: ctx.t('field.dataset', {dataset}), tone: 'default'})

    return {
      typeLabel: ctx.t('field.cross-dataset-reference-label', {
        targets: targets.join(' | ') || ctx.t('field.unknown-target'),
      }),
      links: targets.map((target) => ({
        kind: 'external-reference',
        target,
        path: ctx.path,
        weak: Boolean(weak),
      })),
      options,
    }
  },
}

/**
 * A `globalDocumentReference` field — a pointer at a document in another
 * resource entirely (another dataset, a media library), named by
 * `resourceType:resourceId`. Otherwise exactly
 * {@link crossDatasetReferenceDescriber}: terminal, target types named by
 * string, same `external-reference` edge kind.
 *
 * @beta
 */
export const globalDocumentReferenceDescriber: FieldDescriber = {
  id: 'globalDocumentReference',
  match: isGlobalDocumentReference,
  describe(type, ctx) {
    if (!isGlobalDocumentReference(type)) return empty(type.name)
    const {to, resourceType, resourceId, weak} = type
    const targets = externalTargets(to)
    const options = referenceOptions(type, Boolean(weak), ctx)
    if (resourceType || resourceId) {
      options.push({label: ctx.t('field.resource', {resourceType, resourceId}), tone: 'default'})
    }

    return {
      typeLabel: ctx.t('field.global-document-reference-label', {
        targets: targets.join(' | ') || ctx.t('field.unknown-target'),
      }),
      links: targets.map((target) => ({
        kind: 'external-reference',
        target,
        path: ctx.path,
        weak: Boolean(weak),
      })),
      options,
    }
  },
}

/**
 * A field whose type is one the author registered. Terminal by design: that
 * type has its own node carrying its own fields and outgoing edges, so
 * descending here would duplicate them onto every type that reuses it.
 *
 * Ordered ahead of the structural describers so a registered *array* type
 * (`blockContent`, `tags`) produces a "reuses" edge rather than floating
 * unconnected.
 *
 * @beta
 */
export const namedTypeDescriber: FieldDescriber = {
  id: 'namedType',
  match: (type, ctx) =>
    ctx.isRegistered(type.name) && !isAnonymousType(type) && type.name !== ctx.selfName,
  describe: (type, ctx) => ({
    // Nested, the jsonType suffix just adds noise inside a longer label
    // ("array of seo (object)"); at the top level it's the useful part.
    typeLabel:
      ctx.depth === 0
        ? ctx.t('field.named-type-label', {name: type.name, jsonType: type.jsonType})
        : type.name,
    links: [{kind: 'reuses', target: type.name, path: ctx.path}],
    options: [],
  }),
}

/**
 * An array: descends into every member type.
 *
 * @beta
 */
export const arrayDescriber: FieldDescriber = {
  id: 'array',
  match: (type) => isArraySchemaType(type),
  describe(type, ctx, recurse) {
    if (!isArraySchemaType(type)) return empty(type.name)
    const parts: string[] = []
    const links: FieldLink[] = []
    for (const member of type.of ?? []) {
      const result = recurse(member, '[]')
      parts.push(result.typeLabel)
      links.push(...result.links)
    }
    return {
      typeLabel: ctx.t('field.array-label', {
        members: parts.join(', ') || ctx.t('field.unknown-target'),
      }),
      links,
      options: [],
    }
  },
}

/**
 * An anonymous object — an inline `{type: 'object', fields: [...]}`, a
 * customized `image`/`file`, a portable-text `block`, an annotation. Descends
 * into the fields the author added, skipping the built-in shape of whatever
 * intrinsic type it extends (see `INTRINSIC_FIELD_NAMES`).
 *
 * @beta
 */
export const objectDescriber: FieldDescriber = {
  id: 'object',
  match: (type) => isObjectSchemaType(type),
  describe(type, _ctx, recurse) {
    if (!isObjectSchemaType(type)) return empty(type.name)
    const builtIn = INTRINSIC_FIELD_NAMES[type.name]
    const links: FieldLink[] = []
    for (const field of type.fields ?? []) {
      if (builtIn?.has(field.name)) continue
      links.push(...recurse(field.type, field.name).links)
    }
    return {typeLabel: type.name, links, options: []}
  },
}

/**
 * Anything else — a primitive, or a type no other describer claimed.
 *
 * @beta
 */
export const fallbackDescriber: FieldDescriber = {
  id: 'fallback',
  match: () => true,
  describe: (type) => empty(type.name),
}

/**
 * Order is the contract: terminal/naming rules first, structural recursion
 * after, catch-all last. Callers extending this should place their describer
 * ahead of the built-in it needs to pre-empt rather than appending, since
 * `fallbackDescriber` matches everything. `insertBefore` with the anchor
 * `'namedType'` does that without knowing the order here.
 *
 * @public
 */
export const defaultFieldDescribers: readonly FieldDescriber[] = [
  referenceDescriber,
  crossDatasetReferenceDescriber,
  globalDocumentReferenceDescriber,
  namedTypeDescriber,
  arrayDescriber,
  objectDescriber,
  fallbackDescriber,
]

/**
 * Describes a compiled schema type, recursing through arrays, inline objects
 * and portable-text blocks to collect every reference/reuse connection
 * underneath it — not just the ones declared at the top level of a type.
 */
export function walkFieldType(
  type: SchemaType,
  ctx: WalkContext,
  describers: readonly FieldDescriber[] = defaultFieldDescribers,
): DescribeResult {
  if (ctx.depth > ctx.maxDepth || ctx.seen.has(type)) return empty(type.name)

  const recurse: Recurse = (childType, segment) =>
    walkFieldType(
      childType,
      {
        ...ctx,
        path: childPath(ctx.path, segment),
        depth: ctx.depth + 1,
        seen: new Set(ctx.seen).add(type),
      },
      describers,
    )

  const describer = describers.find((d) => d.match(type, ctx)) ?? fallbackDescriber
  return describer.describe(type, ctx, recurse)
}

/** Builds the root {@link WalkContext} for a field named `fieldName`. */
export function rootWalkContext(
  fieldName: string,
  isRegistered: (name: string) => boolean,
  maxDepth: number = DEFAULT_MAX_DEPTH,
  selfName?: string,
  t: TranslateFn = defaultTranslate,
): WalkContext {
  return {path: fieldName, depth: 0, maxDepth, isRegistered, seen: new Set(), selfName, t}
}
