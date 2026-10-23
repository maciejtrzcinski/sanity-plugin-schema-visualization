import '@xyflow/react/dist/style.css'
import {Card, Flex, Spinner, Text, usePrefersReducedMotion} from '@sanity/ui'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  ViewportPortal,
  type NodeChange,
} from '@xyflow/react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
} from 'react'

import {useConfig} from '../config'
import {svgExportFileName} from '../exportSvg'
import {nodeMatchesFilters, type FilterContext, type FilterValues} from '../filters'
import type {FlowEdge, FlowNode} from '../flowModel'
import {computeStyledEdges, computeStyledNodes, DIM_CLASSES} from '../graphStyling'
import {useTranslate} from '../hooks/useTranslate'
import {estimateNodeHeight, type HeightOf} from '../layout'
import {LayoutController} from '../layoutController'
import type {NodeAnnotations} from '../nodeAnnotations'
import {cssColor} from '../registry'
import type {SchemaGraph} from '../types'
import {ClusterBackgrounds} from './ClusterBackground'
import {ExportControls} from './ExportControls'
import {FieldEdge} from './FieldEdge'
import {Legend} from './Legend'
import {TypeNode} from './TypeNode'

const NODE_TYPES = {typeNode: TypeNode}
const EDGE_TYPES = {field: FieldEdge}

const CANVAS_CLASS = 'sv-canvas'

const CONTROLS_BUTTON_SIZE = 30
/** React Flow's default margin around a `Panel`. */
const PANEL_MARGIN = 15

/**
 * How far up from the canvas's bottom edge the zoom controls reach — what an
 * overlay in the left-hand corner has to stop short of to keep them clickable.
 */
export const CONTROLS_CLEARANCE = PANEL_MARGIN + 3 * CONTROLS_BUTTON_SIZE

/**
 * Selection and search dimming, driven by the classes `computeStyledNodes` and
 * `computeStyledEdges` put on the few elements a change touches — see
 * `DIM_CLASSES` for why this is a stylesheet rather than per-card state.
 *
 * No opacity transition: an animating element gets a compositing layer of its
 * own, and fading a large schema's every card and edge at once made Chrome
 * build ~2,300 layers per click — the largest single cost of a selection.
 *
 * The zoom controls are mapped onto the Studio's card colors: React Flow paints
 * their background a fixed light grey but lets the icon inherit the text
 * color, so in a dark Studio they render light-on-light.
 */
const CANVAS_CSS = `
.${CANVAS_CLASS}.${DIM_CLASSES.selecting} .react-flow__node:not(.${DIM_CLASSES.lit}),
.${CANVAS_CLASS} .react-flow__node.${DIM_CLASSES.miss} {
  opacity: 0.25;
}
.${CANVAS_CLASS}.${DIM_CLASSES.selecting} .react-flow__edge:not(.${DIM_CLASSES.lit}) {
  opacity: 0.15;
}
.${CANVAS_CLASS} {
  --xy-controls-button-background-color: var(--card-bg-color);
  --xy-controls-button-background-color-hover: color-mix(in srgb, var(--card-fg-color) 10%, var(--card-bg-color));
  --xy-controls-button-color: var(--card-fg-color);
  --xy-controls-button-color-hover: var(--card-fg-color);
  --xy-controls-button-border-color: var(--card-border-color);
  --xy-controls-box-shadow: 0 0 0 1px var(--card-border-color), 0 2px 6px var(--card-shadow-umbra-color);
}
.${CANVAS_CLASS} .react-flow__controls {
  border-radius: 4px;
  overflow: hidden;
}
.${CANVAS_CLASS} .react-flow__controls-button {
  width: ${CONTROLS_BUTTON_SIZE}px;
  height: ${CONTROLS_BUTTON_SIZE}px;
}
.${CANVAS_CLASS} .react-flow__controls-button svg {
  max-width: 14px;
  max-height: 14px;
}
`

