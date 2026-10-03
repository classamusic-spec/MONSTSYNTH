import { describe, expect, it } from 'vitest';
import { chordTones, GROOVES, grooveNotes, ROOT_PLAN, TUNES, tuneNotes, wandGrooves, wandPattern, wandTunes } from '../src/magic/grooves';
import { chordSteps } from '../src/magic/scales';
import { isTidy, projectGrid, melodicRows } from '../src/magic/steps';
import { monsterBandProject } from '../src/magic/templates';
import { gridColumnCap, MONSTERS } from '../src/model/monsters';
import type { MonsterKind } from '../src/model/types';
import { activeClip } from '../src/model/project';

const sig = (notes: { beat: number; step: number }[]) =>
  notes
    .map((n) => `${n.step}@${n.beat}`)
    .sort()
    .join(' ');

/** The Monster Band's beat as it was written before it moved into grooves.ts. */
const BAND_BOOM: [number, number][] = [
  [0, 0], [1.5, 0], [2, 0], [4, 0], [5.5, 0], [6, 0],
  [1, 1], [3, 1], [5, 1], [7, 1],
  [0.5, 2], [1.5, 2], [2.5, 2], [3.5, 2], [4.5, 2], [5.5, 2], [6.5, 2], [7.5, 3],
];

describe('wand grooves', () => {
  it('are deterministic', () => {
    let i = 0;
    const ids = () => `n${i++}`;
    const a = GROOVES.map((g) => grooveNotes(g, { beatsPerBar: 4, newId: ids }));
    i = 0;
    const b = GROOVES.map((g) => grooveNotes(g, { beatsPerBar: 4, newId: ids }));
    expect(a).toEqual(b);
  });

  it('land every hit exactly on an eighth inside the loop', () => {
    for (const g of GROOVES) {
      for (const row of Object.values(g.rows)) expect(row).toMatch(/^[xda.]{8}$/);
      for (const n of grooveNotes(g, { beatsPerBar: 4 })) {
        expect(Number.isInteger(n.beat * 2)).toBe(true);
        expect(n.beat).toBeGreaterThanOrEqual(0);
        expect(n.beat).toBeLessThan(8);
      }
    }
  });

  it('start with the big drum on beat 1', () => {
    for (const g of GROOVES) expect(grooveNotes(g, { beatsPerBar: 4 }).some((n) => n.beat === 0 && n.step === 0)).toBe(true);
  });

  it('give Little Monsters six grooves on the first four drums, Monster Makers four more', () => {
    const little = wandGrooves('little');
    expect(little).toHaveLength(6);
    for (const g of little) for (const n of grooveNotes(g, { beatsPerBar: 4 })) expect(n.step).toBeLessThanOrEqual(3);
    expect(wandGrooves('maker')).toHaveLength(10);
    for (let k = 0; k < 12; k++) for (const n of wandPattern('boom', 'little', k, { beatsPerBar: 4 })) expect(n.step).toBeLessThanOrEqual(3);
  });

  it('the first groove is the Monster Band beat', () => {
    expect(GROOVES[0].id).toBe('stomp');
    expect(sig(grooveNotes(GROOVES[0], { beatsPerBar: 4 }))).toBe(sig(BAND_BOOM.map(([beat, step]) => ({ beat, step }))));
    const band = monsterBandProject(5);
    const boom = band.tracks.find((t) => t.monster === 'boom')!;
    expect(sig(activeClip(boom)!.notes)).toBe(sig(BAND_BOOM.map(([beat, step]) => ({ beat, step }))));
  });

  it('fit in a loop, with every drum used at most once per position', () => {
    for (const g of GROOVES) {
      const notes = grooveNotes(g, { beatsPerBar: 4 });
      expect(notes.length).toBeLessThanOrEqual(96);
      expect(notes.length).toBeLessThanOrEqual(MONSTERS.boom.maxClipNotes);
      expect(new Set(notes.map((n) => `${n.step}@${n.beat}`)).size).toBe(notes.length);
      for (let col = 0; col < 8; col++) expect(new Set(notes.filter((n) => Math.floor(n.beat) === col).map((n) => n.step)).size).toBeLessThanOrEqual(4);
    }
  });

  it('wraps the wand index both ways', () => {
    const at = (k: number) => sig(wandPattern('boom', 'little', k, { beatsPerBar: 4 }));
    expect(at(6)).toBe(at(0));
    expect(at(-1)).toBe(at(5));
    expect(at(1)).not.toBe(at(0));
    expect(sig(wandPattern('boom', 'maker', 9, { beatsPerBar: 4 }))).toBe(sig(grooveNotes(GROOVES[9], { beatsPerBar: 4 })));
  });
});

const MELODIC = ['bloop', 'grumble', 'spark', 'puff', 'mimic'] as const satisfies readonly Exclude<MonsterKind, 'boom'>[];

