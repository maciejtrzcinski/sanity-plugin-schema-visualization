import {createContext, useContext, useMemo, type ReactNode} from 'react'

import {warnOnce} from './compat'
import {catchAllEdgeKind, defaultEdgeKinds, type EdgeKindDef} from './edgeKinds'
import type {FieldBadgeDef} from './fieldBadges'
import type {FieldDescriber} from './fieldWalker'
import {
  createDefaultFilters,
  defaultFilterValues,
  type FilterDef,
  type FilterValues,
} from './filters'
import {defaultHealthRules, type HealthRule} from './healthRules'
import {catchAllKind, kindIdsWith, type NodeKindDef} from './kinds'
import {defaultNodeBadges, type NodeBadgeDef} from './nodeBadges'
import {duplicateIds, duplicates, indexById, type Registered} from './registry'
import {resolveGraphOptions, type SchemaToGraphOptions} from './schemaToGraph'
import type {GraphEdgeKind, GraphNodeKind} from './types'
import {RESERVED_URL_PARAMS} from './urlState'

/**
 * What a consumer may override when registering the plugin.
 *
 * @public
 */
export interface SchemaVisualizationOptions extends SchemaToGraphOptions {
  /** Enables the toolbar's on-demand per-type document count. Off by default. */
  documentCounts?: boolean
  /** Categories to sort schema types into. First match wins, so the catch-all goes last. */
  kinds?: readonly NodeKindDef[]
  /**
   * How deep to descend into anonymous nested types when reading a field's
   * connections. Defaults to 8 — deep enough for any hand-written schema; a
   * generated one nesting inline objects further than that can raise it.
   */
  maxDepth?: number
  /**
   * How each kind of connection is drawn, labelled and badged. Needed only by
   * a `FieldDescriber` that emits links of a kind beyond the built-in
   * `reference` and `reuses`.
   */
  edgeKinds?: readonly EdgeKindDef[]
  /** Rules for reading a compiled schema type's label and connections. */
  fieldDescribers?: readonly FieldDescriber[]
  /**
   * Badges describing how a field behaves — `required`, `read-only`, `list`.
   * Unlike the other registries this one has no first-match ordering: every
   * entry runs, and order is the order badges appear on the field row.
   */
  fieldBadges?: readonly FieldBadgeDef[]
  /**
   * Badges on a type's card header and in its detail panel — `system`,
   * `deprecated`, the live document count, the collapsed card's field summary.
   * Like `fieldBadges` every entry runs and order is the order they appear;
   * unlike it, the height the canvas reserves per card is measured from
   * whatever this produces, so a new badge needs no layout change.
   */
  nodeBadges?: readonly NodeBadgeDef[]
  /**
   * Node-visibility filters offered in the toolbar. Given a function, it
   * receives the resolved kinds so a custom set can still include the derived
   * kind filter (`createKindsFilter(kinds)`).
   */
  filters?: readonly FilterDef[] | ((kinds: readonly NodeKindDef[]) => readonly FilterDef[])
  /** Checks run over the graph for the health panel. */
  healthRules?: readonly HealthRule[]
  /** Starting view state, before anything the URL or a previous session supplies. */
  defaults?: {
    direction?: 'LR' | 'TB'
    compactMode?: boolean
  }
}

export interface ResolvedConfig {
  documentCounts: boolean
  kinds: readonly NodeKindDef[]
  kindById: Map<GraphNodeKind, NodeKindDef>
  /** Where a kind id that isn't in `kinds` resolves — see {@link catchAllKind}. */
  catchAll: NodeKindDef
  /** Ids of the kinds whose types carry live document counts (`countsDocuments`). */
  docCountKinds: ReadonlySet<GraphNodeKind>
  edgeKinds: readonly EdgeKindDef[]
  edgeKindById: Map<GraphEdgeKind, EdgeKindDef>
  /** Where an edge kind that isn't in `edgeKinds` resolves — see {@link catchAllEdgeKind}. */
  catchAllEdge: EdgeKindDef
  fieldDescribers: readonly FieldDescriber[]
  fieldBadges: readonly FieldBadgeDef[]
  maxDepth: number
  nodeBadges: readonly NodeBadgeDef[]
  filters: readonly FilterDef[]
  healthRules: readonly HealthRule[]
  defaults: {direction: 'LR' | 'TB'; compactMode: boolean; filters: FilterValues}
}

