import {selectionFor, type FilterContext, type FilterDef, type FilterValues} from './filters'
import type {GraphStats} from './hooks/useGraphModel'
import {localized, type TranslateFn} from './i18n'

/**
 * The toolbar's one-line summary of the schema, e.g.
 * `2 documents · 1 objects · 2 connections · 1 system · system types hidden`.
 *
 * Built from the kind registry rather than named fields, so registering a kind
 * gives it a segment here automatically. Kinds with nothing to report are
 * dropped, so a two-document schema doesn't read "… · 0 objects". Each
 * installed filter then gets to append its own note through `summary` — which
 * is what keeps the wording honest for a consumer who drops the system filter:
 * nothing else in here claims system types are hidden.
 *
 * Pure, and separate from the toolbar, so the wording can be asserted without
 * mounting one.
 */
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
        // Mid-sentence, so the kind's own (translated) plural label is
        // lowercased for the locale rather than spelled out a second time.
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
