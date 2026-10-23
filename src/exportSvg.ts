/**
 * True vector SVG export, built by walking the live React Flow viewport DOM
 * and re-expressing what it paints as SVG primitives: boxes with a visible
 * background/border become `<rect>`s, text nodes become `<text>` positioned
 * by the browser's own layout, inline icon SVGs are copied through, and React
 * Flow's edges — already SVG paths in flow coordinates — are lifted almost
 * verbatim (with their computed styles inlined, since the export has no
 * stylesheet).
 *
 * Why not `html-to-image`'s `toSvg`: that clones the DOM into a
 * `foreignObject` with every computed CSS property inlined per element —
 * 49 MB for a 37-node graph — and `foreignObject` only renders in browsers
 * anyway. Reading geometry from the rendered DOM instead keeps the output a
 * plain SVG (KBs per node, opens in any viewer/editor) with no hand-mirrored
 * copy of `TypeNode`'s layout to drift out of sync: whatever Sanity UI
 * painted is what gets measured.
 */

/**
 * The name an export downloads as, scoped to the workspace and dataset it
 * came from: two Studios open on one machine (a staging workspace and a
 * production one, say) otherwise both write `schema-graph.svg`, and the
 * second silently replaces the first in the downloads folder. Called with
 * nothing — outside a workspace — it yields the bare `schema-graph.svg`.
 */
export function svgExportFileName(scope: {workspaceName?: string; dataset?: string} = {}): string {
  const parts = ['schema-graph', scope.workspaceName, scope.dataset].map(slugify).filter(Boolean)
  // A workspace named after its dataset (`production` / `production`) would
  // otherwise stutter.
  return `${[...new Set(parts)].join('-')}.svg`
}

