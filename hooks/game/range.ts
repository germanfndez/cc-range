// The range itself: where the target is, where the pistol is pointed, and what a shot does.
// Everything here is in canvas pixels, so the board can hand the scene a world that already
// matches the band it was given; no other module needs to know the geometry.

export type Target = { x: number; y: number; r: number; vx: number; vy: number }
export type Hole = { x: number; y: number; age: number }
export type Splash = { x: number; y: number; t: number; hit: boolean }

// the board steps at 66 ms, so a second is about fifteen ticks
export const HZ = 15
export const ROUND = 30 * HZ

export type Range = {
  w: number
  h: number
  aimX: number
  aimY: number
  target: Target
  score: number
  shots: number
  hits: number
  streak: number
  bestStreak: number
  recoil: number
  flash: number
  holes: Hole[]
  splashes: Splash[]
  // the round runs 30 seconds; each target has a fuse of its own that shrinks as the score climbs
  clock: number
  fuse: number
  fuseMax: number
  over: boolean
  lapsed: number
  seed: number
  ticks: number
}

// The back wall, as fractions of the canvas: the target never leaves it, so it is never drawn
// behind the counter or off the top where the score sits.
// The whole face of the wall: `bounds` insets it by the target's own size, so as the target
// shrinks the ground it can stand on grows. These are the wall's edges, not the target's range —
// writing them as the range is what made every target land in the same narrow stripe.
export const WALL = { x0: 0.09, x1: 0.91, y0: 0.32, y1: 0.84 }

// where the wall starts and where the counter in front of the player cuts it off
export const HORIZON = 0.32
export const COUNTER = 0.84

// The score and the record sit in the top left, the round clock in the top right, and a target
// under either is a target you cannot read. Widths are in canvas pixels, because the lettering is
// a fixed size; the depth is a fraction of the band.
export const HUD = { left: 70, right: 40, bottom: 0.58 }

// the backdrop behind the wall changes every five seconds
export const SCENE_SECONDS = 5

const rnd = (g: { seed: number }) => {
  g.seed ^= g.seed << 13
  g.seed ^= g.seed >>> 17
  g.seed ^= g.seed << 5
  g.seed >>>= 0
  return g.seed / 0x100000000
}

// A target shrinks as the score climbs and stops shrinking at a size a terminal can still
// resolve; past a few hits it also drifts, which is what keeps the round from going flat.
// The face is an ellipse: a canvas pixel is half as tall as it is wide once the quadrants are
// packed, so a target that reads as a circle is twice as wide as it is tall. The height is what
// the wall has room for, so that is what the size is measured in.
const radiusFor = (g: Range) => {
  const base = g.h * 0.24
  return Math.max(g.h * 0.11, base * Math.max(0.40, 1 - g.score * 0.038))
}

const speedFor = (g: Range) => (g.score < 1 ? 0 : Math.min(3.8, 0.8 + (g.score - 1) * 0.19))

// how long the next target stands there: three seconds at the start, down to nine tenths of one
export const fuseFor = (score: number) => Math.round(Math.max(0.75, 2.7 - score * 0.14) * HZ)

const bounds = (g: Range, r: number) => ({
  x0: g.w * WALL.x0 + r,
  x1: g.w * WALL.x1 - r,
  y0: g.h * WALL.y0 + r * 0.5,
  y1: g.h * WALL.y1 - r * 0.5,
})

// everything the target is not allowed to overlap: the lettering in either top corner, and the
// pistol standing up the middle of the band
const blocked = (g: Range, x: number, y: number, r: number) => {
  const top = y - r * 0.5 < g.h * HUD.bottom
  if (top && x - r < HUD.left) return true
  if (top && x + r > g.w - HUD.right) return true
  const gunL = g.w / 2 - g.h * 0.46
  const gunR = g.w / 2 + g.h * 0.46
  // on a band too narrow to give the middle up, the gun has to be lived with
  return gunR - gunL < g.w * 0.5 && x + r > gunL && x - r < gunR && y + r * 0.5 > g.h * 0.56
}

// Somewhere else on the wall: a target that reappears under the crosshair would hand the next
// point away, so a new one is kept a target's width from where the last one stood.
const place = (g: Range, away?: Target): Target => {
  const r = radiusFor(g)
  const b = bounds(g, r)
  const spanX = Math.max(1, b.x1 - b.x0)
  const spanY = Math.max(1, b.y1 - b.y0)

  // A clear spot anywhere is better than a well-spaced one that is covered, so the two conditions
  // are tried in order: first both, then just "not blocked", and only then wherever it landed.
  let x = b.x0 + spanX / 2
  let y = b.y0 + spanY / 2
  let fallback: [number, number] | null = null
  for (let i = 0; i < 80; i++) {
    x = b.x0 + rnd(g) * spanX
    y = b.y0 + rnd(g) * spanY
    if (blocked(g, x, y, r)) continue
    if (!fallback) fallback = [x, y]
    if (!away) break
    const dx = (x - away.x) / Math.max(1, g.w)
    const dy = (y - away.y) / Math.max(1, g.h)
    if (Math.hypot(dx, dy * 0.6) > 0.22) break
  }
  if (blocked(g, x, y, r) && fallback) [x, y] = fallback
  const sp = speedFor(g)
  const dir = rnd(g) * Math.PI * 2
  return { x, y, r, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp * 0.45 }
}

