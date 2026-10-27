# AGENTS.md

Guidance for coding agents working in this repo. Human-facing detail lives in
[CONTRIBUTING.md](CONTRIBUTING.md) and [README.md](README.md) — this file is the
short version plus the things that are easy to get wrong.

## What this is

`@maciejtrzcinski/sanity-plugin-schema-visualization` — a Sanity Studio plugin that adds a
**Graph** tool to the navbar, rendering the Studio's compiled schema as an
interactive canvas (React Flow + dagre): types as cards, `reference` and
type-reuse edges between them, search/filter/focus, health checks, SVG export.

Everything runs client-side off `useSchema()`. Nothing reads document data
except the opt-in `documentCounts` feature, which fires a single GROQ query only
when the user clicks the toolbar button.

## Layout

- **`src/*.ts` — the pure core. No React at the top level of `src/`.**
  Schema walking (`schemaToGraph.ts`, `fieldWalker.ts`), registries
  (`kinds.ts`, `filters.ts`, `healthRules.ts`, `edgeKinds.ts`,
  `fieldBadges.ts`) over the shared plumbing in `registry.ts`, layout
  (`layout.ts`) and the canvas data it sizes (`flowModel.ts`), styling rules
  (`graphStyling.ts`), URL and persisted state (`urlState.ts`,
  `viewPrefs.ts`), export (`exportSvg.ts`), doc counts (`documentCounts.ts`).
- **`src/hooks/`, `src/components/` — the React shell. Composition only.**
  Schema logic in a component belongs one level up in the core.
- **`src/config.tsx`** resolves user options against defaults.
- **`src/index.ts`** is the root entry point, and it is deliberately thin: the
  plugin, its config types and `I18N_NAMESPACE`, nothing else. Every Studio
  that installs the plugin runs this module at boot, so a re-export added here
  is a re-export every one of them downloads. The extensibility surface is
  published from **`src/exports/registry.ts`** as
  `@maciejtrzcinski/sanity-plugin-schema-visualization/registry` instead, and the English
  resources are reached through a dynamic `import()` — which is why
  `I18N_NAMESPACE` lives in its own module (`src/i18nNamespace.ts`) rather than
  in `src/i18n.ts`, where a static import would defeat the deferral.
  `src/index.test.ts` pins both entry points' surfaces.
- **`dev/`** is the demo Studio (`pnpm run dev`). Nothing imports it.
- **`test/`** is test-only scaffolding: `setup.ts` (jsdom polyfills),
  `render.tsx` (provider wrapper), `fixtures.ts` (hand-written graphs).

The registries are plain arrays with first-match ordering, and they share their
id index, catch-all lookup, duplicate-id check, `ThemeColor` and `Tone` through
`registry.ts` — a new registry reuses those rather than restating them. Adding a
node kind, filter, health rule, edge kind or field badge means adding an entry +
a unit test — no UI code to touch. **If you change a registry's shape, update
[docs/extending.md](docs/extending.md) in the same PR** — it documents them as
public API.

## Comments

Comments say **why**, briefly — a constraint, a trap, a reason an obvious
alternative doesn't work. History ("this used to…", "previously…", the bug a
change fixed) goes in the commit message, not the code. Public API types keep
their TSDoc; elsewhere, if a comment runs longer than the code it explains,
cut it.

## Strings

**No user-visible string is written inline.** Every one lives in
`enUSResources` in `src/i18n.ts`, under the `schema-visualization` namespace
the plugin registers with the Studio, and is read back one of two ways:

- **A registry def's static label** names its key in an `i18n` object and keeps
  its English text as the fallback; the render site resolves it with
  `localized(t, def.i18n?.label, def.label)`.
- **Anything computed** — a health rule's message, a badge, a stats segment —
  goes through `t`, which every string-producing registry callback gets on its
  context (`HealthContext`, `FilterContext`, `NodeBadgeContext`,
  `FieldBadgeContext`, `WalkContext`). React components get it from
  `useTranslate()`; the pure core defaults it to `defaultTranslate`, which
  resolves the same resources so the headless entry points still read as
  English.

`src/i18n.test.ts` checks both directions against the source: a key nothing
defines and a resource nothing reads both fail the suite. Plural keys are
`_one`/`_other` and are chosen by a `count` value, as in i18next.

## Commands

```sh
pnpm install
pnpm run check      # typecheck + lint + format:check + knip + test — what CI runs
pnpm run test       # vitest, once
pnpm exec vitest    # watch mode
pnpm exec vitest kinds       # one file by name filter
pnpm run format     # oxfmt, fixes formatting
pnpm run lint:fix   # oxlint --fix
pnpm run build      # plugin-kit verify + pkg-utils build
pnpm run dev        # boot the demo Studio in dev/
```

pnpm only (pinned in `packageManager`). Node 24 for the toolchain; the
`engines` range (20.19+ or 22.12+) is where a Studio runs the built plugin, and
jsdom suites won't even start on its floor.

**Before handing work back, run `pnpm run check`.** It is exactly what CI runs
(plus `pnpm run build`). `knip` is part of it, so an export nothing imports or a
newly unused dependency fails the run.

## Writing tests

Vitest, colocated next to the module under test. Anything added to the pure
core needs a test.

### Core tests — `src/<module>.test.ts`

Plain input/output, node environment, no DOM. Import real Sanity helpers
(`createSchema`, `defineType`, `defineField`) when a test needs a compiled
schema type — see `src/kinds.test.ts` for the pattern.

### Component tests — `src/components/<Component>.test.tsx`

- Start the file with `// @vitest-environment jsdom` — the core suites run in
  node, jsdom is opted into per file.
- Render through `renderWithProviders` from `test/render.tsx`. It supplies the
  Sanity UI theme, the toast context, the resolved plugin config, React Flow's
  store and a bare Studio router (what the detail panel's intent link resolves
  against). Pass `options` to render against a custom registry — that's how the
  extension points are covered end to end; pass `onNavigate` to watch where an
  intent link goes. There is no locale provider, so `useTranslate` falls back
  to the English bundle and assertions read as English.
- Use graph fixtures from `test/fixtures.ts` (`makeNode`, `makeEdge`, `postNode`,
  …). They're hand-written on purpose, so a component test fails for a rendering
  reason and never because schema compilation moved.
- Build props through a local `props(overrides)` helper rather than spelling out
  every callback per test (see `src/components/Toolbar.test.tsx`).

Two jsdom facts that cause most of the confusion:

- **No layout engine.** `test/setup.ts` fakes the measurements React Flow needs
  (`offsetWidth`/`offsetHeight`, `ResizeObserver`, `DOMMatrixReadOnly`,
  `getBBox`), which is what keeps `onlyRenderVisibleElements` from dropping the
  cards under assertion. Layout settles across two animation frames — **assert
  through `waitFor`/`findBy`, never synchronously.** `asyncUtilTimeout` is
  raised to 5s in setup and `testTimeout` to 20s in `vitest.config.ts`.
- **Sanity UI popovers are never positioned.** A menu or tooltip keeps its
  `hidden` attribute, so role queries need `{hidden: true}` to see it. A menu
  mounts its items only once it opens, and a `MenuGroup` submenu only once it
  opens in turn — click your way to an item before querying it.

Things real browser layout decides — SVG export above all — should be checked in
the dev Studio, not asserted in jsdom.

## Commits

Conventional Commits; semantic-release reads them to decide versions.
`fix:` → patch, `feat:` → minor, `feat!:`/`BREAKING CHANGE:` → major,
`docs:`/`chore:`/`refactor:`/`test:` → no release. Never bump `version` in
`package.json` or edit `CHANGELOG.md` by hand.
