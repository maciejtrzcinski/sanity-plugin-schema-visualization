# Contributing

Thanks for taking the time. This is a small plugin with a deliberately small
surface: a pure logic core under `src/` and a thin React shell on top of it.
Most contributions only touch the core.

## Getting set up

The repo uses **pnpm** (pinned via the `packageManager` field) and Node from the
range in `engines` — Node 20.19+ or 22.12+.

```sh
pnpm install
pnpm run dev     # boots the dev Studio in dev/ against the local source
```

`dev/sanity.config.ts` ships with a placeholder `projectId`. The graph itself
renders fine without a real project, since it reads the schema, not content. To
exercise the parts that hit the API — document counts, mainly — run
`npx sanity init --env` from `dev/` and point it at a project of yours.

## The one command that matters

```sh
pnpm run check
```

That runs, in order: `typecheck` (the plugin and the dev Studio), `lint`
(oxlint), `format:check` (oxfmt), `knip` (unused files, exports and
dependencies) and `test` (vitest). CI runs exactly this plus `pnpm run build`,
on every supported Node version. If it passes locally it passes there.

`pnpm run format` and `pnpm run lint:fix` fix most of what the first three
complain about.

## How the code is laid out

- **`src/*.ts` — the core.** No React anywhere at the top level of `src/`.
  Schema walking (`schemaToGraph.ts`, `fieldWalker.ts`), the registries
  (`kinds.ts`, `filters.ts`, `healthRules.ts`, `edgeKinds.ts`) and the plumbing
  they share (`registry.ts`), layout (`layout.ts`) and the per-node canvas data
  it sizes (`flowModel.ts`, which `components/TypeNode.tsx` renders from), URL
  and preference state (`urlState.ts`, `viewPrefs.ts`). Every one of these has a
  `.test.ts` next to it.
- **`src/hooks/`, `src/components/` — the shell.** Composition only. If you
  find yourself writing schema logic in a component, it probably belongs one
  level up.
- **`src/config.tsx`** resolves user options against the defaults.
- **`dev/`** is the demo Studio. Nothing imports it; it exists to be run.
- **`test/`** is test-only scaffolding: the jsdom polyfills, the provider
  wrapper components render under, and the graph fixtures.

The registries are plain arrays and objects with first-match ordering, so
adding a node kind, a filter, a health rule or a field describer means adding an
entry and a unit test — no UI code to touch. What they have in common — indexing
by id, resolving an unknown id to the catch-all, warning about a shadowed id,
the `ThemeColor` and `Tone` types — lives in `registry.ts`, so a seventh
registry inherits it instead of copying it. [docs/extending.md](docs/extending.md)
documents the same registries as the public API, so **if you change one of them,
update it in the same PR.**

## Tests

Vitest, colocated as `src/<module>.test.ts`. Anything in the pure core needs a
test.

```sh
pnpm run test              # once, as CI runs it
pnpm exec vitest           # watch mode
pnpm exec vitest kinds     # one file
```

Components are tested too, as `src/components/<Component>.test.tsx`, in jsdom —
opted into per file with a `// @vitest-environment jsdom` docblock, since the
core suites have no use for a DOM. Render through `renderWithProviders`
(`test/render.tsx`), which supplies the Sanity UI theme, the resolved plugin
config and React Flow's store; pass `options` to it to render against a custom
registry, which is how the extension points are covered end to end. Graph
fixtures live in `test/fixtures.ts` and are written by hand, so a component test
fails for a rendering reason and never because schema compilation moved.

Two things about jsdom are worth knowing before you write one:

- **It has no layout engine.** `test/setup.ts` stands in for the measurements
  React Flow needs (`offsetWidth`/`offsetHeight`, `ResizeObserver`), which is
  what makes `onlyRenderVisibleElements` keep the cards under assertion. Layout
  runs across two animation frames, so assert through `waitFor`, never
  synchronously.
- **Sanity UI popovers never get positioned**, so a menu or tooltip keeps its
  `hidden` attribute and role queries have to pass `{hidden: true}` to see it.
  Menu content is mounted up front, closed menus included — check the
  `MenuButton`'s `aria-expanded` if what you mean to assert is that a menu
  opened.

The dev Studio is still the place to check anything that depends on real
browser layout — the SVG export above all.

## Commits and releases

Releases are automated with [semantic-release], so **commit messages decide
version numbers**. Use [Conventional Commits] on the subject line:

- `fix: …` → patch release
- `feat: …` → minor release
- `feat!: …`, or a `BREAKING CHANGE:` footer → major release
- `docs: …`, `chore: …`, `refactor: …`, `test: …` → no release

While the plugin is in beta, every push to `main` runs the release workflow: it
re-runs `pnpm run check`, builds, checks the size budgets, then
semantic-release works out whether the new commits warrant a version,
updates `CHANGELOG.md`, tags `1.0.0-beta.N` and cuts a GitHub prerelease, and
the workflow then stages that version on npm under the `beta` dist-tag. Leave
the `stable` branch alone: semantic-release refuses to run unless a
non-prerelease branch exists on the remote, and `stable` is that placeholder
until the beta graduates (see `release.yml`). Don't bump `version` in
`package.json` or edit `CHANGELOG.md` yourself.

> **Maintainers:** npm uses [staged publishing] here. `NPM_TOKEN` is a
> stage-only granular token: CI can stage a version but not publish it, so
> each release waits on npm until you approve it with 2FA, through
> `npm stage approve <stage-id>` (`npm stage list` shows the ids) or the
> Staged Packages tab on npmjs.com. npm can't stage a package that isn't on
> the registry yet, so the very first version is published by hand. The
> workflow logs a warning with the commands; in short:
> `gh release download v1.0.0-beta.1 --pattern '*.tgz'`, then
> `npm publish <tarball> --tag beta --access public`. Once the package exists,
> you can swap the token for a stage-only trusted publisher on npmjs.com; the
> workflow already has `id-token: write`.

## Pull requests

Small and focused beats large and thorough. Open an issue first if the change
is architectural — a new extension point, a change to the graph model — so we
can agree on the shape before you write it.

[semantic-release]: https://semantic-release.gitbook.io/
[staged publishing]: https://docs.npmjs.com/staged-publishing/
[Conventional Commits]: https://www.conventionalcommits.org/
