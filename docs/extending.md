# Extending

Everything past the basic setup in the [README](../README.md): the registries
behind the tool, the API stability rules, localization, and exporting a graph
from code.

## Registries

Every part of the tool that classifies, filters or judges your schema is a
plain data registry, and each one is a plugin option. Override one and the
toolbar, legend, cluster bands, canvas and health panel follow — none of them
hardcode the built-in categories.

| Option            | Replaces                                   | Default                                 |
| ----------------- | ------------------------------------------ | --------------------------------------- |
| `kinds`           | The categories types are sorted into       | `defaultNodeKinds`                      |
| `edgeKinds`       | How each kind of connection is drawn       | `defaultEdgeKinds`                      |
| `fieldDescribers` | How a field's type becomes a label + edges | `defaultFieldDescribers`                |
| `fieldBadges`     | The badges on a field row                  | `defaultFieldBadges`                    |
| `nodeBadges`      | The badges on a type's card header         | `defaultNodeBadges`                     |
| `filters`         | The toolbar's node-visibility filters      | `createDefaultFilters(kinds)`           |
| `healthRules`     | The checks behind the Health panel         | `defaultHealthRules`                    |
| `defaults`        | Starting layout direction / compact mode   | `{direction: 'LR', compactMode: false}` |

Each option **replaces** its default rather than merging with it, so build on
the exported defaults (`[...defaultHealthRules, myRule]`) unless you mean to
drop the built-ins. Every type and default below is exported from
`@maciejtrzcinski/sanity-plugin-schema-visualization/registry` — the package root carries only
`schemaVisualization`, its config types and `I18N_NAMESPACE`, so a Studio that
installs the plugin and never opens the tool loads a couple of kilobytes
rather than the whole registry surface.

Where order matters, three helpers edit a default registry by the ids its
entries already carry, so you never have to know where a built-in sits:

```ts
import {
  defaultFieldBadges,
  defaultFieldDescribers,
  defaultHealthRules,
  insertBefore,
  orphanedTypeRule,
  replaceById,
  without,
} from '@maciejtrzcinski/sanity-plugin-schema-visualization/registry'

insertBefore(defaultFieldDescribers, 'namedType', slugDescriber)
replaceById(defaultHealthRules, {...orphanedTypeRule, severity: 'info'})
without(defaultFieldBadges, 'hotspot')
```

Each returns a new array and leaves the default alone. An id that matches
nothing throws — at Studio boot, naming the ids the registry does have —
because the alternative is an entry silently appended behind a catch-all, where
it can never match.

### API stability

The package has two entry points, and the split is about what a Studio pays
for at boot rather than about how stable something is:

- **`@maciejtrzcinski/sanity-plugin-schema-visualization`** — `schemaVisualization`,
  `SchemaVisualizationConfig`, `SchemaVisualizationOptions`,
  `enUSLocaleBundle` and `I18N_NAMESPACE`. Everything a `sanity.config.ts`
  needs, and nothing else; this module runs on every Studio boot.
- **`@maciejtrzcinski/sanity-plugin-schema-visualization/registry`** — everything else on this
  page. Imported only by a Studio that actually extends something, and loaded
  with the tool otherwise.

Every export carries a release tag, checked at build time by API Extractor:

- **`@public`** — the supported API: the registry types above and their
  defaults (`defaultNodeKinds`, `createDefaultFilters`, `defaultHealthRules`,
  …), the ordering helpers, the pieces the types are written in terms of
  (`Tone`, `ThemeColor`, `NodeAnnotations`), the graph model (`GraphNode`,
  `GraphEdge`, `SchemaGraph` and friends), and the entry points that build a
  graph (`schemaToGraph`) or run the checks (`computeHealthIssues`). Semver
  applies — breaking one takes a major. The localization surface is public
  too: `I18N_NAMESPACE`, `enUSResources`, `enUSLocaleBundle` and
  `TranslateFn`.
- **`@beta`** — the individual built-in entries the defaults are made of
  (`requiredBadge`, `systemBadge`, `healthFilter`, `requiredHiddenRule`,
  `referenceDescriber` and the like), `createAttributePathsRule`, and the
  code exports `graphToMermaid`, `graphToJson` and `GRAPH_JSON_VERSION`. These
  may change in a minor release — pin the version if you depend on one.

