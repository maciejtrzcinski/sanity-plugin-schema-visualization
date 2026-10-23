import type {ResolvedConfig} from './config'
import {defaultTranslate, localized, type TranslateFn} from './i18n'
import {defaultNodeKinds, type NodeKindDef} from './kinds'
import {indexById, type Tone} from './registry'
import type {GraphNode, GraphNodeKind, SchemaGraph} from './types'

/** @public */
export type HealthSeverity = 'warning' | 'info'

/** @public */
export interface HealthIssue {
  id: string
  severity: HealthSeverity
  /** The id of the rule that raised this. Groups issues in the health panel. */
  category: string
  /** The type this issue is reported against. */
  nodeId: string
  fieldName?: string
  message: string
}

/**
 * How an issue of a given severity is painted, wherever one shows up — the
 * health panel's groups and cards, a node's issue badge, the detail panel.
 * Everything reads this, so a `severity: 'info'` rule can't look like a
 * warning in one place and a note in another.
 */
export function severityTone(severity: HealthSeverity): Tone {
  return severity === 'warning' ? 'caution' : 'primary'
}

/**
 * What a rule is handed — the graph, plus the aggregates every rule would otherwise recompute.
 *
 * @public
 */
export interface HealthContext {
  graph: SchemaGraph
  nodesById: Map<string, GraphNode>
  /** How many edges point *at* each node. */
  incomingCount: Map<string, number>
  /** Types the author registered — system types are never reported against. */
  customNodes: GraphNode[]
  /**
   * The kind registry in force, indexed by id. Rules read the capability flags
   * off it (`reportsOrphans`, `isReferenceTarget`) instead of testing
   * `node.kind` against a built-in id, so a custom kind registry keeps them
   * working. A kind id missing from the map is a node that outlived its kind —
   * treat it as opting into nothing.
   */
  kindById: Map<GraphNodeKind, NodeKindDef>
  /**
   * Live document counts by type name, in the Studio's current perspective.
   * Empty until someone presses "Load doc counts", so a missing entry means
   * "not known yet", not zero.
   */
  docCountByType: ReadonlyMap<string, number>
  /**
   * Translates against this plugin's namespace. Rules build their messages
   * through it — including the built-ins below — so a custom rule localises
   * exactly the way they do, and so a rule run outside a Studio still reads
   * as English.
   */
  t: TranslateFn
}

/**
 * What a rule returns; `id`, `category` and `severity` are filled in around it.
 *
 * @public
 */
export interface RawIssue {
  /** Distinguishes issues from the same rule. Combined with the rule id to form `HealthIssue.id`. */
  key: string
  nodeId: string
  fieldName?: string
  message: string
}

/** @public */
export interface HealthRule {
  /** Stable id, used as the issue category and as the health panel's grouping key. */
  id: string
  /** Heading for this rule's group in the health panel. */
  label: string
  /** Resource key for `label`, resolved against the Studio's locale — see `localized`. */
  i18n?: {label?: string}
  severity: HealthSeverity
  check: (ctx: HealthContext) => RawIssue[]
}

/** @beta */
export const orphanedTypeRule: HealthRule = {
  id: 'orphaned-type',
  label: 'Unused type',
  i18n: {label: 'health.rule.orphaned-type.label'},
  severity: 'warning',
  check: ({customNodes, incomingCount, kindById, t}) =>
    customNodes
      .filter(
        (node) =>
          kindById.get(node.kind)?.reportsOrphans && (incomingCount.get(node.id) ?? 0) === 0,
      )
      .map((node) => ({
        key: node.id,
        nodeId: node.id,
        message: t('health.rule.orphaned-type.message', {title: node.title}),
      })),
}

/** @beta */
export const referenceTargetRule: HealthRule = {
  id: 'reference-target',
  label: 'Reference targets non-document type',
  i18n: {label: 'health.rule.reference-target.label'},
  severity: 'warning',
  check: ({customNodes, nodesById, kindById, t}) => {
    // What a reference is allowed to point at, named for the message. With no
    // kind claiming `isReferenceTarget` there's nothing to judge against, so
    // the rule stands down rather than flagging every reference in the schema.
    const targetKinds = [...kindById.values()].filter((kind) => kind.isReferenceTarget)
    if (targetKinds.length === 0) return []
    const expected = targetKinds
      .map((kind) =>
        t('health.rule.reference-target.expected', {
          kind: localized(t, kind.i18n?.singular, kind.singular),
        }),
      )
      .join(t('health.rule.reference-target.expected-separator'))

    const issues: RawIssue[] = []
    for (const node of customNodes) {
      for (const field of node.fields) {
        for (const targetId of field.referencesTo) {
          const target = nodesById.get(targetId)
          if (!target || kindById.get(target.kind)?.isReferenceTarget) continue
          issues.push({
            key: `${node.id}:${field.name}:${targetId}`,
            nodeId: node.id,
            fieldName: field.name,
            message: t('health.rule.reference-target.message', {
              field: field.name,
              target: target.title,
              baseType: target.baseType,
              expected,
            }),
          })
        }
      }
    }
    return issues
  },
}

