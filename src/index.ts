import {ProjectsIcon} from '@sanity/icons/Projects'
import {lazy} from 'react'
import {defineLocaleResourceBundle, definePlugin, type LocaleResourceBundle} from 'sanity'

import type {SchemaVisualizationOptions} from './config'
import {I18N_NAMESPACE} from './i18nNamespace'

/**
 * This plugin's English strings as a Studio locale bundle. The lazy `resources`
 * stay out of the entry chunk only while nothing here imports `./i18n` statically.
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

/** Lazy, so installing the plugin doesn't load React Flow or dagre until the tool opens. */
const LazySchemaVisualizationTool = lazy(async () => ({
  default: (await import('./SchemaVisualizationTool')).SchemaVisualizationTool,
}))

/**
 * Adds a "Graph" tool to the Studio navbar that renders the schema as an
 * interactive canvas.
 *
 * ```ts
 * plugins: [schemaVisualization()]
 * ```
 *
 * @public
 */
export const schemaVisualization = definePlugin<SchemaVisualizationConfig | void>((config = {}) => {
  // `config` is `Config | void`, which can't be destructured directly.
  const {name = 'graph', title = 'Graph', ...options}: SchemaVisualizationConfig = config || {}

  return {
    name: 'sanity-plugin-schema-visualization',
    i18n: {bundles: [enUSLocaleBundle]},
    tools: (prev) => [
      ...prev,
      {
        name,
        title,
        icon: ProjectsIcon,
        component: LazySchemaVisualizationTool,
        options,
      },
    ],
  }
})

export {I18N_NAMESPACE} from './i18nNamespace'
export type {SchemaVisualizationOptions} from './config'
