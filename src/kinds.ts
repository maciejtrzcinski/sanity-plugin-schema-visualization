import {DocumentIcon} from '@sanity/icons/Document'
import {InlineElementIcon} from '@sanity/icons/InlineElement'
import {LinkIcon} from '@sanity/icons/Link'
import type {ComponentType} from 'react'
import {isDocumentSchemaType, isObjectSchemaType, type SchemaType} from 'sanity'

import {catchAllOf, guarded, type ThemeColor, type Tone} from './registry'
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
  /** Resource keys for the labels above — see `localized`. */
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
  /** Badge text for a node of this kind. Defaults to the kind id. */
  baseTypeOf?: (type: SchemaType) => string

  /** Live document counts are fetched for these types and badged on their cards. */
  countsDocuments?: boolean
  /** `orphanedTypeRule` reports types of this kind that nothing else references. */
  reportsOrphans?: boolean
  /** A `reference` field is expected to point at a type of this kind. */
  isReferenceTarget?: boolean
  /** The detail panel offers a "New <type>" link, where the Studio's own create menu does too. */
  createsDocuments?: boolean
  /** Last resort: `classify` must match everything, and unknown kind ids resolve here. */
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
  color: {cssVar: '--card-badge-primary-dot-color', fallback: '#2276fc'},
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
  color: {cssVar: '--card-badge-positive-dot-color', fallback: '#2a9d5c'},
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
  color: {cssVar: '--card-badge-default-dot-color', fallback: '#999999'},
  icon: LinkIcon,
  classify: () => true,
  baseTypeOf: (type) => type.jsonType,
  isCatchAll: true,
}

/**
 * First match wins, so the catch-all goes last. Also the order of filter menus
 * and cluster bands.
 *
 * @public
 */
export const defaultNodeKinds: readonly NodeKindDef[] = [documentKind, objectKind, otherKind]

/** The `isCatchAll` kind, or the last entry. A node can outlive its kind (a stale URL). */
export function catchAllKind(kinds: readonly NodeKindDef[] = defaultNodeKinds): NodeKindDef {
  return catchAllOf(kinds, otherKind)
}

export function kindIdsWith(
  kinds: readonly NodeKindDef[],
  flag: 'countsDocuments' | 'reportsOrphans' | 'isReferenceTarget' | 'createsDocuments',
): ReadonlySet<GraphNodeKind> {
  return new Set(kinds.filter((kind) => kind[flag]).map((kind) => kind.id))
}

export function classifyKind(
  type: SchemaType,
  kinds: readonly NodeKindDef[] = defaultNodeKinds,
): NodeKindDef {
  return (
    kinds.find((k) =>
      guarded(
        () => k.classify(type),
        false,
        () => ({
          registry: 'kind',
          id: k.id,
          callback: 'classify',
          subject: `type \`${type.name}\``,
          outcome: 'the next kind is tried',
        }),
      ),
    ) ?? catchAllKind(kinds)
  )
}

export function baseTypeFor(type: SchemaType, kind: NodeKindDef): string {
  return guarded(
    () => kind.baseTypeOf?.(type) ?? kind.id,
    kind.id,
    () => ({
      registry: 'kind',
      id: kind.id,
      callback: 'baseTypeOf',
      subject: `type \`${type.name}\``,
      outcome: `its base type reads \`${kind.id}\``,
    }),
  )
}
