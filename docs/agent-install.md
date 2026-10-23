# Install with a coding agent

Instructions for an AI coding agent (Claude Code, Cursor, Copilot, Codex, …)
to add `@maciejtrzcinski/sanity-plugin-schema-visualization` to a Sanity Studio
and configure it.

**Humans:** paste this into your agent, from the root of your Studio project:

```text
Install and configure the Sanity schema visualization plugin by following
https://raw.githubusercontent.com/maciejtrzcinski/sanity-plugin-schema-visualization/main/docs/agent-install.md
```

Everything below is written for the agent.

---

## Ground rules

- **Touch only two things:** the Studio's dependencies (through its package
  manager) and its `sanity.config.*` file. No schema changes, no new files, no
  environment variables, no tokens.
- **Don't install the plugin's own dependencies.** `@sanity/ui`,
  `@sanity/icons`, `@xyflow/react` and `@dagrejs/dagre` come with it.
- **Don't upgrade `sanity`, `react` or `styled-components` on your own.** If
  the versions don't fit, stop and tell the user (step 2).
- **Don't commit.** Leave the changes for the user to review, unless they asked
  you to commit.
- The plugin is read-only. It reads the compiled schema in the browser and
  never writes to the dataset, so there's nothing to provision.

## 1. Find the Studio

1. Look for `sanity.config.ts` (or `.js`, `.tsx`, `.jsx`, `.mjs`). Common
   places: the repo root, `studio/`, `apps/studio/`, `packages/studio/`. A
   Studio embedded in Next.js usually keeps it at the app root, next to a
   route that renders `<NextStudio>`.
2. The Studio package is the nearest `package.json` above that file that lists
   `sanity` as a dependency. Install there.
3. More than one Studio config in the repo → ask the user which one.
   None → stop and say this doesn't look like a Sanity Studio project.

## 2. Check compatibility

Read the **installed** versions, not just the ranges in `package.json`
(`node_modules/<name>/package.json`, or `npm ls <name>` / `pnpm why <name>`):

| Package             | Needs            |
| ------------------- | ---------------- |
| `sanity`            | `5.x` or `6.x`   |
| `react`             | `19.2` or newer  |
| `react-dom`         | `19.2` or newer  |
| `styled-components` | `6.1` or newer   |
| Node.js             | 20.19+ or 22.12+ |

If anything is out of range, stop. Tell the user which package is too old and
that upgrading it is their call. Sanity 4 and older are not supported.

