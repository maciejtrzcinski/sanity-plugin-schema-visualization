// @vitest-environment jsdom
import {screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'

import {renderWithProviders} from '../../test/render'
import {DocumentCountsButton} from './DocumentCountsButton'

describe('DocumentCountsButton', () => {
  it('names itself after the fetch state, and goes dead while a load is in flight', async () => {
    const onClick = vi.fn()
    const {rerender} = renderWithProviders(<DocumentCountsButton status="idle" onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', {name: 'Load doc counts'}))
    expect(onClick).toHaveBeenCalledOnce()

    // A load in flight must not be re-triggered by an impatient second click.
    rerender(<DocumentCountsButton status="loading" onClick={onClick} />)
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true)

    rerender(<DocumentCountsButton status="error" onClick={onClick} />)
    expect(screen.getByRole('button', {name: 'Retry doc counts'})).toBeDefined()

    rerender(<DocumentCountsButton status="loaded" fetchedAt={Date.now()} onClick={onClick} />)
    expect(screen.getByRole('button', {name: 'Refresh doc counts'})).toBeDefined()
  })

  it('reports how stale a loaded count is, and says nothing before the first load', async () => {
    const {rerender} = renderWithProviders(
      <DocumentCountsButton status="idle" onClick={() => {}} />,
    )

    // There is nothing to say about freshness until a load has succeeded.
    await userEvent.hover(screen.getByRole('button', {name: 'Load doc counts'}))
    expect(document.body.textContent).not.toContain('Loaded')

    rerender(
      <DocumentCountsButton
        status="loaded"
        fetchedAt={Date.now() - 5 * 60_000}
        onClick={() => {}}
      />,
    )
    await userEvent.hover(screen.getByRole('button', {name: 'Refresh doc counts'}))

    // Like the toolbar's menus, the tooltip's popover stays `hidden` under jsdom.
    await waitFor(() => expect(document.body.textContent).toContain('Loaded 5m ago'))
  })
})
