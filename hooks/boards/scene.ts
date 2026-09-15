// One frame of the range, drawn into a pixel canvas twice the cell grid: sky, hills, the plank
// wall the target hangs on, the counter in front of the player, the pistol the player is holding,
// and the crosshair. `paint.ts` packs it into quadrant blocks afterwards.
//
// The art is flat on purpose — a gallery is painted wood and enamel — which is also what keeps
// the packed row down to a handful of runs. Nothing here is measured in cells: a canvas pixel is
// half as tall as it is wide, so every round thing is drawn as an ellipse twice as wide as high.

import { canvas, disc, put, rect, smallWidth, stamp, stampSmall, textWidth, type Canvas } from './paint.ts'
import { COUNTER as COUNTER_AT, HORIZON, sceneAt, secondsLeft, type Range } from '../game/range.ts'

export type Mode = 'ready' | 'play' | 'over'

const SKY_TOP = 0x141f3a
const SKY_LOW = 0x5a7fb4
const HILL_FAR = 0x2a3b57
const HILL_NEAR = 0x1f4a60
const PLANK = 0x7a4f2e
const PLANK_ALT = 0x6b442a
const PLANK_LINE = 0x452a17
const RAIL = 0x96662f
const DESK = 0x321f12
const DESK_TOP = 0x5f3d22
const POST = 0x50351f
const TARGET_RED = 0xd8382b
const TARGET_WHITE = 0xf4eee2
const TARGET_RIM = 0x261811
const HOLE = 0x140e09
const HOLE_RIM = 0x4a3220
const GOLD = 0xffd15c
const CROSS = 0x64ff9d
const INK = 0x120d08

const GUN_K = 0x14100e
const GUN_D = 0x343a41
const GUN_G = 0x5b636d
const GUN_L = 0x9aa4b0
const WOOD_D = 0x4a2c17
const WOOD_L = 0x7d4b25

// ── shapes ───────────────────────────────────────────────────────────────────────────────────
// A thick straight run, drawn as bars across the direction it is least steep in: a shallow line
// gets vertical bars, a steep one horizontal. That is what a pixel-art gun is made of, and it
// keeps every edge on the pixel grid instead of feathering it.
const bar = (c: Canvas, ax: number, ay: number, bx: number, by: number, t: number, color: number) => {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2))
  const steep = Math.abs(by - ay) > Math.abs(bx - ax)
  for (let i = 0; i <= steps; i++) {
    const k = i / steps
    const x = ax + (bx - ax) * k
    const y = ay + (by - ay) * k
    if (steep) rect(c, x - t / 2, y, t, 1, color)
    else rect(c, x, y - t / 2, 1, t, color)
  }
}

const ring = (c: Canvas, cx: number, cy: number, rx: number, ry: number, t: number, color: number, from = 0, to = Math.PI * 2) => {
  const steps = Math.max(12, Math.ceil((rx + ry) * 3))
  for (let i = 0; i <= steps; i++) {
    const a = from + (to - from) * (i / steps)
    rect(c, cx + Math.cos(a) * rx - t / 2, cy + Math.sin(a) * ry - t / 2, t, t, color)
  }
}

// ── the backdrop ─────────────────────────────────────────────────────────────────────────────
// Six of them, and one takes over every five seconds. Each is a sky gradient, a pair of ridges,
// and whatever belongs in front of them; the ridges are drawn from the same two sine waves every
// time, so the land stays put while the weather changes over it.

type Barrier = 'planks' | 'brick' | 'straw' | 'metal' | 'stone' | 'adobe' | 'posts' | 'rope'

type Scene = {
  name: string
  barrier: Barrier
  top: number
  low: number
  far: number
  near: number
  sun?: { x: number; y: number; r: number; core: number; halo?: number }
  birds?: number
  clouds?: number
  stars?: number
  rain?: boolean
  snow?: boolean
  cacti?: boolean
}

