import {DocumentIcon} from '@sanity/icons/Document'
import {InlineElementIcon} from '@sanity/icons/InlineElement'
import {LinkIcon} from '@sanity/icons/Link'
import type {ComponentType} from 'react'
import {isDocumentSchemaType, isObjectSchemaType, type SchemaType} from 'sanity'

import {catchAllOf, type ThemeColor, type Tone} from './registry'
import type {GraphNodeKind} from './types'

/**
 * Everything the tool needs to know about one category of schema type, in one
 * place — so adding a kind means adding one entry.
 *
 * @public
 */
export interface NodeKindDef {
  id: GraphNodeKind
  /** Plural, for filter toggles and cluster bands: "Documents". */
  label: string
  /** Singular, mid-sentence: "document". */
  singular: string
  /** Heading on the canvas cluster band. */
  clusterLabel: string
  /**
   * Resource keys for the three labels above, resolved against the Studio's
   * locale — see `localized`. Each is optional: a kind without one
   * shows the English string written beside it.
   */
  i18n?: {label?: string; singular?: string; clusterLabel?: string}
  /** Short, stable token used in shareable URLs. Changing one breaks old links. */
  urlParam: string
  /** Sanity UI tone for badges and cards. */
  tone: Tone
  /** Colour for canvas chrome that can't take a tone — see {@link ThemeColor}. */
  color: ThemeColor
  icon: ComponentType
  /** Decides whether a compiled schema type belongs to this kind. */
  classify: (type: SchemaType) => boolean
  /**
   * Badge text for a node of this kind. Defaults to the kind id, which reads
   * well for `document`/`object`; the catch-all kind overrides it to name the
   * concrete type instead ("array", "string") since "other" says nothing.
   */
  baseTypeOf?: (type: SchemaType) => string

  // Capability flags. Behaviour is declared per kind rather than keyed off the
  // built-in ids, so a consumer who replaces `kinds` keeps it on their own
  // categories.

  /** Live document counts are fetched for these types and badged on their cards. */
  countsDocuments?: boolean
  /** `orphanedTypeRule` reports types of this kind that nothing else references. */
  reportsOrphans?: boolean
  /** A `reference` field is expected to point at a type of this kind. */
  isReferenceTarget?: boolean
  /**
   * The detail panel offers a link into the rest of the Studio for types of
   * this kind — Sanity's `create` intent, which opens the type's list in
   * Structure with a new document. Only meaningful for kinds whose types
   * really are documents; an object type has nothing to create. Even then the
   * link appears only where the Studio's own create menu offers the type and
   * the user may create one.
   */
  createsDocuments?: boolean
  /**
   * Last resort. `classify` must match everything, and any kind id that isn't
   * in the registry resolves here, so the node still renders.
   */
  isCatchAll?: boolean
}

/** @beta */
export const documentKind: NodeKindDef = {
  id: 'document',
  label: 'Documents',
  singular: 'document',
  clusterLabel: 'Documents',
  i18n: {
    label: 'kind.document.label',
    singular: 'kind.document.singular',
    clusterLabel: 'kind.document.cluster',
  },
  urlParam: 'doc',
  tone: 'primary',
  color: {cssVar: '--card-badge-primary-bg-color', fallback: '#2276fc'},
  icon: DocumentIcon,
  classify: isDocumentSchemaType,
  countsDocuments: true,
  isReferenceTarget: true,
  createsDocuments: true,
}

/** @beta */
export const objectKind: NodeKindDef = {
  id: 'object',
  label: 'Objects',
  singular: 'object',
  clusterLabel: 'Objects',
  i18n: {
    label: 'kind.object.label',
    singular: 'kind.object.singular',
    clusterLabel: 'kind.object.cluster',
  },
  urlParam: 'obj',
  tone: 'positive',
  color: {cssVar: '--card-badge-positive-bg-color', fallback: '#2a9d5c'},
  icon: InlineElementIcon,
  classify: isObjectSchemaType,
  reportsOrphans: true,
}

/**
 * Catch-all: arrays, primitives and aliases. Must classify everything.
 *
 * @beta
 */
export const otherKind: NodeKindDef = {
  id: 'other',
  label: 'Fields',
  singular: 'field',
  clusterLabel: 'System & primitive types',
  i18n: {
    label: 'kind.other.label',
    singular: 'kind.other.singular',
    clusterLabel: 'kind.other.cluster',
  },
  urlParam: 'other',
  tone: 'default',
  color: {cssVar: '--card-badge-default-bg-color', fallback: '#999999'},
  icon: LinkIcon,
  classify: () => true,
  baseTypeOf: (type) => type.jsonType,
  isCatchAll: true,
}

/**
 * Order is significant twice over: `classifyKind` takes the first match, so
 * the catch-all must come last; and it's the order kinds appear in filter
 * menus and cluster bands.
 *
 * @public
 */
export const defaultNodeKinds: readonly NodeKindDef[] = [documentKind, objectKind, otherKind]

/**
 * Where an unrecognised kind resolves: the registry's `isCatchAll` kind, or
 * its last entry (which is where the catch-all belongs) if none is flagged.
 * A node can outlive the kind that classified it — a stale URL, a cached
 * preference, a config change between sessions — and rendering it as the
 * catch-all beats crashing the canvas.
 */
export function catchAllKind(kinds: readonly NodeKindDef[] = defaultNodeKinds): NodeKindDef {
  return catchAllOf(kinds, otherKind)
}

/**
 * Ids of every kind that opts into one capability, as a set — the membership
 * test the per-node code paths do, hoisted out of the render loop.
 */
export function kindIdsWith(
  kinds: readonly NodeKindDef[],
  flag: 'countsDocuments' | 'reportsOrphans' | 'isReferenceTarget' | 'createsDocuments',
): ReadonlySet<GraphNodeKind> {
  return new Set(kinds.filter((kind) => kind[flag]).map((kind) => kind.id))
}

/**
 * First kind whose `classify` claims the type; falls back to the catch-all.
 */
export function classifyKind(
  type: SchemaType,
  kinds: readonly NodeKindDef[] = defaultNodeKinds,
): NodeKindDef {
  return kinds.find((k) => k.classify(type)) ?? catchAllKind(kinds)
}

/** Badge text for a node of this kind — see `NodeKindDef.baseTypeOf`. */
export function baseTypeFor(type: SchemaType, kind: NodeKindDef): string {
  return kind.baseTypeOf ? kind.baseTypeOf(type) : kind.id
}
