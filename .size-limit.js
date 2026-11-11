// `boot`: what every Studio downloads at startup, dynamic imports excluded.
// `tool`: what opening the tool costs, minus packages the Studio already loaded.
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
