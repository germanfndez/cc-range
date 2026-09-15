// Renders the loop that plays under the round into fx/music.wav. Nothing is sampled: it is a
// chiptune written out here, so the plugin ships no one else's music.
//
// Eight bars at 132 BPM in A minor, and the last sixteenth joins back onto the first, so
// `shouldLoop` has nothing to click over. Four voices, the way the chips that inspired it had:
//
//   bass   a triangle on the root, syncopated off the third and the seventh sixteenth
//   arp    a 12.5% square running the chord up and down in sixteenths — the part you hum
//   lead   a 50% square over the back half, so eight bars do not feel like four played twice
//   pad    a soft sustained chord under all of it, one note a bar
//   drums  a noise hat on the offbeats and a pitched-down sine for the kick
//
// Sixteen bars rather than eight, and the pad never lets go: the seam comes round half as often
// and there is always something sounding across it, so a loop that restarts a hair late is not
// a hole in the music.

import { writeFileSync, mkdirSync } from 'node:fs'

const RATE = 22050                 // a square wave needs no more, and the file stays small
const BPM = 132
const STEP = 60 / BPM / 4          // one sixteenth
const BARS = 16
const STEPS = BARS * 16
const LENGTH = STEPS * STEP

const noise = (() => { let s = 99137; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x3fffffff - 1 } })()

// A4 = 440, and every note is written as semitones from it
const hz = n => 440 * Math.pow(2, n / 12)

const Am = { root: -12, notes: [0, 3, 7] }
const F = { root: -16, notes: [-4, 0, 3] }
const C = { root: -9, notes: [3, 7, 10] }
const G = { root: -14, notes: [-2, 2, 5] }
const Dm = { root: -19, notes: [-7, -3, 0] }

// sixteen bars: the first eight state it, the second eight answer under the hook
const CHORDS = [Am, F, C, G, Am, F, G, G, Am, Am, F, F, C, G, Dm, G]

// which degree of the chord the arpeggio is on, per sixteenth; 3 is the root an octave up
const ARP = [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 2, 3, 2, 1]
// the hook over the back half, as semitones from A4, `null` for a rest
const HOOK = [
  12, null, 10, null, 7, null, 3, null, 7, null, 10, null, 12, null, null, null,
  10, null, 7, null, 3, null, 0, null, 3, null, 7, null, 10, null, null, null,
  12, null, 15, null, 14, null, 12, null, 10, null, 7, null, 12, null, null, null,
  10, null, 7, null, 10, null, 12, null, 14, null, null, null, 14, null, null, null,
]
const BASS = [0, 3, 6, 8, 11, 14]
const KICK = [0, 6, 8]
const HAT = [2, 6, 10, 14]

const n = Math.round(LENGTH * RATE)
// Half a second past the end is rendered too, and then folded back over the beginning with a
// crossfade. Wrapping the tails round with a modulo — the obvious thing — leaves the last sample
// and the first one at completely different points of their waveforms, and every time the loop
// comes round that step is a click. This way the end of the buffer already *is* the run-up to
// its own beginning.
const TAIL = Math.round(0.25 * RATE)
const out = new Float32Array(n + TAIL)

// every voice writes one note at a time into the buffer, so a note that runs past the next step
// rings under it instead of cutting
const note = (startStep, lenSteps, fn) => {
  const from = Math.round(startStep * STEP * RATE)
  const len = Math.round(lenSteps * STEP * RATE)
  for (let i = 0; i < len; i++) {
    const at = from + i
    if (at < out.length) out[at] += fn(i / RATE, i / len)
  }
}

const square = (t, f, duty) => ((t * f) % 1 < duty ? 1 : -1)

for (let step = 0; step < STEPS; step++) {
  const bar = Math.floor(step / 16)
  const inBar = step % 16
  const chord = CHORDS[bar % CHORDS.length]

  // arp
  const degree = ARP[inBar]
  const semi = degree === 3 ? chord.notes[0] + 12 : chord.notes[degree]
  note(step, 1, (t, k) => square(t, hz(semi), 0.125) * 0.13 * Math.exp(-k * 2.6))

  // bass
  if (BASS.includes(inBar)) {
    const f = hz(chord.root - 12)
    // a triangle, as its own Fourier sum would be too slow: fold a saw back on itself
    note(step, 2, (t, k) => (Math.abs(((t * f) % 1) * 4 - 2) - 1) * 0.30 * Math.exp(-k * 1.6))
  }

  // the hook, over the back half only
  if (bar >= 8) {
    const h = HOOK[(step - 128) % HOOK.length]
    if (h !== null && h !== undefined) {
      note(step, 2, (t, k) => square(t, hz(h), 0.5) * 0.11 * Math.exp(-k * 2.2) * Math.min(1, k * 24))
    }
  }

  // the pad: one note a bar, held right through it and a little past, so the voices never all
  // stop at once — including at the seam, where the tail wraps onto the first bar
  if (inBar === 0) {
    for (const semi of chord.notes) {
      const f = hz(semi - 12)
      note(step, 17, (t, k) => (Math.abs(((t * f) % 1) * 4 - 2) - 1) * 0.055 * Math.min(1, k * 12) * Math.min(1, (1 - k) * 9))
    }
  }

  // drums
  if (KICK.includes(inBar)) note(step, 2, t => Math.sin(2 * Math.PI * (120 - t * 420) * t) * 0.5 * Math.exp(-t * 34))
  if (HAT.includes(inBar)) note(step, 1, (t, k) => noise() * 0.10 * Math.exp(-k * 14))
}

// Fold the overhang onto the head. The head comes up fast — a downbeat faded in over a quarter
// of a second is a dip you can hear every time round — while the overhang rings out across the
// whole fold, which is what carries the last bar's tails over the seam.
for (let i = 0; i < TAIL; i++) {
  const k = i / TAIL
  out[i] = out[i] * Math.min(1, k / 0.15) + out[n + i] * (1 - k)
}

let peak = 0
for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]))
const norm = 0.82 / (peak || 1)
const bytes = Buffer.alloc(44 + n * 2)
bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + n * 2, 4); bytes.write('WAVEfmt ', 8)
bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
bytes.writeUInt32LE(RATE, 24); bytes.writeUInt32LE(RATE * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
bytes.write('data', 36); bytes.writeUInt32LE(n * 2, 40)
for (let i = 0; i < n; i++) bytes.writeInt16LE(Math.round(Math.tanh(out[i] * norm) * 30000), 44 + i * 2)

mkdirSync(new URL('../fx/', import.meta.url), { recursive: true })
writeFileSync(new URL('../fx/music.wav', import.meta.url), bytes)
console.log(`fx/music.wav · ${LENGTH.toFixed(1)} s · ${BPM} BPM · ${(bytes.length / 1024).toFixed(0)} KiB`)
