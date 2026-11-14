import {defaultTranslate, type TranslateFn} from './i18n'
import type {NodeAnnotations} from './nodeAnnotations'
import {guarded} from './registry'
import type {FieldOptionSummary, GraphNode} from './types'

/**
 * Where a node badge is painted: a terse card, or the roomier detail panel.
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
  /** Translates against this plugin's namespace. */
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
  /** `text` renders a muted line rather than a chip. Defaults to `badge`. */
  variant?: 'badge' | 'text'
}

export interface CollectedNodeBadge extends NodeBadge {
  id: string
}

/**
 * One badge describing a type. Every def runs, in order, and contributes at
 * most one badge.
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

/** @beta */
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
 * Reads the `docCount`, `publishedCount` and `draftCount` annotations. Zero is
 * flagged; a missing count means not loaded yet.
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
 * A document-level `initialValue`. Panel only.
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

/** @beta */
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

/** A throwing badge is skipped for that node and reported once. */
export function collectNodeBadges(
  node: GraphNode,
  ctx: Omit<NodeBadgeContext, 't'> & {t?: TranslateFn},
  badges: readonly NodeBadgeDef[] = defaultNodeBadges,
): CollectedNodeBadge[] {
  const context: NodeBadgeContext = {...ctx, t: ctx.t ?? defaultTranslate}
  const collected: CollectedNodeBadge[] = []

  for (const def of badges) {
    const badge = guarded(
      () => def.badge(node, context),
      undefined,
      () => ({
        registry: 'node badge',
        id: def.id,
        subject: `type \`${node.name}\``,
        outcome: 'it is skipped there',
      }),
    )
    if (badge) collected.push({...badge, id: def.id})
  }

  return collected
}