export interface GraphCanvasProps {
  graph: SchemaGraph
  filters: FilterValues
  /** Issue counts and connectivity, computed once by `useGraphModel`. */
  filterContext: FilterContext
  direction: 'LR' | 'TB'
  searchQuery: string
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  /** When set, only this type and its directly connected neighbors are shown. */
  focusNodeId: string | null
  /** When true, nodes show only their title + connection count by default. */
  compactMode: boolean
  /** Node ids individually expanded to show full field data, overriding `compactMode`. */
  expandedNodeIds: Set<string>
  onToggleExpand: (nodeId: string) => void
  relayoutToken: number
  /**
   * Per-node data loaded after the graph was built, by node id — live document
   * counts today, whatever a consumer adds tomorrow. The canvas neither
   * produces nor interprets these: it carries them to the cards, where the
   * node-badge registry decides what (if anything) they look like.
   */
  annotations: ReadonlyMap<string, NodeAnnotations>
  /**
   * What an SVG export downloads as. Defaults to the bare `schema-graph.svg`;
   * the tool root passes one scoped to the workspace and dataset so two
   * Studios' exports don't overwrite each other.
   */
  exportFileName?: string
}

/**
 * What a layout pass depends on from the visible graph: which nodes and edges
 * are on it. Selection, search and a rebuilt filter context all produce a new
 * `visibleGraph` object without changing this, and none of them should re-run
 * dagre (or re-frame the viewport the user has panned).
 */
function shapeKey(graph: SchemaGraph): string {
  return `${graph.nodes.map((n) => n.id).join('\n')}\0${graph.edges.map((e) => e.id).join('\n')}`
}

/** Restricts a graph to one node plus its directly connected neighbors. */
function isolateNode(graph: SchemaGraph, focusNodeId: string): SchemaGraph {
  const keep = new Set<string>([focusNodeId])
  for (const edge of graph.edges) {
    if (edge.source === focusNodeId) keep.add(edge.target)
    if (edge.target === focusNodeId) keep.add(edge.source)
  }
  return {
    nodes: graph.nodes.filter((n) => keep.has(n.id)),
    edges: graph.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  }
}

