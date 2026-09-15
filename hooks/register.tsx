/* @jsx h */
import type { Register } from 'claude-code'

// One command, /range. The board is a surface module on the drawing thread; this module opens and
// closes it, keeps the best score in $.store, and plays the sounds the board asks for.
//
// Sounds are played from a timer, never from inside the dispatch that asked for them: a call of
// the dispatch's own is abandoned with it, and the game would run silent.

let open = false
let muted = false
let best = 0
let turnsDone = 0

const SFX = new Set(['hit', 'miss', 'lapse', 'over'])

// The engine refuses a play once four are already going, and a shooting gallery can ask for one
// every few frames. So the plugin keeps its own count and a floor between starts: a sound that
// would be refused is simply dropped, which is what the player wants anyway — the shot they can
// already hear is the one that mattered.
// Four at once is what the engine allows; the loop holds one, so three are left. The shot is
// forced past the gap because it is the one sound the player is waiting for — losing it is worse
// than two of them overlapping.
const MAX_PLAYS = 3
const MIN_GAP_MS = 30
let playing = 0
let lastPlay = 0

// The loop under the round. It holds one of the engine's four slots for as long as the board is
// open, which is why the effects are capped at two: three playing at once always leaves a fourth
// free. Its own `AbortController` is the only way to stop it.
//
// Aborting only *asks* the player to stop, so a second loop started before the first has actually
// finished leaves the old one playing with nothing holding its controller — a track that can
// never be stopped again. A restart is therefore delayed and re-checked against `music`, which
// only the newest start owns.
let music: AbortController | null = null

// Drops the play rather than letting it be refused: the count comes back down on settle, and a
// failure counts as settled too, so a refusal can never wedge the gate shut.
const play = ($: { audio: { play: (o: { asset: string }) => Promise<unknown> } }, name: string, force = false) => {
  const now = Date.now()
  if (playing >= MAX_PLAYS) return
  if (!force && now - lastPlay < MIN_GAP_MS) return
  playing++
  lastPlay = now
  const done = () => { playing = Math.max(0, playing - 1) }
  $.audio.play({ asset: `fx/${name}.wav` }).then(done, done)
}

type Audio = { audio: { play: (c: { asset: string }, o?: { shouldLoop: true; gain?: number; signal: AbortSignal }) => Promise<void> }; ui: { log: (m: string) => void }; clock: { after: (ms: number, fn: () => void) => unknown } }

// `delay` is for a restart: whatever was playing needs a moment to actually let go first.
const startMusic = ($: Audio, delay = 0) => {
  if (music || muted || !open) return
  const ctl = new AbortController()
  music = ctl
  // The play has to be made from a timer, not from the dispatch that asked for it or from a
  // promise chained off it: a call of the dispatch's own is abandoned with it, and the track
  // simply never starts. That is why there was no music on the opening screen.
  $.clock.after(delay, () => {
    if (music !== ctl || muted || !open) {
      if (music === ctl) music = null
      return
    }
    const done = () => { if (music === ctl) music = null }
    $.audio
      .play({ asset: 'fx/music.wav' }, { shouldLoop: true, gain: 0.34, signal: ctl.signal })
      .then(done, err => { done(); $.ui.log(`cc-range: music: ${err}`) })
  })
}

