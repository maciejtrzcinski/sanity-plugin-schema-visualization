import {missingTitle} from '@sanity-labs/schema-lint'
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'

import {schemaVisualization} from '../src'
import {defaultHealthRules, fromSanityLint} from '../src/exports/registry'
import {largeSchemaTypes} from '../test/largeSchema'
import {schemaTypes} from './schemaTypes'

// The Studio's bundler inlines `process.env.SANITY_STUDIO_*` at build time.
declare const process: {env: Record<string, string | undefined>}

export default defineConfig({
  name: 'default',
  title: 'Schema Visualization – Dev Studio',

  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'your-project-id',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',

  plugins: [
    structureTool(),
    schemaVisualization({
      documentCounts: true,
      healthRules: [...defaultHealthRules, ...fromSanityLint([missingTitle])],
    }),
  ],

  // `SANITY_STUDIO_LARGE_SCHEMA=1` swaps in the synthetic 331-type schema.
  schema: {
    types: process.env.SANITY_STUDIO_LARGE_SCHEMA ? largeSchemaTypes() : schemaTypes,
  },
})
