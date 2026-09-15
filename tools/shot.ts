// Renders one frame to a PNG, so the drawing can be judged as a picture. The canvas is packed
// into quadrant cells first and each cell painted back out, which is exactly what the terminal
// shows, at 2x2 pixels per cell.
//   bun tools/shot.ts out.png [columns] [rows] [shots]   MODE=ready|play
import { aimAt, newRange, shoot, tick, type Range } from '../hooks/game/range.ts'
import { rowRuns } from '../hooks/boards/paint.ts'
import { frame } from '../hooks/boards/scene.ts'
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const out = process.argv[2] ?? 'shot.png'
const columns = Number(process.argv[3] ?? 100)
const rows = Number(process.argv[4] ?? 24)
const shots = Number(process.argv[5] ?? 4)
const mode = (process.env.MODE ?? 'play') as 'ready' | 'play'
// a cell is about half as wide as it is tall, and holds two canvas pixels each way
const ZW = 3
const ZH = 6

let g: Range = newRange(columns * 2, rows * 2, 20260915)
for (let i = 0; i < shots; i++) {
  g = aimAt(g, g.target.x + (i === shots - 1 ? g.target.r * 3 : 0), g.target.y)
  g = shoot(g).game
  for (let k = 0; k < 3; k++) g = tick(g)
}
// AIM=<0..1>,<0..1> puts the crosshair somewhere fixed, to judge how the gun leans
const aim = process.env.AIM?.split(',').map(Number)
g = aim && aim.length === 2
  ? aimAt(g, columns * 2 * aim[0]!, rows * 2 * aim[1]!)
  : aimAt(g, g.target.x + 4, g.target.y - 2)

// the cell glyphs, as which of the four quadrants the foreground covers
const MASK: Record<string, number> = {
  '█': 15, '▘': 1, '▝': 2, '▀': 3, '▖': 4, '▌': 5, '▞': 6, '▛': 7,
  '▗': 8, '▚': 9, '▐': 10, '▜': 11, '▄': 12, '▙': 13, '▟': 14,
}

// SCENE=<n> holds one backdrop still, so each can be judged on its own
if (process.env.SCENE) g = { ...g, ticks: Number(process.env.SCENE) * 5 * 15 + Number(process.env.T ?? 0) }
const view = frame(g, columns, rows, mode, Number(process.env.BEST ?? 12), process.env.MUTED === '1')
const maxRuns = Math.max(6, Math.floor(1500 / rows) - 1)
const W = columns * 2 * ZW
const H = rows * 2 * ZH
const px = Buffer.alloc(W * H * 3)

const dot = (x: number, y: number, v: number) => {
  for (let yy = y * ZH; yy < (y + 1) * ZH; yy++) {
    for (let xx = x * ZW; xx < (x + 1) * ZW; xx++) {
      const i = (yy * W + xx) * 3
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

// a minimal PNG: one IHDR, one deflated IDAT of filter-0 scanlines, one IEND
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
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
const raw = Buffer.alloc(H * (W * 3 + 1))
for (let y = 0; y < H; y++) px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3)
writeFileSync(out, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]))
console.log(`${out} · ${W}x${H} · score ${g.score} · shots ${g.shots}`)