On Sanity 5 the Studio ends up with two copies of `@sanity/ui` (its own v3 and
the plugin's v4). That's expected and works. Don't add overrides or
resolutions to dedupe it.

## 3. Install

Pick the package manager from the lockfile and run it in the Studio package:

| Lockfile            | Command                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| `pnpm-lock.yaml`    | `pnpm add @maciejtrzcinski/sanity-plugin-schema-visualization@beta`    |
| `package-lock.json` | `npm install @maciejtrzcinski/sanity-plugin-schema-visualization@beta` |
| `yarn.lock`         | `yarn add @maciejtrzcinski/sanity-plugin-schema-visualization@beta`    |
| `bun.lock(b)`       | `bun add @maciejtrzcinski/sanity-plugin-schema-visualization@beta`     |

In a monorepo where the lockfile sits at the root, target the Studio package
(`pnpm add --filter <studio-package-name> …`, `npm install -w <workspace> …`,
or run the command from the Studio directory).

The plugin is in beta, hence the `@beta` tag. If the install 404s, the beta
isn't on npm yet: stop and tell the user.

## 4. Register the plugin

Import `schemaVisualization` from the package root and add it to `plugins`.
Keep the diff minimal: one import, one array entry.

```ts
// sanity.config.ts
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {schemaVisualization} from '@maciejtrzcinski/sanity-plugin-schema-visualization'

export default defineConfig({
  // ...
  plugins: [structureTool(), schemaVisualization()],
})
```

- **Put it after `structureTool()`** (and after other tools the user already
  has). The first tool in the navbar is the one the Studio opens on, so
  appending keeps the user's landing page where it was.
- **Multiple workspaces** (`defineConfig([...])`): if they share a `plugins`
  array or helper, add it there once. Otherwise add it to every workspace, or
  ask the user which ones should get it.
- **A `tools` callback** in the config that keeps only certain tools by name
  will hide this one. Add `'graph'` (or whatever `name` you set) to it.
- **JavaScript configs** take exactly the same code.

## 5. Choose options

**Default to no options.** `schemaVisualization()` is the right call for most
Studios. Add an option only when the user asked for it or one of these
applies:

| If…                                                             | Set                                              |
| --------------------------------------------------------------- | ------------------------------------------------ |
| The user wants document counts per type                         | `documentCounts: true`                           |
| The project is on Sanity's Free plan (only if the user says so) | The attribute-limit rule at 2,000, see below     |
| Another tool in the Studio is already named `graph`             | `name: 'schema-graph'` (the URL segment)         |
| The user wants a different navbar label                         | `title: 'Data model'`                            |
| The user prefers a vertical layout or a dense overview          | `defaults: {direction: 'TB', compactMode: true}` |
| References through deeply nested inline objects don't show up   | `maxDepth: 12` (default `8`)                     |

What `documentCounts: true` does: it adds a "Load doc counts" button. Nothing
is queried until someone clicks it; then it runs two read-only GROQ `count()`
queries in the Studio's current perspective. The person clicking needs read
access to the dataset.

Every registry option (`kinds`, `edgeKinds`, `fieldDescribers`, `fieldBadges`,
`nodeBadges`, `filters`, `healthRules`) **replaces** its default instead of
merging with it. Build on the exported defaults so the built-ins stay, and
import them from the `/registry` subpath. Never import from `dist/` paths.

```ts
import {schemaVisualization} from '@maciejtrzcinski/sanity-plugin-schema-visualization'
import {
  createAttributePathsRule,
  defaultHealthRules,
  replaceById,
} from '@maciejtrzcinski/sanity-plugin-schema-visualization/registry'

schemaVisualization({
  documentCounts: true,
  // Free plan: 2,000 attributes. Growth and Enterprise: 10,000 (the default).
  healthRules: replaceById(defaultHealthRules, createAttributePathsRule({limit: 2000})),
})
```

Custom kinds, filters, badges or health rules go beyond setup. Follow
[docs/extending.md](https://github.com/maciejtrzcinski/sanity-plugin-schema-visualization/blob/main/docs/extending.md)
for those, and only if the user asked.

## 6. Verify

1. **Type-check**, if the Studio is TypeScript: run its `typecheck` script, or
   `npx tsc --noEmit` from the Studio package.
2. **Boot the Studio** with its usual dev script (often `npm run dev`, which
   runs `sanity dev`) and open the tool:
   - standalone Studio: `http://localhost:3333/graph`
   - several workspaces: `http://localhost:3333/<workspace basePath>/graph`
   - embedded in Next.js: `http://localhost:3000/<studio route>/graph`
3. **Expect** a "Graph" item in the navbar and one card per schema type, with
   arrows for references.
4. **Read the browser console.** Messages prefixed `[schema-visualization]`
   are the plugin talking:
   - Ones about ids, catch-alls or `urlParam`s are config mistakes. Fix them.
   - "Expected shape not found for …" means this Sanity version moved
     something the plugin reads. The tool still works with a feature degraded.
     Tell the user and suggest
     [opening an issue](https://github.com/maciejtrzcinski/sanity-plugin-schema-visualization/issues).
5. Stop the dev server when you're done.

If you can't open a browser, say so and give the user the URL and what they
should see.

## Troubleshooting

| Symptom                                                     | Cause and fix                                                                                                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| No "Graph" in the navbar                                    | Plugin added to a different workspace, a `tools` callback filters it out, or the dev server needs a restart.                                         |
| `Cannot find module '…/registry'` in TypeScript             | The Studio's `tsconfig.json` uses `"moduleResolution": "node"`, which ignores subpath exports. `"bundler"` (Sanity's default) or `"nodenext"` works. |
| Peer dependency warnings for `react` or `styled-components` | Versions below what step 2 lists. Report to the user; don't force-install.                                                                           |
| "Load doc counts" fails                                     | The user isn't logged in or has no read access to the dataset.                                                                                       |
| "Close to the attribute limit" on a Free plan project       | It warns at 80% of 10,000 by default. Set the limit to 2,000 (step 5).                                                                               |

## Report back

When you're done, tell the user:

- the version installed and which `package.json` it went into,
- the config file(s) you changed,
- the options you set and why, or that you kept the defaults,
- the URL to open the tool,
- anything you skipped or couldn't verify.

---

## Optional: schema checks outside the Studio

Only if the user asks. The graph and health functions run without a Studio,
so a script can print the schema as Mermaid or fail CI on health issues. This
needs `sanity` 6.19 or newer (older 6.x won't load outside a bundler) and
`tsx` to run it:

```ts
// schema-graph.ts — run with `npx tsx schema-graph.ts`
import {createSchema} from 'sanity'
import {
  computeHealthIssues,
  graphToMermaid,
  schemaToGraph,
} from '@maciejtrzcinski/sanity-plugin-schema-visualization/registry'
import {schemaTypes} from './schemaTypes'

const graph = schemaToGraph(createSchema({name: 'default', types: schemaTypes}))
console.log(graphToMermaid(graph))
console.log(computeHealthIssues(graph))
```

Point the `schemaTypes` import at wherever the Studio's `schema.types` come
from. `graphToMermaid` is beta API and may change in a minor release.
