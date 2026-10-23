import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'

import {schemaVisualization} from '../src'
import {largeSchemaTypes} from '../test/largeSchema'
import {schemaTypes} from './schemaTypes'

// The Studio's bundler inlines `process.env.SANITY_STUDIO_*` at build time.
declare const process: {env: Record<string, string | undefined>}

export default defineConfig({
  name: 'default',
  title: 'Schema Visualization – Dev Studio',

  // Replace with a real project id/dataset to fully exercise the Studio,
  // e.g. by running `npx sanity init --env` from this folder.
  projectId: 'your-project-id',
  dataset: 'production',

  plugins: [structureTool(), schemaVisualization({documentCounts: true})],

  // `SANITY_STUDIO_LARGE_SCHEMA=1 pnpm dev` swaps in the synthetic 331-type
  // page builder the layout benchmarks run against — the size at which the
  // canvas has to switch layout engines.
  schema: {
    types: process.env.SANITY_STUDIO_LARGE_SCHEMA ? largeSchemaTypes() : schemaTypes,
  },
})
