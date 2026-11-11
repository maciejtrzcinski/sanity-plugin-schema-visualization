import {defineCliConfig} from 'sanity/cli'

declare const process: {env: Record<string, string | undefined>}

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'your-project-id',
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  },
  vite: (config) => ({
    ...config,
    optimizeDeps: {
      ...config.optimizeDeps,
      // @sanity/sdk-react ships raw JSX in .js files, which the dep optimizer won't parse.
      rolldownOptions: {
        ...config.optimizeDeps?.rolldownOptions,
        moduleTypes: {'.js': 'jsx'},
      },
    },
    // Same for `sanity build`, which skips the dep optimizer.
    build: {
      ...config.build,
      rolldownOptions: {
        ...config.build?.rolldownOptions,
        moduleTypes: {'.js': 'jsx'},
      },
    },
  }),
})
