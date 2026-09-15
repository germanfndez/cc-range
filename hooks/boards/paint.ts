// A pixel canvas for a board, and the packing that gets it onto a terminal.
//
// A surface module has no Raster (ClientElements omits it), so the picture is drawn into an rgb
// buffer at twice the cell grid and packed into quadrant blocks: four pixels per cell, drawn as
// whichever two-colour split of them costs the least. The art is flat by design — the game it
// copies is flat — so most cells come out uniform, which keeps the run count, and with it the
// engine's node budget, far below what a gradient would cost.

export type Canvas = { w: number; h: number; px: Uint8Array }

// indexed by which pixels the foreground covers: bit 0 upper left, 1 upper right, 2 lower left,
// 3 lower right. All four agreeing is a full block, so the empty mask and the full one share one
// glyph.
const QUADRANT = [
  '█', '▘', '▝', '▀', '▖', '▌', '▞', '▛',
  '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█',
]

export const canvas = (w: number, h: number): Canvas => ({ w, h, px: new Uint8Array(w * h * 3) })

export const fill = (c: Canvas, color: number) => {
  const r = (color >> 16) & 0xff
  const g = (color >> 8) & 0xff
  const b = color & 0xff
  for (let i = 0; i < c.px.length; i += 3) { c.px[i] = r; c.px[i + 1] = g; c.px[i + 2] = b }
}

export const put = (c: Canvas, x: number, y: number, color: number, a = 1) => {
  const ix = x | 0
  const iy = y | 0
  if (ix < 0 || iy < 0 || ix >= c.w || iy >= c.h || a <= 0) return
  const i = (iy * c.w + ix) * 3
  const r = (color >> 16) & 0xff
  const g = (color >> 8) & 0xff
  const b = color & 0xff
  if (a >= 1) { c.px[i] = r; c.px[i + 1] = g; c.px[i + 2] = b; return }
  c.px[i] = (c.px[i]! + (r - c.px[i]!) * a) | 0
  c.px[i + 1] = (c.px[i + 1]! + (g - c.px[i + 1]!) * a) | 0
  c.px[i + 2] = (c.px[i + 2]! + (b - c.px[i + 2]!) * a) | 0
}

export const rect = (c: Canvas, x: number, y: number, w: number, h: number, color: number, a = 1) => {
  const x0 = Math.max(0, Math.round(x))
  const y0 = Math.max(0, Math.round(y))
  const x1 = Math.min(c.w, Math.round(x + w))
  const y1 = Math.min(c.h, Math.round(y + h))
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) put(c, xx, yy, color, a)
}

export const disc = (c: Canvas, cx: number, cy: number, rx: number, ry: number, color: number, a = 1) => {
  if (rx <= 0 || ry <= 0) return
  for (let yy = Math.floor(cy - ry); yy <= cy + ry; yy++) {
    for (let xx = Math.floor(cx - rx); xx <= cx + rx; xx++) {
      const dx = (xx + 0.5 - cx) / rx
      const dy = (yy + 0.5 - cy) / ry
      if (dx * dx + dy * dy <= 1) put(c, xx, yy, color, a)
    }
  }
}

// ── a 5x7 face, for the score and the panels ─────────────────────────────────────────────────
const GLYPHS: Record<string, string> = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####',
  F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#..##|#...#|#...#|.###.',
  H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '#####|..#..|..#..|..#..|..#..|..#..|#####',
  J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#...#|#...#|#...#|#...#',
  N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.',
  T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#...#|#.#.#|##.##|#...#',
  X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
  '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
  '3': '#####|...#.|..#..|...#.|....#|#...#|.###.',
  '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  '5': '#####|#....|####.|....#|....#|#...#|.###.',
  '6': '..##.|.#...|#....|####.|#...#|#...#|.###.',
  '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
  '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  '9': '.###.|#...#|#...#|.####|....#|...#.|.##..',
  '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
  '.': '.....|.....|.....|.....|.....|.##..|.##..',
  '%': '##..#|##.#.|...#.|..#..|.#...|.#.##|#..##',
  '-': '.....|.....|.....|#####|.....|.....|.....',
  ' ': '.....|.....|.....|.....|.....|.....|.....',
}

export const GLYPH_W = 5
export const GLYPH_H = 7
export const textWidth = (s: string, scale: number) => Math.max(0, s.length * (GLYPH_W + 1) * scale - scale)

