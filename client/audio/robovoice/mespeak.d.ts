// meSpeak ships no types; this is the slice of its API the voice worker uses.
declare module "mespeak" {
  interface SpeakOptions {
    rawdata?: "arraybuffer" | "array" | "base64" | "mime";
    amplitude?: number;
    pitch?: number;
    speed?: number;
    variant?: string;
    wordgap?: number;
    voice?: string;
  }
  const meSpeak: {
    loadConfig(config: object | string): void;
    loadVoice(voice: object | string, cb?: (ok: boolean, id: string) => void): void;
    speak(text: string, opts?: SpeakOptions): any;
    isConfigLoaded(): boolean;
  };
  export default meSpeak;
}
