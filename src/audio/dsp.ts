// ─────────────────────────────────────────────────────────────────────────────
// Small DSP toolkit shared by every voice. Works on any BaseAudioContext so the
// same code renders live (AudioContext) and offline (OfflineAudioContext export).
// ─────────────────────────────────────────────────────────────────────────────

export interface Env {
  a: number;
  d: number;
  s: number;
  r: number;
}

export function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type HoldableParam = AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };

/** Freeze a parameter at time `t` so a new ramp can start from wherever it is. */
export function holdAt(param: AudioParam, t: number): void {
  const p = param as HoldableParam;
  if (typeof p.cancelAndHoldAtTime === 'function') {
    p.cancelAndHoldAtTime(t);
  } else {
    const v = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
  }
}

/** Attack → decay → sustain, starting from silence at `t`. */
export function envelopeOn(param: AudioParam, t: number, env: Env, peak: number): void {
  const a = Math.max(0.002, env.a);
  param.cancelScheduledValues(t);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  if (env.s < 0.999) param.setTargetAtTime(peak * env.s, t + a, Math.max(0.005, env.d / 3));
}

/** Release towards silence. Returns the time after which the sound is inaudible. */
export function envelopeOff(param: AudioParam, t: number, release: number, hold = true): number {
  const r = Math.max(0.01, release);
  if (hold) holdAt(param, t);
  param.setTargetAtTime(0, t, r / 5);
  return t + r * 1.25 + 0.03;
}

/** Fast fade used when a voice is stolen or the transport stops (no clicks). */
export function fadeOut(param: AudioParam, t: number, fade: number): number {
  holdAt(param, t);
  param.linearRampToValueAtTime(0, t + Math.max(0.005, fade));
  return t + fade + 0.01;
}

// ── Shared buffers & curves (cached per context) ─────────────────────────────

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    const length = Math.floor(ctx.sampleRate * 2);
    buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < length; i++) {
      // Deterministic white noise (xorshift) so offline renders are repeatable.
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      data[i] = ((seed >>> 0) / 4294967296) * 2 - 1;
    }
    noiseCache.set(ctx, buf);
  }
  return buf;
}

export function noiseSource(ctx: BaseAudioContext, loop = true): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = loop;
  return src;
}

/** tanh saturation curve. `amount` 0..1 bends it from almost-linear to warm crunch. */
export function saturationCurve(amount: number, size = 2048): Float32Array<ArrayBuffer> {
  const k = 1 + amount * 6;
  const curve = new Float32Array(size);
  const norm = Math.tanh(k);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

/** Gentle master soft-clip: transparent below about -6 dBFS, rounds off anything hotter. */
export function softClipCurve(size = 4096): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const ax = Math.abs(x);
    const y = ax < 0.5 ? ax : 0.5 + 0.5 * Math.tanh((ax - 0.5) / 0.5);
    curve[i] = Math.sign(x) * Math.min(0.98, y);
  }
  return curve;
}

/**
 * Procedural stereo impulse response for Gloop's reverb: early reflections plus a
 * dense tail that darkens as it decays (like a real room). No audio files needed.
 */
export function impulseResponse(ctx: BaseAudioContext, seconds = 2.6, decayRate = 3.0): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, length, rate);
  const reflections = [
    [0.0071, 0.55],
    [0.0113, 0.42],
    [0.0187, 0.35],
    [0.0263, 0.28],
    [0.0341, 0.22],
    [0.0457, 0.18],
  ];
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let seed = ch === 0 ? 12345 : 67890;
    let lp = 0;
    let energy = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const white = ((seed >>> 0) / 4294967296) * 2 - 1;
      // High frequencies die first: the smoothing coefficient shrinks over time.
      const cutoff = 9000 * Math.exp(-t * 1.6) + 900;
      const a = 1 - Math.exp((-2 * Math.PI * cutoff) / rate);
      lp += a * (white - lp);
      const fadeIn = 1 - Math.exp(-t / 0.004);
      const v = lp * Math.exp(-t * decayRate) * fadeIn;
      data[i] = v;
      energy += v * v;
    }
    for (const [time, gain] of reflections) {
      const idx = Math.floor((time + (ch ? 0.0023 : 0)) * rate);
      if (idx < length) data[idx] += gain * (ch ? -1 : 1) * 0.5;
    }
    const norm = 1 / Math.sqrt(energy / rate + 1e-9);
    for (let i = 0; i < length; i++) data[i] *= norm * 0.12;
  }
  return buf;
}

/** A damped spring pitch curve for Boom's "boing". */
export function boingCurve(base: number, seconds: number, points = 128): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const t = (i / (points - 1)) * seconds;
    curve[i] = Math.max(30, base * (1 + 0.55 * Math.exp(-4.5 * t) * Math.sin(2 * Math.PI * 9 * t)));
  }
  return curve;
}

/** Vowel formants (Hz) used by Mimic's singing voice and Puff's choir. */
export const VOWELS: { f: [number, number, number]; g: [number, number, number] }[] = [
  { f: [300, 870, 2240], g: [1, 0.35, 0.12] }, // u  (dark)
  { f: [570, 840, 2410], g: [1, 0.45, 0.15] }, // o
  { f: [730, 1090, 2440], g: [1, 0.5, 0.2] }, // a
  { f: [530, 1840, 2480], g: [1, 0.4, 0.22] }, // e
  { f: [270, 2290, 3010], g: [1, 0.3, 0.2] }, // i  (sparkly)
];

/** Morph between vowels with `tone` -1 (u) … +1 (i). */
export function vowelAt(tone: number): { f: number[]; g: number[] } {
  const pos = (clamp(tone, -1, 1) + 1) * 2; // 0..4
  const i = Math.min(3, Math.floor(pos));
  const t = pos - i;
  const a = VOWELS[i];
  const b = VOWELS[i + 1];
  return {
    f: a.f.map((v, k) => v + (b.f[k] - v) * t),
    g: a.g.map((v, k) => v + (b.g[k] - v) * t),
  };
}
