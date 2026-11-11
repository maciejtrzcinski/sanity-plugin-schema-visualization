// The extensibility surface. A subpath because the root runs at every Studio's
// boot. `@public` breaks only in a major; `@beta` may change in a minor.
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
export {fromSanityLint} from '../sanityLint'
export type {
  SanityLintField,
  SanityLintFinding,
  SanityLintRule,
  SanityLintRuleContext,
  SanityLintType,
} from '../sanityLint'
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
