/**
 * Runs before every test file, in both environments — the pure-logic suites
 * run in node, the component suites opt into jsdom with a
 * `@vitest-environment` docblock. Everything here is DOM-only, so it's skipped
 * entirely when there's no `window`.
 */
/// <reference types="vitest/jsdom" />
import {cleanup, configure} from '@testing-library/react'
import {afterEach} from 'vitest'

if (typeof window !== 'undefined') {
  /**
   * React Flow watches its pane and every node with a `ResizeObserver`, then
   * re-reads their size from `offsetWidth`/`offsetHeight`. jsdom fires neither
   * and reports both as 0, so the observer here just notifies on `observe` and
   * the sizes come from the fallbacks below.
   */
  class TestResizeObserver {
    constructor(private readonly callback: (entries: unknown[], observer: unknown) => void) {}
    observe(target: Element): void {
      this.callback([{target, contentRect: target.getBoundingClientRect()}], this)
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(window, 'ResizeObserver', {value: TestResizeObserver, writable: true})

  /**
   * Node 25+ ships its own `localStorage` global, `undefined` unless Node runs
   * with `--localstorage-file`, and Vitest leaves it standing in place of
   * jsdom's. Point it back at the jsdom window's storage, which Vitest exposes
   * as the `jsdom` global.
   */
  const storage: Storage | undefined = window.localStorage
  if (storage === undefined) {
    Object.defineProperty(globalThis, 'localStorage', {
      value: jsdom.window.localStorage,
      writable: true,
    })
  }

  /** React Flow reads the pane's zoom back out of its CSS transform. */
  class TestDOMMatrixReadOnly {
    m22: number
    constructor(transform?: string) {
      const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1]
      this.m22 = scale === undefined ? 1 : Number(scale)
    }
  }
  Object.defineProperty(window, 'DOMMatrixReadOnly', {
    value: TestDOMMatrixReadOnly,
    writable: true,
  })

  /**
   * jsdom reports every element as 0×0, and React Flow reads real sizes off
   * `offsetWidth`/`offsetHeight`: the pane's decides which nodes
   * `onlyRenderVisibleElements` keeps, and each card's is what `fitView` and
   * the canvas's own re-flow measure. Inline styles win where a test sets
   * them; otherwise the pane gets a fixed test viewport and a card the width
   * the layout reserves for it.
   */
  const FALLBACK_SIZES: Array<[selector: string, width: number, height: number]> = [
    ['.react-flow', 1200, 800],
    ['.react-flow__node', 260, 120],
  ]

  for (const [prop, styleProp, index] of [
    ['offsetWidth', 'width', 1],
    ['offsetHeight', 'height', 2],
  ] as const) {
    Object.defineProperty(window.HTMLElement.prototype, prop, {
      configurable: true,
      get(this: HTMLElement) {
        const inline = Number.parseFloat(this.style[styleProp])
        if (inline) return inline
        const match = FALLBACK_SIZES.find(([selector]) => this.matches(selector))
        return match ? match[index] : 1
      },
    })
  }

  // React Flow sizes an edge's field-name label from its rendered text, which
  // jsdom can't measure. Only the label's own background rect depends on it.
  Object.defineProperty(window.SVGElement.prototype, 'getBBox', {
    writable: true,
    value: () => ({x: 0, y: 0, width: 0, height: 0}),
  })

  // Sanity UI's Tooltip and Autocomplete position themselves through Popper,
  // which asks for these on mount.
  window.HTMLElement.prototype.scrollIntoView = () => {}
  window.Element.prototype.scrollTo = () => {}

  // jsdom ships no media-query engine; Sanity UI's `usePrefersReducedMotion`
  // subscribes to one. Reduced motion is the one query that matches: the
  // canvas then re-frames without its 300ms animation, so a test waiting for
  // off-screen cards to come into view waits on a frame, not on a transition
  // that a loaded CI box can stretch past the `waitFor` budget.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })

  // Mounting React Flow, Sanity UI's styled-components and a dagre pass costs
  // well over Testing Library's 1s default on a loaded CI box, and the canvas
  // only settles two animation frames after that. The first render in a file
  // is the slow one — 1.5–3s at idle, several times that under load, which
  // is what made the first test of each component suite fail at random with
  // a 5s budget. Every `waitFor`/`findBy` in the component suites is waiting
  // on that same commit, so the budget is raised once here rather than per
  // call; a passing wait returns as soon as it matches, so this costs nothing
  // unless a test is failing anyway. See `testTimeout` in `vitest.config.ts`,
  // which has to leave room for several in a row.
  configure({asyncUtilTimeout: 15_000})

  afterEach(cleanup)
}
