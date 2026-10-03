// Robo speech, the listening half: your mic → text, which is sent to everyone nearby and
// spoken by ./robovoice/ in a robot voice. Nobody hears your real voice.
//
// Two speech-to-text engines:
//  1. The browser's Web Speech API (free, streams words as you talk) — Chrome, Edge, Safari.
//  2. If that's missing or refused (Firefox, Brave…), an on-device model (LocalSTT) that
//     downloads in the background. The game is fully playable meanwhile; only talking
//     waits until the model is ready.

import { LocalSTT } from "./localstt.ts";

type Rec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

/** Web Speech errors that mean "this browser won't do it" rather than "try again". */
const ENGINE_REFUSED = new Set(["network", "service-not-allowed", "language-not-supported"]);

export class RoboSpeech {
  private rec: Rec | null = null;
  private holding = false;
  private finalText = "";
  private interim = "";
  readonly local = new LocalSTT();
  /** Which engine robo speech uses. Starts on the browser's own if it has one. */
  engine: "web" | "local" = RoboSpeech.webSupported() ? "web" : "local";
  onText: (text: string) => void = () => {};
  onPartial: (text: string) => void = () => {};
  /** Engine or model status changed — redraw anything showing it. */
  onStatus: () => void = () => {};
  error = "";

  static webSupported(): boolean {
    return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  constructor(private getStream: () => Promise<MediaStream | null>) {
    this.local.onChange = () => this.onStatus();
  }

  /** Called when robo speech is switched on: warm up the fallback if we'll need it. */
  prepare() {
    if (this.engine === "local") this.local.load();
  }

  /** Short label for small buttons: "VOICE 43%", "VOICE…" once it's compiling. */
  get shortStatus(): string {
    const pct = Math.round(this.local.progress * 100);
    return this.local.status === "error" ? "VOICE ✕" : pct >= 99 ? "VOICE…" : `VOICE ${pct}%`;
  }

  /** Can the talk button be used right now? */
  get ready() {
    return this.engine === "web" || this.local.status === "ready";
  }

  /** Short human status for buttons and the lobby panel. */
  get statusText(): string {
    if (this.engine === "web") return "ready";
    switch (this.local.status) {
      case "ready":
        return "ready (on-device)";
      case "loading":
        // downloaded but still compiling the model takes a few more seconds
        return this.local.progress >= 0.99
          ? "starting voice model"
          : `loading voice model ${Math.round(this.local.progress * 100)}%`;
      case "error":
        return `voice model failed: ${this.local.error}`;
      default:
        return "voice model not loaded";
    }
  }

  private switchToLocal(reason: string) {
    if (this.engine === "local") return;
    this.engine = "local";
    this.error = reason;
    this.local.load();
    this.onStatus();
  }

  private build(): Rec | null {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return null;
    const r: Rec = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "en-US";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) this.finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      this.interim = interim;
      this.onPartial((this.finalText + " " + interim).trim());
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      // Brave and friends expose the API but refuse to run it: fall back for good.
      if (ENGINE_REFUSED.has(e.error)) {
        this.holding = false;
        this.switchToLocal(`browser speech unavailable (${e.error})`);
        this.onPartial("");
        return;
      }
      this.error = String(e.error);
    };
    r.onend = () => {
      // Chrome ends sessions on a pause; restart while the key is still held.
      if (this.holding && this.engine === "web") {
        try {
          r.start();
        } catch {}
        return;
      }
      this.flush();
    };
    return r;
  }

  /** Push-to-talk down. Returns false if we can't listen yet (model still loading). */
  start(): boolean {
    if (this.holding) return true;
    if (this.engine === "local") {
      this.local.load();
      if (this.local.status !== "ready") return false;
      this.holding = true;
      void this.getStream().then((stream) => {
        if (!stream || !this.holding) {
          this.holding = false;
          return;
        }
        this.local.begin(stream);
        this.onPartial("…");
      });
      return true;
    }
    this.holding = true;
    this.finalText = "";
    this.interim = "";
    this.rec ??= this.build();
    try {
      this.rec?.start();
    } catch {}
    return true;
  }

  /** Push-to-talk up. */
  stop() {
    if (!this.holding) return;
    this.holding = false;
    if (this.engine === "local") {
      if (!this.local.recording) return;
      this.onPartial("transcribing…");
      void this.local.end().then((text) => {
        this.onPartial("");
        if (text) this.onText(text);
      });
      return;
    }
    try {
      this.rec?.stop();
    } catch {
      this.flush();
    }
  }

  get active() {
    return this.holding;
  }

  private flush() {
    // Chrome sometimes ends before promoting the last interim result to final.
    const text = (this.finalText + " " + this.interim).trim();
    this.finalText = "";
    this.interim = "";
    if (text) this.onText(text);
  }

}