/** Anything the name can't safely carry into a filesystem, to `-`. */
function slugify(value: string | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface SvgExportFrame {
  /** Output width/height in flow px (graph bounds plus padding). */
  width: number
  height: number
  /** Flow-coordinate translation applied to everything (padding minus bounds origin). */
  offsetX: number
  offsetY: number
  backgroundColor: string
}

const num = (n: number) => String(Math.round(n * 100) / 100)

/**
 * XML-escapes text and attribute values. Both go through this one function:
 * attributes are always written with `"` delimiters, so escaping `&<>"` covers
 * each position, and `'` needs no handling. An unescaped `&` in a type title is
 * enough to make the whole export unopenable, so this is exported for its own
 * test rather than only exercised through `viewportToSvg` — which needs real
 * browser layout and is checked in the dev Studio.
 *
 * @internal
 */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

let colorCtx: CanvasRenderingContext2D | null | undefined
/**
 * Round-trips a color through a canvas `fillStyle` so modern CSS color forms
 * the browser resolves to (`color(srgb …)` from the clusters' `color-mix`
 * tints, `oklch(…)`, …) come back as plain hex/rgba that any SVG viewer,
 * not just a browser, can parse.
 */
function normalizeColor(color: string): string {
  const c = color.trim()
  if (!c || c === 'none' || /^(#|rgb)/.test(c)) return c
  if (colorCtx === undefined) {
    colorCtx = document.createElement('canvas').getContext('2d')
  }
  if (!colorCtx) return c
  colorCtx.fillStyle = '#000'
  colorCtx.fillStyle = c
  return colorCtx.fillStyle
}

/**
 * The alpha channel of a computed color, 0–1. Drives {@link isInvisible},
 * which is what decides whether a painted box becomes a `<rect>` at all — so a
 * mis-parse here means borders that print solid where the Studio shows none, or
 * fills that vanish from the export. Silent in both directions, hence exported
 * for its own test.
 *
 * Anything it cannot read is treated as fully opaque: drawing something the
 * viewer can then see beats dropping it.
 *
 * @internal
 */
export function colorAlpha(color: string): number {
  const c = color.trim()
  if (!c || c === 'none' || c === 'transparent') return 0
  // Any slash-separated alpha: `color(srgb r g b / a)` and `oklch(… / a)` from
  // the clusters' `color-mix` tints, and the space-separated `rgb(r g b / a)`
  // CSS Color 4 also allows. Read before the comma form below — that one has no
  // slash, so the order is unambiguous, and splitting `rgb(34 118 252 / 0.75)`
  // on the slash there would have yielded two parts and read as opaque.
  const slashAlpha = c.match(/\/\s*([\d.]+)(%?)\s*\)$/)
  if (slashAlpha) {
    return slashAlpha[2] ? parseFloat(slashAlpha[1]) / 100 : parseFloat(slashAlpha[1])
  }
  // Legacy `rgba(r, g, b, a)`. A three-part `rgb(…)` carries no alpha.
  const legacy = c.match(/^rgba?\(([^)]+)\)$/)
  if (legacy) {
    const parts = legacy[1].split(',').map((p) => p.trim())
    return parts.length >= 4 ? parseFloat(parts[3]) : 1
  }
  return 1
}

const isInvisible = (color: string) => colorAlpha(color) === 0

/** Geometry/behavior attributes copied through on SVG elements; presentation comes from computed style. */
const SVG_COPY_ATTRS = [
  'd',
  'points',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'transform',
  'viewBox',
  'marker-start',
  'marker-end',
  'refX',
  'refY',
  'markerWidth',
  'markerHeight',
  'markerUnits',
  'orient',
  'id',
]

class SvgSerializer {
  private out: string[] = []
  private zoom: number
  private vpLeft: number
  private vpTop: number
  private measureCtx: CanvasRenderingContext2D | null

  constructor(private viewportEl: HTMLElement) {
    const transform = getComputedStyle(viewportEl).transform
    const matrix =
      transform && transform !== 'none' ? new DOMMatrixReadOnly(transform) : new DOMMatrixReadOnly()
    this.zoom = matrix.a || 1
    const rect = viewportEl.getBoundingClientRect()
    this.vpLeft = rect.left
    this.vpTop = rect.top
    this.measureCtx = document.createElement('canvas').getContext('2d')
  }

  /** Screen-space rect → flow coordinates (the space edge paths already use). */
  private toLocal(r: DOMRect) {
    return {
      x: (r.left - this.vpLeft) / this.zoom,
      y: (r.top - this.vpTop) / this.zoom,
      width: r.width / this.zoom,
      height: r.height / this.zoom,
    }
  }

  render(frame: SvgExportFrame): string {
    const {width, height, offsetX, offsetY, backgroundColor} = frame
    this.out = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}" height="${num(height)}" viewBox="0 0 ${num(width)} ${num(height)}">`,
      `<rect width="${num(width)}" height="${num(height)}" fill="${esc(normalizeColor(backgroundColor))}"/>`,
    ]

    // Arrowhead markers live in a dedicated defs-only SVG; edge paths
    // reference them by id, so the ids must survive into the export's defs.
    const flowEl = this.viewportEl.closest('.react-flow') ?? this.viewportEl
    const markers = flowEl.querySelectorAll<SVGMarkerElement>('.react-flow__marker marker')
    if (markers.length > 0) {
      this.out.push('<defs>')
      for (const marker of markers) this.serializeSvgElement(marker)
      this.out.push('</defs>')
    }

    this.out.push(`<g transform="translate(${num(offsetX)} ${num(offsetY)})">`)

    // DOM order within the viewport is not paint order (React Flow layers via
    // z-index: the cluster-band portal sits last in the DOM but paints
    // underneath everything) — emit background → edges → labels → nodes.
    const rank = (el: Element) =>
      el.classList.contains('react-flow__viewport-portal')
        ? 0
        : el.classList.contains('react-flow__edges')
          ? 1
          : el.classList.contains('react-flow__edgelabel-renderer')
            ? 2
            : el.classList.contains('react-flow__nodes')
              ? 3
              : 4
    const sections = Array.from(this.viewportEl.children).sort((a, b) => rank(a) - rank(b))
    for (const section of sections) this.serializeElement(section)

    this.out.push('</g>', '</svg>')
    return this.out.join('\n')
  }

  private serializeElement(el: Element) {
    if (el instanceof SVGSVGElement) {
      // Marker defs are already emitted into the top-level <defs>.
      if (el.classList.contains('react-flow__marker')) return
      this.serializeSvgRoot(el)
      return
    }
    if (!(el instanceof HTMLElement)) return

    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return
    const opacity = parseFloat(cs.opacity)
    if (opacity === 0) return
    if (opacity < 1) this.out.push(`<g opacity="${num(opacity)}">`)

    this.paintBox(el, cs)
    for (const child of el.childNodes) {
      if (child instanceof Text) {
        this.serializeTextNode(child, el, cs)
      } else if (child instanceof Element) {
        this.serializeElement(child)
      }
    }

    if (opacity < 1) this.out.push('</g>')
  }

  /**
   * Emits a `<rect>` for any element that paints a background or a uniform
   * border, plus one `<line>` per side for partial borders (the divider under
   * an expanded card's header is a lone `border-bottom`).
   */
  private paintBox(el: HTMLElement, cs: CSSStyleDeclaration) {
    const bg = cs.backgroundColor
    const hasBg = !isInvisible(bg)
    const side = (width: string, style: string, color: string) =>
      (parseFloat(width) || 0) > 0 && style !== 'none' && !isInvisible(color)
        ? {width: parseFloat(width), style, color}
        : null
    const top = side(cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor)
    const right = side(cs.borderRightWidth, cs.borderRightStyle, cs.borderRightColor)
    const bottom = side(cs.borderBottomWidth, cs.borderBottomStyle, cs.borderBottomColor)
    const left = side(cs.borderLeftWidth, cs.borderLeftStyle, cs.borderLeftColor)
    const sides = [top, right, bottom, left]
    if (!hasBg && !sides.some(Boolean)) return

    const r = this.toLocal(el.getBoundingClientRect())
    if (r.width <= 0 || r.height <= 0) return
    const radius = parseFloat(cs.borderTopLeftRadius) || 0

    const dashFor = (b: {width: number; style: string}) =>
      b.style === 'dashed'
        ? ` stroke-dasharray="${num(b.width * 4)} ${num(b.width * 3)}"`
        : b.style === 'dotted'
          ? ` stroke-dasharray="${num(b.width)} ${num(b.width * 2)}"`
          : ''
    const uniform =
      top &&
      sides.every(
        (b) => b && b.width === top.width && b.style === top.style && b.color === top.color,
      )

    let attrs = `x="${num(r.x)}" y="${num(r.y)}" width="${num(r.width)}" height="${num(r.height)}"`
    if (radius > 0) attrs += ` rx="${num(Math.min(radius, r.height / 2))}"`
    attrs += ` fill="${hasBg ? esc(normalizeColor(bg)) : 'none'}"`
    if (uniform) {
      attrs += ` stroke="${esc(normalizeColor(top.color))}" stroke-width="${num(top.width)}"${dashFor(top)}`
    }
    if (hasBg || uniform) this.out.push(`<rect ${attrs}/>`)
    if (uniform) return

    const edges = [
      {b: top, x1: r.x, y1: r.y, x2: r.x + r.width, y2: r.y},
      {b: right, x1: r.x + r.width, y1: r.y, x2: r.x + r.width, y2: r.y + r.height},
      {b: bottom, x1: r.x, y1: r.y + r.height, x2: r.x + r.width, y2: r.y + r.height},
      {b: left, x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.height},
    ]
    for (const {b, x1, y1, x2, y2} of edges) {
      if (!b) continue
      this.out.push(
        `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${esc(normalizeColor(b.color))}" stroke-width="${num(b.width)}"${dashFor(b)}/>`,
      )
    }
  }

  /**
   * An inline `<svg>` in the HTML tree: an icon inside a card (has a viewBox
   * — nest it, positioned by its on-screen rect), or one of React Flow's
   * per-edge SVGs (no viewBox; its children are already in flow coordinates,
   * so a plain group at the element's offset carries them through).
   */
  private serializeSvgRoot(el: SVGSVGElement) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return
    const opacity = parseFloat(cs.opacity)
    if (opacity === 0) return

    const r = this.toLocal(el.getBoundingClientRect())
    const viewBox = el.getAttribute('viewBox')
    if (viewBox) {
      this.out.push(
        `<svg x="${num(r.x)}" y="${num(r.y)}" width="${num(r.width)}" height="${num(r.height)}" viewBox="${esc(viewBox)}"${opacity < 1 ? ` opacity="${num(opacity)}"` : ''}>`,
      )
      for (const child of el.children) this.serializeSvgElement(child)
      this.out.push('</svg>')
    } else {
      this.out.push(
        `<g transform="translate(${num(r.x)} ${num(r.y)})"${opacity < 1 ? ` opacity="${num(opacity)}"` : ''}>`,
      )
      for (const child of el.children) this.serializeSvgElement(child)
      this.out.push('</g>')
    }
  }

  /** Serializes an element inside an SVG subtree, inlining its computed presentation styles. */
  private serializeSvgElement(el: Element) {
    const tag = el.tagName.toLowerCase()
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return
    if (parseFloat(cs.opacity) === 0) return

    const container = tag === 'g' || tag === 'defs' || tag === 'marker' || tag === 'text'
    const shape = ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'].includes(tag)
    if (!container && !shape && tag !== 'tspan') return

    const fill = cs.fill
    const stroke = cs.stroke
    const strokeOpacity = parseFloat(cs.strokeOpacity)
    // React Flow's fat invisible interaction paths — pure hit areas.
    if (shape && isInvisible(fill) && (isInvisible(stroke) || strokeOpacity === 0)) return

    let attrs = ''
    for (const name of SVG_COPY_ATTRS) {
      const value = el.getAttribute(name)
      if (value !== null) attrs += ` ${name}="${esc(value)}"`
    }
    if (shape || tag === 'text' || tag === 'tspan') {
      attrs += ` fill="${isInvisible(fill) ? 'none' : esc(normalizeColor(fill))}"`
      if (!isInvisible(stroke) && strokeOpacity > 0) {
        attrs += ` stroke="${esc(normalizeColor(stroke))}" stroke-width="${esc(cs.strokeWidth)}"`
        if (strokeOpacity < 1) attrs += ` stroke-opacity="${num(strokeOpacity)}"`
        if (cs.strokeDasharray !== 'none') attrs += ` stroke-dasharray="${esc(cs.strokeDasharray)}"`
        if (cs.strokeLinecap !== 'butt') attrs += ` stroke-linecap="${esc(cs.strokeLinecap)}"`
        if (cs.strokeLinejoin !== 'miter') attrs += ` stroke-linejoin="${esc(cs.strokeLinejoin)}"`
      }
      const fillOpacity = parseFloat(cs.fillOpacity)
      if (!isInvisible(fill) && fillOpacity < 1) attrs += ` fill-opacity="${num(fillOpacity)}"`
      const opacity = parseFloat(cs.opacity)
      if (opacity < 1) attrs += ` opacity="${num(opacity)}"`
      if (cs.fillRule === 'evenodd') attrs += ` fill-rule="evenodd"`
    }
    if (tag === 'text' || tag === 'tspan') {
      attrs += ` font-family="${esc(cs.fontFamily)}" font-size="${esc(cs.fontSize)}"`
      if (cs.fontWeight !== '400') attrs += ` font-weight="${esc(cs.fontWeight)}"`
    }

    if (tag === 'text' || tag === 'tspan') {
      this.out.push(`<${tag}${attrs}>`)
      for (const child of el.childNodes) {
        if (child instanceof Text) this.out.push(esc(child.nodeValue ?? ''))
        else if (child instanceof Element) this.serializeSvgElement(child)
      }
      this.out.push(`</${tag}>`)
    } else if (container) {
      this.out.push(`<${tag}${attrs}>`)
      for (const child of el.children) this.serializeSvgElement(child)
      this.out.push(`</${tag}>`)
    } else {
      this.out.push(`<${tag}${attrs}/>`)
    }
  }

  /**
   * One `<text>` per rendered line, positioned by the browser's own line
   * boxes (via Range client rects), so wrapping, flex centering, and badge
   * padding all come out exactly where they were painted.
   */
  private serializeTextNode(node: Text, parentEl: HTMLElement, cs: CSSStyleDeclaration) {
    const raw = node.data
    if (!raw || !raw.trim()) return

    const range = document.createRange()
    range.selectNodeContents(node)
    const lineCount = range.getClientRects().length
    const lines =
      lineCount > 1 ? this.splitLines(node) : [{text: raw, rect: range.getBoundingClientRect()}]

    const fontSize = parseFloat(cs.fontSize)
    const font = `${cs.fontStyle !== 'normal' ? `${cs.fontStyle} ` : ''}${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const letterSpacing = cs.letterSpacing !== 'normal' ? parseFloat(cs.letterSpacing) : 0

    for (const line of lines) {
      let text = line.text.replace(/\s+/g, ' ').trim()
      if (!text || line.rect.width === 0) continue
      if (cs.textTransform === 'uppercase') text = text.toUpperCase()
      else if (cs.textTransform === 'lowercase') text = text.toLowerCase()

      const r = this.toLocal(line.rect)
      text = this.applyEllipsis(text, parentEl, line.rect, font)

      let attrs = `x="${num(r.x)}" y="${num(r.y + r.height / 2)}" dominant-baseline="central"`
      attrs += ` font-family="${esc(cs.fontFamily)}" font-size="${num(fontSize)}"`
      if (cs.fontWeight !== '400') attrs += ` font-weight="${esc(cs.fontWeight)}"`
      if (cs.fontStyle !== 'normal') attrs += ` font-style="${esc(cs.fontStyle)}"`
      if (letterSpacing) attrs += ` letter-spacing="${num(letterSpacing)}"`
      attrs += ` fill="${esc(normalizeColor(cs.color))}"`
      this.out.push(`<text ${attrs}>${esc(text)}</text>`)
    }
  }

  /** Splits a wrapped text node into per-line runs by grouping character rects by their top edge. */
  private splitLines(node: Text): {text: string; rect: DOMRect}[] {
    const lines: {text: string; rect: DOMRect}[] = []
    const range = document.createRange()
    let currentTop: number | null = null
    let start = 0
    const flush = (end: number) => {
      if (end <= start) return
      range.setStart(node, start)
      range.setEnd(node, end)
      lines.push({text: node.data.slice(start, end), rect: range.getBoundingClientRect()})
    }
    for (let i = 0; i < node.data.length; i++) {
      range.setStart(node, i)
      range.setEnd(node, i + 1)
      const r = range.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      if (currentTop === null) {
        currentTop = r.top
      } else if (Math.abs(r.top - currentTop) > r.height / 2) {
        flush(i)
        start = i
        currentTop = r.top
      }
    }
    flush(node.data.length)
    return lines
  }

  /**
   * `text-overflow: ellipsis` clipping doesn't shrink a text node's layout
   * rects, so an over-long title would spill past its card in the export.
   * Detect the clip on the nearest overflow-hidden ancestor and re-truncate
   * with canvas text measurement, mirroring what the browser painted.
   */
  private applyEllipsis(text: string, parentEl: HTMLElement, rect: DOMRect, font: string): string {
    let clipEl: HTMLElement | null = null
    let el: HTMLElement | null = parentEl
    for (let depth = 0; el && depth < 3; depth++, el = el.parentElement) {
      const cs = getComputedStyle(el)
      if (
        cs.textOverflow === 'ellipsis' &&
        (cs.overflowX === 'hidden' || cs.overflowX === 'clip')
      ) {
        clipEl = el
        break
      }
    }
    if (!clipEl || !this.measureCtx) return text

    const clipRight = clipEl.getBoundingClientRect().right
    if (rect.right <= clipRight + 0.5) return text

    const maxWidth = (clipRight - rect.left) / this.zoom
    this.measureCtx.font = font
    if (this.measureCtx.measureText(text).width <= maxWidth) return text
    let end = text.length
    while (end > 1 && this.measureCtx.measureText(`${text.slice(0, end)}…`).width > maxWidth) {
      end--
    }
    return `${text.slice(0, end).trimEnd()}…`
  }
}

export function viewportToSvg(viewportEl: HTMLElement, frame: SvgExportFrame): string {
  return new SvgSerializer(viewportEl).render(frame)
}