export function resolveConfig(options: SchemaVisualizationOptions = {}): ResolvedConfig {
  // The options that shape the graph get their defaults from the graph
  // builder, so the tool and a bare `schemaToGraph` call can't disagree.
  const graphOptions = resolveGraphOptions(options)
  const {kinds, fieldDescribers, fieldBadges} = graphOptions
  const edgeKinds = options.edgeKinds ?? defaultEdgeKinds
  const nodeBadges = options.nodeBadges ?? defaultNodeBadges
  const filters =
    typeof options.filters === 'function'
      ? options.filters(kinds)
      : (options.filters ?? createDefaultFilters(kinds))

  validateConfig(kinds, edgeKinds, fieldDescribers, fieldBadges, nodeBadges, filters)

  return {
    ...graphOptions,
    documentCounts: options.documentCounts ?? false,
    kindById: indexById(kinds),
    catchAll: catchAllKind(kinds),
    docCountKinds: kindIdsWith(kinds, 'countsDocuments'),
    edgeKinds,
    edgeKindById: indexById(edgeKinds),
    catchAllEdge: catchAllEdgeKind(edgeKinds),
    nodeBadges,
    filters,
    healthRules: options.healthRules ?? defaultHealthRules,
    defaults: {
      direction: options.defaults?.direction ?? 'LR',
      compactMode: options.defaults?.compactMode ?? false,
      filters: defaultFilterValues(filters),
    },
  }
}

/**
 * Reports the registry mistakes that otherwise fail silently: a shadowed id, a
 * missing catch-all, a URL param two filters both claim. None of them throw —
 * a config problem should not be what takes a Studio down — and each is
 * reported once per session through the same channel as `src/compat.ts`, since
 * `resolveConfig` runs again whenever the options object identity changes.
 *
 * This runs in production too, for the same reason the compat warnings do: the
 * symptom (a filter that won't stick, a legend entry with the wrong colour) is
 * far harder to trace back than the warning is to read.
 */
function validateConfig(
  kinds: readonly NodeKindDef[],
  edgeKinds: readonly EdgeKindDef[],
  fieldDescribers: readonly FieldDescriber[],
  fieldBadges: readonly FieldBadgeDef[],
  nodeBadges: readonly NodeBadgeDef[],
  filters: readonly FilterDef[],
): void {
  validateRegistry(kinds, 'kind', {
    duplicate: (id) =>
      `Two or more kinds in \`kinds\` share the id \`${id}\`. Types are classified by the ` +
      `first one, but the toolbar, legend and cluster bands read the last — give each kind its own id.`,
    empty:
      '`kinds` is empty, so every type falls back to the built-in `other` kind and no kind filter is offered.',
    noCatchAll: (last) =>
      `No kind in \`kinds\` is flagged \`isCatchAll: true\`, so \`${last}\` ` +
      `— the last entry — is standing in as the fallback for types nothing classifies. Flag it explicitly.`,
  })

  validateRegistry(edgeKinds, 'edge-kind', {
    duplicate: (id) =>
      `Two or more kinds in \`edgeKinds\` share the id \`${id}\`. Edges are drawn with the last ` +
      `one's style while the legend lists both — give each edge kind its own id.`,
    empty: '`edgeKinds` is empty, so every edge falls back to the built-in `reuses` style.',
    noCatchAll: (last) =>
      `No kind in \`edgeKinds\` is flagged \`isCatchAll: true\`, so \`${last}\` ` +
      `— the last entry — is standing in as the fallback for edges a describer emits with an unregistered kind.`,
  })

  validateRegistry(fieldDescribers, 'field-describer', {
    duplicate: (id) =>
      `Two or more describers in \`fieldDescribers\` share the id \`${id}\`. Only the first can ever ` +
      `match, and \`replaceById\` / \`without\` act on the first too, leaving the other behind — ` +
      `give each describer its own id.`,
  })

  validateRegistry(fieldBadges, 'field-badge', {
    duplicate: (id) =>
      `Two or more badges in \`fieldBadges\` share the id \`${id}\`. Every entry runs, so the field ` +
      `row shows both, and replacing one by id leaves the other behind — give each badge its own id.`,
  })

  validateRegistry(nodeBadges, 'node-badge', {
    duplicate: (id) =>
      `Two or more badges in \`nodeBadges\` share the id \`${id}\`. Every entry runs, so the card ` +
      `header shows both, and replacing one by id leaves the other behind — give each badge its own id.`,
  })

  validateRegistry(filters, 'filter', {
    duplicate: (id) =>
      `Two or more filters share the id \`${id}\`. Filter state is keyed by id, so they share ` +
      `one selection and only the last one's options are honoured — give each filter its own id.`,
  })

  const reserved = new Set(RESERVED_URL_PARAMS)
  for (const filter of filters) {
    if (reserved.has(filter.urlParam)) {
      warnOnce(
        `config:reserved-url-param:${filter.urlParam}`,
        `Filter \`${filter.id}\` uses the reserved \`urlParam\` \`${filter.urlParam}\`, which the tool ` +
          `writes itself (${RESERVED_URL_PARAMS.join(', ')}). Search, focus or the open detail panel will ` +
          `fight with this filter over the URL — pick another param name.`,
      )
    }
  }

  for (const param of duplicates(filters.map((f) => f.urlParam))) {
    warnOnce(
      `config:duplicate-url-param:${param}`,
      `Two or more filters write the \`urlParam\` \`${param}\`, so they overwrite each other in the ` +
        `URL and shared links restore the wrong selection — give each filter its own param name.`,
    )
  }
}

