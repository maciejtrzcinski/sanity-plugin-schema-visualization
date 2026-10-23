import {warnOnce} from './compat'
import {defaultTranslate, type TranslateFn} from './i18n'
import type {NodeAnnotations} from './nodeAnnotations'
import type {FieldOptionSummary, GraphNode} from './types'

/**
 * Where a node badge is being painted. The card is 260px wide and repeats
 * itself across the canvas, so its badges stay terse and put the detail in a
 * tooltip; the detail panel has room to spell the same fact out.
 *
 * @public
 */
export type NodeBadgeSurface = 'card' | 'panel'

/**
 * What a node badge is handed besides the node itself: everything about it
 * that isn't in the schema.
 *
 * @public
 */
export interface NodeBadgeContext {
  /** Per-node data loaded after the graph was built — see {@link NodeAnnotations}. */
  annotations: NodeAnnotations
  /** Edges touching this node, in either direction. */
  connectionCount: number
  /** Health issues raised against this node, of any severity. */
  issueCount: number
  warningCount: number
  infoCount: number
  /** Whether the field list is showing. Always true on the panel, which never collapses. */
  expanded: boolean
  surface: NodeBadgeSurface
  /**
   * Translates against this plugin's namespace. Every badge's text goes
   * through it — a badge label is computed, not declared, so there is nothing
   * static to hang a resource key off — which is how a custom badge localises
   * the same way the built-ins do.
   */
  t: TranslateFn
}

/**
 * One badge on a type's card header, and in the detail panel's header.
 *
 * @public
 */
export interface NodeBadge extends FieldOptionSummary {
  /** Longer explanation, shown on hover. */
  tooltip?: string
  /**
   * `text` renders as a muted line rather than a chip — for a summary that
   * isn't a status, like the collapsed card's "3 fields · 2 connections".
   * Defaults to `badge`.
   */
  variant?: 'badge' | 'text'
}

/**
 * A badge plus the id of the def that produced it — a stable React key for the
 * surfaces that render the list.
 */
export interface CollectedNodeBadge extends NodeBadge {
  id: string
}

/**
 * One badge describing a *type* — the node-level counterpart of
 * {@link FieldBadgeDef}. Every def in the registry runs, in order, and each
 * contributes at most one badge, so a caller adds one with
 * `[...defaultNodeBadges, myBadge]` and drops or replaces exactly one built-in
 * by id.
 *
 * This registry is what keeps the card and its own height estimate in step:
 * `TypeNode` renders the list and `estimateNodeHeight` measures the same list,
 * rather than mirroring each other chip by chip.
 *
 * @public
 */
export interface NodeBadgeDef {
  /** Stable id, so a caller can drop or replace one built-in by name. */
  id: string
  /** The badge for this node, or undefined when it doesn't apply. */
  badge: (node: GraphNode, ctx: NodeBadgeContext) => NodeBadge | undefined
}

/** @beta */
export const systemBadge: NodeBadgeDef = {
  id: 'system',
  badge: (node, ctx) => (node.isSystem ? {label: ctx.t('node-badge.system')} : undefined),
}

/**
 * The card has no room for a deprecation reason, so it tucks it into a
 * tooltip; the panel says it outright.
 *
 * @beta
 */
export const deprecatedTypeBadge: NodeBadgeDef = {
  id: 'deprecated',
  badge: (node, ctx) => {
    if (!node.deprecated) return undefined
    if (ctx.surface === 'panel') {
      return {
        label: ctx.t('node-badge.deprecated-reason', {reason: node.deprecated}),
        tone: 'caution',
      }
    }
    return {label: ctx.t('node-badge.deprecated'), tone: 'caution', tooltip: node.deprecated}
  },
}

/**
 * Reads the `docCount` annotation — documents of this type in the Studio's
 * current perspective — and, when present, `publishedCount` and `draftCount`
 * beside it. All three are set only on the kinds that opted into
 * `countsDocuments`.
 *
 * Zero is worth flagging — a registered type nobody has created a document of
 * — while a missing count means nobody has pressed "Load doc counts" yet, so
 * the badge stays away rather than claiming zero.
 *
 * @beta
 */
