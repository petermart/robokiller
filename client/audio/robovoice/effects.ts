// The robot effect chain for synthesized speech. Classic sci-fi recipe:
//   ring modulator  — multiplies the voice by a low sine: the "take me to your leader" warble
//   comb filter     — a very short echo with feedback: metallic, tin-can resonance
//   bit-crush       — a little stepped grit
//   band-limit      — tinny speaker grille: no deep bass, no air
// Every colour gets its own pitch and warble, so a disguised robot also *sounds* like
// the robot it's copying.

export interface VoiceParams {
  /** eSpeak pitch 0–99 (50 is a normal voice). */
  pitch: number;
  /** Words per minute. */
  speed: number;
  variant: string;
  /** Ring-modulator carrier, Hz: lower = slower, more menacing warble. */
  ring: number;
  /** Comb delay, seconds: sets the metallic "pipe" tone. */
  comb: number;
}

/** Deterministic voice for a robot colour (0–9). */
export function voiceFor(color: number): VoiceParams {
  const c = ((color % 10) + 10) % 10;
  return {
    pitch: 14 + ((c * 7) % 10) * 3, // 14–41: always low
    speed: 138 + (c % 3) * 10,
    variant: "m3",
    ring: 30 + ((c * 3) % 10) * 5, // 30–75 Hz
    comb: 0.0055 + ((c * 9) % 10) * 0.0004, // 5.5–9.1 ms
  };
}

/** A stepped transfer curve: quantizes amplitude for a lo-fi digital edge. */
function crushCurve(steps: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

/**
 * Build the chain for one utterance. Feed audio into `input`; `output` goes on to the
 * speaker's proximity gain. Call `stop()` when the line has finished.
 */
export function robotChain(ctx: BaseAudioContext, v: VoiceParams) {
  const input = ctx.createGain();

  // ring modulator, mixed with some dry signal so words stay intelligible
  const dry = ctx.createGain();
  dry.gain.value = 0.45;
  const ring = ctx.createGain();
  ring.gain.value = 0; // driven entirely by the carrier below
  const carrier = ctx.createOscillator();
  carrier.type = "sine";
  carrier.frequency.value = v.ring;
  carrier.connect(ring.gain);
  carrier.start();
  input.connect(dry);
  input.connect(ring);
  const ringOut = ctx.createGain();
  ringOut.gain.value = 0.9;
  ring.connect(ringOut);

  // comb filter: short delay fed back into itself
  const mix = ctx.createGain();
  dry.connect(mix);
  ringOut.connect(mix);
  const delay = ctx.createDelay(0.05);
  delay.delayTime.value = v.comb;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.5;
  mix.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  const combOut = ctx.createGain();
  mix.connect(combOut);
  delay.connect(combOut);

  // grit
  const crush = ctx.createWaveShaper();
  crush.curve = crushCurve(20);
  combOut.connect(crush);

  // tin-can speaker
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 230;
  const presence = ctx.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 1150;
  presence.Q.value = 1.1;
  presence.gain.value = 5;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3400;
  crush.connect(hp).connect(presence).connect(lp);

  const output = ctx.createGain();
  output.gain.value = 1.4;
  lp.connect(output);

  return {
    input,
    output,
    stop() {
      try {
        carrier.stop();
      } catch {}
      feedback.disconnect();
      output.disconnect();
    },
  };
}
