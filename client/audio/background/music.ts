// The 8-bit background loop: Am–F–C–G, a 12.5% pulse arpeggio, triangle bass, square lead
// and noise drums, scheduled a little ahead of time. Toggled per player with M / ♪.

import { buses, noiseBuffers, whenAudioReady } from "../context.ts";

const MUSIC_KEY = "rk.music";
const VOLUME = 0.16;

export let musicOn = (() => {
  try {
    return localStorage.getItem(MUSIC_KEY) !== "0";
  } catch {
    return true;
  }
})();

export function setMusic(on: boolean) {
  musicOn = on;
  try {
    localStorage.setItem(MUSIC_KEY, on ? "1" : "0");
  } catch {}
  const bus = buses().music;
  bus.gain.setTargetAtTime(on ? VOLUME : 0, bus.context.currentTime, 0.1);
}

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

const CHORDS = [
  { root: 45, tones: [57, 60, 64] }, // Am
  { root: 41, tones: [53, 57, 60] }, // F
  { root: 48, tones: [60, 64, 67] }, // C
  { root: 43, tones: [55, 59, 62] }, // G
];
// eighth notes, 0 = rest
const LEAD = [
  [69, 0, 72, 0, 76, 74, 72, 0],
  [69, 0, 0, 67, 69, 0, 72, 0],
  [67, 0, 64, 0, 67, 69, 67, 0],
  [74, 0, 0, 0, 71, 0, 67, 0],
  [76, 0, 76, 74, 72, 0, 69, 0],
  [72, 0, 69, 0, 65, 0, 69, 72],
  [76, 0, 74, 72, 67, 0, 64, 0],
  [74, 0, 71, 0, 67, 0, 71, 74],
];
const ARP = [0, 1, 2, 1, 0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1];

function startMusic() {
  const bus = buses().music;
  const c = bus.context as AudioContext;
  bus.gain.value = musicOn ? VOLUME : 0;
  const { white } = noiseBuffers();

  // 12.5% duty pulse — the classic NES lead timbre
  const real = new Float32Array(32), imag = new Float32Array(32);
  for (let k = 1; k < 32; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.125);
  const pulse = c.createPeriodicWave(real, imag);

  const step = 60 / 116 / 4;
  let next = c.currentTime + 0.2;
  let i = 0;

  const tone = (type: OscillatorType | PeriodicWave, f: number, t: number, dur: number, vol: number) => {
    const o = c.createOscillator();
    if (type instanceof PeriodicWave) o.setPeriodicWave(type);
    else o.type = type;
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  const noise = (t: number, dur: number, vol: number, hp: number) => {
    const s = c.createBufferSource();
    s.buffer = white;
    const f = c.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(bus);
    s.start(t, Math.random());
    s.stop(t + dur);
  };
  const kick = (t: number) => {
    const o = c.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.2);
  };

  setInterval(() => {
    // Skip scheduling entirely while muted, but keep the clock moving.
    while (next < c.currentTime + 0.15) {
      if (musicOn) {
        const bar = Math.floor(i / 16) % 8;
        const s = i % 16;
        const chord = CHORDS[bar % 4]!;
        tone(pulse, midi(chord.tones[ARP[s]!]! + 12), next, step * 0.9, 0.18);
        if (s % 2 === 0) {
          tone("triangle", midi(chord.root + (s % 4 === 2 ? 12 : 0)), next, step * 1.8, 0.55);
          const lead = LEAD[bar]![s / 2]!;
          if (lead) tone("square", midi(lead), next, step * 1.9, 0.12);
        }
        if (s % 8 === 0) kick(next);
        if (s % 8 === 4) noise(next, 0.12, 0.35, 1200);
        if (s % 2 === 1) noise(next, 0.03, 0.12, 7000);
      }
      next += step;
      i++;
    }
  }, 25);
}

whenAudioReady(startMusic);
