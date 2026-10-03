// Speech synthesis worker: eSpeak (via meSpeak) turns text into a WAV, off the main
// thread so a long sentence never stalls the game. The robot effects and proximity are
// applied afterwards in the main thread (./effects.ts, ./index.ts).
//
// The server bundles this file on startup and serves it at /robovoice-worker.js, so it
// only downloads when robo speech is actually on. eSpeak is GPL-licensed.

import meSpeak from "mespeak";
import config from "mespeak/src/mespeak_config.json";
import enUS from "mespeak/voices/en/en-us.json";

export interface SynthRequest {
  id: number;
  text: string;
  /** eSpeak pitch 0–99 (50 is a normal voice; robots sit low). */
  pitch: number;
  /** Words per minute. */
  speed: number;
  /** eSpeak voice variant, e.g. "m3", "klatt". */
  variant: string;
}

export type SynthReply = { id: number; wav: ArrayBuffer } | { id: number; error: string };

const scope = self as unknown as {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<SynthRequest>) => void) | null;
};

meSpeak.loadConfig(config);
meSpeak.loadVoice(enUS);

scope.onmessage = (e) => {
  const { id, text, pitch, speed, variant } = e.data;
  try {
    const wav: ArrayBuffer | null = meSpeak.speak(text, {
      rawdata: "arraybuffer",
      amplitude: 100,
      pitch,
      speed,
      variant,
      wordgap: 1,
    });
    if (!wav) throw new Error("eSpeak returned nothing");
    scope.postMessage({ id, wav } satisfies SynthReply, [wav]);
  } catch (err) {
    scope.postMessage({ id, error: String((err as Error)?.message ?? err) } satisfies SynthReply);
  }
};
