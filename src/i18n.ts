/*
 * Every string this plugin puts on screen, in one namespace, with an English
 * bundle the Studio registers through the plugin's `i18n.bundles` option.
 * The namespace itself lives in `i18nNamespace.ts`, so the entry point can
 * name it without dragging these resources into the Studio's boot chunk.
 *
 * Two mechanisms feed off this file, because the strings come from two very
 * different places:
 *
 *   - **Registry labels are static**, so each def names its resource key in an
 *     `i18n` object (`documentKind.i18n.label`) and keeps its English `label`
 *     as the fallback. {@link localized} resolves one.
 *   - **Registry-produced sentences are computed** — a health rule's message
 *     names a field and a type, a badge counts things — so every registry
 *     callback that returns a string is handed a `t` on its context and calls
 *     it itself. That is what lets a *custom* rule or badge localise exactly
 *     the way the built-ins do.
 *
 * Both paths run outside the Studio too (`schemaToGraph`, `computeHealthIssues`
 * are usable headlessly), so {@link defaultTranslate} resolves keys against the
 * English resources below rather than requiring a Studio locale context.
 */

/**
 * A translator function: a resource key plus the values interpolated into it.
 * Structurally the slice of Sanity's (i18next's) `t` this plugin uses, so the
 * Studio's own `t` satisfies it — see `useTranslate`.
 *
 * `values.count` picks between a key's `_one` and `_other` forms, and
 * `values.defaultValue` is the string to use when the key is missing, both as
 * i18next defines them.
 *
 * @public
 */
export type TranslateFn = (key: string, values?: Record<string, unknown>) => string

/**
 * The English resource bundle — the single source of every default string, and
 * the fallback the plugin translates against when it runs outside a Studio.
 *
 * Keys are namespaced by where the string appears (`toolbar.`, `detail.`) or by
 * the registry that produces it (`health.rule.`, `node-badge.`). A key with
 * `_one`/`_other` variants is chosen by the `count` value passed with it.
 *
 * @public
 */
