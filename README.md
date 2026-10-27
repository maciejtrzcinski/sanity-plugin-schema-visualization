# @maciejtrzcinski/sanity-plugin-schema-visualization

Your whole Sanity schema on one canvas. The plugin adds a **Graph** tool to the
Studio navbar: every type is a card, every reference is an arrow.

This is a community plugin, not an official Sanity one. Report problems here
on GitHub, not to Sanity support.

[![Watch the 53-second demo](https://raw.githubusercontent.com/maciejtrzcinski/sanity-plugin-schema-visualization/main/docs/media/demo-poster.jpg)](https://cdn.jsdelivr.net/gh/maciejtrzcinski/sanity-plugin-schema-visualization@main/docs/media/demo.mp4)

## Install

| Package manager | Command                                                                |
| --------------- | ---------------------------------------------------------------------- |
| npm             | `npm install @maciejtrzcinski/sanity-plugin-schema-visualization@beta` |
| pnpm            | `pnpm add @maciejtrzcinski/sanity-plugin-schema-visualization@beta`    |
| yarn            | `yarn add @maciejtrzcinski/sanity-plugin-schema-visualization@beta`    |
| bun             | `bun add @maciejtrzcinski/sanity-plugin-schema-visualization@beta`     |

The plugin is in beta. Built-in registry entries may change shape between
betas; their ids won't. Found a bug?
[Open an issue](https://github.com/maciejtrzcinski/sanity-plugin-schema-visualization/issues).

```ts
// sanity.config.ts

import {schemaVisualization} from '@maciejtrzcinski/sanity-plugin-schema-visualization'
import {defineConfig} from 'sanity'

export default defineConfig({
  // ...
  plugins: [schemaVisualization()],
})
```

Works with Sanity 5 and 6, React 19.2+ and styled-components 6.1+.

It reads the compiled schema in the browser and nothing else. Document data is
only touched if you turn on `documentCounts`, and then only when you click the
button. It never writes: the "New …" button opens Sanity's own create form,
and nothing is saved until you edit it.

## What's in the tool

### Toolbar

| Control         | What it does                                                                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search          | Finds types and fields by name. Matches stay lit, the rest dims.                                                                                                                                                            |
| Focus picker    | Shows one type and its direct connections, nothing else.                                                                                                                                                                    |
| Filter          | Kind, system types (hidden by default), health status, connectivity (only connected / only orphans) and deprecated.                                                                                                         |
| View            | Compact cards (title and counts, expand one at a time), horizontal or vertical layout, re-layout.                                                                                                                           |
| Health          | Opens the list of schema problems. See [Health checks](#health-checks).                                                                                                                                                     |
| Copy link       | Copies a URL with the current search, filters, focus and selected type.                                                                                                                                                     |
| Load doc counts | Only with `documentCounts: true`. Counts documents per type in the Studio's current perspective (drafts, published or a release) and splits them into published and drafts. Two read-only GROQ `count()` queries per click. |

### Canvas

- **Cards** list every field with its type and badges: `required`, `read-only`,
  `hidden`, `conditionally hidden`, `deprecated`, `list (n)`, `layout`,
  `source`, `hotspot`, validation (`min 3 · max 120`, `matches lowercase
  (warning)`), the initial value, and `no create` on a reference with
  `disableNew`. Card headers show `system`, `deprecated` and the doc count.
- **Arrows**: solid for references, dashed for a reused object type (say an
  `seo` object used in five documents), their own colour for cross-dataset and
  global document references. Hover one to see which field it comes from.
- **Click a card** to highlight what it's connected to and open the detail
  panel: all fields with their group and fieldset, the type's groups, health
  issues, incoming and outgoing connections, a "show only this type" toggle,
  and for document types a "New …" button that opens Structure with a fresh
  document. The button only appears where the Studio's own create menu offers
  the type and you're allowed to create one, so singletons don't get it.
- Types are grouped into bands: Documents, Objects, System & primitive types.
  Drag cards, zoom, use the minimap and legend.
- **Export** what's on screen as SVG (real vectors, not a screenshot), a
  Mermaid flowchart or JSON.

### Health checks

| Check                          | Flags                                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Unused type                    | An object type nothing references or reuses.                                                                         |
| Reference targets non-doc      | A `reference` field pointing at a type that isn't a document.                                                        |
| Uses a deprecated type         | A field whose type is marked `deprecated`.                                                                           |
| Required field is hidden       | A field that's required but always hidden, so nobody can fill it.                                                    |
| Preview follows references     | A `preview.select` path crossing more than one reference (`author.company.name`), which every list row pays for.     |
| Slug has no source             | A slug without `options.source`, so editors type it by hand. A note, not a warning.                                  |
| Close to the attribute limit   | Documents that can write 80% or more of the dataset's attribute limit (10,000; pass `limit: 2000` on the Free plan). |
| Document type has no documents | A document type with zero documents, once doc counts are loaded. A note, not a warning.                              |

Flagged cards get a badge. Custom rules can be warnings or just notes.

### Good to know

- Compact mode, layout direction, filters and the last doc counts are saved in
  `localStorage`, separately for each project, dataset and workspace. A shared
  link overrides them.
- Over 60 types (or 240 connections) the layout switches from dagre to a
  layered layout of its own, so hundreds of types still lay out in
  milliseconds.
- All UI text comes from a Studio locale bundle (`schema-visualization`
  namespace), so you can translate it like any built-in tool.

## Options

```ts
schemaVisualization({
  title: 'Data model',
  documentCounts: true,
  defaults: {direction: 'TB', compactMode: true},
})
```

| Option            | Default                                 | What it does                                                                                                                    |
| ----------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `name`            | `'graph'`                               | URL segment of the tool (`/graph`).                                                                                             |
| `title`           | `'Graph'`                               | Label in the navbar.                                                                                                            |
| `documentCounts`  | `false`                                 | Adds the "Load doc counts" button. Read-only; needs read access to the dataset.                                                 |
| `maxDepth`        | `8`                                     | How many levels of inline objects and arrays to walk when looking for references. Raise it for deeply nested generated schemas. |
| `defaults`        | `{direction: 'LR', compactMode: false}` | Starting layout. The URL and saved settings win over it.                                                                        |
| `kinds`           | documents, objects, other               | Categories types are sorted into. Drives bands, colours, legend and the Kind filter.                                            |
| `edgeKinds`       | reference, external ref, reuses         | How each kind of arrow looks and what the legend calls it.                                                                      |
| `fieldDescribers` | built-in                                | How a field's type turns into a label and arrows.                                                                               |
| `fieldBadges`     | built-in                                | Badges on field rows.                                                                                                           |
| `nodeBadges`      | built-in                                | Badges on card headers.                                                                                                         |
| `filters`         | built-in                                | Groups in the Filter menu. Can be a function that gets the resolved kinds.                                                      |
| `healthRules`     | the eight above                         | Checks in the Health panel.                                                                                                     |

The last seven replace the defaults, they don't merge. To add one rule and keep
the built-ins:

```ts
import {
  defaultHealthRules,
  type HealthRule,
} from '@maciejtrzcinski/sanity-plugin-schema-visualization/registry'

const tooManyFields: HealthRule = {
  id: 'too-many-fields',
  label: 'Type has a lot of fields',
  severity: 'info',
  check: ({customNodes}) =>
    customNodes
      .filter((node) => node.fields.length > 25)
      .map((node) => ({
        key: node.id,
        nodeId: node.id,
        message: `${node.title} has ${node.fields.length} fields`,
      })),
}

schemaVisualization({healthRules: [...defaultHealthRules, tooManyFields]})
```

## Functions

Everything beyond the plugin itself comes from
`@maciejtrzcinski/sanity-plugin-schema-visualization/registry`, so a Studio
that never opens the tool doesn't load it.

| Function                              | Returns                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `schemaToGraph(schema, options?)`     | The graph (types as nodes, connections as edges) for a compiled schema.         |
| `computeHealthIssues(graph, opts?)`   | The health issues for a graph. `opts`: `rules`, `kinds`, `t`, `docCountByType`. |
| `graphToMermaid(graph, {direction?})` | A Mermaid flowchart, e.g. for a README or a pull request. _Beta API._           |
| `graphToJson(graph)`                  | The graph as versioned JSON. _Beta API._                                        |
| `insertBefore(defs, id, ...entries)`  | A copy of a registry with entries added before `id`.                            |
| `replaceById(defs, entry)`            | A copy with the entry of the same id swapped out.                               |
| `without(defs, ...ids)`               | A copy with those ids removed.                                                  |

_Beta API_ means it can change in a minor release; the rest of the table is
stable. The three helpers throw if an id doesn't exist, so a typo fails at
Studio boot instead of quietly doing nothing. The built-in registries are exported too
(`defaultNodeKinds`, `defaultEdgeKinds`, `defaultFieldDescribers`,
`defaultFieldBadges`, `defaultNodeBadges`, `createDefaultFilters`,
`defaultHealthRules`).

The graph functions don't need a running Studio, so a script can print your
schema as Mermaid or check it for health issues in CI. Run it with
`npx tsx schema-graph.ts` (tested on `sanity` 6.20).

```ts
// schema-graph.ts

import {
  computeHealthIssues,
  graphToMermaid,
  schemaToGraph,
} from '@maciejtrzcinski/sanity-plugin-schema-visualization/registry'
import {createSchema} from 'sanity'

import {schemaTypes} from './schemaTypes'

const graph = schemaToGraph(createSchema({name: 'default', types: schemaTypes}))
console.log(graphToMermaid(graph))
console.log(computeHealthIssues(graph))
```

Inside the Studio, pass `useSchema()` instead of `createSchema(...)`.

Full reference with examples for every registry, the API stability rules and
translations: [docs/extending.md](docs/extending.md).

## Develop

```sh
pnpm install
pnpm run dev # demo Studio in dev/
pnpm run check # what CI runs
```

`SANITY_STUDIO_LARGE_SCHEMA=1 pnpm run dev` loads a 331-type test schema. More
in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Maciej Trzcinski