/**
 * The checks every id-keyed registry gets: no shadowed ids, and — for the
 * registries that resolve an unknown id to a fallback — a catch-all that is
 * flagged rather than merely last. Only the wording is per-registry, because
 * what actually goes wrong differs: a shadowed kind misclassifies types, a
 * shadowed filter loses its selection.
 *
 * `name` is the singular registry name, and it decides the `warnOnce` keys
 * (`config:duplicate-<name>:<id>`, `config:empty-<name>s`,
 * `config:no-catch-all-<name>`) — changing one re-warns a session that has
 * already been told.
 */
function validateRegistry(
  defs: readonly Registered[],
  name: string,
  messages: {
    duplicate: (id: string) => string
    /** Omitted by the registries where every entry runs and empty is merely inert. */
    empty?: string
    noCatchAll?: (lastId: string) => string
  },
): void {
  for (const id of duplicateIds(defs)) {
    warnOnce(`config:duplicate-${name}:${id}`, messages.duplicate(id))
  }

  if (!messages.empty || !messages.noCatchAll) return

  if (defs.length === 0) {
    warnOnce(`config:empty-${name}s`, messages.empty)
  } else if (!defs.some((def) => def.isCatchAll)) {
    warnOnce(`config:no-catch-all-${name}`, messages.noCatchAll(defs[defs.length - 1].id))
  }
}

/**
 * No default config: resolving one here would run `validateConfig` at import
 * time, before any consumer options exist, and would let a component render
 * against the built-in registries when it is simply outside the provider —
 * a mismatch that shows up as a wrong legend colour rather than an error.
 */
const ConfigContext = createContext<ResolvedConfig | null>(null)

export function ConfigProvider({
  options,
  children,
}: {
  options: SchemaVisualizationOptions
  children: ReactNode
}) {
  const value = useMemo(() => resolveConfig(options), [options])
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
}

export function useConfig(): ResolvedConfig {
  const config = useContext(ConfigContext)
  if (!config) {
    throw new Error('useConfig must be used within a <ConfigProvider> (the tool root renders one).')
  }
  return config
}

export function useNodeKinds(): readonly NodeKindDef[] {
  return useConfig().kinds
}

export function useEdgeKinds(): readonly EdgeKindDef[] {
  return useConfig().edgeKinds
}

/**
 * The definition for one kind, falling back to the registry's catch-all rather
 * than throwing — see {@link catchAllKind} for why a node can name a kind the
 * registry no longer has.
 */
export function useKind(id: GraphNodeKind): NodeKindDef {
  const {kindById, catchAll} = useConfig()
  return kindById.get(id) ?? catchAll
}

/**
 * The definition for one edge kind, falling back to the registry's catch-all —
 * see {@link catchAllEdgeKind} for why an edge can name a kind the registry
 * doesn't have.
 */
export function useEdgeKind(id: GraphEdgeKind): EdgeKindDef {
  const {edgeKindById, catchAllEdge} = useConfig()
  return edgeKindById.get(id) ?? catchAllEdge
}
