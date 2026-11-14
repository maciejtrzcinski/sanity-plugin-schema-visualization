import {onTestFinished, vi} from 'vitest'

import {resetBrokenAssumptions} from '../src/compat'

/**
 * Silences `console.warn` for the current test and returns the spy. Once-only
 * warnings are reset first, so one reported by an earlier test reports again.
 */
export function spyOnWarnings() {
  resetBrokenAssumptions()
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  onTestFinished(() => warn.mockRestore())
  return warn
}

/** The message of the `index`th warning, without the plugin's prefix. */
export function warningAt(warn: ReturnType<typeof spyOnWarnings>, index = 0): string {
  return String(warn.mock.calls[index]?.[0]).replace('[schema-visualization] ', '')
}
