import {selectionFor, type FilterContext, type FilterDef, type FilterValues} from './filters'
import type {GraphStats} from './hooks/useGraphModel'
import {localized, type TranslateFn} from './i18n'

/** e.g. `2 documents · 1 objects · 2 connections · 1 system · system types hidden`. */
export function statsLine(
  stats: GraphStats,
  filters: FilterValues,
  filterDefs: readonly FilterDef[],
  filterContext: FilterContext,
  t: TranslateFn,
): string {
  const parts = stats.byKind
    .filter((entry) => entry.count > 0)
    .map((entry) =>
      t('toolbar.stats.kind', {
        count: entry.count,
        label: localized(t, entry.kind.i18n?.label, entry.kind.label).toLocaleLowerCase(),
      }),
    )

  parts.push(t('toolbar.stats.connections', {count: stats.edges}))
  if (stats.system > 0) parts.push(t('toolbar.stats.system', {count: stats.system}))

  for (const def of filterDefs) {
    const note = def.summary?.(selectionFor(filters, def), filterContext)
    if (note) parts.push(note)
  }

  return parts.join(' · ')
}
