import {describe, expect, it} from 'vitest'

import {graph, makeEdge, makeNode} from '../test/fixtures'
import {createDefaultFilters, defaultFilterValues} from './filters'
import {buildFilterContext, computeGraphStats, countWarnings, groupIssuesByNode} from './graphModel'
import type {HealthIssue, HealthSeverity} from './healthRules'
import {defaultTranslate} from './i18n'
import {catchAllKind, defaultNodeKinds, documentKind, objectKind, otherKind} from './kinds'
import {indexById} from './registry'
import {visibleSubgraph} from './visibleGraph'

const statsConfig = {
  kinds: defaultNodeKinds,
  kindById: indexById(defaultNodeKinds),
  catchAll: catchAllKind(defaultNodeKinds),
}

function issue(nodeId: string, severity: HealthSeverity): HealthIssue {
  const id = `${nodeId}-${severity}`
  return {id, severity, category: 'test', nodeId, message: id}
}

describe('computeGraphStats', () => {
  it('counts custom types per kind in registry order, and system types apart', () => {
    expect(computeGraphStats(graph, statsConfig)).toEqual({
      byKind: [
        {kind: documentKind, count: 2},
        {kind: objectKind, count: 1},
        {kind: otherKind, count: 0},
      ],
      edges: 2,
      system: 1,
    })
  })

  it('counts a type of an unregistered kind under the catch-all', () => {
    const widget = makeNode({id: 'widget', kind: 'widget'})
    const stats = computeGraphStats({nodes: [...graph.nodes, widget], edges: []}, statsConfig)

    expect(stats.byKind.find((entry) => entry.kind === statsConfig.catchAll)?.count).toBe(1)
  })
})

describe('groupIssuesByNode', () => {
  it('groups issues under the type they are reported against, keeping their order', () => {
    const first = issue('post', 'warning')
    const second = issue('author', 'info')
    const third = issue('post', 'info')

    expect(groupIssuesByNode([first, second, third])).toEqual(
      new Map([
        ['post', [first, third]],
        ['author', [second]],
      ]),
    )
  })
})

describe('countWarnings', () => {
  it('counts only warning-severity issues', () => {
    expect(countWarnings([issue('a', 'warning'), issue('b', 'info'), issue('c', 'warning')])).toBe(
      2,
    )
  })
})

describe('buildFilterContext', () => {
  it('counts issues of any severity, and warnings only for types that have some', () => {
    const issuesByNodeId = groupIssuesByNode([
      issue('post', 'warning'),
      issue('post', 'info'),
      issue('author', 'info'),
    ])
    const ctx = buildFilterContext(graph, issuesByNodeId, new Map(), defaultTranslate)

    expect(ctx.issueCountByNodeId).toEqual(
      new Map([
        ['post', 2],
        ['author', 1],
      ]),
    )
    expect(ctx.warningCountByNodeId).toEqual(new Map([['post', 1]]))
  })

  it('judges orphans against the whole graph, so hiding a type does not orphan its neighbours', () => {
    const post = makeNode({id: 'post'})
    const seo = makeNode({id: 'seo', kind: 'object'})
    const lonely = makeNode({id: 'lonely'})
    const whole = {
      nodes: [post, seo, lonely],
      edges: [makeEdge({source: 'post', target: 'seo', kind: 'reuses'})],
    }
    const filterDefs = createDefaultFilters()
    const filters = {
      ...defaultFilterValues(filterDefs),
      kinds: ['document'],
      connectivity: ['orphan'],
    }

    const visible = visibleSubgraph(whole, {
      filters,
      filterDefs,
      filterContext: buildFilterContext(whole, new Map(), new Map(), defaultTranslate),
      focusNodeId: null,
      selectedNodeId: null,
    })

    expect(visible.nodes.map((n) => n.id)).toEqual(['lonely'])
  })
})
