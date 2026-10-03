// The shared AudioContext and mixer. All game audio is synthesized here in the browser —
// nothing is downloaded. Busses: music (background/music.ts), sfx (sfx/ and thunder),
// and master, which the rain hiss and the voice chat sit beside.

let ctx: AudioContext | null = null;
let master: GainNode;
let musicBus: GainNode;
let sfxBus: GainNode;
let noiseBuf: AudioBuffer;
let brownBuf: AudioBuffer;
const readyHooks: (() => void)[] = [];

/** Run `fn` once the context exists (immediately if it already does). */
export function whenAudioReady(fn: () => void) {
  if (ctx) fn();
  else readyHooks.push(fn);
}

export function audio(): AudioContext {
  if (ctx) return ctx;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0; // background/music.ts sets it from the player's preference
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
  for (const fn of readyHooks.splice(0)) fn();
  return ctx;
}

/** Call from any user gesture; browsers keep audio suspended until one happens. */
export function unlockAudio() {
  const c = audio();
  if (c.state === "suspended") void c.resume();
}

export function buses() {
  audio();
  return { master, music: musicBus, sfx: sfxBus };
}

/** Two seconds of white noise (hiss, hats, crunch) and brown noise (rumble). */
export function noiseBuffers() {
  audio();
  return { white: noiseBuf, brown: brownBuf };
}

/** A gain node shaped as attack → exponential decay, starting at time `t`. */
export function env(vol: number, t: number, attack: number, dur: number) {
  const g = audio().createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}