// `outline` draws the character one pixel out in every direction first, which is what keeps the
// white score legible over a pipe and over the sky both
export const stamp = (c: Canvas, s: string, x: number, y: number, scale: number, color: number, outline?: number) => {
  const draw = (ox: number, oy: number, tint: number) => {
    let at = x + ox
    for (const ch of s.toUpperCase()) {
      const rows = (GLYPHS[ch] ?? GLYPHS[' ']!).split('|')
      for (let ry = 0; ry < GLYPH_H; ry++) {
        const line = rows[ry]!
        for (let rx = 0; rx < GLYPH_W; rx++) {
          if (line[rx] !== '#') continue
          rect(c, at + rx * scale, y + oy + ry * scale, scale, scale, tint)
        }
      }
      at += (GLYPH_W + 1) * scale
    }
  }
  if (outline !== undefined) {
    for (let oy = -scale; oy <= scale; oy += scale) {
      for (let ox = -scale; ox <= scale; ox += scale) if (ox || oy) draw(ox, oy, outline)
    }
  }
  draw(0, 0, color)
}

// ── packing ──────────────────────────────────────────────────────────────────────────────────
export type Run = [text: string, color: string, background: string]

const HEX = new Map<number, string>()
const hex = (v: number) => {
  let s = HEX.get(v)
  if (s === undefined) { s = `#${v.toString(16).padStart(6, '0')}`; HEX.set(v, s) }
  return s
}

const luma = (px: Uint8Array, i: number) => px[i]! * 299 + px[i + 1]! * 587 + px[i + 2]! * 114

// One row of the canvas's cells, as spans that share both colours. `maxRuns` folds neighbours
// pair by pair until the row fits: a drawing the engine cannot hold in its node budget is worse
// than a slightly coarser one, and a folded pair keeps the left one's colours and every glyph.
export const rowRuns = (c: Canvas, cy: number, columns: number, maxRuns: number): Run[] => {
  let out: Run[] = []
  const spot = [0, 0, 0, 0]
  for (let cx = 0; cx < columns; cx++) {
    spot[0] = ((cy * 2) * c.w + cx * 2) * 3
    spot[1] = spot[0]! + 3
    spot[2] = ((cy * 2 + 1) * c.w + cx * 2) * 3
    spot[3] = spot[2]! + 3
    let lo = Infinity
    let hi = -Infinity
    for (let q = 0; q < 4; q++) {
      const l = luma(c.px, spot[q]!)
      if (l < lo) lo = l
      if (l > hi) hi = l
    }
    const cut = hi - lo < 1 ? -1 : (lo + hi) / 2
    let mask = 0
    let fr = 0, fg = 0, fb = 0, fn = 0
    let br = 0, bg = 0, bb = 0, bn = 0
    for (let q = 0; q < 4; q++) {
      const i = spot[q]!
      const r = c.px[i]!, g = c.px[i + 1]!, b = c.px[i + 2]!
      if (luma(c.px, i) > cut) { mask |= 1 << q; fr += r; fg += g; fb += b; fn++ }
      else { br += r; bg += g; bb += b; bn++ }
    }
    const flat = ((((fr + br) / 4) & 0xff) << 16) | ((((fg + bg) / 4) & 0xff) << 8) | (((fb + bb) / 4) & 0xff)
    const fgv = fn ? (((fr / fn) & 0xff) << 16) | (((fg / fn) & 0xff) << 8) | ((fb / fn) & 0xff) : flat
    const bgv = bn ? (((br / bn) & 0xff) << 16) | (((bg / bn) & 0xff) << 8) | ((bb / bn) & 0xff) : flat
    const glyph = QUADRANT[mask]!
    const color = hex(fgv)
    const background = hex(bgv)
    const last = out[out.length - 1]
    if (last && last[1] === color && last[2] === background) last[0] += glyph
    else out.push([glyph, color, background])
  }
  while (out.length > Math.max(1, maxRuns)) {
    const folded: Run[] = []
    for (let i = 0; i < out.length; i += 2) {
      const [t, c1, b1] = out[i]!
      const nx = out[i + 1]
      folded.push(nx ? [t + nx[0], c1, b1] : [t, c1, b1])
    }
    out = folded
  }
  return out
}
