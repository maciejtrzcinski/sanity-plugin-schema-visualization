import {describe, expect, it} from 'vitest'

import {defaultTranslate, enUSResources, interpolate, localized, type TranslateFn} from './i18n'
import {documentKind} from './kinds'

declare global {
  interface ImportMeta {
    /** Declared here: Vite isn't a dependency, so no `vite/client` types. */
    glob: (
      pattern: string,
      options: {query: '?raw'; import: 'default'; eager: true},
    ) => Record<string, string>
  }
}

describe('defaultTranslate', () => {
  it('resolves a key against the English bundle', () => {
    expect(defaultTranslate('toolbar.copy-link')).toBe('Copy link')
  })

  it('interpolates values into the template', () => {
    expect(defaultTranslate('detail.fields', {count: 3})).toBe('Fields (3)')
  })

  it('picks the plural form from `count`, the way i18next does', () => {
    expect(defaultTranslate('toolbar.stats.connections', {count: 1})).toBe('1 connection')
    expect(defaultTranslate('toolbar.stats.connections', {count: 2})).toBe('2 connections')
    expect(defaultTranslate('toolbar.stats.connections', {count: 0})).toBe('0 connections')
  })

  it('falls back to `defaultValue`, then to the key itself', () => {
    expect(defaultTranslate('no.such.key', {defaultValue: 'Custom badge'})).toBe('Custom badge')
    expect(defaultTranslate('no.such.key')).toBe('no.such.key')
  })

  it('leaves a placeholder nothing was passed for alone', () => {
    expect(interpolate('{{a}} and {{b}}', {a: 'x'})).toBe('x and {{b}}')
  })
})

describe('localized', () => {
  const translate: TranslateFn = (key, values) =>
    typeof values?.defaultValue === 'string' && !(key in enUSResources)
      ? values.defaultValue
      : `nb:${key}`

  it('uses the resource a def names', () => {
    expect(localized(translate, documentKind.i18n?.label, documentKind.label)).toBe(
      'nb:kind.document.label',
    )
  })

  it('keeps the def’s own text when there is no key', () => {
    expect(localized(translate, undefined, 'Singletons')).toBe('Singletons')
  })

  it('translates a key this bundle doesn’t define — it belongs to whoever wrote it', () => {
    expect(localized(translate, 'my-plugin.kind.label', 'Singletons')).toBe('Singletons')
  })

  it('drops a built-in key once the def no longer carries that built-in’s text', () => {
    const collectionKind = {...documentKind, id: 'collection', label: 'Collections'}

    expect(localized(translate, collectionKind.i18n?.label, collectionKind.label)).toBe(
      'Collections',
    )
  })
})

describe('the English bundle and its call sites', () => {
  const sources = import.meta.glob('./**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  })
  const allSource = Object.entries(sources)
    .filter(([path]) => !path.includes('.test.') && !path.endsWith('/i18n.ts'))
    .map(([, source]) => source)
    .join('\n')

  const quotedKeys = new Set(
    [...allSource.matchAll(/'([a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+)'/g)].map((m) => m[1]),
  )

  const baseKeys = new Set(
    Object.keys(enUSResources).map((key) => key.replace(/_(one|other)$/, '')),
  )

  it('defines every key the plugin asks for', () => {
    const asked = [...quotedKeys].filter((key) =>
      [...baseKeys].some((known) => known.split('.')[0] === key.split('.')[0]),
    )
    const missing = asked.filter((key) => !baseKeys.has(key))

    expect(missing).toEqual([])
  })

  it('ships no resource nothing reads', () => {
    const unused = [...baseKeys].filter((key) => !quotedKeys.has(key))

    expect(unused).toEqual([])
  })

  it('pairs every plural key with both of its forms', () => {
    const plurals = Object.keys(enUSResources).filter((key) => /_(one|other)$/.test(key))
    const lonely = plurals.filter((key) => {
      const other = key.endsWith('_one')
        ? key.replace(/_one$/, '_other')
        : key.replace(/_other$/, '_one')
      return !(other in enUSResources)
    })

    expect(lonely).toEqual([])
  })
})
