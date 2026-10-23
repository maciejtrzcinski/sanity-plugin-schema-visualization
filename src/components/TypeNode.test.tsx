// @vitest-environment jsdom
import {screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'

import {makeNode, postNode} from '../../test/fixtures'
import {renderWithProviders} from '../../test/render'
import type {TypeNodeData} from '../flowModel'
import {MAX_VISIBLE_FIELDS} from '../layout'
import {TypeNode} from './TypeNode'

function data(overrides: Partial<TypeNodeData> = {}): TypeNodeData {
  const node = overrides.node ?? postNode
  return {
    node,
    fieldCount: node.fields.length,
    expanded: true,
    connectionCount: 2,
    warningCount: 0,
    infoCount: 0,
    annotations: {},
    onToggleExpand: () => {},
    ...overrides,
  }
}

describe('TypeNode', () => {
  it('renders the title, the schema name and the base type badge', () => {
    renderWithProviders(<TypeNode data={data()} />)

    expect(screen.getByText('Blog post')).toBeDefined()
    // Shown separately only because the title differs from the type name.
    expect(screen.getByText('post')).toBeDefined()
    expect(screen.getByText('document')).toBeDefined()
  })

  it('lists fields with their type labels and badges when expanded', () => {
    renderWithProviders(<TypeNode data={data({expanded: true})} />)

    expect(screen.getByText('title')).toBeDefined()
    expect(screen.getByText('reference → author')).toBeDefined()
    expect(screen.getByText('weak ref')).toBeDefined()
  })

  it('collapses to a summary line instead of the field list', () => {
    renderWithProviders(<TypeNode data={data({expanded: false})} />)

    expect(screen.queryByText('metaTitle')).toBeNull()
    expect(screen.getByText('3 fields · 2 connections')).toBeDefined()
  })

  it('toggles expansion through the chevron without selecting the node', async () => {
    const onToggleExpand = vi.fn()
    const onCardClick = vi.fn()
    // React Flow selects a node from a click that bubbles out of the card, so
    // the chevron must not let one through.
    renderWithProviders(
      <div role="presentation" onClick={onCardClick}>
        <TypeNode data={data({expanded: false, onToggleExpand})} />
      </div>,
    )

    await userEvent.click(screen.getByRole('button', {name: 'Expand fields'}))

    expect(onToggleExpand).toHaveBeenCalledWith('post')
    // The chevron stops propagation so expanding doesn't also open the panel.
    expect(onCardClick).not.toHaveBeenCalled()
  })

  it('badges system and deprecated types, and pluralises the doc count', () => {
    const node = {...postNode, isSystem: true, deprecated: 'use `article`'}
    renderWithProviders(<TypeNode data={data({node, annotations: {docCount: 1}})} />)

    expect(screen.getByText('system')).toBeDefined()
    expect(screen.getByText('deprecated')).toBeDefined()
    expect(screen.getByText('1 doc')).toBeDefined()
  })

  it('paints the issue badge from the worst severity present', () => {
    const {container, rerender} = renderWithProviders(
      <TypeNode data={data({warningCount: 1, infoCount: 2})} />,
    )

    // One badge for all three, and a warning outranks the two notes.
    expect(screen.getByText('3')).toBeDefined()
    expect(container.querySelector('[data-sanity-icon="warning-outline"]')).not.toBeNull()

    rerender(<TypeNode data={data({warningCount: 0, infoCount: 2})} />)

    // Advisory notes only — not something to flag as a warning.
    expect(container.querySelector('[data-sanity-icon="warning-outline"]')).toBeNull()
    expect(container.querySelector('[data-sanity-icon="info-outline"]')).not.toBeNull()
  })

  it('truncates the field list and says how many are left', () => {
    const fields = Array.from({length: MAX_VISIBLE_FIELDS + 3}, (_, i) => ({
      name: `field${i}`,
      typeLabel: 'string',
      options: [],
      referencesTo: [],
      reusesTypes: [],
      required: false,
      hidden: false,
    }))
    renderWithProviders(<TypeNode data={data({node: {...postNode, fields}})} />)

    expect(screen.getByText(`field${MAX_VISIBLE_FIELDS - 1}`)).toBeDefined()
    expect(screen.queryByText(`field${MAX_VISIBLE_FIELDS}`)).toBeNull()
    expect(screen.getByText(/\+3 more fields/)).toBeDefined()
  })

  it('falls back to the catch-all kind for a kind the registry does not have', () => {
    renderWithProviders(<TypeNode data={data({node: {...postNode, kind: 'gone'}})} />)

    // Renders rather than throwing — the catch-all supplies tone and icon.
    expect(screen.getByText('Blog post')).toBeDefined()
  })

  it('renders both option badges when a field carries two with the same label', () => {
    // A field badge and a describer's own option can carry the same label on
    // one field. Keyed by label, React warns about the collision and
    // reconciles the two as one on the next update — hence the collected id.
    const node = makeNode({
      id: 'post',
      fields: [
        {
          name: 'title',
          typeLabel: 'string',
          options: [
            {id: 'required', label: 'required', tone: 'critical'},
            {id: 'type-option:0', label: 'required', tone: 'primary'},
          ],
          referencesTo: [],
          reusesTypes: [],
          required: true,
          hidden: false,
        },
      ],
    })

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderWithProviders(<TypeNode data={data({node})} />)

    expect(screen.getAllByText('required')).toHaveLength(2)
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
