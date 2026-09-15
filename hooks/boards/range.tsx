/* @jsx h */
import type { ClientSurface } from 'claude-code'
import { accuracy, aimAt, newRange, nudge, restart, secondsLeft, shoot, tick, type Range } from '../game/range.ts'
import { rowRuns } from './paint.ts'
import { frame } from './scene.ts'

// The board: the surface module, on the drawing thread, with its own frame clock, the keys it
// gets after a click, and the pointer it aims with.
//
// Never name a local `h` here: every JSX tag compiles to a call of `h`.

type Props = { best?: number; done?: number; muted?: boolean } | undefined
type Mode = 'ready' | 'play' | 'over'
type State = { game: Range; mode: Mode; size: string; seenLapsed: number }

const STEP_MS = 66

export default function RangeBoard(props: Props, surface: ClientSurface<State>) {
  const { Box, Text } = surface.elements
  const columns = Math.max(24, surface.columns)
  const rows = Math.max(10, surface.rows)
  const size = `${columns}x${rows}`
  const best = props?.best ?? 0
  const board = rows - 1

  const fresh = (): State => ({
    game: newRange(columns * 2, board * 2, (Date.now() & 0x7fffffff) || 1),
    mode: 'ready',
    size,
    seenLapsed: 0,
  })

  // the pointer lands in cells; the game lives in canvas pixels, which are two per cell
  const toCanvas = (x: number, y: number) => ({ x: x * 2 + 1, y: y * 2 + 1 })

  // a shot — or, on the start screen, the press that begins the round
  const fire = (at?: { x: number; y: number }) => {
    const s = surface.state
    if (!s) return
    const aimed = at ? aimAt(s.game, at.x, at.y) : s.game

    // the start screen costs no shot: pressing it is what begins the thirty seconds
    if (s.mode === 'ready') {
      surface.setState({ ...s, game: aimed, mode: 'play' })
      return
    }
    if (s.mode === 'over') {
      const next = restart(s.game)
      surface.setState({ ...s, game: aimAt(next, aimed.aimX, aimed.aimY), mode: 'play', seenLapsed: next.lapsed })
      return
    }

    const shot = shoot(aimed)
    surface.post(shot.hit ? { sfx: 'hit', score: shot.game.score } : { sfx: 'miss' })
    surface.setState({ ...s, game: shot.game, mode: 'play' })
  }

  if (surface.state === undefined) {
    surface.setState(fresh())

    surface.every(STEP_MS, () => {
      const s = surface.state
      if (!s) return
      // the clock only runs once the first shot has been fired
      if (s.mode !== 'play') return
      const game = tick(s.game)
      // the round just ended, or a target left on its own: the hooks module wants to know
      if (game.over && !s.game.over) surface.post({ sfx: 'over', score: game.score })
      else if (game.lapsed !== s.seenLapsed) surface.post({ sfx: 'lapse' })
      surface.setState({ ...s, game, mode: game.over ? 'over' : 'play', seenLapsed: game.lapsed })
    })

    surface.onKey(({ key }) => {
      const s = surface.state
      if (!s) return
      const k = key === 'space' ? ' ' : key.toLowerCase()
      if (k === 'r') { const next = restart(s.game); surface.setState({ ...s, game: next, mode: 'play', seenLapsed: next.lapsed }); return }
      if (k === 'm') { surface.post({ mute: true }); return }
      if (k === 'q') { surface.post({ close: true }); return }
      const aim =
        k === 'left' || k === 'a' ? [-1, 0] :
        k === 'right' || k === 'd' ? [1, 0] :
        k === 'up' || k === 'w' ? [0, -1] :
        k === 'down' || k === 's' ? [0, 1] : null
      if (aim) { surface.setState({ ...s, game: nudge(s.game, aim[0]!, aim[1]!), mode: 'play' }); return }
      if (k === ' ' || k === 'return' || k === 'f') fire()
    })

    // moving the pointer aims; pressing it fires where it is
    surface.onPointer(ev => {
      const s = surface.state
      if (!s) return
      const p = toCanvas(ev.x, ev.y)
      if (ev.type === 'move' || ev.type === 'enter') {
        surface.setState({ ...s, game: aimAt(s.game, p.x, p.y) })
        return
      }
      if (ev.type === 'down') fire(p)
    })
  }

  const s = surface.state
  // a resized band is a different range: lay it out again rather than stretch it
  if (s && s.size !== size) surface.setState(fresh())

  const game = s?.game ?? newRange(columns * 2, board * 2)
  const mode = s?.mode ?? 'ready'
  const view = frame(game, columns, board, mode, best)
  // the engine holds a bounded number of nodes: spend them evenly over the rows
  const maxRuns = Math.max(6, Math.floor(1500 / Math.max(1, rows)) - 1)
  const painted = Array.from({ length: board }, (_, y) => (
    <Text>
      {rowRuns(view, y, columns, maxRuns).map(([t, color, background]) => (
        <Text color={color} backgroundColor={background}>{t}</Text>
      ))}
    </Text>
  ))

  const status = mode === 'ready'
    ? `range · click the board, then move to aim and fire · 30 seconds from the first shot · m mutes · q closes · best ${best}`
    : mode === 'over'
      ? `range · time · ${game.score} hits · accuracy ${accuracy(game)}% · best ${Math.max(best, game.score)} · space or click plays again`
      : `range · ${secondsLeft(game)}s · score ${game.score} · streak ${game.streak} · accuracy ${accuracy(game)}% · best ${Math.max(best, game.score)}`

  return (
    <Box flexDirection="column">
      {painted}
      <Text dimColor wrap="truncate-end">{status}</Text>
    </Box>
  )
}
