// Storm ambience: a quiet bed of rain hiss, and thunder rolls timed to the lightning
// (engine/world/weather.ts calls `thunder` with a distance-based delay). Both go through
// the ambience bus, whose level each player sets with the ☂ slider (saved locally).

import { audio, buses, env, noiseBuffers, whenAudioReady } from "../context.ts";

const AMBIENCE_KEY = "rk.ambience";
/** Highest slider value — 1 is the original mix. */
export const AMBIENCE_MAX = 2;

/** Rain + thunder volume, 0 … AMBIENCE_MAX. */
export let ambienceLevel = (() => {
  try {
    const v = Number(localStorage.getItem(AMBIENCE_KEY) ?? "1");
    return Number.isFinite(v) ? Math.max(0, Math.min(AMBIENCE_MAX, v)) : 1;
  } catch {
    return 1;
  }
})();

export function setAmbience(level: number) {
  ambienceLevel = Math.max(0, Math.min(AMBIENCE_MAX, level));
  try {
    localStorage.setItem(AMBIENCE_KEY, String(ambienceLevel));
  } catch {}
  const bus = buses().ambience;
  bus.gain.setTargetAtTime(ambienceLevel, bus.context.currentTime, 0.05);
}

function startRain() {
  const c = audio();
  const s = c.createBufferSource();
  s.buffer = noiseBuffers().white;
  s.loop = true;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 2500;
  f.Q.value = 0.4;
  const g = c.createGain();
  g.gain.value = 0.015; // kept low on purpose — players asked for a quieter storm
  s.connect(f).connect(g).connect(buses().ambience);
  s.start();
}

export function thunder(delay: number, power: number) {
  const c = audio();
  const t = c.currentTime + delay;
  const s = c.createBufferSource();
  s.buffer = noiseBuffers().brown;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(900, t);
  f.frequency.exponentialRampToValueAtTime(120, t + 2.5);
  const g = env(0.55 * power, t, 0.05, 3.2);
  s.connect(f).connect(g).connect(buses().ambience);
  s.start(t, Math.random());
  s.stop(t + 3.3);
}

whenAudioReady(() => {
  buses().ambience.gain.value = ambienceLevel;
  startRain();
});
