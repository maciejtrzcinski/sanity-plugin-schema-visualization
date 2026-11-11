// @vitest-environment jsdom
import {act, fireEvent, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {authorEdge, graph, makeFilterContext, seoEdge} from '../../test/fixtures'
import {renderWithProviders} from '../../test/render'
import {createDefaultFilters, defaultFilterValues, type FilterDef} from '../filters'
import {DIM_CLASSES} from '../graphStyling'
import {defaultNodeKinds} from '../kinds'
import {LayoutController} from '../layoutController'
import {GraphCanvas, type GraphCanvasProps} from './GraphCanvas'

const defaultFilters = defaultFilterValues(createDefaultFilters(defaultNodeKinds))
const defaultFilterContext = makeFilterContext()
const noop = () => {}

function props(overrides: Partial<GraphCanvasProps> = {}): GraphCanvasProps {
  return {
    graph,
    filters: defaultFilters,
    filterContext: defaultFilterContext,
    direction: 'LR',
    searchQuery: '',
    selectedNodeId: null,
    onSelectNode: () => {},
    focusNodeId: null,
    compactMode: false,
    expandedNodeIds: new Set(),
    onToggleExpand: noop,
    relayoutToken: 0,
    annotations: new Map(),
    ...overrides,
  }
}

function renderedNodeIds(): string[] {
  return sorted(
    [...document.querySelectorAll('.react-flow__node')].map(
      (el) => el.getAttribute('data-id') ?? '',
    ),
  )
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b))
}

async function waitForNodes(ids: string[]): Promise<void> {
  await waitFor(() => expect(renderedNodeIds()).toEqual(sorted(ids)))
}

