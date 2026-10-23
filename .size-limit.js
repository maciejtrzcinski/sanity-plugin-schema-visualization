/**
 * Two budgets, matching the two moments a Studio pays for this plugin.
 *
 * `boot` is what every Studio that installs the plugin downloads at startup,
 * whether or not anyone opens the tool — so it must stay tiny. Dynamic imports
 * are left out of it on purpose: they are the lazily loaded tool, measured
 * separately. A stray static import from `src/index.ts` is exactly what this
 * catches.
 *
 * `tool` is what opening the tool costs, with its own dependencies (React Flow,
 * dagre) bundled in. The Studio's own packages are excluded: the Studio has
 * already loaded them.
 */
const studio = ['sanity', 'react', 'react-dom', 'styled-components', '@sanity/ui', '@sanity/icons']

const leaveDynamicImportsOut = {
  name: 'leave-dynamic-imports-out',
  setup(build) {
    build.onResolve({filter: /.*/}, (args) =>
      args.kind === 'dynamic-import' ? {path: args.path, external: true} : undefined,
    )
  },
}

export default [
  {
    name: 'boot: what every Studio loads at startup',
    path: 'dist/index.js',
    import: '{schemaVisualization}',
    ignore: studio,
    limit: '1 kB',
    modifyEsbuildConfig: (config) => ({
      ...config,
      plugins: [...(config.plugins ?? []), leaveDynamicImportsOut],
    }),
  },
  {
    name: 'tool: what opening the Graph tool loads',
    path: 'dist/SchemaVisualizationTool-*.js',
    ignore: studio,
    limit: '100 kB',
  },
]
