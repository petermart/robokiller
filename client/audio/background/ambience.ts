// Storm ambience: a quiet bed of rain hiss, and thunder rolls timed to the lightning
// (engine/world/weather.ts calls `thunder` with a distance-based delay).

import { audio, buses, env, noiseBuffers, whenAudioReady } from "../context.ts";

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
  s.connect(f).connect(g).connect(buses().master);
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
  s.connect(f).connect(g).connect(buses().sfx);
  s.start(t, Math.random());
  s.stop(t + 3.3);
}

whenAudioReady(startRain);
