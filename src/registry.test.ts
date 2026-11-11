import {describe, expect, it} from 'vitest'

import {
  catchAllOf,
  cssColor,
  duplicateIds,
  duplicates,
  indexById,
  insertBefore,
  replaceById,
  without,
  type Registered,
} from './registry'

interface Def extends Registered {
  label: string
}

const first: Def = {id: 'first', label: 'First'}
const second: Def = {id: 'second', label: 'Second'}
const fallback: Def = {id: 'fallback', label: 'Fallback', isCatchAll: true}

describe('indexById', () => {
  it('indexes a registry by id', () => {
    const map = indexById([first, second])
    expect(map.get('first')).toBe(first)
    expect(map.get('second')).toBe(second)
  })

  it('misses on an id no def covers', () => {
    expect(indexById([first]).get('nope')).toBeUndefined()
  })

  it('keeps the last of two entries sharing an id', () => {
    const shadow: Def = {id: 'first', label: 'Shadow'}
    expect(indexById([first, shadow]).get('first')).toBe(shadow)
  })
})

describe('catchAllOf', () => {
  it('finds the entry flagged `isCatchAll`', () => {
    expect(catchAllOf([first, fallback], first)).toBe(fallback)
    expect(catchAllOf([fallback, first], first)).toBe(fallback)
  })

  it('stands the last entry in when none is flagged', () => {
    expect(catchAllOf([first, second], fallback)).toBe(second)
  })

  it('falls back to the built-in when the registry is empty', () => {
    expect(catchAllOf([], fallback)).toBe(fallback)
  })
})

describe('duplicateIds', () => {
  it('reports each shadowed id once, however many times it repeats', () => {
    const dupe: Def = {id: 'first', label: 'Dupe'}
    expect(duplicateIds([first, dupe, second, {id: 'first', label: 'Third'}])).toEqual(['first'])
  })

  it('reports nothing for a registry with unique ids', () => {
    expect(duplicateIds([first, second, fallback])).toEqual([])
  })
})

describe('duplicates', () => {
  it('reports the repeated values, each once', () => {
    expect(duplicates(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b'])
  })
})

describe('insertBefore', () => {
  it('places the entries just ahead of the anchor, in the order given', () => {
    const a: Def = {id: 'a', label: 'A'}
    const b: Def = {id: 'b', label: 'B'}
    expect(insertBefore([first, second, fallback], 'second', a, b)).toEqual([
      first,
      a,
      b,
      second,
      fallback,
    ])
  })

  it('leaves the input untouched', () => {
    const defs = [first, second]
    insertBefore(defs, 'second', fallback)
    expect(defs).toEqual([first, second])
  })

  it('throws on an anchor no entry carries, naming the ids it does have', () => {
    expect(() => insertBefore([first, second], 'nope', fallback)).toThrow(
      'insertBefore: no entry with id `nope`. The registry has `first`, `second`.',
    )
    expect(() => insertBefore([], 'nope', fallback)).toThrow('The registry is empty.')
  })
})

describe('replaceById', () => {
  it('swaps the entry sharing the replacement id, keeping its position', () => {
    const softer: Def = {...second, label: 'Softer second'}
    expect(replaceById([first, second, fallback], softer)).toEqual([first, softer, fallback])
  })

  it('throws when nothing carries the replacement id', () => {
    expect(() => replaceById([first], second)).toThrow('replaceById: no entry with id `second`')
  })
})

describe('without', () => {
  it('drops every entry named, keeping the rest in order', () => {
    expect(without([first, second, fallback], 'second')).toEqual([first, fallback])
    expect(without([first, second, fallback], 'fallback', 'first')).toEqual([second])
  })

  it('throws when one of the ids matches nothing', () => {
    expect(() => without([first, second], 'first', 'nope')).toThrow(
      'without: no entry with id `nope`',
    )
  })
})

describe('cssColor', () => {
  it('pairs the custom property with its literal fallback', () => {
    expect(cssColor({cssVar: '--card-badge-primary-dot-color', fallback: '#2276fc'})).toBe(
      'var(--card-badge-primary-dot-color, #2276fc)',
    )
  })
})