Nothing else is exported. The plumbing the tool runs on — config resolution,
the field walker, the badge collectors, the intrinsic type lists — is
internal, so it can change without a release note.

The ids of built-in entries are part of the stable API even where the object
behind one is `@beta`: `without(defaultFieldBadges, 'required')` keeps working
across minors, while the exact label, tone or predicate of `requiredBadge` may
change. Reach built-ins through the default arrays and the ordering helpers
rather than importing the objects.

One asymmetry is worth spelling out, because it is what makes a `@public`
context usable. The context objects a registry hands your callback —
`WalkContext`, `FieldBadgeContext`, `NodeBadgeContext`, `FilterContext`,
`HealthContext` — flow one way: the plugin writes them, your code reads them.
Adding a field to one is therefore additive and ships in a minor; removing or
retyping a field is breaking and waits for a major. Write against the fields
you need, ignore the rest, and expect the set to grow.

`FilterContext.docCountByType` is the concrete case. It is there for one
built-in feature — the live counts behind `documentCounts: true` — but it is a
permanent field, not a detail that might be tidied away in a later release.
Per-node data has an open bag to grow into instead (`NodeAnnotations`, under
[Custom node badges](#custom-node-badges)); the filter context deliberately
does not, so a future source of per-type numbers would arrive as a new field
beside this one rather than by reshaping it.

### Three ordering rules

These are the only things that bite. Everything else is order-independent.

1. **The catch-all kind goes last.** `classifyKind` takes the first `classify`
   that returns true, and the catch-all's returns true for everything. It also
   needs `isCatchAll: true` — a node whose kind disappeared between sessions
   (a stale URL, a stored preference) resolves there instead of crashing the
   canvas.
2. **Insert a describer ahead of what it pre-empts, don't append it.**
   `fallbackDescriber` matches every type, so anything after it is dead code.
   `insertBefore(defaultFieldDescribers, 'namedType', mine)` puts yours in the
   right place without counting positions.
3. **A filter needs a unique `id` and a unique `urlParam`.** Filter state
   lives in the URL, so a `urlParam` colliding with another filter's or with
   the reserved `q`, `focus` and `selected` silently breaks shared links.

Break one of these — or register two kinds under the same id — and the plugin
says so: it checks the registries it is handed and logs one
console warning per problem, naming what the mistake costs you. Nothing throws,
and a warning is reported once per session rather than on every render.

### Custom kinds

A kind is one category of schema type: its labels, colour, icon, the
`classify` predicate that claims types for it, and capability flags. The flags
are how built-in behaviour reaches your own categories — `countsDocuments` opts into live document counts,
`isReferenceTarget` tells `referenceTargetRule` a reference may point here,
`reportsOrphans` opts into the unused-type check, and `createsDocuments` puts
the "New <type>" intent link in the detail panel — where the Studio's own
create menu offers the type and the user's grants allow creating one, so a
singleton removed from `newDocumentOptions` or `schema.templates` gets no link.

```ts
import {schemaVisualization} from '@maciejtrzcinski/sanity-plugin-schema-visualization'
import {
  documentKind,
  objectKind,
  otherKind,
  type NodeKindDef,
} from '@maciejtrzcinski/sanity-plugin-schema-visualization/registry'
import {PinIcon} from '@sanity/icons'
import {isDocumentSchemaType} from 'sanity'

const SINGLETONS = new Set(['siteSettings', 'homePage'])

const singletonKind: NodeKindDef = {
  id: 'singleton',
  label: 'Singletons',
  singular: 'singleton',
  clusterLabel: 'Singletons',
  urlParam: 'single', // short + stable: it ends up in shared links
  tone: 'primary',
  color: {cssVar: '--card-badge-primary-bg-color', fallback: '#2276fc'},
  icon: PinIcon,
  classify: (type) => isDocumentSchemaType(type) && SINGLETONS.has(type.name),
  countsDocuments: true,
  isReferenceTarget: true,
  createsDocuments: true,
}

// Ahead of documentKind (it would otherwise claim singletons first),
// and otherKind — the catch-all — stays last.
schemaVisualization({kinds: [singletonKind, documentKind, objectKind, otherKind]})
```

Singletons now get their own cluster band, legend entry, filter toggle and
document counts, with no UI changes.

### Custom edge kinds

An edge kind is one category of connection: how the line is drawn, what the
legend calls it, and how the detail panel badges it. You only need one if a
custom describer emits links of a kind beyond the built-in `reference`,
`external-reference` and `reuses` — a portable-text annotation, say, or a
convention of your own that a plain reuse edge undersells.

```ts
import {schemaVisualization} from '@maciejtrzcinski/sanity-plugin-schema-visualization'
import {
  defaultEdgeKinds,
  defaultFieldDescribers,
  referenceKind,
  reusesKind,
  type EdgeKindDef,
  type FieldDescriber,
} from '@maciejtrzcinski/sanity-plugin-schema-visualization/registry'

const annotationKind: EdgeKindDef = {
  id: 'annotation',
  label: 'Portable Text annotation',
  color: {cssVar: '--card-badge-caution-bg-color', fallback: '#c8a400'},
  dash: '1 3',
  tone: 'caution',
  // Optional: defaults to the kind id, which is already what you want here.
  badgeLabel: () => 'annotation',
}

const annotationDescriber: FieldDescriber = {
  id: 'annotation',
  match: (type, ctx) => ctx.path.includes('markDefs') && ctx.isRegistered(type.name),
  describe: (type, ctx) => ({
    typeLabel: type.name,
    links: [{kind: 'annotation', target: type.name, path: ctx.path}],
    options: [],
  }),
}

schemaVisualization({
  edgeKinds: [...defaultEdgeKinds, annotationKind],
  fieldDescribers: [annotationDescriber, ...defaultFieldDescribers],
})
```

One entry needs `isCatchAll: true` — `reusesKind` has it, so keeping the
built-ins is enough. It's where an edge whose kind isn't in the registry gets
drawn, which is what a describer and an `edgeKinds` list that disagree produce.
`referenceKind`, `externalReferenceKind` and `reusesKind` are all exported, so
you can reorder or restyle them instead of replacing the set.

### Custom field describers

A describer turns one compiled schema type into a label, badges, and the
connections it implies. The first whose `match` returns true wins; `recurse`
descends into a nested type (array members, inline object fields) and returns
that level's result.

```ts
import {
  defaultFieldDescribers,
  insertBefore,
  type FieldDescriber,
} from '@maciejtrzcinski/sanity-plugin-schema-visualization/registry'

const slugDescriber: FieldDescriber = {
  id: 'slug',
  match: (type) => type.name === 'slug',
  describe: (type) => {
    const source = (type as {options?: {source?: string}}).options?.source
    return {
      typeLabel: source ? `slug (from ${source})` : 'slug',
      links: [],
      options: source ? [] : [{label: 'no source', tone: 'caution'}],
    }
  },
}

// Ahead of namedTypeDescriber, which would otherwise claim `slug`
// as a plain reuse of a registered type.
schemaVisualization({
  fieldDescribers: insertBefore(defaultFieldDescribers, 'namedType', slugDescriber),
})
```

Returning `links` is how a describer draws edges: `{kind, target, path}`. The
built-in kinds are `reference`, `external-reference` (what
`crossDatasetReferenceDescriber` and `globalDocumentReferenceDescriber` emit)
and `reuses`; a describer that emits anything else needs a matching entry in
`edgeKinds` — see [Custom edge kinds](#custom-edge-kinds).

### Custom field badges

A badge is one small label on a field row — `required`, `read-only`,
`list (3)`. Each def reads the field's own compiled type and returns one badge
or `undefined`; unlike the other registries there is no first match, so **every**
entry runs and the registry order is the order badges appear.

```ts
import {
  defaultFieldBadges,
  type FieldBadgeDef,
} from '@maciejtrzcinski/sanity-plugin-schema-visualization/registry'

const localizedBadge: FieldBadgeDef = {
  id: 'localized',
  badge: (type) => {
    const i18n = (type as {options?: {i18n?: boolean}}).options?.i18n
    return i18n ? {label: 'localized', tone: 'primary'} : undefined
  },
}

schemaVisualization({fieldBadges: [...defaultFieldBadges, localizedBadge]})
```

`ctx.required` and `ctx.validation` (the field's other constraints — `min`,
`max`, `regex` and the rest, each with its level) are handed in rather than
read off the type, because validation comes from an undocumented shape inside
the compiled `Rule` — the plugin does that read once, defensively, and warns if
it ever stops working.

Because each built-in has an id, you can drop or swap exactly one:

```ts
import {
  defaultFieldBadges,
  hotspotBadge,
  replaceById,
  without,
} from '@maciejtrzcinski/sanity-plugin-schema-visualization/registry'

schemaVisualization({fieldBadges: without(defaultFieldBadges, 'hotspot')})
// or, keeping its place but changing its tone:
schemaVisualization({
  fieldBadges: replaceById(defaultFieldBadges, {
    ...hotspotBadge,
    badge: (type, ctx) => {
      const badge = hotspotBadge.badge(type, ctx)
      return badge && {...badge, tone: 'primary'}
    },
  }),
})
```

These are deliberately not a `FieldDescriber` concern. A describer runs at
every depth of a field's type, while a badge describes the field itself — the
same `hidden` or `readOnly` flag on a nested type describes _that_ type, so
emitting it from a describer would bubble a misleading badge up to the field
row. A badge that throws is skipped for that field, reported once, and the rest
still render.

### Custom node badges

A node badge is a label on a type's card header — `system`, `deprecated`, the
live document count — and in its detail panel. Same shape as a field badge:
every entry runs, order is the order badges appear, and each returns one badge
or `undefined`.

What it also does is size the card. `estimateNodeHeight` runs this registry
over the same node and reserves a badge row for whatever comes back, so a badge
you add is measured without touching the layout.

```ts
import {
  defaultNodeBadges,
  type NodeBadgeDef,
} from '@maciejtrzcinski/sanity-plugin-schema-visualization/registry'

const lintScoreBadge: NodeBadgeDef = {
  id: 'lint-score',
  badge: (_node, ctx) => {
    const score = ctx.annotations.lintScore
    if (typeof score !== 'number') return undefined
    return {label: `lint ${score}`, tone: score < 50 ? 'caution' : 'positive'}
  },
}

schemaVisualization({nodeBadges: [...defaultNodeBadges, lintScoreBadge]})
```

`ctx` carries everything about the node that isn't in the schema — its
connection count, its health issue counts split by severity, whether the card
is expanded, and `annotations`:

```ts
interface NodeAnnotations {
  [key: string]: unknown
}
```

`NodeAnnotations` is one bag of per-node data that the compiled schema can't
supply, carried to the cards as a single `Map<nodeId, NodeAnnotations>`.
Document counts are the built-in entry, under the `docCount` key — the count
in the Studio's current perspective, absent until someone presses "Load doc
counts" and so never to be read as zero — with `publishedCount` and
`draftCount` beside it. No key is named on the interface itself,
`docCount` included: each one belongs to whatever produces it, so anything you
add rides the same map instead of growing a prop on the canvas, the card, the
height estimate and the panel.

`ctx.surface` says whether the badge is being painted on a card (260px wide,
repeated across the canvas) or in the detail panel. The built-ins use it to
stay terse on the card and spell themselves out on the panel — the deprecated
badge puts its reason in a `tooltip` on one and inline on the other. A badge
that ignores `surface` simply looks the same in both places.

Two rendering hints beyond `label` and `tone`: `tooltip` for detail that
doesn't fit, and `variant: 'text'` for a muted line rather than a chip (what
the collapsed card's "3 fields · 2 connections" summary uses). As with field
badges, each built-in has an id, so you can drop or replace exactly one — and
a badge that throws is skipped for that type, reported once, with the rest
still rendering.

### Custom filters

A filter renders as a group in the toolbar's filter menu (`single` = radio,
`multi` = checkboxes) and hides nodes whose `predicate` returns false. The
predicate gets the node, the current selection, and a `FilterContext` carrying
the whole unfiltered `graph`, `issueCountByNodeId`, `warningCountByNodeId`
(the `warning`-severity share of the former — subtract for the `info` count),
`connectedNodeIds` and `docCountByType` — the per-type document counts in the
Studio's current perspective, empty until someone presses "Load doc counts"
(and always empty with `documentCounts` off), so read a missing entry as "not
known yet" rather than as zero.

```ts
import {
  createDefaultFilters,
  type FilterDef,
} from '@maciejtrzcinski/sanity-plugin-schema-visualization/registry'
import {TagIcon} from '@sanity/icons'

const namespaceFilter: FilterDef = {
  id: 'namespace',
  label: 'Namespace',
  icon: TagIcon,
  type: 'multi',
  options: [
    {value: 'page', label: 'page.*'},
    {value: 'block', label: 'block.*'},
    {value: 'none', label: 'No namespace'},
  ],
  defaultValues: ['page', 'block', 'none'],
  urlParam: 'ns', // must not collide with q / focus / selected or another filter
  predicate: (node, selected) => {
    const prefix = node.name.includes('.') ? node.name.split('.')[0] : 'none'
    return selected.values.has(prefix)
  },
}

// The function form receives the resolved kinds, so the derived "Kind"
// filter (createKindsFilter) still reflects a custom kind registry.
schemaVisualization({
  filters: (kinds) => [...createDefaultFilters(kinds), namespaceFilter],
})
```

The wider context is what makes a filter like "types nothing uses" possible —
it needs both the loaded counts and the edges pointing at the node. An optional
`summary` lets a filter add a note to the toolbar's stats line while it's
narrowing the graph (the built-in system-types filter contributes "system types
hidden" this way); it gets the same selection and context as the predicate:

```ts
const unusedFilter: FilterDef = {
  id: 'unused',
  label: 'Usage',
  type: 'single',
  options: [
    {value: 'all', label: 'All types'},
    {value: 'only', label: 'Only unused (0 docs, no references in)'},
  ],
  defaultValues: ['all'],
  urlParam: 'unused',
  predicate: (node, selected, ctx) =>
    selected.value !== 'only' ||
    (ctx.docCountByType.get(node.name) === 0 &&
      !ctx.graph.edges.some((edge) => edge.target === node.id)),
  summary: (selected) => (selected.value === 'only' ? 'unused only' : undefined),
}
```

### Custom health rules

A rule gets the whole graph plus the aggregates every rule would otherwise
recompute (`customNodes` excludes system types; `incomingCount`, `nodesById`
and `kindById` are prebuilt; `docCountByType` holds the loaded document
counts, empty until someone loads them) and returns raw issues — `id`,
`category` and `severity` are filled in around them. A rule that throws is
skipped rather than taking the panel down.

`severity` is what the panel, the node badge and the detail panel are painted
from, and what the "Only with warnings" filter selects on — an `info` rule
reads as a note, not a problem.

The graph carries more than the canvas draws, for rules to judge: each field's
`validation`, `groups`, `fieldset`, `initialValue`, `intrinsicType` and
`source`; each type's `groups`, `fieldsets`, `initialValue` and
`previewSelect` (every select path with the number of references it crosses);
each document type's `attributePaths`, and the whole schema's estimate on
`graph.attributePaths`.

The attribute-limit check is a factory, because the limit depends on the plan
— 2,000 attributes on Free, 10,000 on Growth and Enterprise:

```ts
import {
  createAttributePathsRule,
  defaultHealthRules,
  replaceById,
} from '@maciejtrzcinski/sanity-plugin-schema-visualization/registry'

schemaVisualization({
  healthRules: replaceById(defaultHealthRules, createAttributePathsRule({limit: 2000})),
})
```

```ts
import {
  defaultHealthRules,
  type HealthRule,
} from '@maciejtrzcinski/sanity-plugin-schema-visualization/registry'

const largeTypeRule: HealthRule = {
  id: 'large-type',
  label: 'Type has a lot of fields',
  severity: 'info',
  check: ({customNodes}) =>
    customNodes
      .filter((node) => node.fields.length > 25)
      .map((node) => ({
        key: node.id, // unique within this rule
        nodeId: node.id,
        message: `"${node.title}" has ${node.fields.length} fields — consider splitting it into reusable object types.`,
      })),
}

schemaVisualization({healthRules: [...defaultHealthRules, largeTypeRule]})
```

### Starting view state

`defaults` seeds the view before the URL or a previous session's stored
preferences are applied — both of those still win when they specify something.

```ts
schemaVisualization({defaults: {direction: 'TB', compactMode: true}})
```

## Localization

Every string the tool paints lives in a Studio locale bundle under the
`schema-visualization` namespace, registered for you through the plugin's
`i18n.bundles`. English ships with the plugin; another language is a bundle
for the same namespace, exactly as for a first-party tool:

```ts
import {defineConfig, defineLocaleResourceBundle} from 'sanity'

export default defineConfig({
  // ...
  i18n: {
    bundles: [
      defineLocaleResourceBundle({
        locale: 'nb-NO',
        namespace: 'schema-visualization',
        resources: {
          'toolbar.copy-link': 'Kopier lenke',
          'health.title': 'Skjemahelse',
          // …any subset: a key you leave out falls back to English.
        },
      }),
    ],
  },
})
```

`enUSResources` is exported from
`@maciejtrzcinski/sanity-plugin-schema-visualization/registry`, so `Object.keys(enUSResources)`
is the list of keys to translate — and `I18N_NAMESPACE` is the namespace
string, exported from the root, if you'd rather not spell it out.

The plugin's own bundle loads its resources lazily, as Sanity's locale API
prefers, so the English strings are a chunk the Studio fetches alongside its
startup rather than 10 KB inside it.

### Localizing your own registry entries

The registries produce two kinds of string, and each has one way to localize.

**Labels are static**, so a def names its resource key alongside the English
text it falls back to:

```ts
const singletonKind: NodeKindDef = {
  id: 'singleton',
  label: 'Singletons',
  singular: 'singleton',
  clusterLabel: 'Singletons',
  i18n: {label: 'my-studio.singleton.label'},
  // …
}
```

Any key works — one of yours in this namespace, or `'my-ns:some.key'` to reach
another bundle entirely. The same `i18n: {label}` field is on `EdgeKindDef`,
`FilterDef`, `FilterOption` and `HealthRule`.

One rule about spreading a built-in: `{...documentKind, id: 'collection', label:
'Collections'}` inherits `documentKind`'s resource key too, and that key still
says "Documents". The plugin handles it — a built-in key is only honoured while
the def still carries the English text that key stands for, so your label wins —
but if you want your own translation, give it your own key.

**Sentences are computed**, so every registry callback that returns text is
handed a `t` on its context and calls it itself:

```ts
const largeTypeRule: HealthRule = {
  id: 'large-type',
  label: 'Type has a lot of fields',
  i18n: {label: 'my-studio.large-type.label'},
  severity: 'info',
  check: ({customNodes, t}) =>
    customNodes
      .filter((node) => node.fields.length > 25)
      .map((node) => ({
        key: node.id,
        nodeId: node.id,
        message: t('my-studio.large-type.message', {
          title: node.title,
          count: node.fields.length,
        }),
      })),
}
```

`t` is on `HealthContext`, `FilterContext`, `NodeBadgeContext`,
`FieldBadgeContext` and `WalkContext`, and it's the second argument to an edge
kind's `badgeLabel`. It follows i18next's conventions: `{{placeholders}}` in
the template, `count` picking between a key's `_one` and `_other` forms.
Ignore it and your entry keeps returning the string it always did.

Outside a Studio — `schemaToGraph`, `computeHealthIssues` — there is no locale
context, so `t` defaults to one that resolves against the plugin's own English
resources. Both entry points take a `t` of your own: `schemaToGraph` as its
last argument, `computeHealthIssues` in its options.

## Exporting from code

The canvas exports what it currently shows — filters and focus applied — as
an SVG picture, a Mermaid flowchart (for a README or a pull request) or a
versioned JSON document. The last two come from the graph model rather than
the screen, so a script can produce them too:

```ts
import {
  graphToMermaid,
  schemaToGraph,
} from '@maciejtrzcinski/sanity-plugin-schema-visualization/registry'

const mermaid = graphToMermaid(schemaToGraph(schema), {direction: 'LR'})
```

Mermaid renders at most 500 links unless the renderer raises its `maxEdges`
setting, so a large schema's diagram may need filtering first.

## How it works

The tool reads the Studio's compiled schema via `useSchema()` and walks every
registered type's fields, using Sanity's own type guards
(`isReferenceSchemaType`, `isArraySchemaType`, `isDocumentSchemaType`, …) to
classify each field as a plain value, a reference, or a reuse of another named
type. Reference and array-of-reference fields become **reference** edges;
`crossDatasetReference` and `globalDocumentReference` fields become
**external-reference** edges (Sanity ships no schema-type guard for either, so
the walker matches their compiled alias chain itself); fields whose type is
another named object/array type (as opposed to an inline one) become **reuses**
edges. Everything runs client-side against the schema
already loaded in the Studio. The one exception is `documentCounts`: a click
on its button sends two read-only GROQ `count()` queries, one in the Studio's
current perspective and one in `raw` for the published/draft split.
