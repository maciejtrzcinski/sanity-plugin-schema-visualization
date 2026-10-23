import {Box, Card, Flex, Stack, Text} from '@sanity/ui'
import {useToast} from '@sanity/ui/toast'
import {Component, useCallback, useMemo, useState, type ReactNode} from 'react'
import {useSchema, useWorkspace, type Tool} from 'sanity'

import {DetailPanel} from './components/DetailPanel'
import {CONTROLS_CLEARANCE, GraphCanvas} from './components/GraphCanvas'
import {HealthPanel} from './components/HealthPanel'
import {Toolbar} from './components/Toolbar'
import {ConfigProvider, useConfig, type SchemaVisualizationOptions} from './config'
import {documentCountAnnotations} from './documentCounts/annotations'
import {DocumentCountsButton} from './documentCounts/DocumentCountsButton'
import {useDocumentCounts} from './documentCounts/useDocumentCounts'
import {svgExportFileName} from './exportSvg'
import {nodeMatchesFilters} from './filters'
import {useCreateDocumentTarget} from './hooks/useCreateDocumentTarget'
import {useGraphModel, useSchemaGraph} from './hooks/useGraphModel'
import {useTranslate} from './hooks/useTranslate'
import {usePersistedViewPrefs, useStoredViewPrefs, useViewState} from './hooks/useViewState'
import {NO_ANNOTATIONS} from './nodeAnnotations'
import {buildViewPrefsStorageKey} from './viewPrefs'

const HEALTH_PANEL_INSET = 12

/**
 * Catches anything thrown while deriving or rendering the graph — an
 * unexpected schema shape in `schemaToGraph`, a throwing custom
 * `FieldDescriber`, a render crash — so a bug here degrades to an error card
 * instead of white-screening the whole Studio tool pane. Health rules are
 * already guarded individually in `computeHealthIssues`; this covers the rest.
 */
class VisualizationErrorBoundary extends Component<
  {children: ReactNode; title: string},
  {error: Error | null}
> {
  state: {error: Error | null} = {error: null}

  static getDerivedStateFromError(error: Error): {error: Error} {
    return {error}
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <Flex align="center" justify="center" padding={4} style={{height: '100%'}}>
          <Card padding={4} radius={3} shadow={1} tone="critical" style={{maxWidth: 480}}>
            <Stack gap={4}>
              <Text weight="semibold">{this.props.title}</Text>
              <Text size={1} muted style={{wordBreak: 'break-word'}}>
                {this.state.error.message}
              </Text>
            </Stack>
          </Card>
        </Flex>
      )
    }
    return this.props.children
  }
}

export function SchemaVisualizationTool({tool}: {tool: Tool<SchemaVisualizationOptions>}) {
  // `tool.options` is a stable object from the plugin definition, but memoize
  // the fallback so an unconfigured tool doesn't rebuild the config each render.
  const options = useMemo(() => tool.options ?? {}, [tool.options])
  // The boundary is a class component, so it takes its one string as a prop
  // rather than reading the locale itself.
  const t = useTranslate()

  return (
    <VisualizationErrorBoundary title={t('tool.error-title')}>
      <ConfigProvider options={options}>
        <SchemaVisualization toolName={tool.name} />
      </ConfigProvider>
    </VisualizationErrorBoundary>
  )
}

