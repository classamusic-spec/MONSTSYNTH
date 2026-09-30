// ─────────────────────────────────────────────────────────────────────────────
// Transport: the "two clocks" look-ahead scheduler.
// A worker timer wakes us every 25 ms (workers keep ticking while the main thread
// is busy animating); each tick schedules every event in the next ~120 ms at a
// sample-accurate AudioContext time. Musical decisions come from a provider
// callback, so this file knows nothing about songs.
// ─────────────────────────────────────────────────────────────────────────────

export const LOOKAHEAD_SECONDS = 0.12;
const TICK_MS = 25;

interface Clock {
  start(): void;
  stop(): void;
}

function createClock(onTick: () => void): Clock {
  try {
    const src =
      'let id=null;onmessage=function(e){if(e.data==="start"){if(id===null)id=setInterval(function(){postMessage(0)},' +
      TICK_MS +
      ')}else{clearInterval(id);id=null}}';
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.onmessage = () => onTick();
    return {
      start: () => worker.postMessage('start'),
      stop: () => worker.postMessage('stop'),
    };
  } catch {
    // Some embedded contexts forbid blob workers; a main-thread timer still works.
    let id: ReturnType<typeof setInterval> | null = null;
    return {
      start: () => {
        if (id === null) id = setInterval(onTick, TICK_MS);
      },
      stop: () => {
        if (id !== null) clearInterval(id);
        id = null;
      },
    };
  }
}

export interface TransportCallbacks<E extends { absBeat: number }> {
  /** Events whose start lies in [fromBeat, toBeat). */
  provide(fromBeat: number, toBeat: number): E[];
  /** Schedule one event at an AudioContext time. */
  schedule(event: E, when: number): void;
  /** Called once when a finite (song) playback reaches its end. */
  ended?(): void;
}

export class Transport<E extends { absBeat: number }> {
  playing = false;
  private startTime = 0;
  private scheduledBeat = 0;
  private endBeat: number | null = null;
  private tempo = 100;
  private clock: Clock;
  private endNotified = false;

  constructor(
    private ctx: BaseAudioContext,
    private cb: TransportCallbacks<E>,
  ) {
    this.clock = createClock(() => this.tick());
  }

  get secondsPerBeat(): number {
    return 60 / this.tempo;
  }

  get bpm(): number {
    return this.tempo;
  }

  /** Transport beat at an AudioContext time (can be negative before the start). */
  beatAt(time: number): number {
    return (time - this.startTime) / this.secondsPerBeat;
  }

  timeAt(beat: number): number {
    return this.startTime + beat * this.secondsPerBeat;
  }

  get songEnd(): number | null {
    return this.endBeat;
  }

  start(opts: { atTime?: number; fromBeat?: number; endBeat?: number | null } = {}) {
    const at = opts.atTime ?? this.ctx.currentTime + 0.03;
    const from = opts.fromBeat ?? 0;
    this.startTime = at - from * this.secondsPerBeat;
    this.scheduledBeat = from;
    this.endBeat = opts.endBeat ?? null;
    this.endNotified = false;
    this.playing = true;
    this.clock.start();
    this.tick();
  }

  stop() {
    this.playing = false;
    this.clock.stop();
  }

  setTempo(bpm: number) {
    if (this.playing) {
      const now = this.ctx.currentTime;
      const beat = this.beatAt(now);
      this.tempo = bpm;
      this.startTime = now - beat * this.secondsPerBeat;
    } else {
      this.tempo = bpm;
    }
  }

  tick() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    let to = this.beatAt(now + LOOKAHEAD_SECONDS);
    if (this.endBeat !== null) to = Math.min(to, this.endBeat);
    if (to > this.scheduledBeat) {
      const events = this.cb.provide(this.scheduledBeat, to);
      for (const e of events) this.cb.schedule(e, Math.max(now, this.timeAt(e.absBeat)));
      this.scheduledBeat = to;
    }
    if (this.endBeat !== null && !this.endNotified && now >= this.timeAt(this.endBeat)) {
      this.endNotified = true;
      this.stop();
      this.cb.ended?.();
    }
  }
}
