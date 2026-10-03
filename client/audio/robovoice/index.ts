// Robo voice playback: text → eSpeak WAV (worker) → robot effects → per-speaker
// proximity gain + stereo pan → speakers. Because the audio runs through Web Audio (unlike
// the browser's speechSynthesis), it works the same on every device, sounds like a robot,
// and fades/pans live as the speaker walks around — the same mix as voice chat.

import { audio, buses } from "../context.ts";
import { measure, type Mouth } from "../levels.ts";
import { robotChain, voiceFor } from "./effects.ts";
import type { SynthReply, SynthRequest } from "./worker.ts";

interface Speaker {
  /** Where this robot's lines enter (before proximity) — measured for its mouth. */
  input: GainNode;
  meter: AnalyserNode;
  gain: GainNode;
  pan: StereoPannerNode;
}

export class RoboVoice {
  status: "idle" | "loading" | "ready" | "error" = "idle";
  error = "";
  private worker: Worker | null = null;
  private seq = 0;
  private waiting = new Map<number, (r: SynthReply) => void>();
  private speakers = new Map<string, Speaker>();
  onStatus: () => void = () => {};

  /** Start fetching the synthesizer (≈0.7 MB, cached). Safe to call repeatedly. */
  load() {
    if (this.worker) return;
    this.status = "loading";
    try {
      this.worker = new Worker("/robovoice-worker.js");
    } catch (e) {
      this.fail((e as Error).message);
      return;
    }
    this.worker.onmessage = (e: MessageEvent<SynthReply>) => {
      const r = e.data;
      if (this.status !== "ready") {
        this.status = "ready";
        this.onStatus();
      }
      this.waiting.get(r.id)?.(r);
      this.waiting.delete(r.id);
    };
    this.worker.onerror = (e) => this.fail(e.message || "voice worker failed");
    // A first tiny synth both warms the engine up and tells us it loaded.
    void this.synth(".", 0);
  }

  private fail(msg: string) {
    this.status = "error";
    this.error = msg;
    this.onStatus();
  }

  private synth(text: string, color: number): Promise<SynthReply> {
    this.load();
    const v = voiceFor(color);
    const id = ++this.seq;
    return new Promise((res) => {
      this.waiting.set(id, res);
      const req: SynthRequest = { id, text, pitch: v.pitch, speed: v.speed, variant: v.variant };
      this.worker!.postMessage(req);
    });
  }

  private speaker(id: string): Speaker {
    let s = this.speakers.get(id);
    if (!s) {
      const ctx = audio();
      const input = ctx.createGain();
      const meter = ctx.createAnalyser();
      meter.fftSize = 1024;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      input.connect(meter);
      input.connect(gain).connect(pan).connect(buses().master);
      s = { input, meter, gain, pan };
      this.speakers.set(id, s);
    }
    return s;
  }

  /** Proximity mix for one robot, set every ~100 ms by the game (like voice chat). */
  setMix(id: string, gain: number, pan: number) {
    const s = this.speakers.get(id);
    if (!s) return;
    const t = s.gain.context.currentTime;
    s.gain.gain.setTargetAtTime(Number.isFinite(gain) ? gain : 0, t, 0.08);
    s.pan.pan.setTargetAtTime(Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0, t, 0.08);
  }

  /** Mouth shape of whatever this robot is saying right now. */
  mouth(id: string): Mouth {
    return measure(this.speakers.get(id)?.meter);
  }

  /** Speak `text` as robot `speakerId`, in the voice of `color` (its displayed colour). */
  async say(speakerId: string, text: string, color: number, initialGain = 0) {
    const s = this.speaker(speakerId);
    if (initialGain > 0 && s.gain.gain.value === 0) s.gain.gain.value = initialGain;
    const reply = await this.synth(text, color);
    if ("error" in reply) {
      fallbackSpeak(text, color, initialGain || s.gain.gain.value);
      return;
    }
    const ctx = audio();
    let buf: AudioBuffer;
    try {
      buf = await ctx.decodeAudioData(reply.wav);
    } catch {
      fallbackSpeak(text, color, initialGain || s.gain.gain.value);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const chain = robotChain(ctx, voiceFor(color));
    src.connect(chain.input);
    chain.output.connect(s.input);
    src.onended = () => setTimeout(() => chain.stop(), 300); // let the comb ring out
    src.start();
  }
}

/** Last resort if the synthesizer can't load: the browser's own voice (no effects). */
function fallbackSpeak(text: string, color: number, volume: number) {
  if (typeof speechSynthesis === "undefined" || volume <= 0.02) return;
  const u = new SpeechSynthesisUtterance(text);
  u.pitch = 0.15 + ((color * 7) % 10) * 0.08;
  u.rate = 1.0;
  u.volume = Math.min(1, volume);
  speechSynthesis.speak(u);
}