describe('GraphCanvas', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lays out a card per type the filters let through', async () => {
    renderWithProviders(<GraphCanvas {...props()} />)

    await waitForNodes(['post', 'author', 'seo'])
    expect(screen.getByText('Blog post')).toBeDefined()
  })

  it('draws an edge per connection between two visible types', async () => {
    renderWithProviders(<GraphCanvas {...props()} />)

    await waitForNodes(['post', 'author', 'seo'])
    await waitFor(() => {
      const ids = [...document.querySelectorAll('.react-flow__edge')].map(
        (el) => el.getAttribute('data-id') ?? '',
      )
      expect(sorted(ids)).toEqual(sorted([authorEdge.id, seoEdge.id]))
    })
  })

  it('honours a filter selection', async () => {
    const {rerender} = renderWithProviders(<GraphCanvas {...props()} />)
    await waitForNodes(['post', 'author', 'seo'])

    rerender(<GraphCanvas {...props({filters: {...defaultFilters, kinds: ['document']}})} />)
    await waitForNodes(['post', 'author'])

    rerender(<GraphCanvas {...props({filters: {...defaultFilters, system: ['1']}})} />)
    await waitForNodes(['post', 'author', 'seo', 'sanity.imageAsset'])
  })

  it('runs a custom filter from the registry, with the graph-wide context', async () => {
    const leavesOnly: FilterDef = {
      id: 'leaves',
      label: 'Leaves',
      type: 'single',
      options: [
        {value: 'all', label: 'All types'},
        {value: 'referenced', label: 'Only referenced'},
      ],
      defaultValues: ['all'],
      urlParam: 'leaves',
      predicate: (node, selected, ctx) =>
        selected.value !== 'referenced' || ctx.graph.edges.some((e) => e.target === node.id),
    }
    const filters = [...createDefaultFilters(defaultNodeKinds), leavesOnly]

    renderWithProviders(
      <GraphCanvas
        {...props({filters: {...defaultFilterValues(filters), leaves: ['referenced']}})}
      />,
      {options: {filters}},
    )

    await waitForNodes(['author', 'seo'])
  })

  it('isolates a focused type and its direct neighbours', async () => {
    renderWithProviders(<GraphCanvas {...props({focusNodeId: 'author'})} />)

    await waitForNodes(['author', 'post'])
  })

  it('keeps the focused type even when a filter would hide it', async () => {
    renderWithProviders(
      <GraphCanvas
        {...props({
          focusNodeId: 'sanity.imageAsset',
          filters: {...defaultFilters, system: ['0']},
        })}
      />,
    )

    await waitForNodes(['sanity.imageAsset'])
  })

  it('keeps the selected type even when a filter would hide it', async () => {
    renderWithProviders(
      <GraphCanvas
        {...props({
          selectedNodeId: 'sanity.imageAsset',
          filters: {...defaultFilters, system: ['0']},
        })}
      />,
    )

    await waitFor(() => expect(renderedNodeIds()).toContain('sanity.imageAsset'))
  })

  it('selects a type on click and clears the selection on a second one', async () => {
    const onSelectNode = vi.fn()
    const {rerender} = renderWithProviders(<GraphCanvas {...props({onSelectNode})} />)
    await waitForNodes(['post', 'author', 'seo'])

    // `fireEvent`: d3-drag reads `event.view`, which jsdom's synthesized mousedown lacks.
    fireEvent.click(screen.getByText('Blog post'))
    expect(onSelectNode).toHaveBeenCalledExactlyOnceWith('post')

    onSelectNode.mockClear()
    rerender(<GraphCanvas {...props({onSelectNode, selectedNodeId: 'post'})} />)
    fireEvent.click(screen.getByText('Blog post'))
    expect(onSelectNode).toHaveBeenCalledExactlyOnceWith(null)
  })

  it('does not re-run the layout when only the selection changes', async () => {
    const rebuild = vi.spyOn(LayoutController.prototype, 'rebuild')
    const {rerender} = renderWithProviders(<GraphCanvas {...props()} />)
    await waitForNodes(['post', 'author', 'seo'])
    const settled = rebuild.mock.calls.length

    rerender(<GraphCanvas {...props({selectedNodeId: 'post'})} />)
    rerender(<GraphCanvas {...props({selectedNodeId: 'author'})} />)
    rerender(<GraphCanvas {...props({selectedNodeId: null})} />)
    await animationFrames(3)

    expect(rebuild).toHaveBeenCalledTimes(settled)
  })

  it('frames a selected type with what it connects to, and stays put once it is cleared', async () => {
    const {rerender} = renderWithProviders(<GraphCanvas {...props()} />)
    await waitForNodes(['post', 'author', 'seo'])
    await animationFrames(2)
    const whole = viewportTransform()

    rerender(<GraphCanvas {...props({selectedNodeId: 'author'})} />)
    await waitFor(() => expect(viewportTransform()).not.toBe(whole))
    const framed = viewportTransform()

    rerender(<GraphCanvas {...props({selectedNodeId: null})} />)
    await animationFrames(3)
    expect(viewportTransform()).toBe(framed)
  })

  it('does not re-run the layout when the filter context is rebuilt with the same issues', async () => {
    const rebuild = vi.spyOn(LayoutController.prototype, 'rebuild')
    const {rerender} = renderWithProviders(<GraphCanvas {...props()} />)
    await waitForNodes(['post', 'author', 'seo'])
    const settled = rebuild.mock.calls.length

    rerender(
      <GraphCanvas
        {...props({
          filterContext: {...defaultFilterContext, docCountByType: new Map([['post', 3]])},
        })}
      />,
    )
    await animationFrames(3)

    expect(rebuild).toHaveBeenCalledTimes(settled)
  })

  it('dims the types a search query does not match', async () => {
    const {rerender} = renderWithProviders(<GraphCanvas {...props()} />)
    await waitForNodes(['post', 'author', 'seo'])

    rerender(<GraphCanvas {...props({searchQuery: 'author'})} />)

    await waitFor(() => {
      expect(isMissed('seo')).toBe(true)
      expect(isMissed('author')).toBe(false)
    })
  })

  it('collapses every card in compact mode, except ones explicitly expanded', async () => {
    const {rerender} = renderWithProviders(<GraphCanvas {...props()} />)
    await waitFor(() => expect(screen.getByText('metaTitle')).toBeDefined())

    rerender(<GraphCanvas {...props({compactMode: true})} />)
    await waitFor(() => expect(screen.queryByText('metaTitle')).toBeNull())

    rerender(<GraphCanvas {...props({compactMode: true, expandedNodeIds: new Set(['seo'])})} />)
    await waitFor(() => expect(screen.getByText('metaTitle')).toBeDefined())
  })

  it('badges whatever annotations a node carries', async () => {
    const annotations = new Map([['post', {docCount: 7}]])
    renderWithProviders(<GraphCanvas {...props({annotations})} />)

    await waitFor(() => expect(screen.getByText('7 docs')).toBeDefined())
    expect(screen.queryByText('3 docs')).toBeNull()
  })

  it('renders the legend and the export controls over the canvas', async () => {
    renderWithProviders(<GraphCanvas {...props()} />)

    await waitForNodes(['post', 'author', 'seo'])
    expect(screen.getByText('Reference field')).toBeDefined()
    expect(screen.getByText('Reuses named type')).toBeDefined()
    expect(screen.getByRole('button', {name: 'Export SVG'})).toBeDefined()
  })
})

function viewportTransform(): string {
  return document.querySelector<HTMLElement>('.react-flow__viewport')!.style.transform
}

async function animationFrames(count: number): Promise<void> {
  const frames = (left: number): Promise<void> =>
    left === 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => requestAnimationFrame(() => resolve())).then(() =>
          frames(left - 1),
        )
  await act(() => frames(count))
}

function isMissed(nodeId: string): boolean {
  return Boolean(
    document
      .querySelector(`.react-flow__node[data-id="${nodeId}"]`)
      ?.classList.contains(DIM_CLASSES.miss),
  )
}
