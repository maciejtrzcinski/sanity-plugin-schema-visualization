import pluginKitOxfmt from '@sanity/plugin-kit/oxfmt'
import {defineConfig} from 'oxfmt'

export default defineConfig({
  ...pluginKitOxfmt,
  // The release writes CHANGELOG.md and formats it with prettier (the
  // semantic-release preset's `prepareCmd`), so oxfmt keeps out of it.
  ignorePatterns: [...(pluginKitOxfmt.ignorePatterns ?? []), 'CHANGELOG.md'],
})
