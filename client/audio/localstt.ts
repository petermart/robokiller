// On-device speech-to-text: the fallback for browsers without the Web Speech API
// (Firefox, Brave, some Safari setups). Moonshine-tiny via transformers.js, run in a
// Web Worker so transcription never stalls the game.
//
// Nothing here is bundled: the library comes from a CDN and the ~28 MB model from the
// Hugging Face hub, both only when this fallback is actually needed. The browser caches
// the model, so it's a one-time download.

import { audio } from "./sound.ts";

const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0";
const MODEL = "onnx-community/moonshine-tiny-ONNX";
const RATE = 16000;
const MAX_SECONDS = 20;

const WORKER = `
import { pipeline, env } from "${LIB}";
env.allowLocalModels = false;
let asr = null;
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === "load") {
      asr = await pipeline("automatic-speech-recognition", "${MODEL}", {
        device: "wasm",
        dtype: "q8",
        progress_callback: (p) => {
          if (p.status === "progress" && p.total) self.postMessage({ type: "progress", file: p.file, loaded: p.loaded, total: p.total });
        },
      });
      self.postMessage({ type: "ready" });
    } else if (m.type === "transcribe") {
      const out = await asr(m.audio);
      self.postMessage({ type: "text", id: m.id, text: String(out.text || "").trim() });
    }
  } catch (err) {
    self.postMessage({ type: "error", id: m.id, error: String((err && err.message) || err) });
  }
};`;

export type LocalStatus = "idle" | "loading" | "ready" | "error";

export class LocalSTT {
  status: LocalStatus = "idle";
  /** 0..1 while the model downloads. */
  progress = 0;
  error = "";
  onChange: () => void = () => {};

  private worker: Worker | null = null;
  private files = new Map<string, { loaded: number; total: number }>();
  private seq = 0;
  private waiting = new Map<number, (text: string) => void>();
  // capture
  private source: MediaStreamAudioSourceNode | null = null;
  private proc: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private captured = 0;

  /** Start the background download. Safe to call repeatedly; never blocks. */
  load() {
    if (this.worker) return;
    this.status = "loading";
    this.onChange();
    try {
      const url = URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" }));
      this.worker = new Worker(url, { type: "module" });
    } catch (e) {
      this.fail(`Couldn't start the speech worker: ${(e as Error).message}`);
      return;
    }
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") {
        this.files.set(m.file, { loaded: m.loaded, total: m.total });
        let l = 0, t = 0;
        for (const f of this.files.values()) {
          l += f.loaded;
          t += f.total;
        }
        this.progress = t ? l / t : 0;
        this.onChange();
      } else if (m.type === "ready") {
        this.status = "ready";
        this.progress = 1;
        this.onChange();
      } else if (m.type === "text") {
        this.waiting.get(m.id)?.(m.text);
        this.waiting.delete(m.id);
      } else if (m.type === "error") {
        if (m.id !== undefined && this.waiting.has(m.id)) {
          this.waiting.get(m.id)!("");
          this.waiting.delete(m.id);
        } else this.fail(m.error);
      }
    };
    this.worker.onerror = (e) => this.fail(e.message || "speech worker crashed");
    this.worker.postMessage({ type: "load" });
  }

  private fail(msg: string) {
    this.status = "error";
    this.error = msg;
    this.onChange();
  }

  get recording() {
    return !!this.proc;
  }

  /** Begin capturing the mic (push-to-talk down). */
  begin(stream: MediaStream) {
    if (this.proc || this.status !== "ready") return false;
    const ctx = audio();
    this.chunks = [];
    this.captured = 0;
    this.source = ctx.createMediaStreamSource(stream);
    // ScriptProcessor is deprecated but runs everywhere, which is the point of a fallback.
    this.proc = ctx.createScriptProcessor(4096, 1, 1);
    const silent = ctx.createGain();
    silent.gain.value = 0;
    this.proc.onaudioprocess = (e) => {
      if (this.captured > MAX_SECONDS * ctx.sampleRate) return;
      const data = e.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(data));
      this.captured += data.length;
    };
    this.source.connect(this.proc);
    this.proc.connect(silent).connect(ctx.destination); // a processor only runs when connected
    return true;
  }

  /** Stop capturing and transcribe what was said (push-to-talk up). */
  async end(): Promise<string> {
    if (!this.proc || !this.source || !this.worker) return "";
    const ctx = audio();
    this.source.disconnect();
    this.proc.disconnect();
    this.proc.onaudioprocess = null;
    this.proc = null;
    this.source = null;
    if (this.captured < ctx.sampleRate * 0.3) return ""; // a tap, not speech

    const all = new Float32Array(this.captured);
    let off = 0;
    for (const c of this.chunks) {
      all.set(c.subarray(0, Math.min(c.length, all.length - off)), off);
      off += c.length;
      if (off >= all.length) break;
    }
    this.chunks = [];
    const pcm = await resample(all, ctx.sampleRate, RATE);
    const id = ++this.seq;
    return new Promise((res) => {
      this.waiting.set(id, res);
      this.worker!.postMessage({ type: "transcribe", id, audio: pcm }, [pcm.buffer]);
    });
  }
}

async function resample(input: Float32Array<ArrayBuffer>, from: number, to: number): Promise<Float32Array<ArrayBuffer>> {
  if (from === to) return input;
  const frames = Math.ceil((input.length * to) / from);
  const off = new OfflineAudioContext(1, frames, to);
  const buf = off.createBuffer(1, input.length, from);
  buf.copyToChannel(input, 0);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  return out.getChannelData(0).slice();
}
