// Renders the range's sounds into fx/. Every one is synthesised here, so the plugin ships no
// sampled audio.
//
//   shot  a crack: a noise transient over a short low body
//   ding  the enamel plate when the shot lands, a bell two notes wide
//   miss  a dull slap into the plank wall

import { writeFileSync, mkdirSync } from 'node:fs'

const RATE = 44100
const fx = new URL('../fx/', import.meta.url)
mkdirSync(fx, { recursive: true })

const noise = (() => { let s = 24681; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x3fffffff - 1 } })()

const render = (seconds, fn) => {
  const n = Math.round(seconds * RATE)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = fn(i / RATE, i)
  return out
}

// a one-pole low pass, so a noise burst reads as air rather than as static
const lowpass = (buf, cutoffAt) => {
  let y = 0
  for (let i = 0; i < buf.length; i++) {
    const a = Math.min(0.99, cutoffAt(i / RATE))
    y += (buf[i] - y) * a
    buf[i] = y
  }
  return buf
}

const SOUNDS = {
  shot: () => {
    const body = render(0.18, t => Math.sin(2 * Math.PI * (210 - t * 520) * t) * Math.exp(-t * 26))
    const crack = lowpass(render(0.18, t => noise() * Math.exp(-t * 62)), t => 0.85 * Math.exp(-t * 30) + 0.12)
    return render(0.18, (t, i) => (body[i] * 0.55 + crack[i] * 0.95) * 0.7)
  },
  ding: () => render(0.42, t => {
    const one = Math.sin(2 * Math.PI * 1318.5 * t) * Math.exp(-t * 9)
    const two = Math.sin(2 * Math.PI * 1975.5 * t) * Math.exp(-t * 13) * 0.6
    const ring = Math.sin(2 * Math.PI * 2637 * t) * Math.exp(-t * 20) * 0.25
    return (one + two + ring) * 0.34
  }),
  miss: () => lowpass(render(0.16, t => noise() * Math.exp(-t * 34) + Math.sin(2 * Math.PI * 120 * t) * Math.exp(-t * 30) * 0.5), t => 0.18 * Math.exp(-t * 12) + 0.03),
}

for (const [name, make] of Object.entries(SOUNDS)) {
  const buf = make()
  let peak = 0
  for (const v of buf) peak = Math.max(peak, Math.abs(v))
  const norm = 0.9 / (peak || 1)
  const bytes = Buffer.alloc(44 + buf.length * 2)
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + buf.length * 2, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(RATE, 24); bytes.writeUInt32LE(RATE * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(buf.length * 2, 40)
  for (let i = 0; i < buf.length; i++) bytes.writeInt16LE(Math.round(Math.tanh(buf[i] * norm) * 32000), 44 + i * 2)
  writeFileSync(new URL(`${name}.wav`, fx), bytes)
  // wav, not mp3: these are a fifth of a second each, and an mp3 frame's own latency is audible
  console.log(`fx/${name}.wav · ${(buf.length / RATE * 1000).toFixed(0)} ms · ${(bytes.length / 1024).toFixed(0)} KiB`)
}
