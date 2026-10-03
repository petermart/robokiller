// All audio is synthesized: an 8-bit loop, storm ambience, and game sound effects.
// Nothing is downloaded.

let ctx: AudioContext | null = null;
let master: GainNode;
let musicBus: GainNode;
let sfxBus: GainNode;
let noiseBuf: AudioBuffer;
let brownBuf: AudioBuffer;

const MUSIC_KEY = "rk.music";
export let musicOn = (() => {
  try {
    return localStorage.getItem(MUSIC_KEY) !== "0";
  } catch {
    return true;
  }
})();

export function audio(): AudioContext {
  if (ctx) return ctx;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = musicOn ? 0.16 : 0;
  musicBus.connect(master);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.5;
  sfxBus.connect(master);

  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const n = noiseBuf.getChannelData(0), b = brownBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    n[i] = Math.random() * 2 - 1;
    last = (last + 0.02 * n[i]!) / 1.02;
    b[i] = last * 3.5;
  }
  startRain();
  startMusic();
  return ctx;
}

/** Call from any user gesture; browsers keep audio suspended until one happens. */
export function unlockAudio() {
  const c = audio();
  if (c.state === "suspended") void c.resume();
}

export function setMusic(on: boolean) {
  musicOn = on;
  try {
    localStorage.setItem(MUSIC_KEY, on ? "1" : "0");
  } catch {}
  if (ctx) musicBus.gain.setTargetAtTime(on ? 0.16 : 0, ctx.currentTime, 0.1);
}

// ------------------------------------------------------------------ music

const SQUARE_12 = () => {
  const c = audio();
  const real = new Float32Array(32), imag = new Float32Array(32);
  for (let k = 1; k < 32; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.125);
  return c.createPeriodicWave(real, imag);
};

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
  const c = ctx!;
  const wave = SQUARE_12();
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
    o.connect(g).connect(musicBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  const noise = (t: number, dur: number, vol: number, hp: number) => {
    const s = c.createBufferSource();
    s.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(musicBus);
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
    o.connect(g).connect(musicBus);
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
        tone(wave, midi(chord.tones[ARP[s]!]! + 12), next, step * 0.9, 0.18);
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

// ------------------------------------------------------------------ ambience + sfx

function startRain() {
  const c = ctx!;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 2500;
  f.Q.value = 0.4;
  const g = c.createGain();
  g.gain.value = 0.015;
  s.connect(f).connect(g).connect(master);
  s.start();
}

function env(vol: number, t: number, attack: number, dur: number) {
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

export function thunder(delay: number, power: number) {
  const c = audio();
  const t = c.currentTime + delay;
  const s = c.createBufferSource();
  s.buffer = brownBuf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(900, t);
  f.frequency.exponentialRampToValueAtTime(120, t + 2.5);
  const g = env(0.55 * power, t, 0.05, 3.2);
  s.connect(f).connect(g).connect(sfxBus);
  s.start(t, Math.random());
  s.stop(t + 3.3);
}

export function sfx(kind: "boom" | "shot" | "task" | "alarm" | "vent" | "blip" | "elevator" | "deny", vol = 1) {
  const c = audio();
  const t = c.currentTime;
  const out = c.createGain();
  out.gain.value = vol;
  out.connect(sfxBus);
  const osc = (type: OscillatorType, f0: number, f1: number, at: number, dur: number, v: number) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t + at);
    o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
    const g = env(v, t + at, 0.005, dur);
    o.connect(g).connect(out);
    o.start(t + at);
    o.stop(t + at + dur + 0.02);
  };
  const noise = (filter: BiquadFilterType, freq: number, at: number, dur: number, v: number) => {
    const s = c.createBufferSource();
    s.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = env(v, t + at, 0.003, dur);
    s.connect(f).connect(g).connect(out);
    s.start(t + at, Math.random());
    s.stop(t + at + dur + 0.02);
  };
  switch (kind) {
    case "boom":
      noise("lowpass", 600, 0, 1.2, 1.2);
      osc("sine", 120, 30, 0, 0.6, 1);
      osc("square", 880, 110, 0, 0.25, 0.15);
      break;
    case "shot":
      noise("highpass", 1500, 0, 0.12, 1);
      noise("lowpass", 800, 0, 0.6, 0.5);
      noise("bandpass", 3000, 0.25, 0.4, 0.15);
      break;
    case "task":
      [523, 659, 784, 1046].forEach((f, i) => osc("square", f, f, i * 0.07, 0.12, 0.15));
      break;
    case "alarm":
      for (let i = 0; i < 4; i++) {
        osc("square", 880, 880, i * 0.36, 0.17, 0.2);
        osc("square", 660, 660, i * 0.36 + 0.18, 0.17, 0.2);
      }
      break;
    case "vent":
      noise("bandpass", 1800, 0, 0.15, 0.7);
      osc("triangle", 220, 90, 0, 0.2, 0.5);
      break;
    case "elevator":
      osc("sine", 1318, 1318, 0, 0.4, 0.25);
      osc("sine", 1046, 1046, 0.25, 0.6, 0.25);
      break;
    case "blip":
      osc("square", 1200, 1600, 0, 0.05, 0.08);
      break;
    case "deny":
      osc("square", 220, 180, 0, 0.15, 0.12);
      break;
  }
}
