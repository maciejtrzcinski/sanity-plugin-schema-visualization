import {ProjectsIcon} from '@sanity/icons/Projects'
import {lazy} from 'react'
import {defineLocaleResourceBundle, definePlugin, type LocaleResourceBundle} from 'sanity'

import type {SchemaVisualizationOptions} from './config'
import {I18N_NAMESPACE} from './i18nNamespace'

/**
 * This plugin's English strings, as a Studio locale bundle. Declared here so
 * `src/i18n.ts` stays free of Studio imports and readable from Node.
 *
 * The lazy `resources` form keeps the 10 KB of strings in a chunk of their
 * own rather than the Studio's entry chunk. The Studio still requests it at
 * boot — it declares every namespace up front — and that holds only while
 * nothing here imports `./i18n` statically (see `i18nNamespace.ts`).
 *
 * @public
 */
export const enUSLocaleBundle: LocaleResourceBundle = defineLocaleResourceBundle({
  locale: 'en-US',
  namespace: I18N_NAMESPACE,
  resources: () => import('./i18n').then((mod) => mod.enUSResources),
})

/** @public */
export interface SchemaVisualizationConfig extends SchemaVisualizationOptions {
  /** Tool name shown in the URL, e.g. /graph. Defaults to "graph". */
  name?: string
  /** Title shown in the Studio navbar. Defaults to "Graph". */
  title?: string
}

/**
 * Lazy, so a Studio that merely installs the plugin doesn't load React Flow,
 * dagre and their stylesheet until someone opens the tool. The Studio renders
 * the active tool inside `<Suspense>`, so no fallback is needed.
 */
const LazySchemaVisualizationTool = lazy(async () => ({
  default: (await import('./SchemaVisualizationTool')).SchemaVisualizationTool,
}))

/**
 * Adds a "Graph" tool to Sanity Studio's navbar — next to Structure,
 * Presentation, Releases, etc. — that renders your entire schema as an
 * interactive, pan/zoomable canvas: document types, object types, fields,
 * options and reference connections.
 *
 * Usage in `sanity.config.ts`:
 *
 * ```ts
 * import {defineConfig} from 'sanity'
 * import {schemaVisualization} from '@maciejtrzcinski/sanity-plugin-schema-visualization'
 *
 * export default defineConfig({
 *   // ...
 *   plugins: [schemaVisualization()],
 * })
 * ```
 *
 * @public
 */
export const schemaVisualization = definePlugin<SchemaVisualizationConfig | void>((config = {}) => {
  // `definePlugin`'s parameter is `Config | void`, which can't be destructured
  // directly even with a default — narrow it first.
  const {name = 'graph', title = 'Graph', ...options}: SchemaVisualizationConfig = config || {}

  return {
    name: 'sanity-plugin-schema-visualization',
    // Every string the tool paints comes from this namespace. A Studio adds a
    // locale by registering its own bundle for `schema-visualization`, exactly
    // as it would for a first-party tool.
    i18n: {bundles: [enUSLocaleBundle]},
    tools: (prev) => [
      ...prev,
      {
        name,
        title,
        icon: ProjectsIcon,
        component: LazySchemaVisualizationTool,
        // Passed through to the tool component as `props.tool.options`, and
        // from there into the config context every part of the tool reads.
        options,
      },
    ],
  }
})

/*
 * Every Studio that installs the plugin runs this module at boot, so it
 * carries only what a `sanity.config.ts` needs. The extensibility surface is
 * published from `/registry` instead — see `src/exports/registry.ts`.
 */
export {I18N_NAMESPACE} from './i18nNamespace'
export type {SchemaVisualizationOptions} from './config'
