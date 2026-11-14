import {describe, expect, it} from 'vitest'

import {makeFilterContext, postNode} from '../test/fixtures'
import {spyOnWarnings, warningAt} from '../test/warnings'
import {
  createDefaultFilters,
  createKindsFilter,
  defaultFilterValues,
  type FilterDef,
} from './filters'
import type {GraphStats} from './hooks/useGraphModel'
import {defaultTranslate} from './i18n'
import {defaultNodeKinds, documentKind, objectKind, otherKind} from './kinds'
import {statsLine} from './statsLine'

const defaultDefs = createDefaultFilters(defaultNodeKinds)
const defaultFilters = defaultFilterValues(defaultDefs)

const stats: GraphStats = {
  byKind: [
    {kind: documentKind, count: 2},
    {kind: objectKind, count: 1},
    {kind: otherKind, count: 0},
  ],
  edges: 2,
  system: 1,
}

function line({
  stats: s = stats,
  filters = defaultFilters,
  defs = defaultDefs,
  context = makeFilterContext(),
}: {
  stats?: GraphStats
  filters?: Record<string, readonly string[]>
  defs?: readonly FilterDef[]
  context?: ReturnType<typeof makeFilterContext>
} = {}): string {
  return statsLine(s, filters, defs, context, defaultTranslate)
}

describe('statsLine', () => {
  it('is built from the kind registry, dropping kinds with nothing to report', () => {
    expect(line()).toBe('2 documents · 1 objects · 2 connections · 1 system · system types hidden')
  })

  it('drops the "hidden" note once system types are included', () => {
    expect(line({filters: {...defaultFilters, system: ['1']}})).toBe(
      '2 documents · 1 objects · 2 connections · 1 system',
    )
  })

  it('does not call system types hidden when the schema has none', () => {
    expect(line({stats: {...stats, system: 0}})).toBe(
      '2 documents · 1 objects · 2 connections · system types hidden',
    )
  })

  it('leaves out the note of a filter whose summary throws, keeping the rest', () => {
    const warn = spyOnWarnings()
    const broken: FilterDef = {
      id: 'broken',
      label: 'Broken',
      type: 'single',
      options: [{value: 'all', label: 'All'}],
      defaultValues: ['all'],
      urlParam: 'broken',
      predicate: () => true,
      summary: () => {
        throw new Error('nope')
      },
    }
    const defs = [...defaultDefs, broken]

    expect(line({defs, filters: defaultFilterValues(defs)})).toBe(line())
    line({defs, filters: defaultFilterValues(defs)})
    expect(warn).toHaveBeenCalledOnce()
    expect(warningAt(warn)).toContain(
      "`broken` filter's `summary` failed, so its note is left off the stats line",
    )
  })

  it('appends whatever note each installed filter summarises itself with', () => {
    const usageFilter: FilterDef = {
      id: 'usage',
      label: 'Usage',
      type: 'single',
      options: [
        {value: 'all', label: 'All'},
        {value: 'unused', label: 'Unused'},
      ],
      defaultValues: ['all'],
      urlParam: 'usage',
      predicate: () => true,
      summary: (selected) => (selected.value === 'unused' ? 'unused only' : undefined),
    }
    const defs = [createKindsFilter(defaultNodeKinds), usageFilter]

    expect(line({defs, filters: {...defaultFilterValues(defs), usage: ['unused']}})).toBe(
      '2 documents · 1 objects · 2 connections · 1 system · unused only',
    )
    expect(line({defs, filters: defaultFilterValues(defs)})).toBe(
      '2 documents · 1 objects · 2 connections · 1 system',
    )
  })

  it('counts a custom kind rather than folding it into a built-in bucket', () => {
    const assetKind = {...objectKind, id: 'asset', label: 'Assets', singular: 'asset'}
    const defs = createDefaultFilters([documentKind, assetKind, otherKind])

    expect(
      line({
        stats: {byKind: [{kind: assetKind, count: 3}], edges: 0, system: 0},
        defs,
        filters: defaultFilterValues(defs),
        context: makeFilterContext({graph: {nodes: [postNode], edges: []}}),
      }),
    ).toBe('3 assets · 0 connections')
  })

  /** "1 documents" is pinned on purpose: using `singular` is a copy change in every locale. */
  it('pluralises the connection count, but takes each kind label as it comes', () => {
    expect(
      line({
        stats: {byKind: [{kind: documentKind, count: 1}], edges: 1, system: 1},
        filters: {...defaultFilters, system: ['1']},
      }),
    ).toBe('1 documents · 1 connection · 1 system')
  })
})
