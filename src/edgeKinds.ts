import type {TranslateFn} from './i18n'
import {catchAllOf, type ThemeColor, type Tone} from './registry'
import type {GraphEdge, GraphEdgeKind} from './types'

/**
 * Everything the app needs to know about one kind of connection, in one
 * place — how it's drawn on the canvas, what the legend calls it, and what
 * the detail panel badges it as. The same registry shape as `NodeKindDef`,
 * for the same reason: a custom `FieldDescriber` that emits a link of its own
 * kind (a cross-dataset reference, a portable-text annotation) registers a def
 * here and the canvas, legend and detail panel pick it up with no UI changes.
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
  /**
   * Badge text for one edge in the detail panel. Defaults to the kind id,
   * which reads well for `reuses`; `reference` overrides it to call out a
   * weak reference, which the id alone can't say. `t` translates against this
   * plugin's namespace, so a custom edge kind localises the same way.
   */
  badgeLabel?: (edge: GraphEdge, t: TranslateFn) => string
  /**
   * Last resort. Any edge kind that isn't in the registry resolves here, so
   * the edge is still drawn.
   */
  isCatchAll?: boolean
}

/** @beta */
export const referenceKind: EdgeKindDef = {
  id: 'reference',
  label: 'Reference field',
  i18n: {label: 'edge-kind.reference.label'},
  color: {cssVar: '--card-badge-primary-bg-color', fallback: '#2276fc'},
  tone: 'primary',
  badgeLabel: (edge, t) =>
    edge.weak ? t('edge-kind.reference.badge-weak') : t('edge-kind.reference.badge'),
}

/**
 * A `crossDatasetReference` or `globalDocumentReference` — a pointer at a
 * document outside this dataset. One kind for both, because what a reader needs
 * from the line is the same in either case ("this leaves the dataset"); which
 * of the two it is, and the dataset or resource it names, is on the field row
 * the edge came from.
 *
 * Only drawn when the target type name also exists in this schema — see
 * `crossDatasetReferenceDescriber` — so the style has to say "not a local
 * reference" at a glance: its own colour, and dashed like `reuses`.
 *
 * @beta
 */
export const externalReferenceKind: EdgeKindDef = {
  id: 'external-reference',
  label: 'Reference to another dataset',
  i18n: {label: 'edge-kind.external-reference.label'},
  color: {cssVar: '--card-badge-suggest-bg-color', fallback: '#8f57ef'},
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
  color: {cssVar: '--card-badge-default-bg-color', fallback: '#999999'},
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

/**
 * Where an unrecognised edge kind resolves: the registry's `isCatchAll` kind,
 * or its last entry if none is flagged. Unlike a node kind, an edge kind isn't
 * chosen by a `classify` pass over the registry — it comes from whatever a
 * `FieldDescriber` put on its links, so an id no def covers is a describer and
 * a registry that disagree. Drawing that edge in the catch-all's style beats
 * crashing the canvas on a missing style.
 */
export function catchAllEdgeKind(kinds: readonly EdgeKindDef[] = defaultEdgeKinds): EdgeKindDef {
  return catchAllOf(kinds, reusesKind)
}

/** Badge text for one edge — see `EdgeKindDef.badgeLabel`. */
export function edgeBadgeLabel(edge: GraphEdge, kind: EdgeKindDef, t: TranslateFn): string {
  return kind.badgeLabel ? kind.badgeLabel(edge, t) : String(edge.kind)
}