const SCENES: Scene[] = [
  { name: 'dawn', barrier: 'planks', top: 0x2a2352, low: 0xf1a06a, far: 0x4a3a63, near: 0x35405f, sun: { x: 0.22, y: 0.88, r: 0.30, core: 0xffe9b0, halo: 0xffb069 }, birds: 5 },
  { name: 'noon', barrier: 'brick', top: 0x2f7ad0, low: 0xb6e0f7, far: 0x35688c, near: 0x2f7a7a, sun: { x: 0.80, y: 0.26, r: 0.16, core: 0xfffbe2, halo: 0xffe98a }, clouds: 4, birds: 3 },
  { name: 'meadow', barrier: 'posts', top: 0x4f9ad8, low: 0xd8f0ff, far: 0x4a7a4a, near: 0x3f6b3c, sun: { x: 0.16, y: 0.30, r: 0.14, core: 0xfffbe2, halo: 0xffe98a }, clouds: 5, birds: 6 },
  { name: 'dusk', barrier: 'straw', top: 0x3c1c55, low: 0xff8b56, far: 0x4a2a52, near: 0x36243f, sun: { x: 0.68, y: 0.95, r: 0.34, core: 0xffd08a, halo: 0xff6f4a }, birds: 6 },
  { name: 'night', barrier: 'metal', top: 0x05091c, low: 0x1b2950, far: 0x141d38, near: 0x101833, sun: { x: 0.78, y: 0.28, r: 0.13, core: 0xf2f0dc }, stars: 46 },
  { name: 'rain', barrier: 'stone', top: 0x232935, low: 0x616a78, far: 0x2b3340, near: 0x232b36, rain: true },
  { name: 'snow', barrier: 'rope', top: 0x6d86a8, low: 0xdfeaf6, far: 0x8ea4bd, near: 0xa8bcd2, snow: true },
  { name: 'desert', barrier: 'adobe', top: 0x8e6a3e, low: 0xf3d79c, far: 0x8a6034, near: 0xa8763f, sun: { x: 0.35, y: 0.34, r: 0.18, core: 0xfff3c8, halo: 0xffd07a }, cacti: true },
]

export const SCENE_COUNT = SCENES.length

