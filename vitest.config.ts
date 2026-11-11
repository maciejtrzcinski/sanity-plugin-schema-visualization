import {defineConfig} from 'vitest/config'

export default defineConfig({
  // `sanity`'s transitive `entities` dep ships sourcemaps Vite warns about on every run.
  logLevel: 'error',
  resolve: {
    // A regex: a string alias would rewrite `@sanity/sdk-react/dashboard` to a path under the stub.
    alias: [
      {
        find: /^@sanity\/sdk-react(\/.*)?$/,
        replacement: new URL('./test/sdk-react-stub.ts', import.meta.url).pathname,
      },
    ],
  },
  test: {
    setupFiles: ['./test/setup.ts'],
    // Several jsdom `waitFor`s in a row can outlast the default. See `asyncUtilTimeout`.
    testTimeout: 45_000,
    server: {deps: {inline: [/sanity/]}},
  },
})
