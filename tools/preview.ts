// Renders one frame to this terminal, so the drawing can be judged without a session.
//   bun tools/preview.ts [columns] [rows] [shots]   MODE=ready|play
import { aimAt, newRange, shoot, tick, type Range } from '../hooks/game/range.ts'
import { rowRuns } from '../hooks/boards/paint.ts'
import { frame } from '../hooks/boards/scene.ts'

const columns = Number(process.argv[2] ?? 100)
const rows = Number(process.argv[3] ?? 24)
const shots = Number(process.argv[4] ?? 4)
const ESC = String.fromCharCode(27)
const mode = (process.env.MODE ?? 'play') as 'ready' | 'play'

const rgb = (s: string) => {
  const v = parseInt(s.slice(1), 16)
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff] as const
}

let g: Range = newRange(columns * 2, rows * 2, 20260915)
for (let i = 0; i < shots; i++) {
  // three on the plate, then one wide, so the frame shows a hole and a streak both
  g = aimAt(g, g.target.x + (i === shots - 1 ? g.target.r * 3 : 0), g.target.y)
  g = shoot(g).game
  for (let k = 0; k < 3; k++) g = tick(g)
}
g = aimAt(g, g.target.x + 4, g.target.y - 2)

const view = frame(g, columns, rows, mode)
const maxRuns = Math.max(6, Math.floor(1500 / rows) - 1)
let total = 0
const out: string[] = []
for (let y = 0; y < rows; y++) {
  const runs = rowRuns(view, y, columns, maxRuns)
  total += runs.length
  out.push(
    runs
      .map(([t, c, b]) => {
        const [fr, fg, fb] = rgb(c)
        const [br, bg, bb] = rgb(b)
        return `${ESC}[38;2;${fr};${fg};${fb}m${ESC}[48;2;${br};${bg};${bb}m${t}`
      })
      .join('') + `${ESC}[0m`,
  )
}
console.log(out.join('\n'))
console.log(`\n${columns}x${rows} · score ${g.score} · shots ${g.shots} · ${total} runs (cap ${maxRuns}/row)`)