/** @beta */
export const deprecatedTargetRule: HealthRule = {
  id: 'deprecated-target',
  label: 'Uses a deprecated type',
  i18n: {label: 'health.rule.deprecated-target.label'},
  severity: 'warning',
  check: ({customNodes, nodesById, t}) => {
    const issues: RawIssue[] = []
    for (const node of customNodes) {
      for (const field of node.fields) {
        for (const targetId of [...field.referencesTo, ...field.reusesTypes]) {
          const target = nodesById.get(targetId)
          if (!target?.deprecated) continue
          issues.push({
            key: `${node.id}:${field.name}:${targetId}`,
            nodeId: node.id,
            fieldName: field.name,
            message: t('health.rule.deprecated-target.message', {
              field: field.name,
              target: target.title,
              reason: target.deprecated,
            }),
          })
        }
      }
    }
    return issues
  },
}

/** @beta */
export const requiredHiddenRule: HealthRule = {
  id: 'required-hidden',
  label: 'Required field is hidden',
  i18n: {label: 'health.rule.required-hidden.label'},
  severity: 'warning',
  check: ({customNodes, t}) =>
    customNodes.flatMap((node) =>
      node.fields
        .filter((field) => field.required && field.hidden)
        .map((field) => ({
          key: `${node.id}:${field.name}`,
          nodeId: node.id,
          fieldName: field.name,
          message: t('health.rule.required-hidden.message', {field: field.name}),
        })),
    ),
}

/**
 * More than one hop is where a preview gets expensive: every row in a document
 * list resolves its preview, and each reference crossed on the way is another
 * document to fetch and listen to.
 */
const MAX_PREVIEW_DEREFERENCES = 1

/** @beta */
export const previewDereferenceRule: HealthRule = {
  id: 'preview-dereference',
  label: 'Preview follows several references',
  i18n: {label: 'health.rule.preview-dereference.label'},
  severity: 'warning',
  check: ({customNodes, t}) =>
    customNodes.flatMap((node) =>
      (node.previewSelect ?? [])
        .filter((selection) => selection.dereferences > MAX_PREVIEW_DEREFERENCES)
        .map((selection) => ({
          key: `${node.id}:${selection.key}`,
          nodeId: node.id,
          message: t('health.rule.preview-dereference.message', {
            key: selection.key,
            path: selection.path,
            count: selection.dereferences,
          }),
        })),
    ),
}

/** @beta */
export const slugWithoutSourceRule: HealthRule = {
  id: 'slug-without-source',
  label: 'Slug has no source',
  i18n: {label: 'health.rule.slug-without-source.label'},
  severity: 'info',
  check: ({customNodes, t}) =>
    customNodes.flatMap((node) =>
      node.fields
        .filter((field) => field.intrinsicType === 'slug' && !field.source && !field.hidden)
        .map((field) => ({
          key: `${node.id}:${field.name}`,
          nodeId: node.id,
          fieldName: field.name,
          message: t('health.rule.slug-without-source.message', {field: field.name}),
        })),
    ),
}

/**
 * Only judged once counts are loaded, and only for the kinds that count
 * documents. Info rather than a warning: a new type is empty for a while.
 *
 * @beta
 */
export const emptyDocumentTypeRule: HealthRule = {
  id: 'empty-document-type',
  label: 'Document type has no documents',
  i18n: {label: 'health.rule.empty-document-type.label'},
  severity: 'info',
  check: ({customNodes, kindById, docCountByType, t}) =>
    customNodes
      .filter(
        (node) => kindById.get(node.kind)?.countsDocuments && docCountByType.get(node.name) === 0,
      )
      .map((node) => ({
        key: node.id,
        nodeId: node.id,
        message: t('health.rule.empty-document-type.message', {title: node.title}),
      })),
}

/** @beta */
export interface AttributePathsRuleOptions {
  /** The dataset's attribute limit: 2,000 on the Free plan, 10,000 on Growth and Enterprise. */
  limit?: number
  /** Warn once the estimate reaches this share of `limit`. */
  warnAt?: number
}

/**
 * Sanity caps the distinct attribute paths a dataset may hold, and the schema
 * decides how many its documents can write. The issue lands on the custom
 * document type contributing the most, since that's where restructuring pays.
 *
 * @beta
 */