describe('wand tunes (the bead lane)', () => {
  it('are deterministic', () => {
    for (const m of MELODIC) {
      let i = 0;
      const ids = () => `t${i++}`;
      const a = TUNES[m].map((t) => tuneNotes(m, t, { beatsPerBar: 4, newId: ids }));
      i = 0;
      const b = TUNES[m].map((t) => tuneNotes(m, t, { beatsPerBar: 4, newId: ids }));
      expect(a).toEqual(b);
    }
  });

  it('give every melodic monster 3 tunes for Little Monsters and more for Monster Makers', () => {
    for (const m of MELODIC) {
      expect(wandTunes(m, 'little')).toHaveLength(3);
      expect(wandTunes(m, 'maker').length).toBeGreaterThan(3);
      expect(new Set(TUNES[m].map((t) => t.id)).size).toBe(TUNES[m].length);
    }
  });

  it('use keys 0–7 on whole beats inside the loop, and are tidy', () => {
    for (const m of MELODIC) {
      for (const t of TUNES[m]) {
        const notes = tuneNotes(m, t, { beatsPerBar: 4 });
        expect(notes.length).toBeGreaterThan(0);
        expect(notes.length).toBeLessThanOrEqual(MONSTERS[m].maxClipNotes);
        for (const n of notes) {
          expect(Number.isInteger(n.step) && n.step >= 0 && n.step <= 7).toBe(true);
          expect(Object.is(n.beat, Math.round(n.beat) + 0)).toBe(true);
          expect(n.beat).toBeGreaterThanOrEqual(0);
          expect(n.beat).toBeLessThan(8);
        }
        expect(isTidy(notes, 0.5)).toBe(true);
        // One bead per key per beat.
        expect(new Set(notes.map((n) => `${n.step}@${n.beat}`)).size).toBe(notes.length);
      }
    }
  });

  it('fit the bead lane: Little tunes one bead per beat, Maker tunes within the column cap', () => {
    for (const m of MELODIC) {
      for (const mode of ['little', 'maker'] as const) {
        const cap = gridColumnCap(m, mode);
        for (const t of wandTunes(m, mode)) {
          const perBeat = new Map<number, number>();
          for (const [beat] of t.notes) perBeat.set(beat, (perBeat.get(beat) ?? 0) + 1);
          expect(Math.max(...perBeat.values())).toBeLessThanOrEqual(cap);
          // Every note shows as a whole bead (no partly lit cells).
          const g = projectGrid(tuneNotes(m, t, { beatsPerBar: 4 }), 8, melodicRows(), { sustain: MONSTERS[m].gridMono });
          for (const row of g.cells) for (const cell of row) expect(['off', 'one']).toContain(cell.state);
        }
      }
    }
  });

  it('agree with each other: every note is a tone of the shared chord plan (Puff plays roots, its chords stay in the plan)', () => {
    expect(ROOT_PLAN).toEqual([0, 0, 3, 3, 4, 4, 0, 0]);
    for (const m of MELODIC) {
      for (const t of TUNES[m]) {
        for (const [beat, step] of t.notes) {
          const root = ROOT_PLAN[beat];
          if (m === 'puff') {
            expect(step).toBe(root);
            for (const s of chordSteps(step)) expect(chordTones(root)).toContain(s);
          } else {
            expect(chordTones(root)).toContain(step);
          }
        }
      }
    }
  });

  it('give a long note per beat to the one-note-at-a-time monster (Puff ends each note where the next begins)', () => {
    for (const t of TUNES.puff) {
      const notes = tuneNotes('puff', t, { beatsPerBar: 4 });
      const starts = notes.map((n) => n.beat);
      for (const n of notes) {
        const next = starts.find((b) => b > n.beat) ?? starts[0] + 8;
        expect(n.dur).toBeLessThanOrEqual(next - n.beat + 1e-9);
        expect(n.dur).toBeLessThanOrEqual(MONSTERS.puff.gridDur);
        expect(n.dur).toBeGreaterThan(0);
      }
    }
    const clouds = tuneNotes('puff', TUNES.puff[0], { beatsPerBar: 4 });
    expect(clouds.map((n) => n.dur)).toEqual([1.9, 1.9, 1.9, 1.9]);
    const pulse = tuneNotes('puff', TUNES.puff[1], { beatsPerBar: 4 });
    expect(pulse.every((n) => n.dur === 1)).toBe(true);
    // Others keep their grid length; the bar's first beat is a little louder.
    const skip = tuneNotes('bloop', TUNES.bloop[0], { beatsPerBar: 4 });
    expect(skip.every((n) => n.dur === MONSTERS.bloop.gridDur)).toBe(true);
    expect(skip.filter((n) => n.vel === 0.9).map((n) => n.beat)).toEqual([0, 4]);
  });

  it('the wand cycles tunes per monster (wrapping), and grooves for Boom', () => {
    for (const m of MELODIC) {
      const at = (mode: 'little' | 'maker', k: number) => sig(wandPattern(m, mode, k, { beatsPerBar: 4 }));
      expect(at('little', 3)).toBe(at('little', 0));
      expect(at('little', -1)).toBe(at('little', 2));
      expect(new Set([0, 1, 2].map((k) => at('little', k))).size).toBe(3);
      const n = wandTunes(m, 'maker').length;
      expect(new Set(Array.from({ length: n }, (_, k) => at('maker', k))).size).toBe(n);
    }
    expect(sig(wandPattern('boom', 'little', 0, { beatsPerBar: 4 }))).toBe(sig(grooveNotes(GROOVES[0], { beatsPerBar: 4 })));
  });
});