const stopMusic = () => {
  music?.abort()
  music = null
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    // a store that cannot be read costs the score, never the game: an unhandled rejection here
    // would unmount the whole module
    const saved = await $.store.get('best').catch(err => { $.ui.log(`cc-range: store read failed: ${err}`); return undefined })
    if (typeof saved === 'number') best = saved
    muted = (await $.store.get('muted').catch(() => undefined)) === true
    await $.command.register({
      name: 'range',
      description: 'A shooting gallery above the prompt: aim with the pointer, click to fire (cc-range)',
      argumentHint: '[mute | reset | stop]',
      immediate: true,
    }).catch(err => $.ui.log(`cc-range: /range not registered: ${err}`))
    return r
  })

  on('command.run', { command: 'range' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'stop') {
      open = false
      stopMusic()
      $.ui.invalidate('ui.render')
      return { text: 'range closed' }
    }
    if (arg === 'mute' || arg === 'unmute') {
      muted = arg === 'mute'
      await $.store.set('muted', muted).catch(() => {})
      if (muted) stopMusic()
      else startMusic($, 200)
      $.ui.invalidate('ui.render')
      return { text: `sound ${muted ? 'off' : 'on'}` }
    }
    if (arg === 'reset') {
      best = 0
      await $.store.set('best', 0).catch(() => {})
      $.ui.invalidate('ui.render')
      return { text: 'best score cleared' }
    }
    open = true
    startMusic($)
    $.ui.invalidate('ui.render')
    return { text: `Range · click the board above the prompt, move the pointer to aim, click or space to fire · 30 seconds from the first shot · m mutes · wasd or the arrows also aim · r restart · Esc returns to the prompt · /range stop closes${best ? ` · best ${best}` : ''}` }
  })

  // a cancelled turn is the gesture for "stop everything": the board stays, the track does not
  on('turn.abort', async ($, e, next) => {
    stopMusic()
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (open) {
      turnsDone++
      $.ui.invalidate('ui.render')
    }
    return r
  })

  // the board's own messages: a sound to play, and the score after a hit
  on('ui.message', async ($, e, next) => {
    const data = e.data as { sfx?: unknown; score?: unknown; mute?: unknown; close?: unknown } | null
    if (!data) return next(e)

    if (data.close === true) {
      open = false
      stopMusic()
      $.ui.invalidate('ui.render')
      return { props: { best, done: turnsDone, muted } }
    }

    if (data.mute === true) {
      muted = !muted
      await $.store.set('muted', muted).catch(() => {})
      if (muted) stopMusic()
      else startMusic($, 200)
      $.ui.toast(`range: sound ${muted ? 'off' : 'on'}`)
    }

    if (typeof data.sfx === 'string' && SFX.has(data.sfx) && !muted) {
      const name = data.sfx
      // a sound is played from a timer, never inside the dispatch that asked for it: a call of
      // the dispatch's own is abandoned with it, and the game would run silent
      $.clock.after(0, () => {
        if (name === 'hit' || name === 'miss') play($, 'shot', true)
        // the shot, then what it did: one timer, so the two never stack
        if (name === 'hit') $.clock.after(110, () => play($, 'ding'))
        if (name === 'lapse') play($, 'miss')
        if (name === 'over') play($, 'ding')
      })
    }

    if (typeof data.score === 'number' && data.score > best) {
      best = data.score
      await $.store.set('best', best).catch(err => $.ui.log(`cc-range: store write failed: ${err}`))
      $.ui.toast(`range: new best ${best}`)
    }

    return { props: { best, done: turnsDone, muted } }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // the board needs a terminal's keys and pointer; the desktop and mobile bands draw their own
    if (!open || e.props.hasSurvey || e.surface !== 'terminal') return next(e)
    const { Box, Button, Client, Text } = await $.ui.resolve(e)

    const columns = e.props.bodyColumns
    const rows = Math.max(12, e.props.maxRows - 2)
    const close = () => { open = false; stopMusic(); $.ui.invalidate('ui.render') }

    return (
      <Box flexDirection="column">
        {/* the module path is a string literal: the engine reads it off this source */}
        <Client key="range:board" module="./boards/range.tsx" width={columns} height={rows} props={{ best, done: turnsDone, muted }} />
        {/* one button, under the board: muting is the m key, so there is no second */}
        <Box flexDirection="row" columnGap={1}>
          <Button key="range:close" label="close" onPress={close} />
          <Text dimColor>{'click the board to play · m mutes · q closes · Esc returns to the prompt'}</Text>
        </Box>
        {await next(e)}
      </Box>
    )
  })
}