function SchemaVisualization({toolName}: {toolName: string}) {
  const config = useConfig()
  const schema = useSchema()
  const workspace = useWorkspace()
  const toast = useToast()
  const t = useTranslate()

  const graph = useSchemaGraph(schema)

  // Scoped to project + dataset + env + workspace + this tool instance, not
  // just the origin — critical in local dev, where many unrelated projects'
  // Studios all share `localhost:3333` and would otherwise clobber each
  // other's prefs through plain `localStorage`.
  const storageKey = useMemo(
    () =>
      buildViewPrefsStorageKey({
        projectId: workspace.projectId,
        dataset: workspace.dataset,
        apiHost: workspace.apiHost,
        workspaceName: workspace.name,
        basePath: workspace.basePath,
        toolName,
      }),
    [workspace, toolName],
  )

  const storedPrefs = useStoredViewPrefs(storageKey)

  // Same reason the storage key is scoped: two Studios open side by side both
  // download `schema-graph.svg` otherwise, and the second replaces the first.
  const exportFileName = useMemo(
    () => svgExportFileName({workspaceName: workspace.name, dataset: workspace.dataset}),
    [workspace.name, workspace.dataset],
  )

  // Which types are worth a `count()` query: the kinds that opted into
  // `countsDocuments`, minus Sanity's own system types.
  const documentTypeNames = useMemo(
    () =>
      graph.nodes.filter((n) => config.docCountKinds.has(n.kind) && !n.isSystem).map((n) => n.name),
    [graph, config.docCountKinds],
  )

  const documentCounts = useDocumentCounts({
    enabled: config.documentCounts,
    typeNames: documentTypeNames,
    cached: storedPrefs?.cache.documentCounts,
  })

  const model = useGraphModel(graph, documentCounts.state.counts)
  const {healthIssues, nodesById, issuesByNodeId, stats, filterContext} = model
  const healthWarningCount = useMemo(
    () => healthIssues.filter((issue) => issue.severity === 'warning').length,
    [healthIssues],
  )

  // Every per-node datum the schema can't supply, in one map keyed by node id.
  // Doc counts are the only source today; a second one joins here rather than
  // growing a prop on the canvas, the card, the layout estimate and the panel.
  const annotations = useMemo(
    () =>
      documentCountAnnotations(
        graph.nodes,
        config.docCountKinds,
        documentCounts.state.counts,
        documentCounts.state.breakdown,
      ),
    [
      graph.nodes,
      config.docCountKinds,
      documentCounts.state.counts,
      documentCounts.state.breakdown,
    ],
  )

  const view = useViewState({nodes: graph.nodes, filterContext, storedPrefs})

  usePersistedViewPrefs({
    storageKey,
    prefs: view.persistable,
    documentCounts: documentCounts.state,
    initialDocumentCounts: storedPrefs?.cache.documentCounts,
  })

  const [showHealthPanel, setShowHealthPanel] = useState(false)

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.push({
        status: 'success',
        title: t('toolbar.copy-link-success'),
        description: t('toolbar.copy-link-success-description'),
      })
    } catch {
      toast.push({status: 'error', title: t('toolbar.copy-link-error')})
    }
  }, [toast, t])

  // Only offer nodes that currently match the active filters, so a pick from
  // this list is always something the canvas can actually show — e.g. with
  // "Only deprecated" active, only deprecated types show up here. The current
  // focus is kept regardless: a filter change doesn't clear it (see
  // `coreReducer`), so the combobox still needs its label.
  const focusOptions = useMemo(
    () =>
      graph.nodes
        .filter(
          (n) =>
            n.id === view.focusNodeId ||
            nodeMatchesFilters(n, view.filters, config.filters, filterContext),
        )
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((n) => ({id: n.id, title: n.title, isSystem: n.isSystem, kind: n.kind})),
    [graph, view.focusNodeId, view.filters, config.filters, filterContext],
  )

  const selectedNode = view.selectedNodeId ? (nodesById.get(view.selectedNodeId) ?? null) : null
  const createDocument = useCreateDocumentTarget(selectedNode)

  return (
    <Flex direction="column" style={{height: '100%'}}>
      <Toolbar
        view={view}
        filterContext={filterContext}
        stats={stats}
        focusOptions={focusOptions}
        healthIssueCount={healthIssues.length}
        healthWarningCount={healthWarningCount}
        showHealthPanel={showHealthPanel}
        onToggleHealthPanel={() => setShowHealthPanel((v) => !v)}
        onCopyLink={handleCopyLink}
        // With zero countable types, `load` is a silent no-op — hide the button.
        extraActions={
          config.documentCounts && documentTypeNames.length > 0 ? (
            <DocumentCountsButton
              status={documentCounts.state.status}
              fetchedAt={documentCounts.state.fetchedAt}
              onClick={documentCounts.load}
            />
          ) : null
        }
      />
      <Flex flex={1} style={{minHeight: 0}}>
        <Card flex={1} style={{position: 'relative'}}>
          <GraphCanvas
            graph={graph}
            filters={view.filters}
            filterContext={filterContext}
            direction={view.direction}
            searchQuery={view.searchQuery}
            selectedNodeId={view.selectedNodeId}
            onSelectNode={view.setSelectedNodeId}
            focusNodeId={view.focusNodeId}
            compactMode={view.compactMode}
            expandedNodeIds={view.expandedNodeIds}
            onToggleExpand={view.toggleExpanded}
            relayoutToken={view.relayoutToken}
            annotations={annotations}
            exportFileName={exportFileName}
          />
          {showHealthPanel && (
            // A flex column, so the panel shrinks to this box's max height and
            // scrolls inside — a percentage max height on the panel itself
            // would resolve against this box's auto height, i.e. to nothing.
            // It stops above the zoom controls in the same corner.
            <Box
              style={{
                position: 'absolute',
                top: HEALTH_PANEL_INSET,
                left: HEALTH_PANEL_INSET,
                zIndex: 5,
                maxHeight: `calc(100% - ${HEALTH_PANEL_INSET * 2 + CONTROLS_CLEARANCE}px)`,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <HealthPanel
                issues={healthIssues}
                nodesById={nodesById}
                onSelectNode={view.setSelectedNodeId}
                onClose={() => setShowHealthPanel(false)}
              />
            </Box>
          )}
        </Card>
        {selectedNode && (
          <DetailPanel
            node={selectedNode}
            edges={graph.edges}
            issues={issuesByNodeId.get(selectedNode.id) ?? []}
            isFocused={view.focusNodeId === selectedNode.id}
            annotations={annotations.get(selectedNode.id) ?? NO_ANNOTATIONS}
            createDocument={createDocument}
            onClose={() => view.setSelectedNodeId(null)}
            onNavigate={view.setSelectedNodeId}
            onToggleFocus={() =>
              view.setFocus(view.focusNodeId === selectedNode.id ? null : selectedNode.id)
            }
          />
        )}
      </Flex>
    </Flex>
  )
}
