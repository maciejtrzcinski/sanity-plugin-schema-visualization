import {defineConfig} from 'knip/config'

export default defineConfig({
  'entry': ['dev/sanity.config.ts', 'dev/sanity.cli.ts'],
  'project': ['src/**/*.{ts,tsx}', 'dev/**/*.ts'],
  // Scanned so what the workflows run (`semantic-release`) counts as used.
  'github-actions': {
    config: ['.github/workflows/*.{yml,yaml}', '.github/back_workflows/*.{yml,yaml}'],
  },
  'ignoreDependencies': [
    // Consumed by the `browserslist` field in package.json, not by an import.
    '@sanity/browserslist-config',
    // Run by the release preset's `npx -y prettier`, which finds no bin under pnpm otherwise.
    'prettier',
  ],
})
