import { describe, expect, it } from 'vitest';
import { ALL_MONSTERS } from '../src/model/monsters';
import {
  LAUGHS,
  laughLength,
  laughNotes,
  laughPlan,
  NEW_TICKLE,
  TICKLE,
  tickleQuiet,
  tickleTap,
  WHEEE_GAP,
  type LaughKind,
  type TickleConfig,
  type TickleState,
} from '../src/magic/tickle';

const little = TICKLE.little;
const maker = TICKLE.maker;

/** Pokes at the given times; returns the outcomes and the final state. */
function poke(times: number[], cfg: TickleConfig = little, from: TickleState = NEW_TICKLE) {
  let state = from;
  const outs: string[] = [];
  for (const t of times) {
    const r = tickleTap(state, t, cfg);
    state = r.state;
    outs.push(r.out);
  }
  return { state, outs };
}

const every = (n: number, gap: number, start = 0) => Array.from({ length: n }, (_, i) => start + i * gap);

describe('tickle time: counting pokes', () => {
  it('four quick pokes are just notes; the fifth gives the giggles; more pokes keep them going', () => {
    const { outs, state } = poke(every(6, 100));
    expect(outs).toEqual(['none', 'none', 'none', 'none', 'giggly', 'more']);
    expect(state).toMatchObject({ giggly: true, level: 1 });
  });

  it('five pokes in just under the window count; spread a little wider they never do', () => {
    expect(poke(every(5, 495)).outs.at(-1)).toBe('giggly'); // 1980 ms
    expect(poke(every(12, 520)).outs).not.toContain('giggly'); // only 4 in any 2 s
  });

  it('a slow, steady rhythm never giggles, however long it goes on', () => {
    expect(poke(every(40, 600)).outs.every((o) => o === 'none')).toBe(true);
    // Quarter notes at 120 bpm are on the edge, and stay just under it.
    expect(poke(every(40, 500)).outs.every((o) => o === 'none')).toBe(true);
  });

  it('Monster Makers need more, faster pokes (fast drumming is not a tickle)', () => {
    expect(poke(every(7, 100), maker).outs).not.toContain('giggly');
    expect(poke(every(8, 100), maker).outs.at(-1)).toBe('giggly');
    // Steady eighths at 120 bpm (4 a second) never get there.
    expect(poke(every(40, 250), maker).outs).not.toContain('giggly');
  });

  it('each monster keeps its own count (states are separate values)', () => {
    let a = NEW_TICKLE;
    let b = NEW_TICKLE;
    for (const t of every(4, 100)) a = tickleTap(a, t, little).state;
    for (const t of every(4, 100, 50)) b = tickleTap(b, t, little).state;
    expect(a.giggly || b.giggly).toBe(false);
    expect(tickleTap(a, 500, little).out).toBe('giggly');
  });

  it('never mutates the state it is given, and ignores a stale or broken time', () => {
    const s = poke(every(3, 100)).state;
    const copy = JSON.parse(JSON.stringify(s));
    tickleTap(s, 400, little);
    tickleQuiet(s, 5000, little);
    expect(JSON.parse(JSON.stringify(s))).toEqual(copy);
    expect(tickleTap(s, Number.NaN, little)).toEqual({ state: s, out: 'none' });
    // A timestamp from before the last pokes counts once, not as a double.
    const back = tickleTap(s, 50, little).state;
    expect(back.taps.filter((t) => t > 50)).toHaveLength(0);
  });
});

describe('tickle time: the laugh', () => {
  const giggling = () => poke(every(5, 100)).state; // last poke at 400

  it('waits for quiet, then laughs at the level of the giggles', () => {
    const s = giggling();
    expect(tickleQuiet(s, 700, little)).toMatchObject({ out: 'none', waitMs: 150 });
    const r = tickleQuiet(s, 850, little);
    expect(r).toMatchObject({ out: 'laugh', level: 1 });
    expect(r.state).toMatchObject({ giggly: false, laughedAt: 850 });
  });

  it('a poke while giggling pushes the laugh back', () => {
    let s = giggling();
    s = tickleTap(s, 800, little).state;
    expect(tickleQuiet(s, 900, little).out).toBe('none');
    expect(tickleQuiet(s, 1250, little).out).toBe('laugh');
  });

  it('nothing to laugh about without the giggles', () => {
    expect(tickleQuiet(NEW_TICKLE, 10_000, little)).toMatchObject({ out: 'none', waitMs: Infinity });
    expect(tickleQuiet(poke(every(3, 100)).state, 10_000, little).out).toBe('none');
  });

  it('tickled again soon after a laugh → level 2, then a rest of plain notes, then level 1 again', () => {
    let s = tickleQuiet(giggling(), 900, little).state; // laughs at 900
    let r = poke(every(5, 100, 1300), little, s); // giggly again at 1700
    expect(r.outs.at(-1)).toBe('giggly');
    expect(r.state.level).toBe(2);
    const q = tickleQuiet(r.state, 2300, little);
    expect(q).toMatchObject({ out: 'laugh', level: 2 });
    s = q.state;
    expect(s.restUntil).toBe(2300 + little.restMs);
    // Resting: even a flurry of pokes are just notes.
    r = poke(every(10, 80, 2400), little, s);
    expect(r.outs.every((o) => o === 'none')).toBe(true);
    // Rested: it starts over from level 1.
    r = poke(every(5, 100, 2300 + little.restMs + 10), little, r.state);
    expect(r.outs.at(-1)).toBe('giggly');
    expect(r.state.level).toBe(1);
  });

  it('a long gap after a laugh starts over from level 1', () => {
    const s = tickleQuiet(giggling(), 900, little).state;
    const r = poke(every(5, 100, 900 + little.againMs + 500), little, s);
    expect(r.state.level).toBe(1);
  });

  it('caps at the top level: Monster Makers stop at level 1 and rest', () => {
    const s = poke(every(8, 100), maker).state;
    const q = tickleQuiet(s, 2000, maker);
    expect(q).toMatchObject({ out: 'laugh', level: 1 });
    expect(q.state.restUntil).toBe(2000 + maker.restMs);
    expect(maker.laughs).toBe(false);
    expect(little.laughs).toBe(true);
  });
});

