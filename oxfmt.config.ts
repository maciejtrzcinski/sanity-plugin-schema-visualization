import pluginKitOxfmt from '@sanity/plugin-kit/oxfmt'
import {defineConfig} from 'oxfmt'

export default defineConfig({
  ...pluginKitOxfmt,
  // Written by the release and formatted with prettier, not oxfmt.
  ignorePatterns: [...(pluginKitOxfmt.ignorePatterns ?? []), 'CHANGELOG.md'],
})
