import type {TranslateFn} from './i18n'
import {catchAllOf, type ThemeColor, type Tone} from './registry'
import type {GraphEdge, GraphEdgeKind} from './types'

/**
 * One kind of connection: how it's drawn, what the legend calls it, how the
 * detail panel badges it.
 *
 * @public
 */
export interface EdgeKindDef {
  id: GraphEdgeKind
  /** Legend entry: "Reference field". */
  label: string
  /** Resource key for `label`, resolved against the Studio's locale — see `localized`. */
  i18n?: {label?: string}
  /** Line and arrowhead colour — see {@link ThemeColor}. */
  color: ThemeColor
  /** SVG `stroke-dasharray`, or undefined for a solid line. */
  dash?: string
  /** Sanity UI tone for the detail panel's connection badge. */
  tone: Tone
  /** Badge text for one edge in the detail panel. Defaults to the kind id. */
  badgeLabel?: (edge: GraphEdge, t: TranslateFn) => string
  /** Any edge kind not in the registry resolves here. */
  isCatchAll?: boolean
}

/** @beta */
export const referenceKind: EdgeKindDef = {
  id: 'reference',
  label: 'Reference field',
  i18n: {label: 'edge-kind.reference.label'},
  color: {cssVar: '--card-badge-primary-dot-color', fallback: '#2276fc'},
  tone: 'primary',
  badgeLabel: (edge, t) =>
    edge.weak ? t('edge-kind.reference.badge-weak') : t('edge-kind.reference.badge'),
}

/**
 * A `crossDatasetReference` or `globalDocumentReference`. Only drawn when the
 * target type name also exists in this schema.
 *
 * @beta
 */
export const externalReferenceKind: EdgeKindDef = {
  id: 'external-reference',
  label: 'Reference to another dataset',
  i18n: {label: 'edge-kind.external-reference.label'},
  color: {cssVar: '--card-badge-suggest-dot-color', fallback: '#8f57ef'},
  dash: '6 3',
  tone: 'suggest',
  badgeLabel: (edge, t) =>
    edge.weak
      ? t('edge-kind.external-reference.badge-weak')
      : t('edge-kind.external-reference.badge'),
}

/** @beta */
export const reusesKind: EdgeKindDef = {
  id: 'reuses',
  label: 'Reuses named type',
  i18n: {label: 'edge-kind.reuses.label'},
  color: {cssVar: '--card-badge-default-dot-color', fallback: '#999999'},
  dash: '4 3',
  tone: 'default',
  isCatchAll: true,
}

/**
 * Order is the order edge kinds appear in the legend.
 *
 * @public
 */
export const defaultEdgeKinds: readonly EdgeKindDef[] = [
  referenceKind,
  externalReferenceKind,
  reusesKind,
]

/** The registry's `isCatchAll` kind, or its last entry. */
export function catchAllEdgeKind(kinds: readonly EdgeKindDef[] = defaultEdgeKinds): EdgeKindDef {
  return catchAllOf(kinds, reusesKind)
}

export function edgeBadgeLabel(edge: GraphEdge, kind: EdgeKindDef, t: TranslateFn): string {
  return kind.badgeLabel ? kind.badgeLabel(edge, t) : String(edge.kind)
}
