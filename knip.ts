import {defineConfig} from 'knip/config'

export default defineConfig({
  // `src/index.ts` is inferred from package.json `exports`; `dev/` is the demo
  // Studio, which nothing imports — it's only ever run via `pnpm run dev`.
  'entry': ['dev/sanity.config.ts', 'dev/sanity.cli.ts'],
  'project': ['src/**/*.{ts,tsx}', 'dev/**/*.ts'],
  // The CI and release workflows are parked in `back_workflows` until the
  // package is ready to publish. Scan them anyway, so what they run
  // (`semantic-release`) counts as used and stays installed.
  'github-actions': {
    config: ['.github/workflows/*.{yml,yaml}', '.github/back_workflows/*.{yml,yaml}'],
  },
  'ignoreDependencies': [
    // Consumed by the `browserslist` field in package.json, not by an import.
    '@sanity/browserslist-config',
    // Run by that preset's `npx -y prettier` on CHANGELOG.md. Under pnpm, npx
    // sees prettier's transitive copy, skips the download and finds no bin.
    'prettier',
  ],
})