export const newRange = (w: number, h: number, seed = 1): Range => {
  const g: Range = {
    w, h,
    aimX: w / 2,
    aimY: h * 0.4,
    target: { x: w / 2, y: h * 0.38, r: 1, vx: 0, vy: 0 },
    score: 0, shots: 0, hits: 0, streak: 0, bestStreak: 0,
    recoil: 0, flash: 0,
    holes: [], splashes: [],
    clock: ROUND, fuse: fuseFor(0), fuseMax: fuseFor(0), over: false, lapsed: 0,
    seed: seed >>> 0 || 1,
    ticks: 0,
  }
  g.target = place(g)
  return g
}

export const aimAt = (g: Range, x: number, y: number): Range => ({
  ...g,
  aimX: Math.max(0, Math.min(g.w - 1, x)),
  aimY: Math.max(0, Math.min(g.h - 1, y)),
})

export const nudge = (g: Range, dx: number, dy: number): Range =>
  aimAt(g, g.aimX + dx * g.w * 0.035, g.aimY + dy * g.h * 0.07)

export const tick = (g: Range): Range => {
  if (g.over) return { ...g, recoil: g.recoil > 0.01 ? g.recoil * 0.78 : 0, flash: g.flash > 0 ? g.flash - 1 : 0, splashes: g.splashes.map(s => ({ ...s, t: s.t + 1 })).filter(s => s.t < 14), ticks: g.ticks + 1 }

  const t = g.target
  const b = bounds(g, t.r)
  let { x, y, vx, vy } = t
  x += vx
  y += vy
  if (x < b.x0) { x = b.x0; vx = Math.abs(vx) }
  if (x > b.x1) { x = b.x1; vx = -Math.abs(vx) }
  if (y < b.y0) { y = b.y0; vy = Math.abs(vy) }
  if (y > b.y1) { y = b.y1; vy = -Math.abs(vy) }

  const moved: Range = {
    ...g,
    target: { ...t, x, y, vx, vy },
    recoil: g.recoil > 0.01 ? g.recoil * 0.78 : 0,
    flash: g.flash > 0 ? g.flash - 1 : 0,
    // the splashes age out; the holes stay until there are too many to be scenery
    splashes: g.splashes.map(s => ({ ...s, t: s.t + 1 })).filter(s => s.t < 14),
    clock: Math.max(0, g.clock - 1),
    fuse: g.fuse - 1,
    over: g.clock <= 1,
    ticks: g.ticks + 1,
  }

  // the fuse ran out: the target leaves on its own, and the streak goes with it
  if (moved.fuse > 0 || moved.over) return moved
  const lapsed: Range = { ...moved, streak: 0, lapsed: g.lapsed + 1, fuse: fuseFor(g.score), fuseMax: fuseFor(g.score) }
  // `place` advances the seed on the object it is given, so it has to run BEFORE the spread that
  // copies it out — inside one, the object literal copies the old seed and the new one is thrown
  // away, and every target lands in the same handful of places
  const next = place(lapsed, t)
  return { ...lapsed, seed: lapsed.seed, target: next }
}

export type Shot = { game: Range; hit: boolean }

export const shoot = (g: Range): Shot => {
  if (g.over) return { game: g, hit: false }
  const t = g.target
  const dx = g.aimX - t.x
  // a canvas pixel is half as tall as it is wide once the quadrants are packed, so the circle
  // the player sees is an ellipse in this buffer: measure against that, not against a disc
  const dy = (g.aimY - t.y) * 0.5
  const hit = Math.hypot(dx, dy) <= t.r

  const base: Range = {
    ...g,
    shots: g.shots + 1,
    recoil: 1,
    flash: 3,
    splashes: [...g.splashes, { x: g.aimX, y: g.aimY, t: 0, hit }],
  }

  if (!hit) {
    return {
      hit: false,
      game: {
        ...base,
        streak: 0,
        holes: [...base.holes, { x: g.aimX, y: g.aimY, age: 0 }].slice(-18),
      },
    }
  }

  const scored: Range = {
    ...base,
    score: g.score + 1,
    hits: g.hits + 1,
    streak: g.streak + 1,
    fuse: fuseFor(g.score + 1),
    fuseMax: fuseFor(g.score + 1),
  }
  // the same rule as above: place first, spread after, or the seed never moves
  const next = place(scored, t)
  return {
    hit: true,
    game: {
      ...scored,
      seed: scored.seed,
      bestStreak: Math.max(g.bestStreak, scored.streak),
      target: next,
    },
  }
}

export const restart = (g: Range, seed?: number): Range => newRange(g.w, g.h, seed ?? (g.seed + 7919) >>> 0)

export const accuracy = (g: Range) => (g.shots ? Math.round((g.hits / g.shots) * 100) : 100)

export const secondsLeft = (g: Range) => Math.ceil(g.clock / HZ)

// which backdrop is up: it turns over on its own clock, so it keeps moving between rounds too
export const sceneAt = (g: Range, count: number) => Math.floor(g.ticks / (SCENE_SECONDS * HZ)) % count
