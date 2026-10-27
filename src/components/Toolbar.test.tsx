// @vitest-environment jsdom
import {screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {ReactNode} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {makeFilterContext} from '../../test/fixtures'
import {renderWithProviders} from '../../test/render'
import {
  createDefaultFilters,
  defaultFilterValues,
  type FilterContext,
  type FilterDef,
  type FilterValues,
} from '../filters'
import type {GraphStats} from '../hooks/useGraphModel'
import type {ViewState} from '../hooks/useViewState'
import {defaultNodeKinds, documentKind, objectKind, otherKind} from '../kinds'
import {Toolbar, type ToolbarProps} from './Toolbar'

const defaultFilters = defaultFilterValues(createDefaultFilters(defaultNodeKinds))

const stats: GraphStats = {
  byKind: [
    {kind: documentKind, count: 2},
    {kind: objectKind, count: 1},
    {kind: otherKind, count: 0},
  ],
  edges: 2,
  system: 1,
}

/**
 * The toolbar takes `view` whole, but the tests still poke at one field at a
 * time — so overrides stay flat here and get folded into it.
 */
interface Overrides {
  searchQuery?: string
  onSearchQueryChange?: ViewState['setSearchQuery']
  filters?: FilterValues
  filterContext?: FilterContext
  onToggleFilterValue?: ViewState['toggleFilterValue']
  onSetFilterValue?: ViewState['setFilterValue']
  onClearFilters?: ViewState['clearFilters']
  direction?: 'LR' | 'TB'
  onDirectionChange?: ViewState['setDirection']
  onRelayout?: ViewState['relayout']
  stats?: GraphStats
  focusNodeId?: string | null
  focusOptions?: ToolbarProps['focusOptions']
  onFocusNodeIdChange?: ViewState['setFocus']
  compactMode?: boolean
  onCompactModeChange?: ViewState['setCompactMode']
  healthIssueCount?: number
  healthWarningCount?: number
  showHealthPanel?: boolean
  onToggleHealthPanel?: () => void
  onCopyLink?: () => void
  extraActions?: ReactNode
}

function props(o: Overrides = {}): ToolbarProps {
  const compactMode = o.compactMode ?? false
  const direction = o.direction ?? 'LR'
  const filters = o.filters ?? defaultFilters
  const noop = () => {}

  const view: ViewState = {
    searchQuery: o.searchQuery ?? '',
    setSearchQuery: o.onSearchQueryChange ?? noop,
    filters,
    toggleFilterValue: o.onToggleFilterValue ?? noop,
    setFilterValue: o.onSetFilterValue ?? noop,
    clearFilters: o.onClearFilters ?? noop,
    direction,
    setDirection: o.onDirectionChange ?? noop,
    compactMode,
    setCompactMode: o.onCompactModeChange ?? noop,
    selectedNodeId: null,
    setSelectedNodeId: noop,
    focusNodeId: o.focusNodeId ?? null,
    setFocus: o.onFocusNodeIdChange ?? noop,
    expandedNodeIds: new Set(),
    toggleExpanded: noop,
    relayoutToken: 0,
    relayout: o.onRelayout ?? noop,
    persistable: {compactMode, direction, filters},
  }

  return {
    view,
    filterContext: o.filterContext ?? makeFilterContext(),
    stats: o.stats ?? stats,
    focusOptions: o.focusOptions ?? [
      {id: 'post', title: 'Blog post', isSystem: false, kind: 'document'},
      {id: 'seo', title: 'SEO', isSystem: false, kind: 'object'},
    ],
    healthIssueCount: o.healthIssueCount ?? 0,
    healthWarningCount: o.healthWarningCount ?? 0,
    showHealthPanel: o.showHealthPanel ?? false,
    onToggleHealthPanel: o.onToggleHealthPanel ?? noop,
    onCopyLink: o.onCopyLink ?? noop,
    extraActions: o.extraActions,
  }
}

/** Opens a `MenuButton` — Sanity UI mounts a menu's items only once it opens. */
async function openMenu(name: RegExp | string): Promise<void> {
  const button = screen.getByRole('button', {name})
  await userEvent.click(button)
  expect(button.getAttribute('aria-expanded')).toBe('true')
}

/** Opens a `MenuGroup` inside an open menu — its items mount only then, too. */
async function openSubmenu(name: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', {name, hidden: true}))
}

/**
 * One menu item, by its label. Not scoped to a menu: an opened popover is
 * positioned by Popper, which needs a layout engine jsdom doesn't have, so it
 * stays `hidden` and can't be told apart from the closed ones by any honest
 * query. The labels asserted here are unique across the toolbar's menus.
 */
function menuItem(name: RegExp | string): HTMLElement {
  return screen.getByRole('menuitem', {name, hidden: true})
}

/** Sanity UI marks a disabled item with a valueless `data-disabled`. */
function isDisabled(item: HTMLElement): boolean {
  return item.hasAttribute('data-disabled')
}

describe('Toolbar', () => {
  // The wording itself is `statsLine`'s, asserted against every kind- and
  // filter-registry shape in `src/statsLine.test.ts`. What's left to check here
  // is that the toolbar renders what that function returns.
  it('renders the stats line', () => {
    renderWithProviders(<Toolbar {...props()} />)

    expect(
      screen.getByText('2 documents · 1 objects · 2 connections · 1 system · system types hidden'),
    ).toBeDefined()
  })

  describe('search', () => {
    beforeEach(() => vi.useFakeTimers({shouldAdvanceTime: true}))
    afterEach(() => vi.useRealTimers())

    it('debounces before propagating, so a full-graph re-render costs one pass', async () => {
      const onSearchQueryChange = vi.fn()
      renderWithProviders(<Toolbar {...props({onSearchQueryChange})} />)

      await userEvent.type(screen.getByPlaceholderText('Search types or fields…'), 'post')

      expect(onSearchQueryChange).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(200)
      expect(onSearchQueryChange).toHaveBeenCalledExactlyOnceWith('post')
    })

    it('clears immediately, without waiting out the debounce', async () => {
      const onSearchQueryChange = vi.fn()
      renderWithProviders(<Toolbar {...props({onSearchQueryChange})} />)

      const input = screen.getByPlaceholderText<HTMLInputElement>('Search types or fields…')
      await userEvent.type(input, 'post')
      await userEvent.click(screen.getByRole('button', {name: /clear/i}))

      expect(onSearchQueryChange).toHaveBeenCalledExactlyOnceWith('')
      expect(input.value).toBe('')
    })
  })

  describe('filter menu', () => {
    it('renders one section per registered filter, including a custom one', async () => {
      const zeroDocs: FilterDef = {
        id: 'zero-docs',
        label: 'Document counts',
        type: 'single',
        options: [
          {value: 'all', label: 'All types'},
          {value: 'empty', label: 'Only empty'},
        ],
        defaultValues: ['all'],
        urlParam: 'docs',
        predicate: () => true,
      }
      const filters = [...createDefaultFilters(defaultNodeKinds), zeroDocs]
      renderWithProviders(<Toolbar {...props({filters: defaultFilterValues(filters)})} />, {
        options: {filters},
      })

      await openMenu('Filter')

      // The toolbar knows nothing about what a filter does — a `FilterDef` is
      // enough to put it in the menu.
      expect(screen.getByText('Document counts')).toBeDefined()
      expect(screen.getByText('Kind')).toBeDefined()
      expect(screen.getByText('Health status')).toBeDefined()
      await openSubmenu('Document counts')
      expect(menuItem('Only empty')).toBeDefined()
    })

    it('toggles one value of a multi filter', async () => {
      const onToggleFilterValue = vi.fn()
      renderWithProviders(<Toolbar {...props({onToggleFilterValue})} />)

      await openMenu('Filter')
      await userEvent.click(menuItem('Objects'))

      expect(onToggleFilterValue.mock.calls[0][0].id).toBe('kinds')
      expect(onToggleFilterValue.mock.calls[0][1]).toBe('object')
    })

    it('disables the last checked option of a multi filter — unchecking it would hide everything', async () => {
      const filters = {...defaultFilters, kinds: ['document']}
      renderWithProviders(<Toolbar {...props({filters})} />)

      await openMenu(/Filter/)

      expect(isDisabled(menuItem('Documents'))).toBe(true)
      expect(isDisabled(menuItem('Objects'))).toBe(false)
    })

    it('replaces the selection of a single filter', async () => {
      const onSetFilterValue = vi.fn()
      renderWithProviders(<Toolbar {...props({onSetFilterValue})} />)

      await openMenu('Filter')
      await openSubmenu('System types')
      await userEvent.click(menuItem('Include system types'))

      expect(onSetFilterValue.mock.calls[0][0].id).toBe('system')
      expect(onSetFilterValue.mock.calls[0][1]).toBe('1')
    })

    it('counts active filters on the button and enables "Clear filters" only then', async () => {
      const {rerender} = renderWithProviders(<Toolbar {...props()} />)
      await openMenu('Filter')
      expect(isDisabled(menuItem('Clear filters'))).toBe(true)

      rerender(
        <Toolbar
          {...props({
            filters: {...defaultFilters, system: ['1'], health: ['issues']},
          })}
        />,
      )
      expect(screen.getByRole('button', {name: 'Filter (2)'})).toBeDefined()
      expect(isDisabled(menuItem('Clear filters'))).toBe(false)
    })
  })

  describe('view menu', () => {
    it('switches layout direction', async () => {
      const onDirectionChange = vi.fn()
      renderWithProviders(<Toolbar {...props({onDirectionChange})} />)

      await openMenu('View')
      await userEvent.click(menuItem('Vertical'))

      expect(onDirectionChange).toHaveBeenCalledExactlyOnceWith('TB')
    })

    it('toggles compact mode and re-layout', async () => {
      const onCompactModeChange = vi.fn()
      const onRelayout = vi.fn()
      renderWithProviders(<Toolbar {...props({onCompactModeChange, onRelayout})} />)

      await openMenu('View')
      await userEvent.click(menuItem('Compact nodes'))
      expect(onCompactModeChange).toHaveBeenCalledExactlyOnceWith(true)

      await openMenu('View')
      await userEvent.click(menuItem('Re-layout'))
      expect(onRelayout).toHaveBeenCalledOnce()
    })
  })

  describe('focus combobox', () => {
    it('offers every type, labelled by its kind, plus an "all types" reset', async () => {
      renderWithProviders(<Toolbar {...props()} />)

      await userEvent.click(screen.getByRole('combobox'))

      expect(await screen.findByText('Only Blog post — document')).toBeDefined()
      expect(screen.getByText('Only SEO — object')).toBeDefined()
      expect(screen.getByText('All types & connections')).toBeDefined()
    })

    it('reports a chosen type, and null for the reset option', async () => {
      const onFocusNodeIdChange = vi.fn()
      renderWithProviders(<Toolbar {...props({onFocusNodeIdChange})} />)

      await userEvent.click(screen.getByRole('combobox'))
      await userEvent.click(await screen.findByText('Only SEO — object'))
      expect(onFocusNodeIdChange).toHaveBeenCalledExactlyOnceWith('seo')

      onFocusNodeIdChange.mockClear()
      await userEvent.click(screen.getByRole('combobox'))
      await userEvent.click(await screen.findByText('All types & connections'))
      expect(onFocusNodeIdChange).toHaveBeenCalledExactlyOnceWith(null)
    })
  })

  describe('health and link buttons', () => {
    it('shows the issue count and toggles the panel', async () => {
      const onToggleHealthPanel = vi.fn()
      renderWithProviders(
        <Toolbar
          {...props({
            healthIssueCount: 3,
            healthWarningCount: 3,
            onToggleHealthPanel,
          })}
        />,
      )

      await userEvent.click(screen.getByRole('button', {name: 'Health (3)'}))

      expect(onToggleHealthPanel).toHaveBeenCalledOnce()
    })

    it('copies the link', async () => {
      const onCopyLink = vi.fn()
      renderWithProviders(<Toolbar {...props({onCopyLink})} />)

      await userEvent.click(screen.getByRole('button', {name: 'Copy link'}))

      expect(onCopyLink).toHaveBeenCalledOnce()
    })
  })

  it('flags the community plugin in beta and links to the issue tracker', () => {
    renderWithProviders(<Toolbar {...props()} />)

    const link = screen.getByRole('link', {name: /community plugin.*in beta/})
    expect(link.textContent).toBe('Beta')
    expect(link.getAttribute('href')).toBe(
      'https://github.com/maciejtrzcinski/sanity-plugin-schema-visualization/issues',
    )
    expect(link.getAttribute('target')).toBe('_blank')
  })

  // The toolbar renders whatever a feature hands it and knows nothing about
  // what that is — `DocumentCountsButton` and its states are tested beside the
  // component, in `src/documentCounts/`.
  describe('extraActions', () => {
    it('renders a contributed control in the action row', () => {
      renderWithProviders(
        <Toolbar {...props({extraActions: <button type="button">Contributed</button>})} />,
      )

      expect(screen.getByRole('button', {name: 'Contributed'})).toBeDefined()
    })
  })
})
