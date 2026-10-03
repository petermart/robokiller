// Game sound effects, each built from a couple of oscillators and filtered noise.

import { audio, buses, env, noiseBuffers } from "../context.ts";

export type SfxKind = "boom" | "shot" | "task" | "alarm" | "vent" | "blip" | "elevator" | "deny";

export function sfx(kind: SfxKind, vol = 1) {
  const c = audio();
  const t = c.currentTime;
  const out = c.createGain();
  out.gain.value = vol;
  out.connect(buses().sfx);
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
    s.buffer = noiseBuffers().white;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = env(v, t + at, 0.003, dur);
    s.connect(f).connect(g).connect(out);
    s.start(t + at, Math.random());
    s.stop(t + at + dur + 0.02);
  };
  switch (kind) {
    case "boom": // a robot exploding
      noise("lowpass", 600, 0, 1.2, 1.2);
      osc("sine", 120, 30, 0, 0.6, 1);
      osc("square", 880, 110, 0, 0.25, 0.15);
      break;
    case "shot": // sniper crack, body, and a tail echoing off the towers
      noise("highpass", 1500, 0, 0.12, 1);
      noise("lowpass", 800, 0, 0.6, 0.5);
      noise("bandpass", 3000, 0.25, 0.4, 0.15);
      break;
    case "task": // need fulfilled: a rising arpeggio
      [523, 659, 784, 1046].forEach((f, i) => osc("square", f, f, i * 0.07, 0.12, 0.15));
      break;
    case "alarm": // emergency meeting two-tone
      for (let i = 0; i < 4; i++) {
        osc("square", 880, 880, i * 0.36, 0.17, 0.2);
        osc("square", 660, 660, i * 0.36 + 0.18, 0.17, 0.2);
      }
      break;
    case "vent": // hatch clank
      noise("bandpass", 1800, 0, 0.15, 0.7);
      osc("triangle", 220, 90, 0, 0.2, 0.5);
      break;
    case "elevator": // ding-dong
      osc("sine", 1318, 1318, 0, 0.4, 0.25);
      osc("sine", 1046, 1046, 0.25, 0.6, 0.25);
      break;
    case "blip": // UI click
      osc("square", 1200, 1600, 0, 0.05, 0.08);
      break;
    case "deny": // can't do that
      osc("square", 220, 180, 0, 0.15, 0.12);
      break;
  }
}