const lerp = (a: number, b: number, k: number) => {
  const r = (((a >> 16) & 0xff) + ((((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * k)) | 0
  const g = (((a >> 8) & 0xff) + ((((b >> 8) & 0xff) - ((a >> 8) & 0xff)) * k)) | 0
  const bl = ((a & 0xff) + (((b & 0xff) - (a & 0xff)) * k)) | 0
  return (r << 16) | (g << 8) | bl
}

// the same seed for the same slot, so the stars and the birds do not jump about between frames
const fixed = (n: number) => {
  let x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

const ridge = (c: Canvas, horizon: number, sc: Scene) => {
  const far = Math.max(3, horizon * 0.45)
  for (let x = 0; x < c.w; x++) {
    const a = horizon - far - Math.sin(x * 0.055) * far * 0.35 - Math.sin(x * 0.017 + 1.3) * far * 0.3
    const b = horizon - far * 0.45 - Math.sin(x * 0.09 + 2.1) * far * 0.3
    rect(c, x, a, 1, horizon - a, sc.far)
    rect(c, x, b, 1, horizon - b, sc.near)
  }
}

// a bird is two strokes; a flock drifts across and wraps round
const birds = (c: Canvas, horizon: number, count: number, ticks: number, tint: number) => {
  for (let i = 0; i < count; i++) {
    const x = ((fixed(i * 3.1) * c.w + ticks * (0.35 + fixed(i) * 0.4)) % (c.w + 20)) - 10
    const y = horizon * (0.18 + fixed(i * 7.7) * 0.55)
    // the wings beat, each bird on its own count
    const up = Math.sin(ticks * 0.34 + i * 1.7) > 0 ? 1 : 0
    for (let d = 1; d <= 2; d++) {
      put(c, x - d, y - (up ? d : -d) * 0.5 - 0.5, tint)
      put(c, x + d, y - (up ? d : -d) * 0.5 - 0.5, tint)
    }
    put(c, x, y, tint)
  }
}

const clouds = (c: Canvas, horizon: number, count: number, ticks: number) => {
  for (let i = 0; i < count; i++) {
    const w = c.w * (0.09 + fixed(i * 5.3) * 0.07)
    const x = ((fixed(i * 2.7) * c.w + ticks * 0.14) % (c.w + w * 2)) - w
    const y = horizon * (0.16 + fixed(i * 9.1) * 0.5)
    disc(c, x, y, w * 0.5, w * 0.16, 0xf6fbff, 0.9)
    disc(c, x - w * 0.22, y + w * 0.05, w * 0.3, w * 0.11, 0xf6fbff, 0.9)
    disc(c, x + w * 0.26, y + w * 0.04, w * 0.26, w * 0.1, 0xe4f0fa, 0.9)
  }
}

const rainfall = (c: Canvas, horizon: number, ticks: number) => {
  for (let i = 0; i < 150; i++) {
    const x = (fixed(i * 1.7) * c.w + ticks * 1.6 + i * 3) % c.w
    const y = (fixed(i * 4.3) * horizon + ticks * 5.5) % horizon
    for (let d = 0; d < 3; d++) put(c, x + d * 0.6, y + d, 0x9fb4c8, 0.55)
  }
}

const snowfall = (c: Canvas, horizon: number, ticks: number) => {
  for (let i = 0; i < 90; i++) {
    const x = (fixed(i * 1.7) * c.w + Math.sin(ticks * 0.05 + i) * 4 + ticks * 0.3) % c.w
    const y = (fixed(i * 4.3) * horizon + ticks * 0.9) % horizon
    put(c, x, y, 0xffffff, 0.85)
  }
}

const cacti = (c: Canvas, horizon: number) => {
  for (let i = 0; i < 6; i++) {
    const x = (0.08 + i * 0.17) * c.w + fixed(i * 6.1) * c.w * 0.05
    const h = horizon * (0.22 + fixed(i * 8.9) * 0.2)
    rect(c, x - 1, horizon - h, 3, h, 0x2e4a2b)
    // one arm, on whichever side the slot fell
    const side = fixed(i * 3.3) > 0.5 ? 1 : -1
    rect(c, x + side * 4, horizon - h * 0.75, 2, h * 0.4, 0x2e4a2b)
    rect(c, x, horizon - h * 0.75, side * 5, 2, 0x2e4a2b)
  }
}

const backdrop = (c: Canvas, horizon: number, sc: Scene, ticks: number) => {
  for (let y = 0; y < c.h; y++) {
    rect(c, 0, y, c.w, 1, lerp(sc.top, sc.low, Math.min(1, y / Math.max(1, horizon))))
  }

  if (sc.stars) {
    for (let i = 0; i < sc.stars; i++) {
      const x = fixed(i * 1.3) * c.w
      const y = fixed(i * 5.9) * horizon * 0.9
      // they twinkle on their own count, a few frames apart
      if (Math.sin(ticks * 0.11 + i) > -0.6) put(c, x, y, 0xdfe6ff, 0.5 + fixed(i * 2.2) * 0.5)
    }
  }

  if (sc.sun) {
    const x = sc.sun.x * c.w
    const y = sc.sun.y * horizon
    const r = sc.sun.r * horizon
    if (sc.sun.halo) disc(c, x, y, r * 2 * 1.5, r * 1.5, sc.sun.halo, 0.32)
    disc(c, x, y, r * 2, r, sc.sun.core)
  }

  if (sc.clouds) clouds(c, horizon, sc.clouds, ticks)
  ridge(c, horizon, sc)
  if (sc.cacti) cacti(c, horizon)
  if (sc.rain) rainfall(c, horizon, ticks)
  if (sc.snow) snowfall(c, horizon, ticks)
  if (sc.birds) birds(c, horizon, sc.birds, ticks, sc.name === 'noon' ? 0x23364d : 0x1a1420)
}

// The barrier the targets hang on. Each scene brings its own, because a plank fence under a
// thunderstorm and a plank fence in the desert is the same gallery painted twice.
const BARRIERS: Record<Barrier, { base: number; alt: number; line: number; rail: number; desk: number; deskTop: number }> = {
  planks: { base: 0x7a4f2e, alt: 0x6b442a, line: 0x452a17, rail: 0x96662f, desk: 0x321f12, deskTop: 0x5f3d22 },
  brick: { base: 0x9c4a38, alt: 0x8a3f30, line: 0xd8c6b0, rail: 0x6d6157, desk: 0x4a3a30, deskTop: 0x7b6552 },
  straw: { base: 0xc9a13f, alt: 0xb08a31, line: 0x7a5c1e, rail: 0x6b4a22, desk: 0x4a3418, deskTop: 0x7d5a2a },
  metal: { base: 0x556070, alt: 0x47505e, line: 0x2c333d, rail: 0x707d8e, desk: 0x2a3038, deskTop: 0x49525e },
  stone: { base: 0x6e7278, alt: 0x5e6268, line: 0x3c4046, rail: 0x868b92, desk: 0x33373c, deskTop: 0x5a5f66 },
  adobe: { base: 0xc79462, alt: 0xb58354, line: 0x8a5f37, rail: 0xd9b083, desk: 0x5c4028, deskTop: 0x94683f },
  // the two open ones: no wall at all, only what holds the targets up
  posts: { base: 0x3f5a35, alt: 0x36502d, line: 0x243a1e, rail: 0x5a4227, desk: 0x2d3a22, deskTop: 0x51663c },
  rope: { base: 0xdfe7ef, alt: 0xcfdae6, line: 0x9fb0c2, rail: 0x8a6a3c, desk: 0x3c4450, deskTop: 0x6d7c8c },
}

const wall = (c: Canvas, top: number, bottom: number, kind: Barrier, ticks: number) => {
  const b = BARRIERS[kind]
  const h = bottom - top

  // the open ones stand the targets on posts instead: the land just runs on behind them
  if (kind === 'posts' || kind === 'rope') {
    for (let y = top; y < bottom; y++) {
      rect(c, 0, y, c.w, 1, lerp(b.alt, b.base, (y - top) / Math.max(1, h)))
    }
    if (kind === 'posts') {
      for (let i = 0; i < 5; i++) {
        const x = (0.12 + i * 0.19) * c.w
        rect(c, x - 1.5, top + h * 0.1, 3, h, b.rail)
        rect(c, x - 1.5, top + h * 0.1, 1, h, b.line)
      }
      // tufts, so the ground is not a flat wash
      for (let i = 0; i < 40; i++) {
        const x = fixed(i * 3.7) * c.w
        const y = top + h * (0.25 + fixed(i * 8.3) * 0.7)
        rect(c, x, y, 1, 2, b.line)
        rect(c, x + 1, y + 1, 1, 1, b.line)
      }
    } else {
      // a rope strung between two poles, with pennants along it
      const y = top + h * 0.22
      rect(c, 0, y, c.w, 1, b.rail)
      rect(c, 0, y + 1, c.w, 1, b.line)
      for (let i = 0; i < 12; i++) {
        const x = (i + 0.5) * (c.w / 12) + Math.sin(ticks * 0.06 + i) * 1.2
        const tint = i % 2 ? 0xd8483a : 0x3a78c8
        for (let d = 0; d < 5; d++) rect(c, x - (4 - d) * 0.4, y + 2 + d, (4 - d) * 0.8 + 1, 1, tint)
      }
    }
    return
  }

  rect(c, 0, top, c.w, h, b.base)

  if (kind === 'brick' || kind === 'stone') {
    // courses, every other one offset by half a brick
    const bw = Math.max(9, Math.round(c.w / 20))
    const bh = Math.max(4, Math.round(h / 7))
    for (let y = top, row = 0; y < bottom; y += bh, row++) {
      rect(c, 0, y, c.w, 1, b.line)
      const off = row % 2 ? bw / 2 : 0
      for (let x = -off; x < c.w; x += bw) rect(c, x, y, 1, bh, b.line)
      if (row % 3 === 1) rect(c, 0, y + 1, c.w, bh - 1, b.alt)
    }
  } else if (kind === 'straw') {
    // bales: broad blocks, each scratched along its own grain
    const bw = Math.max(14, Math.round(c.w / 12))
    for (let x = 0, i = 0; x < c.w; x += bw, i++) {
      if (i % 2) rect(c, x, top, bw, h, b.alt)
      rect(c, x, top, 1, h, b.line)
      for (let y = top + 3; y < bottom - 1; y += 4) rect(c, x + 2, y + (i % 2), bw - 4, 1, b.line)
    }
  } else if (kind === 'metal') {
    for (let x = 0; x < c.w; x += 4) {
      rect(c, x, top, 2, h, b.alt)
      rect(c, x + 2, top, 1, h, b.line)
    }
    rect(c, 0, top + Math.round(h * 0.45), c.w, 1, b.line)
  } else if (kind === 'adobe') {
    // rendered mud, cracked rather than jointed
    for (let i = 0; i < 26; i++) {
      const x = fixed(i * 2.9) * c.w
      const y = top + 3 + fixed(i * 6.7) * (h - 6)
      const len = 3 + fixed(i * 1.9) * 7
      for (let d = 0; d < len; d++) put(c, x + d * (fixed(i) > 0.5 ? 0.6 : -0.6), y + d * 0.5, b.line, 0.7)
    }
    rect(c, 0, top + Math.round(h * 0.5), c.w, 1, b.alt)
  } else {
    const step = Math.max(6, Math.round(c.w / 26))
    for (let x = 0, i = 0; x < c.w; x += step, i++) {
      if (i % 2) rect(c, x, top, step, h, b.alt)
      rect(c, x, top, 1, h, b.line)
    }
  }

  rect(c, 0, top, c.w, 2, b.rail)
  rect(c, 0, top + 2, c.w, 1, b.line)
}

const desk = (c: Canvas, top: number, kind: Barrier) => {
  const b = BARRIERS[kind]
  rect(c, 0, top, c.w, c.h - top, b.desk)
  rect(c, 0, top, c.w, 2, b.deskTop)
  rect(c, 0, top + 2, c.w, 1, 0x00000011)
  for (let x = 6; x < c.w; x += Math.max(14, Math.round(c.w / 9))) rect(c, x, top + 3, 1, c.h - top - 3, b.desk & 0x7f7f7f)
}

// how long this target has left, as a ring closing around it: gold while there is time, red at
// the end. It is drawn outside the face, where the crosshair cannot cover it.
const fuseRing = (c: Canvas, x: number, y: number, r: number, k: number) => {
  if (k <= 0) return
  const tint = k > 0.45 ? GOLD : k > 0.2 ? 0xff9a3c : 0xff4a3c
  const rx = r + 4
  const ry = r * 0.5 + 2
  ring(c, x, y, rx, ry, 2, 0x000000, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k)
  ring(c, x, y, rx, ry, 1.4, tint, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k)
}

const bullseye = (c: Canvas, x: number, y: number, r: number) => {
  const ry = r * 0.5
  // the post it hangs from, then the face: five rings, red outside so a near miss still reads
  rect(c, x - Math.max(1, r * 0.06), y, Math.max(2, r * 0.12), (c.h - y) * 0.5, POST)
  disc(c, x, y, r + 1.5, ry + 0.9, TARGET_RIM)
  ;[1, 0.78, 0.56, 0.34, 0.16].forEach((k, i) => disc(c, x, y, r * k, ry * k, i % 2 ? TARGET_WHITE : TARGET_RED))
  disc(c, x, y, Math.max(1.4, r * 0.09), Math.max(0.8, ry * 0.09), TARGET_RIM)
}

const holes = (c: Canvas, g: Range) => {
  for (const hole of g.holes) {
    disc(c, hole.x, hole.y, 2.6, 1.4, HOLE_RIM)
    disc(c, hole.x, hole.y, 1.5, 0.8, HOLE)
  }
}

// a hit throws a ring out with `+1` over it; a miss throws a small grey puff
const splashes = (c: Canvas, g: Range) => {
  for (const s of g.splashes) {
    const k = s.t / 14
    if (k > 0.85) continue
    const r = 3 + k * (s.hit ? 18 : 8)
    const tint = s.hit ? GOLD : 0xc3bcae
    for (let a = 0; a < 20; a++) {
      const th = (a / 20) * Math.PI * 2
      put(c, s.x + Math.cos(th) * r, s.y + Math.sin(th) * r * 0.5, tint, 1 - k)
    }
    if (s.hit && s.t < 12) stamp(c, '+1', s.x - 5, s.y - 12 - s.t, 1, GOLD, INK)
  }
}

const crosshair = (c: Canvas, x: number, y: number, hot: boolean) => {
  const tint = hot ? GOLD : CROSS
  for (let d = 4; d <= 11; d++) { put(c, x + d, y, tint); put(c, x - d, y, tint) }
  for (let d = 2; d <= 5; d++) { put(c, x, y + d, tint); put(c, x, y - d, tint) }
  put(c, x, y, tint)
}

// ── the pistol ───────────────────────────────────────────────────────────────────────────────
// Seen from behind, pointing away: the slide, the sights, the ejection port, and the top of the
// grip. The rest is below the band, where your hands would be.
//
// It swings on one fixed axis well below the screen, so the pointer only ever sweeps it left and
// right — a pendulum, not a gun tumbling in the air. Everything visible is far from that axis,
// which is what turns a small rotation into a wide, flat sweep.

const PISTOL = [
  '.......KSSK.......',
  '.......KSSK.......',
  '......KKDDKK......',
  '......KDLLDK......',
  '.....KKDLLDKK.....',
  '.....KDGLLGDK.....',
  '.....KDGLLGDK.....',
  '.....KDGLLGDK.....',
  '....KKDGLLGDKK....',
  '....KDGGLLGGDK....',
  '....KDGGLLGGDK....',
  '....KDGGLLGGDK....',
  '...KKDGGLLGGDKK...',
  '...KDDGGLLGGDDK...',
  '...KDGGGLLGGGDK...',
  '...KDGGGLLGGGDK...',
  '...KDGGKKKKGGGDK..',
  '...KDGGKDDDKGGDK..',
  '...KDGGKKKKGGGDK..',
  '...KDGGGLLGGGDK...',
  '..KKDGGGLLGGGDKK..',
  '..KDGGGGLLGGGGDK..',
  '..KDGKKGGGGKKGDK..',
  '..KKKKKKKKKKKKKK..',
  '...KDGGGGGGGGDK...',
  '...KKDDGGGGDDKK...',
  '....KKKKKKKKKK....',
  '.....KWWwwWWK.....',
  '....KWWwwwwWWK....',
  '....KWwwwwwwWK....',
  '...KWWwwwwwwWWK...',
  '...KWwwwwwwwwWK...',
  '..KWWwwwwwwwwWWK..',
  '..KWwwwwwwwwwwWK..',
]

const GUN_PALETTE: Record<string, number> = {
  K: GUN_K, D: GUN_D, G: GUN_G, L: GUN_L, S: 0x0d0b0a, W: WOOD_D, w: WOOD_L,
}

const PISTOL_W = 18
const PISTOL_H = PISTOL.length

// Where the gun hangs: the axis sits well below the band, and the sprite's top sits low enough
// that only the slide, the sights and the start of the grip are on screen — the rest is where
// your hands would be. Both are fractions of the band's height, in visual units.
const AXIS_Y = 1.80
const TOP_Y = 0.60

const pistol = (c: Canvas, g: Range) => {
  const scale = Math.max(1, c.h * 0.024)        // about a fifth of the band, across
  const kick = g.recoil

  // the axis: dead centre, well below the band, and it never moves
  const axX = c.w / 4                          // visual units, so half the canvas width
  const axY = c.h * AXIS_Y
  const reach = c.h * (AXIS_Y - TOP_Y) + kick * scale * 3

  // the pointer only ever sweeps it, ninety degrees of arc at the very most
  const th = Math.max(-1, Math.min(1, (g.aimX - c.w / 2) / (c.w / 2))) * 0.40
  const cs = Math.cos(th)
  const sn = Math.sin(th)

  // every canvas pixel in the lower band maps back through the rotation to a sprite pixel: an
  // inverse map is what keeps the blocks square instead of tearing them along the diagonal
  const y0 = Math.max(0, Math.floor(c.h * (TOP_Y - 0.14)))
  for (let y = y0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const vx = x / 2 - axX
      const vy = y - axY
      // the inverse of the swing, which is the rotation by -th: get this the wrong way round and
      // the gun leans away from the pointer instead of after it
      const lx = vx * cs + vy * sn
      const ly = -vx * sn + vy * cs
      const sx = Math.floor(lx / scale + PISTOL_W / 2)
      const sy = Math.floor((ly + reach) / scale)
      if (sx < 0 || sy < 0 || sx >= PISTOL_W || sy >= PISTOL_H) continue
      const tint = GUN_PALETTE[PISTOL[sy]![sx] ?? '.']
      if (tint === undefined) continue
      const i = (y * c.w + x) * 3
      c.px[i] = (tint >> 16) & 0xff
      c.px[i + 1] = (tint >> 8) & 0xff
      c.px[i + 2] = tint & 0xff
    }
  }

  if (g.flash > 0) {
    // the muzzle is the sprite's top centre, carried through the same rotation
    const k = g.flash / 3
    const mvx = reach * sn
    const mvy = -reach * cs
    const mx = (axX + mvx) * 2
    const my = axY + mvy
    disc(c, mx, my, c.h * 0.16 * k, c.h * 0.08 * k, 0xffcf4e)
    disc(c, mx, my, c.h * 0.09 * k, c.h * 0.045 * k, 0xfff8dc)
    for (let a = 0; a < 10; a++) {
      const sp = th - Math.PI / 2 + (a - 4.5) * 0.16
      for (let d = 2; d < c.h * 0.30 * k; d++) put(c, mx + Math.cos(sp) * d * 2, my + Math.sin(sp) * d, 0xffe28a, 1 - d / (c.h * 0.34))
    }
  }
}

const accuracyOf = (g: Range) => (g.shots ? Math.round((g.hits / g.shots) * 100) : 100)

// The screen the round starts and ends on: the range goes dark behind it and one big plate sits
// in the middle. It is drawn as a target would be — a rim, a face, a legend — so that pressing it
// reads as the same gesture as hitting anything else here.
const startPanel = (c: Canvas, g: Range, mode: Mode, best: number) => {
  rect(c, 0, 0, c.w, c.h, 0x07090f, 0.88)

  const over = mode === 'over'
  const label = over ? 'PLAY AGAIN' : 'START'
  // the plate has to clear the score line above it and the legend below it, so it is sized off
  // the band rather than off the text
  const ts = c.h >= 46 && textWidth(label, 2) + 44 <= c.w ? 2 : 1
  const h = ts * 7 + 8
  const w = Math.min(c.w - 20, textWidth(label, ts) + 22)
  const x = Math.round((c.w - w) / 2)
  // the plate, and on the closing screen the line under it, centred as one block
  const y = Math.round((c.h - (h + (over ? 12 : 0))) / 2)

  rect(c, x - 3, y - 3, w + 6, h + 6, 0x0a1a0e)
  rect(c, x, y, w, h, 0x3fb14e)
  rect(c, x + 2, y + 2, w - 4, h - 4, 0x2f8a3c)
  rect(c, x + 2, y + 2, w - 4, 1, 0x63d472)
  stamp(c, label, x + (w - textWidth(label, ts)) / 2, y + (h - ts * 7) / 2, ts, 0xf4fff2, 0x0d2a12)

  if (over) {
    // the longest line the band will take, not the longest line there is
    const forms = [
      `${g.score} HITS - ${accuracyOf(g)}% - BEST ${Math.max(best, g.score)}`,
      `${g.score} - ${accuracyOf(g)}% - BEST ${Math.max(best, g.score)}`,
      `${g.score} - ${accuracyOf(g)}%`,
      `${g.score}`,
    ]
    const sub = forms.find(f => textWidth(f, 1) <= c.w - 8) ?? forms[forms.length - 1]!
    stamp(c, sub, Math.round((c.w - textWidth(sub, 1)) / 2), y + h + 5, 1, GOLD, INK)
  }
}

// ── the frame ────────────────────────────────────────────────────────────────────────────────
export const frame = (g: Range, columns: number, rows: number, mode: Mode, best: number): Canvas => {
  const c = canvas(columns * 2, rows * 2)
  const horizon = Math.round(c.h * HORIZON)
  const deskTop = Math.round(c.h * COUNTER_AT)

  const sc = SCENES[sceneAt(g, SCENES.length)]!
  backdrop(c, horizon, sc, g.ticks)
  wall(c, horizon, deskTop, sc.barrier, g.ticks)
  holes(c, g)
  bullseye(c, g.target.x, g.target.y, g.target.r)
  if (mode === 'play') fuseRing(c, g.target.x, g.target.y, g.target.r, g.fuse / Math.max(1, g.fuseMax))
  desk(c, deskTop, sc.barrier)
  pistol(c, g)
  splashes(c, g)
  crosshair(c, Math.round(g.aimX), Math.round(g.aimY), g.flash > 0)

  // one band of sky, so the score, the record and the clock share a line
  const label = String(g.score)
  // the face is twice as wide as it was now that a glyph pixel is two canvas pixels across,
  // so the big size only earns its room on a tall band
  const s = c.h >= 72 ? 2 : 1
  const topLine = Math.max(2, Math.round(c.h * HORIZON * 0.5 - s * 3.5))
  stamp(c, label, 4, topLine, s, GOLD, INK)

  // the record on its own line under the score, and the streak beside it, both in the small face
  const under = topLine + s * 7 + 3
  const record = `BEST ${Math.max(best, g.score)}`
  stampSmall(c, record, 4, under, g.score > best ? GOLD : 0xcfd6e0, INK)
  if (g.streak > 1) stampSmall(c, `X${g.streak}`, 4 + smallWidth(record) + 8, under, 0xffffff, INK)

  const left = secondsLeft(g)
  const clock = `${left}`
  stampSmall(c, clock, c.w - smallWidth(clock, 2) - 4, topLine, left <= 5 && mode === 'play' ? 0xff5a46 : 0xffffff, INK, 2)

  if (mode !== 'play') startPanel(c, g, mode, best)

  return c
}
