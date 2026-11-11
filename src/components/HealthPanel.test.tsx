// @vitest-environment jsdom
import {screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'

import {authorNode, postNode} from '../../test/fixtures'
import {renderWithProviders} from '../../test/render'
import type {HealthIssue} from '../healthRules'
import {HealthPanel} from './HealthPanel'

const nodesById = new Map([
  ['post', postNode],
  ['author', authorNode],
])

function issue(overrides: Partial<HealthIssue> & Pick<HealthIssue, 'category' | 'nodeId'>) {
  return {
    id: `${overrides.category}:${overrides.nodeId}`,
    severity: 'warning',
    message: 'Something to look at.',
    ...overrides,
  } satisfies HealthIssue
}

describe('HealthPanel', () => {
  it('says so when there is nothing to report', () => {
    renderWithProviders(
      <HealthPanel issues={[]} nodesById={nodesById} onSelectNode={() => {}} onClose={() => {}} />,
    )

    expect(screen.getByText('No issues found — nice and tidy.')).toBeDefined()
  })

  it('groups issues under each rule’s own label, with a count and a way back to the type', async () => {
    const onSelectNode = vi.fn()
    renderWithProviders(
      <HealthPanel
        issues={[
          issue({category: 'required-hidden', nodeId: 'post', fieldName: 'secret'}),
          issue({category: 'orphaned-type', nodeId: 'author'}),
          issue({category: 'required-hidden', nodeId: 'author', fieldName: 'other'}),
        ]}
        nodesById={nodesById}
        onSelectNode={onSelectNode}
        onClose={() => {}}
      />,
    )

    const headings = screen
      .getAllByText(/^(Unused type|Required field is hidden)$/)
      .map((el) => el.textContent)
    expect(headings).toEqual(['Unused type', 'Required field is hidden'])

    expect(screen.getByText('2')).toBeDefined()

    await userEvent.click(screen.getByRole('button', {name: 'Blog post'}))
    expect(onSelectNode).toHaveBeenCalledExactlyOnceWith('post')
  })
})