export const enUSResources: Record<string, string> = {
  'tool.error-title': 'Couldn’t visualize this schema',

  'toolbar.search-placeholder': 'Search types or fields…',
  'toolbar.focus.all': 'All types & connections',
  'toolbar.focus.only': 'Only {{title}} — {{kind}}',
  'toolbar.focus.only-system': 'Only {{title}} — {{kind}}, system',
  'toolbar.filter': 'Filter',
  'toolbar.filter-active': 'Filter ({{count}})',
  'toolbar.clear-filters': 'Clear filters',
  'toolbar.view': 'View',
  'toolbar.compact-nodes': 'Compact nodes',
  'toolbar.layout-direction': 'Layout direction',
  'toolbar.direction-horizontal': 'Horizontal',
  'toolbar.direction-vertical': 'Vertical',
  'toolbar.relayout': 'Re-layout',
  'toolbar.health': 'Health',
  'toolbar.health-active': 'Health ({{count}})',
  'toolbar.copy-link': 'Copy link',
  'toolbar.copy-link-success': 'Link copied',
  'toolbar.copy-link-success-description': 'Reproduces the current focus, filters and search.',
  'toolbar.copy-link-error': 'Could not copy link',
  'toolbar.doc-counts-load': 'Load doc counts',
  'toolbar.doc-counts-refresh': 'Refresh doc counts',
  'toolbar.doc-counts-retry': 'Retry doc counts',
  'toolbar.doc-counts-loaded': 'Loaded {{when}}',
  'document-counts.error-title': 'Could not load document counts',
  'document-counts.error-unknown': 'Failed to load document counts',
  'toolbar.stats.kind': '{{count}} {{label}}',
  'toolbar.stats.connections_one': '{{count}} connection',
  'toolbar.stats.connections_other': '{{count}} connections',
  'toolbar.stats.system': '{{count}} system',
  'toolbar.beta': 'Beta',
  'toolbar.beta-tooltip':
    "A community plugin, not an official Sanity one. It's in beta, so things may still change. Found a bug or have feedback? Click to open an issue on GitHub.",

  'relative-time.just-now': 'just now',
  'relative-time.minutes': '{{count}}m ago',
  'relative-time.hours': '{{count}}h ago',
  'relative-time.days': '{{count}}d ago',

  'canvas.layouting': 'Updating layout…',
  'canvas.export-svg': 'Export SVG',
  'canvas.export-mermaid': 'Export Mermaid',
  'canvas.export-json': 'Export JSON',
  'canvas.export-error': 'Could not export the graph',
  'legend.title': 'Legend',
  'legend.cluster-hint': 'Dashed box groups types by kind',

  'card.expand-fields': 'Expand fields',
  'card.collapse-fields': 'Collapse fields',
  'card.warnings_one': '{{count}} warning',
  'card.warnings_other': '{{count}} warnings',
  'card.notes_one': '{{count}} note',
  'card.notes_other': '{{count}} notes',
  'card.more-fields_one': '+{{count}} more field — open the details panel',
  'card.more-fields_other': '+{{count}} more fields — open the details panel',
  'card.leaf-note': 'no fields — primitive/alias type',

  'detail.close': 'Close details',
  'detail.focus-on': 'Showing only this type — clear',
  'detail.focus-off': 'Show only this type’s connections',
  'detail.create-document': 'New {{title}}',
  'detail.issues': 'Health issues ({{count}})',
  'detail.fields': 'Fields ({{count}})',
  'detail.no-fields': 'No fields.',
  'detail.outgoing': 'Outgoing connections ({{count}})',
  'detail.incoming': 'Incoming connections ({{count}})',
  'detail.no-connections': 'None.',
  'detail.via': 'via {{path}}',
  'detail.via-field': 'field "{{name}}"',
  'detail.groups': 'Groups: {{groups}}',
  'detail.group-default': '{{title}} (default)',
  'detail.field-groups': 'group: {{groups}}',
  'detail.field-fieldset': 'fieldset: {{fieldset}}',
  'detail.list-separator': ', ',
  'detail.meta-separator': ' · ',

  'health.title': 'Schema health',
  'health.close': 'Close health panel',
  'health.empty': 'No issues found — nice and tidy.',
  'health.rule.orphaned-type.label': 'Unused type',
  'health.rule.orphaned-type.message':
    '"{{title}}" is never referenced or reused by any other type in the schema.',
  'health.rule.reference-target.label': 'Reference targets non-document type',
  'health.rule.reference-target.message':
    '"{{field}}" references "{{target}}", a {{baseType}} type — references should target {{expected}}.',
  'health.rule.reference-target.expected': '{{kind}} types',
  'health.rule.reference-target.expected-separator': ' or ',
  'health.rule.deprecated-target.label': 'Uses a deprecated type',
  'health.rule.deprecated-target.message':
    '"{{field}}" uses "{{target}}", which is deprecated: {{reason}}',
  'health.rule.required-hidden.label': 'Required field is hidden',
  'health.rule.required-hidden.message':
    '"{{field}}" is required but unconditionally hidden — it can never be filled in through the Studio UI.',
  'health.rule.preview-dereference.label': 'Preview follows several references',
  'health.rule.preview-dereference.message':
    'The preview’s "{{key}}" reads "{{path}}", crossing {{count}} references — every row in a document list fetches and listens to each document on the way.',
  'health.rule.slug-without-source.label': 'Slug has no source',
  'health.rule.slug-without-source.message':
    '"{{field}}" is a slug with no `options.source`, so editors can’t generate it and type it by hand.',
  'health.rule.attribute-paths.label': 'Close to the attribute limit',
  'health.rule.attribute-paths.message':
    'Documents in this schema can write about {{count}} distinct attribute paths, against a dataset limit of {{limit}}. "{{title}}" alone accounts for about {{own}}.',
  'health.rule.attribute-paths.message-capped':
    'Documents in this schema can write more than {{count}} distinct attribute paths, against a dataset limit of {{limit}}. "{{title}}" alone accounts for about {{own}}.',
  'health.rule.attribute-paths.recursive':
    'Recursive types ({{types}}) add another set of paths with every level of nesting.',
  'health.rule.empty-document-type.label': 'Document type has no documents',
  'health.rule.empty-document-type.message':
    'No "{{title}}" documents exist in the current perspective.',

  'kind.document.label': 'Documents',
  'kind.document.singular': 'document',
  'kind.document.cluster': 'Documents',
  'kind.object.label': 'Objects',
  'kind.object.singular': 'object',
  'kind.object.cluster': 'Objects',
  'kind.other.label': 'Fields',
  'kind.other.singular': 'field',
  'kind.other.cluster': 'System & primitive types',

  'edge-kind.reference.label': 'Reference field',
  'edge-kind.reference.badge': 'reference',
  'edge-kind.reference.badge-weak': 'weak ref',
  'edge-kind.external-reference.label': 'Reference to another dataset',
  'edge-kind.external-reference.badge': 'external ref',
  'edge-kind.external-reference.badge-weak': 'weak external ref',
  'edge-kind.reuses.label': 'Reuses named type',

  'filter.kinds.label': 'Kind',
  'filter.system.label': 'System types',
  'filter.system.exclude': 'Exclude system types',
  'filter.system.include': 'Include system types',
  'filter.system.summary': 'system types hidden',
  'filter.health.label': 'Health status',
  'filter.health.all': 'All types',
  'filter.health.issues': 'Only with issues',
  'filter.health.warnings': 'Only with warnings',
  'filter.health.clean': 'Only clean',
  'filter.connectivity.label': 'Connectivity',
  'filter.connectivity.all': 'All types',
  'filter.connectivity.connected': 'Only connected',
  'filter.connectivity.orphan': 'Only orphans (no connections)',
  'filter.deprecated.label': 'Deprecated',
  'filter.deprecated.all': 'All types',
  'filter.deprecated.only': 'Only deprecated',
  'filter.deprecated.only-fields': 'Only with deprecated fields',
  'filter.deprecated.hide': 'Hide deprecated',

  'node-badge.system': 'system',
  'node-badge.deprecated': 'deprecated',
  'node-badge.deprecated-reason': 'deprecated: {{reason}}',
  'node-badge.doc-count.card_one': '{{count}} doc',
  'node-badge.doc-count.card_other': '{{count}} docs',
  'node-badge.doc-count.panel_one': '{{count}} document',
  'node-badge.doc-count.panel_other': '{{count}} documents',
  'node-badge.doc-count.breakdown': '{{published}} published · {{drafts}} drafts',
  'node-badge.doc-count.with-breakdown': '{{documents}} — {{breakdown}}',
  'node-badge.doc-count.tooltip':
    'Documents in the current perspective — a document counts once, however many versions it has',
  'node-badge.initial-value': 'initial value',
  'node-badge.initial-value-computed': 'initial value: computed',
  'node-badge.field-summary.fields_one': '{{count}} field',
  'node-badge.field-summary.fields_other': '{{count}} fields',
  'node-badge.field-summary.connections_one': '{{count}} connection',
  'node-badge.field-summary.connections_other': '{{count}} connections',
  'node-badge.field-summary.with-connections': '{{fields}} · {{connections}}',

  'field-badge.required': 'required',
  'field-badge.read-only': 'read-only',
  'field-badge.hidden': 'hidden',
  'field-badge.conditionally-hidden': 'conditionally hidden',
  'field-badge.deprecated': 'deprecated',
  'field-badge.list': 'list ({{count}})',
  'field-badge.layout': 'layout: {{layout}}',
  'field-badge.source': 'source: {{source}}',
  'field-badge.source-computed': 'source: computed',
  'field-badge.hotspot': 'hotspot',
  'field-badge.initial-value': 'initial value',
  'field-badge.initial-value-computed': 'initial value: computed',
  'field-badge.initial-value-literal': 'initial: {{value}}',
  'field-badge.validation.min': 'min {{value}}',
  'field-badge.validation.max': 'max {{value}}',
  'field-badge.validation.length': 'length {{value}}',
  'field-badge.validation.regex': 'matches {{value}}',
  'field-badge.validation.regex-inverted': 'must not match {{value}}',
  'field-badge.validation.integer': 'integer',
  'field-badge.validation.precision': 'precision {{value}}',
  'field-badge.validation.less-than': '< {{value}}',
  'field-badge.validation.greater-than': '> {{value}}',
  'field-badge.validation.unique': 'unique',
  'field-badge.validation.uri': 'URL',
  'field-badge.validation.email': 'email',
  'field-badge.validation.asset-required': 'asset required',
  'field-badge.validation.custom': 'custom',
  'field-badge.validation.field': 'field {{path}}',
  'field-badge.validation.as-warning': '{{rule}} (warning)',
  'field-badge.validation.as-info': '{{rule}} (info)',
  'field-badge.validation.separator': ' · ',

  'field.reference-label': 'reference → {{targets}}',
  'field.cross-dataset-reference-label': 'cross-dataset reference → {{targets}}',
  'field.global-document-reference-label': 'global document reference → {{targets}}',
  'field.dataset': 'dataset: {{dataset}}',
  'field.resource': '{{resourceType}}: {{resourceId}}',
  'field.unknown-target': '?',
  'field.weak-ref': 'weak ref',
  'field.filtered': 'filtered',
  'field.disable-new': 'no create',
  'field.named-type-label': '{{name}} ({{jsonType}})',
  'field.array-label': 'array of {{members}}',
}

