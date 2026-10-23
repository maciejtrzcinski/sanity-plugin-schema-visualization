// @vitest-environment jsdom
import {screen, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'

import {authorEdge, makeNode, postNode, seoEdge, seoNode} from '../../test/fixtures'
import {renderWithProviders} from '../../test/render'
import type {HealthIssue} from '../healthRules'
import {DetailPanel, type DetailPanelProps} from './DetailPanel'

function props(overrides: Partial<DetailPanelProps> = {}): DetailPanelProps {
  return {
    node: postNode,
    edges: [authorEdge, seoEdge],
    issues: [],
    isFocused: false,
    onClose: () => {},
    onNavigate: () => {},
    onToggleFocus: () => {},
    ...overrides,
  }
}

/** The `Stack` following a heading — the section's list of rows. */
function sectionAfter(heading: string): HTMLElement {
  const label = screen.getByText(heading)
  const section = label.closest('[data-ui="Stack"]')
  if (!(section instanceof HTMLElement)) throw new Error(`no section for "${heading}"`)
  return section
}

describe('DetailPanel', () => {
  it('renders the type header, its schema name and base type', () => {
    renderWithProviders(<DetailPanel {...props()} />)

    expect(screen.getByText('Blog post')).toBeDefined()
    // Shown separately only because the title differs from the type name.
    expect(screen.getByText('post')).toBeDefined()
    expect(screen.getByText('document')).toBeDefined()
  })

  it('lists every field with its badges — unlike the card, nothing is truncated', () => {
    renderWithProviders(<DetailPanel {...props()} />)

    const fields = sectionAfter('Fields (3)')
    for (const name of ['title', 'author', 'seo']) {
      expect(within(fields).getByText(name)).toBeDefined()
    }
    expect(within(fields).getByText('reference → author')).toBeDefined()
    expect(within(fields).getByText('required')).toBeDefined()
  })

  it('splits connections into outgoing and incoming', () => {
    renderWithProviders(<DetailPanel {...props({node: seoNode, edges: [authorEdge, seoEdge]})} />)

    expect(screen.getByText('Outgoing connections (0)')).toBeDefined()
    expect(screen.getByText('Incoming connections (1)')).toBeDefined()
    expect(within(sectionAfter('Incoming connections (1)')).getByText('post')).toBeDefined()
  })

  it('badges each connection through its edge kind and shows the field path', () => {
    renderWithProviders(<DetailPanel {...props()} />)

    const outgoing = sectionAfter('Outgoing connections (2)')
    // `referenceKind.badgeLabel` calls out the weak reference; `reusesKind` has
    // no override, so its badge is the kind id.
    expect(within(outgoing).getByText('weak ref')).toBeDefined()
    expect(within(outgoing).getByText('reuses')).toBeDefined()
    // `authorEdge` has no `fieldPath`, so the row names the field instead.
    expect(outgoing.textContent).toContain('via field "author"')
    expect(outgoing.textContent).toContain('via seo')
  })

  it('falls back to the catch-all style for an unregistered edge kind', () => {
    const edges = [{...authorEdge, kind: 'cross-dataset'}]
    renderWithProviders(<DetailPanel {...props({edges})} />)

    // No `badgeLabel` on the catch-all, so the badge is the edge's own kind id.
    expect(screen.getByText('cross-dataset')).toBeDefined()
  })

  it('navigates to the other end of a connection from anywhere on its row', async () => {
    const onNavigate = vi.fn()
    renderWithProviders(<DetailPanel {...props({onNavigate})} />)

    const row = screen.getByRole('button', {name: 'author', description: 'via field "author"'})
    await userEvent.click(within(row).getByText('weak ref'))

    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('author')
  })

  it('reports health issues raised against the type', () => {
    const issues: HealthIssue[] = [
      {
        id: 'orphaned-type:seo',
        severity: 'warning',
        category: 'orphaned-type',
        nodeId: 'post',
        message: 'Nothing references this type.',
      },
    ]
    renderWithProviders(<DetailPanel {...props({issues})} />)

    expect(screen.getByText('Health issues (1)')).toBeDefined()
    expect(screen.getByText('Nothing references this type.')).toBeDefined()
  })

  it('paints an issue card by its severity', () => {
    const issue: HealthIssue = {
      id: 'large-type:post',
      severity: 'warning',
      category: 'large-type',
      nodeId: 'post',
      message: 'Consider splitting this type up.',
    }
    const cardTone = () =>
      screen
        .getByText('Consider splitting this type up.')
        .closest('[data-ui="Card"]')
        ?.getAttribute('data-tone')

    const {rerender} = renderWithProviders(<DetailPanel {...props({issues: [issue]})} />)
    expect(cardTone()).toBe('caution')

    rerender(<DetailPanel {...props({issues: [{...issue, severity: 'info'}]})} />)

    // Same message, lower severity — an advisory note must not reach the panel
    // wearing a warning's tone. `severityTone` decides which; this pins that
    // the panel actually asks it.
    expect(cardTone()).not.toBe('caution')
  })

  it('labels the focus button by whether the type is already focused', async () => {
    const onToggleFocus = vi.fn()
    const {rerender} = renderWithProviders(
      <DetailPanel {...props({isFocused: false, onToggleFocus})} />,
    )
    await userEvent.click(screen.getByRole('button', {name: /Show only this type/}))
    expect(onToggleFocus).toHaveBeenCalledOnce()

    rerender(<DetailPanel {...props({isFocused: true, onToggleFocus})} />)
    expect(screen.getByRole('button', {name: /Showing only this type/})).toBeDefined()
  })

  it('closes', async () => {
    const onClose = vi.fn()
    renderWithProviders(<DetailPanel {...props({onClose})} />)

    await userEvent.click(screen.getByRole('button', {name: 'Close details'}))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows a doc count only once one has been loaded', () => {
    const {rerender} = renderWithProviders(<DetailPanel {...props()} />)
    expect(screen.queryByText(/documents \(live/)).toBeNull()

    rerender(<DetailPanel {...props({annotations: {docCount: 4}})} />)
    expect(screen.getByText('4 documents')).toBeDefined()
  })

  describe('the link into the rest of the Studio', () => {
    const createLink = () => screen.queryByRole('link', {name: /New/})

    it('opens the type in the Studio through the `create` intent', async () => {
      const onNavigate = vi.fn()
      renderWithProviders(<DetailPanel {...props({createDocument: {params: {type: 'post'}}})} />, {
        onNavigate,
      })

      const link = createLink()
      expect(link).not.toBeNull()
      // A real href, so the row behaves like a link rather than a button that
      // navigates — and it names the type, not a structure path.
      expect(link?.getAttribute('href')).toBe('/intent/create/type=post/')

      await userEvent.click(link!)

      expect(onNavigate).toHaveBeenCalledOnce()
    })

    it('names the template when the type’s default one isn’t the one allowed', () => {
      renderWithProviders(
        <DetailPanel
          {...props({createDocument: {params: {type: 'post', template: 'post-by-author'}}})}
        />,
      )

      expect(createLink()?.getAttribute('href')).toContain('template=post-by-author')
    })

    // Which types get one — kinds, system types, singletons, permissions — is
    // `createDocumentTarget` and `useCreateDocumentTarget`; the panel only
    // renders what it's handed.
    it('offers nothing when it isn’t handed a target', () => {
      renderWithProviders(<DetailPanel {...props()} />)

      expect(createLink()).toBeNull()
    })
  })

  it('lists the type’s groups and where each field sits', () => {
    const node = makeNode({
      id: 'post',
      groups: [
        {name: 'content', title: 'Content', isDefault: true},
        {name: 'seo', title: 'SEO'},
      ],
      fieldsets: [{name: 'meta', title: 'Meta', fields: ['code']}],
      fields: [
        {...postNode.fields[0], groups: ['content', 'seo']},
        {...postNode.fields[0], name: 'code', fieldset: 'meta'},
      ],
    })

    renderWithProviders(<DetailPanel {...props({node, edges: []})} />)

    expect(screen.getByText('Groups: Content (default), SEO')).toBeTruthy()
    expect(screen.getByText('group: Content, SEO')).toBeTruthy()
    expect(screen.getByText('fieldset: Meta')).toBeTruthy()
  })

  it('renders both option badges when a field carries two with the same label', () => {
    // Same collision as on the card, keyed by the collected id — see `TypeNode`.
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
    renderWithProviders(<DetailPanel {...props({node, edges: []})} />)

    expect(screen.getAllByText('required')).toHaveLength(2)
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
