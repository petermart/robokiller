// Robo speech: your mic → text (Web Speech API, as in the video-analyzer extension) →
// everyone nearby hears it in a robot TTS voice. Nobody hears your real voice.
//
// The voice pitch comes from the *displayed* colour, so a disguised impostor sounds
// exactly like the robot they are impersonating.

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

export class RoboSpeech {
  private rec: Rec | null = null;
  private holding = false;
  private finalText = "";
  private interim = "";
  private voice: SpeechSynthesisVoice | null = null;
  onText: (text: string) => void = () => {};
  onPartial: (text: string) => void = () => {};
  error = "";

  static supported(): boolean {
    return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  constructor() {
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      // A plain local English voice; every robot shares it so nobody is identifiable.
      this.voice =
        vs.find((v) => /en/i.test(v.lang) && v.localService && /david|mark|daniel|alex|fred/i.test(v.name)) ??
        vs.find((v) => /en/i.test(v.lang) && v.localService) ??
        vs.find((v) => /en/i.test(v.lang)) ??
        null;
    };
    pick();
    speechSynthesis.onvoiceschanged = pick;
  }

  private build(): Rec | null {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      this.error = "This browser has no speech recognition — use Chrome or Edge.";
      return null;
    }
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
      this.error = String(e.error);
    };
    r.onend = () => {
      // Chrome ends sessions on a pause; restart while the key is still held.
      if (this.holding) {
        try {
          r.start();
        } catch {}
        return;
      }
      this.flush();
    };
    return r;
  }

  start() {
    if (this.holding) return;
    this.holding = true;
    this.finalText = "";
    this.interim = "";
    this.rec ??= this.build();
    try {
      this.rec?.start();
    } catch {}
  }

  stop() {
    if (!this.holding) return;
    this.holding = false;
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

  speak(text: string, color: number, volume: number) {
    if (volume <= 0.02) return;
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.pitch = 0.15 + ((color * 7) % 10) * 0.17; // spread colours across 0.15–1.7
    u.rate = 1.08;
    u.volume = Math.min(1, volume);
    speechSynthesis.speak(u);
  }
}
