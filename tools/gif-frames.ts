// Renders a scripted round to a folder of PNGs, one per frame, for assembling into a GIF.
//   bun tools/gif-frames.ts <outDir> [columns] [rows] [frames]
//
// Unlike `shot.ts`, the cells here are twice as tall as they are wide, which is the shape a
// terminal cell actually has — square cells are fine for judging the art, but a recording has to
// match what a person would see.
import { aimAt, newRange, shoot, tick, type Range } from '../hooks/game/range.ts'
import { rowRuns } from '../hooks/boards/paint.ts'
import { frame } from '../hooks/boards/scene.ts'
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const dir = process.argv[2] ?? 'frames'
const columns = Number(process.argv[3] ?? 104)
const rows = Number(process.argv[4] ?? 23)
const count = Number(process.argv[5] ?? 120)
const BEST = Number(process.env.BEST ?? 14)
// one cell: half as wide as it is tall, and each of its four quadrants gets a block of pixels
const QW = 4
const QH = 8

const MASK: Record<string, number> = {
  '█': 15, '▘': 1, '▝': 2, '▀': 3, '▖': 4, '▌': 5, '▞': 6, '▛': 7,
  '▗': 8, '▚': 9, '▐': 10, '▜': 11, '▄': 12, '▙': 13, '▟': 14,
}

const W = columns * 2 * QW
const H = rows * 2 * QH

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (b: Buffer) => {
  let c = 0xffffffff
  for (const v of b) c = crcTable[(c ^ v) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, body: Buffer) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length)
  const head = Buffer.concat([Buffer.from(type, 'ascii'), body])
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(head))
  return Buffer.concat([len, head, sum])
}
const png = (px: Buffer, path: string) => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc(H * (W * 3 + 1))
  for (let y = 0; y < H; y++) px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3)
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]))
}

const paint = (g: Range, path: string) => {
  const view = frame(g, columns, rows, 'play', BEST)
  const maxRuns = Math.max(6, Math.floor(1500 / rows) - 1)
  const px = Buffer.alloc(W * H * 3)
  const dot = (qx: number, qy: number, v: number) => {
    for (let y = qy * QH; y < (qy + 1) * QH; y++) {
      for (let x = qx * QW; x < (qx + 1) * QW; x++) {
        const i = (y * W + x) * 3
        px[i] = (v >> 16) & 0xff; px[i + 1] = (v >> 8) & 0xff; px[i + 2] = v & 0xff
      }
    }
  }
  for (let y = 0; y < rows; y++) {
    let cx = 0
    for (const [text, color, background] of rowRuns(view, y, columns, maxRuns)) {
      const fg = parseInt(color.slice(1), 16)
      const bg = parseInt(background.slice(1), 16)
      for (const ch of text) {
        const m = MASK[ch] ?? 0
        dot(cx * 2, y * 2, m & 1 ? fg : bg)
        dot(cx * 2 + 1, y * 2, m & 2 ? fg : bg)
        dot(cx * 2, y * 2 + 1, m & 4 ? fg : bg)
        dot(cx * 2 + 1, y * 2 + 1, m & 8 ? fg : bg)
        cx++
      }
    }
  }
  png(px, path)
}

// ── the round it plays ───────────────────────────────────────────────────────────────────────
// The crosshair eases onto each target, overshoots a little the way a hand does, settles, and
// fires. Nothing here is scripted frame by frame: it shoots whatever the game put on the wall.
mkdirSync(dir, { recursive: true })
let g = newRange(columns * 2, rows * 2, Number(process.env.SEED ?? 20260915))
let from = { x: g.aimX, y: g.aimY }
let travel = 0
const REACH = 11

for (let f = 0; f < count; f++) {
  const t = g.target
  travel++
  if (travel <= REACH) {
    // ease out, with a wobble that dies as it arrives
    const k = 1 - Math.pow(1 - travel / REACH, 3)
    const wob = (1 - k) * 5
    g = aimAt(g,
      from.x + (t.x - from.x) * k + Math.sin(f * 0.9) * wob * 2,
      from.y + (t.y - from.y) * k + Math.cos(f * 0.7) * wob)
  } else if (travel === REACH + 2) {
    g = shoot(g).game
    from = { x: g.aimX, y: g.aimY }
    travel = 0
  }
  paint(g, `${dir}/f${String(f).padStart(4, '0')}.png`)
  g = tick(g)
}
console.log(`${count} frames · ${W}x${H} · ${dir}`)