export const docCountBadge: NodeBadgeDef = {
  id: 'doc-count',
  badge: (_node, ctx) => {
    const {docCount: count, publishedCount: published, draftCount: drafts} = ctx.annotations
    if (typeof count !== 'number') return undefined
    const tone = count === 0 ? 'caution' : 'default'
    const breakdown =
      typeof published === 'number' && typeof drafts === 'number'
        ? ctx.t('node-badge.doc-count.breakdown', {published, drafts})
        : undefined
    if (ctx.surface === 'panel') {
      const documents = ctx.t('node-badge.doc-count.panel', {count})
      return {
        label: breakdown
          ? ctx.t('node-badge.doc-count.with-breakdown', {documents, breakdown})
          : documents,
        tone,
      }
    }
    const tooltip = ctx.t('node-badge.doc-count.tooltip')
    return {
      label: ctx.t('node-badge.doc-count.card', {count}),
      tone,
      tooltip: breakdown ? `${breakdown}. ${tooltip}` : tooltip,
    }
  },
}

/**
 * A document-level `initialValue`. Panel only: on the card it would cost every
 * such type a badge row for something only worth knowing when you look closer.
 *
 * @beta
 */
export const initialValueTypeBadge: NodeBadgeDef = {
  id: 'initial-value',
  badge: (node, ctx) => {
    if (ctx.surface !== 'panel' || !node.initialValue) return undefined
    return {
      label:
        node.initialValue === 'function'
          ? ctx.t('node-badge.initial-value-computed')
          : ctx.t('node-badge.initial-value'),
      tone: 'default',
    }
  },
}

/**
 * What a collapsed card shows instead of its field list. Muted text rather
 * than a chip: it's a size, not a status.
 *
 * @beta
 */
export const fieldSummaryBadge: NodeBadgeDef = {
  id: 'field-summary',
  badge: (node, ctx) => {
    if (ctx.expanded || node.fields.length === 0) return undefined
    const fields = ctx.t('node-badge.field-summary.fields', {count: node.fields.length})
    if (ctx.connectionCount === 0) return {label: fields, variant: 'text'}
    return {
      label: ctx.t('node-badge.field-summary.with-connections', {
        fields,
        connections: ctx.t('node-badge.field-summary.connections', {
          count: ctx.connectionCount,
        }),
      }),
      variant: 'text',
    }
  },
}

/**
 * Order is the order badges appear in the card header and the panel.
 *
 * @public
 */
export const defaultNodeBadges: readonly NodeBadgeDef[] = [
  systemBadge,
  deprecatedTypeBadge,
  docCountBadge,
  initialValueTypeBadge,
  fieldSummaryBadge,
]

/**
 * Runs a badge registry over one node.
 *
 * A throwing badge is skipped for that node rather than taking the canvas
 * down with it, and reported once — these run per node per layout pass, so a
 * warning each would be unreadable. Same trade-off as `collectFieldBadges`.
 */
export function collectNodeBadges(
  node: GraphNode,
  ctx: Omit<NodeBadgeContext, 't'> & {t?: TranslateFn},
  badges: readonly NodeBadgeDef[] = defaultNodeBadges,
): CollectedNodeBadge[] {
  const context: NodeBadgeContext = {...ctx, t: ctx.t ?? defaultTranslate}
  const collected: CollectedNodeBadge[] = []

  for (const def of badges) {
    let badge: NodeBadge | undefined
    try {
      badge = def.badge(node, context)
    } catch {
      warnOnce(
        `node-badge:${def.id}`,
        `The \`${def.id}\` node badge threw on type \`${node.name}\`, so it is skipped there. ` +
          `Further failures from this badge are not reported.`,
      )
      continue
    }
    if (badge) collected.push({...badge, id: def.id})
  }

  return collected
}
