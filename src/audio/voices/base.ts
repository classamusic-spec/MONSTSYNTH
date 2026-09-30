// Shared voice plumbing: every sounding note is a Voice with a tiny lifecycle.

export interface VoiceHost {
  ctx: BaseAudioContext;
  /** Channel input the voice feeds. */
  dest: AudioNode;
  /** Channel "Wiggle" LFO (in cents). Voices plug their oscillator detune into it. */
  wiggle: AudioNode | null;
  tempo: number;
  /** Mimic's recorded voice, if any. */
  sample: AudioBuffer | null;
}

export interface VoiceParams {
  /** Pitches in MIDI (several for Puff's chords). Ignored by drums. */
  midi: number[];
  /** Drum pad index. */
  pad: number;
  /** Semitone offset (drum tuning from squishing Boom, Mimic key transposition). */
  bend: number;
  vel: number;
  /** Dark ↔ Sparkly, -1..1. */
  tone: number;
  /** Squished ↔ Stretched, -1..1 (short/tight ↔ long/open). */
  size: number;
}

export interface Voice {
  readonly channelId: string;
  readonly startTime: number;
  /** Time after which the voice is silent. */
  endTime: number;
  sequenced: boolean;
  release(when: number): void;
  kill(when: number, fade?: number): void;
  setPitch(midi: number[], when: number): void;
  setTone(tone: number, when: number): void;
  onEnded: (() => void) | null;
}

/** Tracks every node a voice creates so it can be torn down completely. */
export class NodeBag {
  private nodes: AudioNode[] = [];
  private sources: AudioScheduledSourceNode[] = [];
  private params: { from: AudioNode; to: AudioParam }[] = [];
  private stopped = false;
  private disposed = false;

  add<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  source<T extends AudioScheduledSourceNode>(node: T): T {
    this.sources.push(node);
    this.nodes.push(node);
    return node;
  }

  /** Connect a shared modulator (e.g. the channel's Wiggle LFO) to a param of this voice. */
  modulate(from: AudioNode | null, to: AudioParam) {
    if (!from) return;
    from.connect(to);
    this.params.push({ from, to });
  }

  start(when: number) {
    for (const s of this.sources) s.start(when);
  }

  stop(when: number) {
    if (this.stopped) return;
    this.stopped = true;
    for (const s of this.sources) {
      try {
        s.stop(when);
      } catch {
        /* already stopped */
      }
    }
  }

  /** Re-schedule the stop time (a later noteOff). */
  restop(when: number) {
    for (const s of this.sources) {
      try {
        s.stop(when);
      } catch {
        /* some browsers only allow one stop() */
      }
    }
    this.stopped = true;
  }

  onEnded(cb: () => void) {
    const first = this.sources[0];
    if (first) first.onended = cb;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const { from, to } of this.params) {
      try {
        from.disconnect(to);
      } catch {
        /* already gone */
      }
    }
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* already gone */
      }
    }
    this.nodes = [];
    this.sources = [];
    this.params = [];
  }
}

export function velocityGain(vel: number): number {
  const v = Math.min(1, Math.max(0, vel));
  return 0.35 + 0.65 * v * v;
}
