import {describe, expect, it} from 'vitest'

import {colorAlpha, esc, svgExportFileName} from './exportSvg'

describe('svgExportFileName', () => {
  it('scopes the download to the workspace and dataset', () => {
    expect(svgExportFileName({workspaceName: 'staging', dataset: 'development'})).toBe(
      'schema-graph-staging-development.svg',
    )
  })

  it('falls back to the bare name outside a workspace', () => {
    expect(svgExportFileName()).toBe('schema-graph.svg')
  })

  it('slugifies anything a filename cannot carry', () => {
    expect(svgExportFileName({workspaceName: 'Marketing Site (EU)', dataset: 'prod_2'})).toBe(
      'schema-graph-marketing-site-eu-prod-2.svg',
    )
  })

  it('does not repeat a workspace named after its dataset', () => {
    expect(svgExportFileName({workspaceName: 'production', dataset: 'production'})).toBe(
      'schema-graph-production.svg',
    )
  })
})

describe('esc', () => {
  it('escapes the four characters that would break the document', () => {
    expect(esc('Say "hi" & <b>go</b>')).toBe('Say &quot;hi&quot; &amp; &lt;b&gt;go&lt;/b&gt;')
  })

  it('escapes the ampersand first, so an escape is not itself re-escaped', () => {
    // `&` → `&amp;` last would turn `&lt;` into `&amp;lt;`.
    expect(esc('<')).toBe('&lt;')
    expect(esc('&lt;')).toBe('&amp;lt;')
  })

  it('leaves text with nothing to escape untouched', () => {
    expect(esc('')).toBe('')
    expect(esc("Blog post — author's name")).toBe("Blog post — author's name")
  })
})

describe('colorAlpha', () => {
  it('reads nothing-to-paint as fully transparent', () => {
    for (const value of ['', '   ', 'none', 'transparent']) {
      expect(colorAlpha(value)).toBe(0)
    }
  })

  it('treats an opaque color as opaque, whatever notation it arrived in', () => {
    for (const value of [
      '#2276fc',
      'rgb(34, 118, 252)',
      'color(srgb 0.1 0.4 1)',
      'oklch(0.6 0.2 250)',
    ]) {
      expect(colorAlpha(value)).toBe(1)
    }
  })

  it('reads the fourth channel of a legacy rgba()', () => {
    expect(colorAlpha('rgba(0, 0, 0, 0.5)')).toBe(0.5)
    expect(colorAlpha('rgba(0, 0, 0, 0)')).toBe(0)
  })

  it('reads the slash-separated alpha of a modern functional color', () => {
    expect(colorAlpha('color(srgb 0.1 0.4 1 / 0.25)')).toBe(0.25)
    expect(colorAlpha('oklch(0.6 0.2 250 / 0.4)')).toBe(0.4)
    expect(colorAlpha('rgb(34 118 252 / 0.75)')).toBe(0.75)
  })

  it('scales a percentage alpha', () => {
    expect(colorAlpha('oklch(0.6 0.2 250 / 50%)')).toBe(0.5)
    expect(colorAlpha('color(srgb 0 0 0 / 0%)')).toBe(0)
  })

  it('falls back to opaque for a form it cannot read', () => {
    expect(colorAlpha('rebeccapurple')).toBe(1)
    expect(colorAlpha('var(--card-bg-color)')).toBe(1)
  })
})