/**
 * Fills `{{placeholders}}` from `values`; an unknown one is left alone — which
 * is also what makes a second pass over an already-interpolated string a no-op.
 */
export function interpolate(template: string, values?: Record<string, unknown>): string {
  if (!values) return template
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  )
}

/**
 * The English template for a key, honouring the `_one`/`_other` split when a
 * `count` is given — the same resolution i18next does, so a key works the same
 * whether the Studio's `t` or {@link defaultTranslate} resolves it.
 */
export function englishTemplate(key: string, values?: Record<string, unknown>): string | undefined {
  const count = values?.count
  if (typeof count === 'number') {
    const plural = enUSResources[`${key}${count === 1 ? '_one' : '_other'}`]
    if (plural !== undefined) return plural
  }
  return enUSResources[key]
}

/**
 * Translates against the English bundle. The `t` every core entry point falls
 * back to, so `schemaToGraph`, `computeHealthIssues` and the registries stay
 * usable — and readable — outside a Studio, where there is no locale context
 * to ask.
 */
export const defaultTranslate: TranslateFn = (key, values) => {
  const fallback = typeof values?.defaultValue === 'string' ? values.defaultValue : key
  return interpolate(englishTemplate(key, values) ?? fallback, values)
}

/**
 * One registry def's label under the current locale: the resource its `i18n`
 * key names, falling back to the English string written on the def itself. A
 * def with no `i18n` key — every def a consumer writes, until they add one —
 * keeps its `label` verbatim.
 *
 * The one subtlety is what happens to a def built by spreading a built-in,
 * which is how most custom kinds are written:
 *
 * ```ts
 * const collectionKind = {...documentKind, id: 'collection', label: 'Collections'}
 * ```
 *
 * That carries `documentKind`'s resource key onto text that is no longer
 * `documentKind`'s, and a localised Studio would go on rendering "Documents".
 * So a *built-in* key is only honoured while the def still carries the English
 * string that key stands for; edit the text and the text wins. A key this
 * bundle doesn't define is always honoured — that one belongs to whoever wrote
 * it, and resolves out of their own bundle.
 */
export function localized(t: TranslateFn, key: string | undefined, fallback: string): string {
  if (key === undefined) return fallback
  const english = enUSResources[key]
  if (english !== undefined && english !== fallback) return fallback
  return t(key, {defaultValue: fallback})
}
