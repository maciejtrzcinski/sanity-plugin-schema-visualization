import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {resetBrokenAssumptions} from './compat'
import {resolveConfig} from './config'
import {defaultEdgeKinds, referenceKind, reusesKind, type EdgeKindDef} from './edgeKinds'
import {defaultFieldBadges, requiredBadge, type FieldBadgeDef} from './fieldBadges'
import {DEFAULT_MAX_DEPTH, namedTypeDescriber, type FieldDescriber} from './fieldWalker'
import {createDefaultFilters, healthFilter, systemTypesFilter, type FilterDef} from './filters'
import {documentKind, objectKind, otherKind} from './kinds'
import {defaultNodeBadges, systemBadge, type NodeBadgeDef} from './nodeBadges'

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  // Warnings are once-per-session, so each case starts from a clean slate.
  resetBrokenAssumptions()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
})

/** Every warning message produced so far, joined for substring matching. */
function warnings(): string {
  return warn.mock.calls.map((args: unknown[]) => String(args[0])).join('\n')
}

describe('resolveConfig', () => {
  it('defaults the edge kind registry and its lookups', () => {
    const config = resolveConfig()
    expect(config.edgeKinds).toBe(defaultEdgeKinds)
    expect(config.edgeKindById.get('reference')).toBe(referenceKind)
    expect(config.catchAllEdge).toBe(reusesKind)
  })

  it('resolves a custom edge kind registry', () => {
    const crossDataset: EdgeKindDef = {
      id: 'cross-dataset',
      label: 'Cross-dataset reference',
      color: {cssVar: '--card-badge-caution-dot-color', fallback: '#c8a400'},
      dash: '2 2',
      tone: 'caution',
    }
    const config = resolveConfig({edgeKinds: [referenceKind, crossDataset, reusesKind]})

    expect(config.edgeKindById.get('cross-dataset')).toBe(crossDataset)
    expect(config.catchAllEdge).toBe(reusesKind)
    expect(warnings()).toBe('')
  })

  it('says nothing about the stock config', () => {
    resolveConfig()
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('resolveConfig graph options', () => {
  it("defaults the walk depth to the graph builder's own default", () => {
    expect(resolveConfig().maxDepth).toBe(DEFAULT_MAX_DEPTH)
  })

  it('passes a custom walk depth through', () => {
    expect(resolveConfig({maxDepth: 2}).maxDepth).toBe(2)
  })
})

describe('resolveConfig field badges', () => {
  it('defaults to the built-in badge registry', () => {
    expect(resolveConfig().fieldBadges).toBe(defaultFieldBadges)
  })

  it('resolves a custom badge registry', () => {
    const badges = [...defaultFieldBadges, {id: 'custom', badge: () => undefined}]
    expect(resolveConfig({fieldBadges: badges}).fieldBadges).toBe(badges)
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('resolveConfig node badges', () => {
  it('defaults to the built-in badge registry', () => {
    expect(resolveConfig().nodeBadges).toBe(defaultNodeBadges)
  })

  it('resolves a custom badge registry', () => {
    const badges = [...defaultNodeBadges, {id: 'custom', badge: () => undefined}]
    expect(resolveConfig({nodeBadges: badges}).nodeBadges).toBe(badges)
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('resolveConfig validation', () => {
  it('reports a duplicate kind id', () => {
    resolveConfig({kinds: [documentKind, {...objectKind, id: 'document'}, otherKind]})
    expect(warnings()).toContain('share the id `document`')
  })

  it('reports a kind registry with no catch-all', () => {
    resolveConfig({kinds: [documentKind, objectKind]})
    expect(warnings()).toContain('isCatchAll')
    expect(warnings()).toContain('`object`')
  })

  it('reports an empty kind registry', () => {
    resolveConfig({kinds: []})
    expect(warnings()).toContain('`kinds` is empty')
  })

  it('reports a duplicate edge kind id', () => {
    resolveConfig({edgeKinds: [referenceKind, {...reusesKind, id: 'reference'}]})
    expect(warnings()).toContain('`edgeKinds` share the id `reference`')
  })

  it('reports an edge kind registry with no catch-all', () => {
    resolveConfig({edgeKinds: [referenceKind, {...reusesKind, isCatchAll: false}]})
    expect(warnings()).toContain('No kind in `edgeKinds` is flagged')
  })

  it('reports a duplicate field describer id', () => {
    const shadow: FieldDescriber = {...namedTypeDescriber, match: () => false}
    resolveConfig({fieldDescribers: [namedTypeDescriber, shadow]})
    expect(warnings()).toContain('`fieldDescribers` share the id `namedType`')
  })

  it('reports a duplicate field badge id', () => {
    const shadow: FieldBadgeDef = {...requiredBadge, badge: () => undefined}
    resolveConfig({fieldBadges: [requiredBadge, shadow]})
    expect(warnings()).toContain('`fieldBadges` share the id `required`')
  })

  it('reports a duplicate node badge id', () => {
    const shadow: NodeBadgeDef = {...systemBadge, badge: () => undefined}
    resolveConfig({nodeBadges: [systemBadge, shadow]})
    expect(warnings()).toContain('`nodeBadges` share the id `system`')
  })

  it('reports a duplicate filter id', () => {
    const shadow: FilterDef = {...healthFilter, urlParam: 'health2'}
    resolveConfig({filters: [healthFilter, shadow]})
    expect(warnings()).toContain('share the id `health`')
  })

  it('reports a filter claiming a reserved url param', () => {
    resolveConfig({filters: [{...healthFilter, urlParam: 'focus'}]})
    expect(warnings()).toContain('reserved `urlParam` `focus`')
  })

  it('reports two filters writing the same url param', () => {
    resolveConfig({filters: [healthFilter, {...systemTypesFilter, urlParam: 'health'}]})
    expect(warnings()).toContain('write the `urlParam` `health`')
  })

  it('accepts the derived filters built from a custom kind registry', () => {
    const singleton = {...documentKind, id: 'singleton', urlParam: 'single'}
    const kinds = [singleton, documentKind, objectKind, otherKind]
    resolveConfig({kinds, filters: createDefaultFilters(kinds)})
    expect(warn).not.toHaveBeenCalled()
  })

  // The warning is per problem, not per call: `resolveConfig` runs again on
  // every options-identity change, and a misconfigured Studio would otherwise
  // fill the console.
  it('reports each problem once per session', () => {
    const kinds = [documentKind, objectKind]
    resolveConfig({kinds})
    resolveConfig({kinds})
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