function GraphCanvasInner({
  graph,
  filters,
  filterContext,
  direction,
  searchQuery,
  selectedNodeId,
  onSelectNode,
  focusNodeId,
  compactMode,
  expandedNodeIds,
  onToggleExpand,
  relayoutToken,
  annotations,
  exportFileName = svgExportFileName(),
}: GraphCanvasProps) {
  const {
    kindById,
    catchAll,
    nodeBadges,
    edgeKindById,
    catchAllEdge,
    filters: filterDefs,
  } = useConfig()
  const t = useTranslate()
  // Destructured so the patch effect depends on the issue maps, not on the
  // context object — which is rebuilt whenever document counts load.
  const {issueCountByNodeId, warningCountByNodeId} = filterContext

  const visibleGraph = useMemo<SchemaGraph>(() => {
    let g = graph
    const keep = new Set(
      g.nodes
        .filter((n) => nodeMatchesFilters(n, filters, filterDefs, filterContext))
        .map((n) => n.id),
    )
    // A focused/selected node stays on the canvas even when the active filters
    // would otherwise hide it — a filter change never drops the pick (see
    // `coreReducer`), so the canvas has to keep something for it to point at.
    if (focusNodeId) keep.add(focusNodeId)
    if (selectedNodeId) keep.add(selectedNodeId)
    g = {
      nodes: g.nodes.filter((n) => keep.has(n.id)),
      edges: g.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
    }
    if (focusNodeId && g.nodes.some((n) => n.id === focusNodeId)) {
      g = isolateNode(g, focusNodeId)
      // `isolateNode` keeps only the focus node and its neighbours; add back a
      // selection that fell outside that set so it doesn't dim the whole graph.
      if (selectedNodeId && !g.nodes.some((n) => n.id === selectedNodeId)) {
        const selected = graph.nodes.find((n) => n.id === selectedNodeId)
        if (selected) g = {nodes: [...g.nodes, selected], edges: g.edges}
      }
    }
    return g
  }, [graph, filters, filterDefs, filterContext, focusNodeId, selectedNodeId])

  const minimapNodeColor = useCallback(
    (n: FlowNode) => cssColor((kindById.get(n.data.node.kind) ?? catchAll).color),
    [kindById, catchAll],
  )

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const edge of visibleGraph.edges) {
      if (!map.has(edge.source)) map.set(edge.source, new Set())
      if (!map.has(edge.target)) map.set(edge.target, new Set())
      map.get(edge.source)!.add(edge.target)
      map.get(edge.target)!.add(edge.source)
    }
    return map
  }, [visibleGraph])

  // What's on the canvas, and every rule for changing it, lives in the
  // controller — this component only calls it and schedules the frames those
  // calls run on. It's an external store rather than mirrored state: a call
  // that changed nothing publishes nothing, and React state can't drift from
  // what the controller holds.
  const [controller] = useState(() => new LayoutController(compactMode))
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [isLayouting, setIsLayouting] = useState(false)

  // `onlyRenderVisibleElements` culls off-screen nodes from the DOM, which is
  // what makes large schemas pannable/zoomable without lag — but ExportControls
  // captures the rendered DOM directly, so culling has to be lifted for the
  // duration of an export or off-screen types would be silently missing from
  // the PNG.
  const [cullingSuspended, setCullingSuspended] = useState(false)
  const suspendCulling = useCallback(async () => {
    setCullingSuspended(true)
    // Wait a couple of frames so the off-screen nodes React Flow mounts in
    // response actually make it into the DOM before the caller reads it.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
  }, [])
  const resumeCulling = useCallback(() => setCullingSuspended(false), [])

  // Latest values the layout effect reads without depending on them: expanding
  // a card and annotations arriving must not re-run dagre (the patch effect
  // below handles both), but a layout running for some other reason still has
  // to build cards from their current state.
  const expandedNodeIdsRef = useRef(expandedNodeIds)
  const annotationsRef = useRef(annotations)
  const issueCountsRef = useRef({issueCountByNodeId, warningCountByNodeId})
  const visibleGraphRef = useRef(visibleGraph)
  const relayoutTokenRef = useRef(relayoutToken)
  useEffect(() => {
    expandedNodeIdsRef.current = expandedNodeIds
    annotationsRef.current = annotations
    issueCountsRef.current = {issueCountByNodeId, warningCountByNodeId}
    visibleGraphRef.current = visibleGraph
  })
  const visibleShape = useMemo(() => shapeKey(visibleGraph), [visibleGraph])

  // What a card is worth in height before React Flow has measured it; the
  // controller prefers the real measurement wherever it has one.
  const estimate = useCallback<HeightOf>(
    (node) => estimateNodeHeight(node.data, nodeBadges, t),
    [nodeBadges, t],
  )

  // Re-flow with the real heights once measurements arrive — debounced to one
  // pass per frame, since a mount measures every visible card in a burst.
  const measuredReflowFrameRef = useRef<number | undefined>(undefined)
  const scheduleMeasuredReflow = useCallback(() => {
    if (measuredReflowFrameRef.current !== undefined) return
    measuredReflowFrameRef.current = window.requestAnimationFrame(() => {
      measuredReflowFrameRef.current = undefined
      controller.reflow(estimate)
    })
  }, [controller, estimate])
  useEffect(
    () => () => {
      if (measuredReflowFrameRef.current !== undefined)
        window.cancelAnimationFrame(measuredReflowFrameRef.current)
    },
    [],
  )

  // Re-run the layout when the schema, the set of visible types, layout
  // direction, compact mode, or an explicit "re-layout" click changes —
  // otherwise keep positions the user dragged. Keyed on `visibleShape` rather
  // than the `visibleGraph` object, which is rebuilt on every selection change.
  // Expanding a card, annotations and health issues stay out of this: the
  // patch effect below absorbs them without re-framing the graph.
  //
  // In an effect, two frames out, so the control that triggered it paints
  // first: the first frame shows `isLayouting`, the second runs the layout.
  useEffect(() => {
    if (relayoutTokenRef.current !== relayoutToken) {
      relayoutTokenRef.current = relayoutToken
      controller.forgetDragged()
    }

    let cancelled = false
    let workFrame: number | undefined
    const showFrame = window.requestAnimationFrame(() => {
      if (cancelled) return
      setIsLayouting(true)
      workFrame = window.requestAnimationFrame(() => {
        if (cancelled) return
        controller.rebuild(visibleGraphRef.current, {
          direction,
          compactMode,
          expandedNodeIds: expandedNodeIdsRef.current,
          annotations: annotationsRef.current,
          ...issueCountsRef.current,
          onToggleExpand,
          edgeKindById,
          catchAllEdge,
          estimate,
        })
        setLayoutVersion((v) => v + 1)
        setIsLayouting(false)
      })
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(showFrame)
      if (workFrame !== undefined) window.cancelAnimationFrame(workFrame)
    }
  }, [
    controller,
    graph,
    visibleShape,
    direction,
    relayoutToken,
    compactMode,
    onToggleExpand,
    edgeKindById,
    catchAllEdge,
    estimate,
  ])

  // Expanding one card, annotations arriving, or the health issues they raise
  // change what some cards render — but not the graph's shape. The controller
  // patches those cards in place and re-flows what sits below them; it declines
  // a compact-mode switch, which the layout effect above is already re-running
  // dagre for.
  useEffect(() => {
    controller.patch({
      compactMode,
      expandedNodeIds,
      annotations,
      issueCountByNodeId,
      warningCountByNodeId,
      estimate,
    })
  }, [
    controller,
    compactMode,
    expandedNodeIds,
    annotations,
    issueCountByNodeId,
    warningCountByNodeId,
    estimate,
  ])

  // `fitView` on <ReactFlow> only runs once, on mount — re-fit whenever the
  // node set actually changes (filters, focus mode, direction, re-layout) so
  // newly shown/hidden content isn't left off-screen or under the minimap.
  const {fitView} = useReactFlow()
  const reducedMotion = usePrefersReducedMotion()
  useEffect(() => {
    if (layoutVersion === 0) return undefined
    const duration = reducedMotion ? 0 : 300
    const id = window.requestAnimationFrame(() => fitView({duration, padding: 0.2}))
    return () => window.cancelAnimationFrame(id)
  }, [layoutVersion, fitView, reducedMotion])

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      // React Flow reports both the drags to remember across re-layouts and the
      // heights it measured on the rendered cards; a height that disagrees with
      // what the layout reserved owes us a re-flow.
      const {remeasured} = controller.applyChanges(changes)
      if (remeasured) scheduleMeasuredReflow()
    },
    [controller, scheduleMeasuredReflow],
  )

  const onNodeClick = useCallback(
    (_: MouseEvent, node: FlowNode) => onSelectNode(node.id === selectedNodeId ? null : node.id),
    [onSelectNode, selectedNodeId],
  )
  const onPaneClick = useCallback(() => onSelectNode(null), [onSelectNode])

  // An edge's field-name label only shows while hovered (or when it's
  // connected to the current selection, handled in `computeStyledEdges`) —
  // see the comment on `computeStyledEdges` for why.
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const onEdgeMouseEnter = useCallback(
    (_: MouseEvent, edge: FlowEdge) => setHoveredEdgeId(edge.id),
    [],
  )
  const onEdgeMouseLeave = useCallback(() => setHoveredEdgeId(null), [])

  const styledNodes = useMemo<FlowNode[]>(
    () => computeStyledNodes(state.nodes, searchQuery, selectedNodeId, adjacency),
    [state.nodes, searchQuery, selectedNodeId, adjacency],
  )

  const styledEdges = useMemo<FlowEdge[]>(
    () => computeStyledEdges(state.edges, selectedNodeId, hoveredEdgeId),
    [state.edges, selectedNodeId, hoveredEdgeId],
  )

  return (
    <ReactFlow
      className={selectedNodeId ? `${CANVAS_CLASS} ${DIM_CLASSES.selecting}` : CANVAS_CLASS}
      nodes={styledNodes}
      edges={styledEdges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodesChange={onNodesChange}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      onEdgeMouseEnter={onEdgeMouseEnter}
      onEdgeMouseLeave={onEdgeMouseLeave}
      fitView
      minZoom={0.05}
      maxZoom={1.5}
      onlyRenderVisibleElements={!cullingSuspended}
      proOptions={{hideAttribution: true}}
    >
      <style>{CANVAS_CSS}</style>
      <ViewportPortal>
        <ClusterBackgrounds clusters={state.clusters} />
      </ViewportPortal>
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      <Controls showInteractive={false} />
      <MiniMap<FlowNode>
        pannable
        zoomable
        nodeColor={minimapNodeColor}
        maskColor="rgba(0,0,0,0.08)"
      />
      <Panel position="top-right">
        <Legend />
      </Panel>
      <Panel position="bottom-center">
        <ExportControls
          graph={visibleGraph}
          direction={direction}
          clusters={state.clusters}
          fileName={exportFileName}
          suspendCulling={suspendCulling}
          resumeCulling={resumeCulling}
        />
      </Panel>
      {isLayouting && (
        <Panel position="top-center">
          <Card padding={2} radius={3} shadow={2} style={{background: 'var(--card-bg-color)'}}>
            <Flex align="center" gap={2}>
              <Spinner muted />
              <Text size={1} muted>
                {t('canvas.layouting')}
              </Text>
            </Flex>
          </Card>
        </Panel>
      )}
    </ReactFlow>
  )
}

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
