/// <reference types="vitest/jsdom" />
import {cleanup, configure} from '@testing-library/react'
import {afterEach} from 'vitest'

if (typeof window !== 'undefined') {
  /** jsdom never fires `ResizeObserver`: notify on `observe`, sizes come from below. */
  class TestResizeObserver {
    constructor(private readonly callback: (entries: unknown[], observer: unknown) => void) {}
    observe(target: Element): void {
      this.callback([{target, contentRect: target.getBoundingClientRect()}], this)
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(window, 'ResizeObserver', {value: TestResizeObserver, writable: true})

  /** Node 25+'s own `localStorage` global shadows jsdom's; point it back at the jsdom window's. */
  const storage: Storage | undefined = window.localStorage
  if (storage === undefined) {
    Object.defineProperty(globalThis, 'localStorage', {
      value: jsdom.window.localStorage,
      writable: true,
    })
  }

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

  /** jsdom reports 0×0; React Flow culls and fits from these sizes. Inline styles win. */
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

  Object.defineProperty(window.SVGElement.prototype, 'getBBox', {
    writable: true,
    value: () => ({x: 0, y: 0, width: 0, height: 0}),
  })

  window.HTMLElement.prototype.scrollIntoView = () => {}
  window.Element.prototype.scrollTo = () => {}

  // Reduced motion matches, so re-framing skips its 300ms animation and `waitFor` doesn't race it.
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

  // A first React Flow mount can take seconds on a loaded CI box. See `testTimeout`.
  configure({asyncUtilTimeout: 15_000})

  afterEach(cleanup)
}
