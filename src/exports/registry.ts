/*
 * `@maciejtrzcinski/sanity-plugin-schema-visualization/registry` — the extensibility surface
 * `docs/extending.md` documents: the registry types and their defaults, the
 * ordering helpers that edit a default, the graph model, and the entry points
 * that build a graph, run the health rules or export a graph from code.
 *
 * It is a subpath rather than part of the root because the root is what a
 * Studio runs at boot. Nothing here is needed to *install* the plugin.
 *
 * Every export carries a release tag on its own declaration:
 *
 *   `@public` — the supported API. Breaking one takes a major.
 *
 *   `@beta` — the individual built-in entries (reach them through the default
 *   arrays and the ordering helpers, by id) and the code exports. Free to
 *   change in a minor, so pin the version if you depend on one.
 *
 * Plumbing the tool uses internally stays internal; `src/index.test.ts` pins
 * this list so a new export shows up in review.
 */
export {
  attributePathsRule,
  computeHealthIssues,
  createAttributePathsRule,
  defaultHealthRules,
  deprecatedTargetRule,
  emptyDocumentTypeRule,
  orphanedTypeRule,
  previewDereferenceRule,
  referenceTargetRule,
  requiredHiddenRule,
  slugWithoutSourceRule,
} from '../healthRules'
export type {
  AttributePathsRuleOptions,
  ComputeHealthIssuesOptions,
  HealthContext,
  HealthIssue,
  HealthRule,
  HealthSeverity,
  RawIssue,
} from '../healthRules'
export {enUSResources} from '../i18n'
export type {TranslateFn} from '../i18n'
export type {SchemaVisualizationOptions} from '../config'
export {defaultEdgeKinds, externalReferenceKind, referenceKind, reusesKind} from '../edgeKinds'
export type {EdgeKindDef} from '../edgeKinds'
export {
  defaultFieldBadges,
  deprecatedBadge,
  hiddenBadge,
  hotspotBadge,
  initialValueBadge,
  layoutBadge,
  listBadge,
  readOnlyBadge,
  requiredBadge,
  sourceBadge,
  validationBadge,
} from '../fieldBadges'
export type {FieldBadgeContext, FieldBadgeDef} from '../fieldBadges'
export {
  arrayDescriber,
  crossDatasetReferenceDescriber,
  defaultFieldDescribers,
  fallbackDescriber,
  globalDocumentReferenceDescriber,
  namedTypeDescriber,
  objectDescriber,
  referenceDescriber,
} from '../fieldWalker'
export type {
  DescribeResult,
  FieldDescriber,
  FieldDescriberRule,
  Recurse,
  WalkContext,
} from '../fieldWalker'
export {
  connectivityFilter,
  createDefaultFilters,
  createKindsFilter,
  deprecatedFilter,
  healthFilter,
  systemTypesFilter,
} from '../filters'
export type {FilterContext, FilterDef, FilterOption, FilterValue, FilterValues} from '../filters'
export {GRAPH_JSON_VERSION, graphToJson, graphToMermaid} from '../exportModel'
export type {GraphJson, MermaidOptions} from '../exportModel'
export {defaultNodeKinds, documentKind, objectKind, otherKind} from '../kinds'
export type {NodeKindDef} from '../kinds'
export type {NodeAnnotations} from '../nodeAnnotations'
export {
  defaultNodeBadges,
  deprecatedTypeBadge,
  docCountBadge,
  fieldSummaryBadge,
  initialValueTypeBadge,
  systemBadge,
} from '../nodeBadges'
export type {NodeBadge, NodeBadgeContext, NodeBadgeDef, NodeBadgeSurface} from '../nodeBadges'
export {insertBefore, replaceById, without} from '../registry'
export type {Identified, ThemeColor, Tone} from '../registry'
export {schemaToGraph} from '../schemaToGraph'
export type {SchemaToGraphOptions} from '../schemaToGraph'
export type {
  AttributePathEstimate,
  CollectedFieldOption,
  FieldConstraint,
  FieldGroupSummary,
  FieldLink,
  FieldOptionSummary,
  FieldsetSummary,
  FieldSummary,
  GraphEdge,
  GraphEdgeKind,
  GraphNode,
  GraphNodeKind,
  PreviewSelection,
  SchemaGraph,
} from '../types'
