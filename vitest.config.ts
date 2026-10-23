import {defineConfig} from 'vitest/config'

export default defineConfig({
  // `sanity`'s transitive `entities` dep ships sourcemaps pointing outside its
  // own package, which Vite warns about on every run. Vitest's own reporter
  // output is unaffected by this.
  logLevel: 'error',
  resolve: {
    // A regex, because a string alias rewrites `@sanity/sdk-react/dashboard` to
    // a path under the stub file instead of to the stub.
    alias: [
      {
        find: /^@sanity\/sdk-react(\/.*)?$/,
        replacement: new URL('./test/sdk-react-stub.ts', import.meta.url).pathname,
      },
    ],
  },
  test: {
    setupFiles: ['./test/setup.ts'],
    // The component suites render into jsdom and wait on React Flow's layout,
    // which is slow enough there that a test doing a few `waitFor`s in a row
    // can outlast the 5s default — see `asyncUtilTimeout` in `test/setup.ts`.
    testTimeout: 45_000,
    server: {deps: {inline: [/sanity/]}},
  },
})
