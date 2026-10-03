// Cheap "lip sync" from an AnalyserNode: how loud the voice is right now (mouth opening),
// and how bright it is (wide "ee"/"s" sounds vs round "oo"/"ah"). No speech model needed.

const timeBuf = new Float32Array(1024);
const freqBuf = new Uint8Array(512);

export interface Mouth {
  /** 0 = silent, 1 = shouting. */
  level: number;
  /** 0 = dark/round vowel, 1 = bright/hissy. */
  bright: number;
}

export const SILENT: Mouth = { level: 0, bright: 0.5 };

export function measure(an: AnalyserNode | null | undefined): Mouth {
  if (!an) return SILENT;
  const n = Math.min(an.fftSize, timeBuf.length);
  const t = timeBuf.subarray(0, n);
  an.getFloatTimeDomainData(t);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += t[i]! * t[i]!;
  const rms = Math.sqrt(sum / n);
  const level = Math.max(0, Math.min(1, (rms - 0.012) * 5));
  if (level === 0) return SILENT;

  // spectral centroid over the speech band (up to ~5 kHz)
  const bins = Math.min(an.frequencyBinCount, freqBuf.length);
  const f = freqBuf.subarray(0, bins);
  an.getByteFrequencyData(f);
  const top = Math.min(bins, Math.round((5000 / (an.context.sampleRate / 2)) * bins));
  let num = 0, den = 0;
  for (let i = 1; i < top; i++) {
    num += i * f[i]!;
    den += f[i]!;
  }
  const bright = den ? Math.max(0, Math.min(1, (num / den / top - 0.12) * 2.5)) : 0.5;
  return { level, bright };
}
