import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOOKAHEAD_SECONDS, MAX_LATE_SECONDS, Transport, type TransportCallbacks } from '../src/audio/transport';

// The transport against a fake audio clock: `ctx.currentTime` is moved by hand
// and tick() is called directly (fake timers keep the fallback interval quiet).

interface Ev {
  absBeat: number;
}

interface Run {
  ctx: { currentTime: number };
  transport: Transport<Ev>;
  scheduled: { beat: number; when: number }[];
  calls: string[];
  /** Advance the clock in 25 ms worker ticks. */
  run(seconds: number): void;
}

const live: Transport<Ev>[] = [];

/** A provider with a note every quarter beat. */
function setup(extra: Partial<TransportCallbacks<Ev>> = {}): Run {
  const ctx = { currentTime: 10 };
  const scheduled: { beat: number; when: number }[] = [];
  const calls: string[] = [];
  const transport = new Transport<Ev>(ctx as unknown as BaseAudioContext, {
    provide: (from, to) => {
      const out: Ev[] = [];
      for (let k = Math.ceil(from * 4 - 1e-9) + 0; k / 4 < to - 1e-9; k++) out.push({ absBeat: k / 4 });
      return out;
    },
    schedule: (e, when) => scheduled.push({ beat: e.absBeat, when }),
    ...extra,
  });
  live.push(transport);
  const run = (seconds: number) => {
    const end = ctx.currentTime + seconds;
    while (ctx.currentTime < end - 1e-9) {
      ctx.currentTime += 0.025;
      transport.tick();
    }
  };
  return { ctx, transport, scheduled, calls, run };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const t of live.splice(0)) t.stop();
  vi.useRealTimers();
});

describe('Transport', () => {
  it('schedules every note exactly once, on time, across contiguous windows', () => {
    const r = setup();
    r.transport.setTempo(120);
    r.transport.start({ atTime: 10.05, fromBeat: 0 });
    r.run(6);
    const beats = r.scheduled.map((s) => s.beat);
    expect(new Set(beats).size).toBe(beats.length);
    expect(beats).toEqual(Array.from({ length: beats.length }, (_, i) => i / 4));
    for (const s of r.scheduled) expect(s.when).toBeCloseTo(r.transport.timeAt(s.beat), 9);
    expect(r.transport.scheduledUntil).toBeCloseTo(r.transport.beatAt(r.ctx.currentTime + LOOKAHEAD_SECONDS), 9);
  });

  it('drops notes that are too late after a stall instead of playing them in a burst', () => {
    const r = setup();
    r.transport.start({ atTime: 10.05, fromBeat: 0 });
    r.run(1);
    const before = r.scheduled.length;
    // The main thread was blocked for 700 ms: no tick ran.
    r.ctx.currentTime += 0.7;
    r.transport.tick();
    const burst = r.scheduled.slice(before);
    for (const s of burst) expect(s.when - r.transport.timeAt(s.beat)).toBeLessThanOrEqual(MAX_LATE_SECONDS + 1e-9);
    const sameInstant = burst.filter((s) => s.when === r.ctx.currentTime).length;
    expect(sameInstant).toBeLessThanOrEqual(1);
    // …and the music carries on in time.
    r.run(1);
    for (const s of r.scheduled.slice(before + burst.length)) expect(s.when).toBeCloseTo(r.transport.timeAt(s.beat), 9);
    const beats = r.scheduled.map((s) => s.beat);
    expect(new Set(beats).size).toBe(beats.length);
  });

  it('still plays beat 0 once when the start time lies in the past', () => {
    const r = setup();
    r.transport.start({ atTime: r.ctx.currentTime - 0.2, fromBeat: 0 });
    expect(r.scheduled[0]).toEqual({ beat: 0, when: r.ctx.currentTime });
    r.run(0.5);
    expect(r.scheduled.filter((s) => s.beat === 0)).toHaveLength(1);
    expect(r.transport.beatAt(r.ctx.currentTime)).toBeCloseTo((0.7 * 100) / 60, 9);
  });

  it('keeps the current beat when the tempo changes', () => {
    const r = setup();
    r.transport.start({ atTime: 10, fromBeat: 0 });
    r.run(1.5);
    const beat = r.transport.beatAt(r.ctx.currentTime);
    r.transport.setTempo(140);
    expect(r.transport.beatAt(r.ctx.currentTime)).toBeCloseTo(beat, 9);
    expect(r.transport.secondsPerBeat).toBeCloseTo(60 / 140, 9);
    r.run(1);
    const beats = r.scheduled.map((s) => s.beat);
    expect(new Set(beats).size).toBe(beats.length);
  });

  it('announces the ending once, on the last beat, before it has ended', () => {
    const calls: string[] = [];
    const r = setup({
      ending: (when) => calls.push(`ending@${when.toFixed(6)}`),
      ended: () => calls.push('ended'),
    });
    r.transport.start({ atTime: 10, fromBeat: 0, endBeat: 4 });
    r.run(3.5);
    const end = r.transport.timeAt(4);
    expect(calls).toEqual([`ending@${end.toFixed(6)}`, 'ended']);
    expect(r.transport.playing).toBe(false);
    expect(Math.max(...r.scheduled.map((s) => s.beat))).toBe(3.75);
  });

  it('starts from any beat (a pickup or a later column)', () => {
    const r = setup();
    r.transport.start({ atTime: 10.04, fromBeat: 3 });
    expect(r.scheduled[0].beat).toBe(3);
    expect(r.scheduled[0].when).toBeCloseTo(10.04, 9);
  });
});