export function createAttributePathsRule({
  limit = 10_000,
  warnAt = 0.8,
}: AttributePathsRuleOptions = {}): HealthRule {
  return {
    id: 'attribute-paths',
    label: 'Close to the attribute limit',
    i18n: {label: 'health.rule.attribute-paths.label'},
    severity: 'warning',
    check: ({graph, customNodes, t}) => {
      const estimate = graph.attributePaths
      if (!estimate || estimate.count < limit * warnAt) return []
      const heaviest = customNodes
        .filter((node) => node.attributePaths !== undefined)
        .sort((a, b) => (b.attributePaths ?? 0) - (a.attributePaths ?? 0))[0]
      if (!heaviest) return []

      const format = (n: number) => new Intl.NumberFormat().format(n)
      const values = {
        count: format(estimate.count),
        limit: format(limit),
        title: heaviest.title,
        own: format(heaviest.attributePaths ?? 0),
      }
      const parts = [
        estimate.capped
          ? t('health.rule.attribute-paths.message-capped', values)
          : t('health.rule.attribute-paths.message', values),
      ]
      if (estimate.recursiveTypes.length > 0) {
        parts.push(
          t('health.rule.attribute-paths.recursive', {types: estimate.recursiveTypes.join(', ')}),
        )
      }
      return [{key: 'total', nodeId: heaviest.id, message: parts.join(' ')}]
    },
  }
}

/** @beta */
export const attributePathsRule: HealthRule = createAttributePathsRule()

/**
 * Every rule here is a Sanity authoring gotcha, unambiguous dead code, or a
 * cost the Content Lake will bill or cap — things easy to miss by eye once a
 * schema has more than a handful of types.
 *
 * @public
 */
export const defaultHealthRules: readonly HealthRule[] = [
  orphanedTypeRule,
  referenceTargetRule,
  deprecatedTargetRule,
  requiredHiddenRule,
  previewDereferenceRule,
  slugWithoutSourceRule,
  attributePathsRule,
  emptyDocumentTypeRule,
]

/** The slice of the resolved plugin config that running the health rules reads. */
type HealthConfig = Pick<ResolvedConfig, 'healthRules' | 'kindById'>

const NO_DOC_COUNTS: ReadonlyMap<string, number> = new Map()

export function buildHealthContext(
  graph: SchemaGraph,
  kindById: HealthContext['kindById'] = indexById(defaultNodeKinds),
  t: TranslateFn = defaultTranslate,
  docCountByType: ReadonlyMap<string, number> = NO_DOC_COUNTS,
): HealthContext {
  const incomingCount = new Map<string, number>()
  for (const edge of graph.edges) {
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1)
  }
  return {
    graph,
    nodesById: new Map(graph.nodes.map((n) => [n.id, n])),
    incomingCount,
    customNodes: graph.nodes.filter((n) => !n.isSystem),
    kindById,
    docCountByType,
    t,
  }
}

/** @public */
export interface ComputeHealthIssuesOptions {
  /** Defaults to {@link defaultHealthRules}. */
  rules?: readonly HealthRule[]
  /** The kind registry the rules read capability flags from. Defaults to `defaultNodeKinds`. */
  kinds?: readonly NodeKindDef[]
  /** Defaults to the plugin's English bundle. */
  t?: TranslateFn
  /** Document counts by type name, for the rules that judge them. */
  docCountByType?: ReadonlyMap<string, number>
}

/**
 * Runs each rule over the graph and stamps its id and severity onto what comes
 * back. A rule that throws is skipped rather than taking the whole panel down
 * with it — a custom rule shouldn't be able to break the tool.
 *
 * @public
 */
export function computeHealthIssues(
  graph: SchemaGraph,
  {
    rules = defaultHealthRules,
    kinds = defaultNodeKinds,
    t = defaultTranslate,
    docCountByType,
  }: ComputeHealthIssuesOptions = {},
): HealthIssue[] {
  return runHealthRules(graph, {healthRules: rules, kindById: indexById(kinds)}, t, docCountByType)
}

/** {@link computeHealthIssues} for a caller that already holds a resolved config. */
export function runHealthRules(
  graph: SchemaGraph,
  config: HealthConfig,
  t: TranslateFn = defaultTranslate,
  docCountByType?: ReadonlyMap<string, number>,
): HealthIssue[] {
  const ctx = buildHealthContext(graph, config.kindById, t, docCountByType)
  const issues: HealthIssue[] = []

  for (const rule of config.healthRules) {
    let raw: RawIssue[]
    try {
      raw = rule.check(ctx)
    } catch {
      continue
    }
    for (const item of raw) {
      issues.push({
        id: `${rule.id}:${item.key}`,
        severity: rule.severity,
        category: rule.id,
        nodeId: item.nodeId,
        fieldName: item.fieldName,
        message: item.message,
      })
    }
  }

  return issues
}

/** Groups issues by rule, in the order the rules were given. */
export function groupIssuesByRule(
  issues: readonly HealthIssue[],
  rules: readonly HealthRule[],
): Array<{rule: HealthRule; issues: HealthIssue[]}> {
  return rules
    .map((rule) => ({rule, issues: issues.filter((i) => i.category === rule.id)}))
    .filter((group) => group.issues.length > 0)
}
