import {describe, expect, it} from 'vitest'

import {sameAnnotations} from './nodeAnnotations'

describe('sameAnnotations', () => {
  it('compares by value, so a rebuilt map does not re-render every card', () => {
    expect(sameAnnotations({lintScore: 3}, {lintScore: 3})).toBe(true)
    expect(sameAnnotations({lintScore: 3}, {lintScore: 4})).toBe(false)
    expect(sameAnnotations({}, {})).toBe(true)
  })

  it('notices a key one side does not have', () => {
    expect(sameAnnotations({lintScore: 3}, {lintScore: 3, lastModified: 1})).toBe(false)
    expect(sameAnnotations({lintScore: 3, lastModified: 1}, {lintScore: 3})).toBe(false)
  })
})