describe('tickle time: what a laugh sounds like', () => {
  const kinds = Object.keys(LAUGHS) as LaughKind[];

  it('every laugh for every monster is short, soft enough and in range', () => {
    for (const kind of kinds) {
      for (const m of ALL_MONSTERS) {
        const notes = laughNotes(kind, m);
        expect(notes.length).toBeGreaterThan(0);
        expect(laughLength(kind, m)).toBeLessThanOrEqual(1.3);
        for (const [step, at, dur, vel, bend = 0] of notes) {
          expect(at).toBeGreaterThanOrEqual(0);
          expect(dur).toBeGreaterThan(0);
          expect(vel).toBeGreaterThan(0.2);
          expect(vel).toBeLessThanOrEqual(0.72);
          expect(Math.abs(bend)).toBeLessThanOrEqual(6);
          if (m === 'boom') expect(step >= 0 && step <= 7).toBe(true);
          else expect(step >= 0 && step <= 9).toBe(true);
        }
      }
    }
  });

  it('giggles are laughter, not tunes: 4–6 staccato notes, 150–200 ms apart, stepping down and getting softer', () => {
    for (const m of ALL_MONSTERS) {
      if (m === 'puff') continue;
      for (const kind of ['giggle', 'laugh'] as const) {
        const notes = laughNotes(kind, m);
        expect(notes.length).toBeGreaterThanOrEqual(4);
        expect(notes.length).toBeLessThanOrEqual(7);
        for (let i = 1; i < notes.length; i++) {
          const gap = notes[i][1] - notes[i - 1][1];
          expect(gap).toBeGreaterThanOrEqual(0.15 - 1e-9);
          expect(gap).toBeLessThanOrEqual(0.2 + 1e-9);
          expect(notes[i][2]).toBeLessThan(gap); // staccato
          expect(notes[i][3]).toBeLessThanOrEqual(notes[i - 1][3]); // softer
          // Down in pitch: a lower step (melodic), or a lower-tuned or smaller drum (Boom).
          if (m !== 'boom') expect(notes[i][0]).toBeLessThan(notes[i - 1][0]);
        }
      }
    }
  });

  it('Puff sighs one long soft "hoooo" (its slow sounds cannot do staccato)', () => {
    for (const kind of ['giggle', 'laugh'] as const) {
      const notes = laughNotes(kind, 'puff');
      expect(notes).toHaveLength(1);
      expect(notes[0][2]).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('the bigger laugh is at least as long as the giggle, and "wheee" climbs', () => {
    for (const m of ALL_MONSTERS) {
      expect(laughNotes('laugh', m).length).toBeGreaterThanOrEqual(laughNotes('giggle', m).length);
      expect(laughLength('laugh', m)).toBeGreaterThanOrEqual(laughLength('giggle', m));
      const w = laughNotes('wheee', m);
      if (m !== 'boom' && w.length > 1) for (let i = 1; i < w.length; i++) expect(w[i][0]).toBeGreaterThan(w[i - 1][0]);
    }
  });

  it('the plan: level 1 giggles, level 2 goes "wheee" then laughs bigger as the hop lands', () => {
    expect(laughPlan(1, 'bloop')).toEqual({ parts: [{ kind: 'giggle', at: 0 }], seconds: laughLength('giggle', 'bloop') });
    const two = laughPlan(2, 'boom');
    expect(two.parts).toEqual([
      { kind: 'wheee', at: 0 },
      { kind: 'laugh', at: WHEEE_GAP },
    ]);
    expect(two.seconds).toBeCloseTo(WHEEE_GAP + laughLength('laugh', 'boom'));
    expect(laughPlan(3, 'bloop').parts.map((p) => p.kind)).toEqual(['wheee', 'laugh']);
  });
});
