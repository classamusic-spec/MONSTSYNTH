// ─────────────────────────────────────────────────────────────────────────────
// Mimic's ears. Records a short sound from the microphone, then:
//   mono → trim leading/trailing silence → cap length → normalise → soft fades.
// Recordings never leave the device (they are stored in IndexedDB only).
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_VOICE_SECONDS = 3;

export function micSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined'
  );
}

export class MicCapture {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private levelData: Float32Array<ArrayBuffer> | null = null;

  constructor(private ctx: AudioContext) {}

  /** Ask for the microphone (the browser shows its own permission prompt). */
  async open(): Promise<void> {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
    });
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.source.connect(this.analyser);
  }

  /** Live input level 0..1 so Mimic's ears can react while a child speaks. */
  level(): number {
    if (!this.analyser) return 0;
    if (!this.levelData) this.levelData = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(this.levelData);
    let peak = 0;
    for (let i = 0; i < this.levelData.length; i++) peak = Math.max(peak, Math.abs(this.levelData[i]));
    return Math.min(1, peak * 1.4);
  }

  start() {
    if (!this.stream) throw new Error('microphone not open');
    this.chunks = [];
    const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported?.(t));
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
  }

  async stop(): Promise<AudioBuffer | null> {
    const rec = this.recorder;
    if (!rec) return null;
    const done = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });
    if (rec.state !== 'inactive') rec.stop();
    await done;
    this.recorder = null;
    const blob = new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' });
    if (blob.size === 0) return null;
    const raw = await this.ctx.decodeAudioData(await blob.arrayBuffer());
    return processVoice(this.ctx, raw);
  }

  close() {
    try {
      this.recorder?.stop();
    } catch {
      /* ignore */
    }
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.recorder = null;
  }
}

/** Pure processing step — exported for tests and for offline use. */
export function processSamples(input: Float32Array, sampleRate: number): Float32Array<ArrayBuffer> | null {
  const win = Math.max(1, Math.floor(sampleRate * 0.01));
  const rms: number[] = [];
  let peakRms = 0;
  for (let i = 0; i < input.length; i += win) {
    let sum = 0;
    const end = Math.min(input.length, i + win);
    for (let j = i; j < end; j++) sum += input[j] * input[j];
    const r = Math.sqrt(sum / Math.max(1, end - i));
    rms.push(r);
    peakRms = Math.max(peakRms, r);
  }
  if (peakRms < 0.004) return null; // silence: nothing to copy
  const threshold = Math.max(0.003, peakRms * 0.08);
  const first = rms.findIndex((r) => r > threshold);
  let last = rms.length - 1;
  while (last > first && rms[last] <= threshold) last--;
  const start = Math.max(0, first * win - Math.floor(sampleRate * 0.03));
  const stop = Math.min(input.length, (last + 1) * win + Math.floor(sampleRate * 0.08));
  const length = Math.min(stop - start, Math.floor(sampleRate * MAX_VOICE_SECONDS));
  if (length < sampleRate * 0.06) return null;

  const out = new Float32Array(length);
  let peak = 0;
  for (let i = 0; i < length; i++) {
    out[i] = input[start + i];
    peak = Math.max(peak, Math.abs(out[i]));
  }
  const gain = peak > 0 ? 0.89 / peak : 1;
  const fadeIn = Math.floor(sampleRate * 0.008);
  const fadeOut = Math.floor(sampleRate * 0.025);
  for (let i = 0; i < length; i++) {
    let g = gain;
    if (i < fadeIn) g *= i / fadeIn;
    if (i > length - fadeOut) g *= (length - i) / fadeOut;
    out[i] *= g;
  }
  return out;
}

export function processVoice(ctx: BaseAudioContext, raw: AudioBuffer): AudioBuffer | null {
  const n = raw.length;
  const mono = new Float32Array(n);
  for (let ch = 0; ch < raw.numberOfChannels; ch++) {
    const d = raw.getChannelData(ch);
    for (let i = 0; i < n; i++) mono[i] += d[i] / raw.numberOfChannels;
  }
  const processed = processSamples(mono, raw.sampleRate);
  if (!processed) return null;
  const buf = ctx.createBuffer(1, processed.length, raw.sampleRate);
  buf.copyToChannel(processed, 0);
  return buf;
}
