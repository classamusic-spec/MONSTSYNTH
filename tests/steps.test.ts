import { describe, expect, it } from 'vitest';
import { GROOVES, grooveNotes } from '../src/magic/grooves';
import { lessonProject, TEACH_SONGS } from '../src/magic/lessons';
import {
  cellOf,
  cellState,
  drumRows,
  fineSlot,
  foldDrumRows,
  gridColumns,
  isOnGrid,
  isTidy,
  nextTarget,
  projectGrid,
  snapNotes,
  stepVelocity,
  writeCell,
  type CellWrite,
} from '../src/magic/steps';
import { seededRandom } from '../src/model/ids';
import { createClip } from '../src/model/project';
import type { Clip, NoteEvent } from '../src/model/types';

const note = (id: string, beat: number, step: number, vel = 0.8, dur = 0.5): NoteEvent => ({ id, beat, step, dur, vel, tone: 0 });
const clipOf = (notes: NoteEvent[], lengthBeats = 8): Clip => ({ id: 'c', lengthBeats, notes });

let seq = 0;
const ids = () => `g${++seq}`;
const drum = (step: number, col: number, target: CellWrite['target'], extra: Partial<CellWrite> = {}): CellWrite => ({
  step,
  col,
  target,
  lengthBeats: 8,
  beatsPerBar: 4,
  isDrum: true,
  columnCap: Infinity,
  dur: 0.5,
  newId: ids,
  ...extra,
});
const bead = (step: number, col: number, target: CellWrite['target'], extra: Partial<CellWrite> = {}): CellWrite => ({
  ...drum(step, col, target),
  isDrum: false,
  columnCap: 1,
  dur: 0.9,
  ...extra,
});

/** The Monster Band's beat as it was written before it moved into grooves.ts. */
const BAND_BOOM: [number, number][] = [
  [0, 0], [1.5, 0], [2, 0], [4, 0], [5.5, 0], [6, 0],
  [1, 1], [3, 1], [5, 1], [7, 1],
  [0.5, 2], [1.5, 2], [2.5, 2], [3.5, 2], [4.5, 2], [5.5, 2], [6.5, 2], [7.5, 3],
];
const bandBoom = () => clipOf(BAND_BOOM.map(([beat, step], i) => note(`b${i}`, beat, step)));

describe('cells: where a note shows', () => {
  it('puts each note in its beat and quarter, wrapping round the loop', () => {
    expect(cellOf(0.97, 8)).toEqual({ col: 1, sub: 0 });
    expect(cellOf(1.49, 8)).toEqual({ col: 1, sub: 2 });
    expect(cellOf(7.994, 8)).toEqual({ col: 0, sub: 0 });
    expect(cellOf(-0.01, 8)).toEqual({ col: 0, sub: 0 });
    expect(cellOf(2.25, 8)).toEqual({ col: 2, sub: 1 });
    expect(Object.is(fineSlot(-0.01, 8), 0)).toBe(true);
    expect(fineSlot(7.9, 8)).toBe(0);
  });

  it('has one column per beat for whole loops of 4 to 16 beats', () => {
    expect(gridColumns(createClip(8), 8)).toBe(8);
    expect(gridColumns(null, 8)).toBe(8);
    expect(gridColumns(createClip(3), 8)).toBeNull();
    expect(gridColumns(createClip(17), 8)).toBeNull();
    expect(gridColumns(createClip(6.5), 8)).toBeNull();
  });
});

describe('drum rows', () => {
  it('always shows the mode base rows, high sounds on top', () => {
    expect(drumRows(null, [2, 1, 0], [])).toEqual([2, 1, 0]);
    expect(drumRows(null, [2, 3, 1, 0], [])).toEqual([2, 3, 1, 0]);
  });

  it('gives every drum the loop already plays a row (the band clap)', () => {
    expect(drumRows(bandBoom(), [2, 1, 0], [])).toEqual([2, 3, 1, 0]);
    expect(drumRows(clipOf([note('x', 0, 7)]), [2, 1, 0], [5])).toEqual([5, 2, 7, 1, 0]);
  });

  it('keeps a stable order whatever order things come in', () => {
    const a = drumRows(clipOf([note('a', 0, 6), note('b', 1, 4)]), [2, 1, 0], [5, 3]);
    const b = drumRows(clipOf([note('b', 1, 4), note('a', 0, 6)]), [0, 1, 2], [3, 5]);
    expect(a).toEqual(b);
    expect(a).toEqual([5, 2, 6, 3, 1, 4, 0]);
  });
});

describe('folding drum rows (view only)', () => {
  // Robot-ish loop: hat, cowbell ×3, boing ×1, clap, snare, kick; plus bongo ×2 and crash ×1.
  const notes = [
    note('k', 0, 0),
    note('s', 1, 1),
    note('h', 0, 2),
    note('c1', 0, 6),
    note('c2', 2, 6),
    note('c3', 4, 6),
    note('b1', 3, 7),
    note('g1', 1, 4),
    note('g2', 5, 4),
    note('x1', 0, 5),
  ];
  const rows = drumRows(clipOf(notes), [2, 3, 1, 0], []);
  const before = JSON.stringify(notes);

  it('folds nothing when every row fits', () => {
    expect(foldDrumRows(rows, notes, { base: [2, 3, 1, 0], cap: 8 })).toEqual({ shown: rows, folded: [] });
    expect(foldDrumRows([2, 1, 0], [], { base: [2, 1, 0], cap: 5 })).toEqual({ shown: [2, 1, 0], folded: [] });
  });

  it('never folds a base row, and folds the least-used extra rows first', () => {
    const { shown, folded } = foldDrumRows(rows, notes, { base: [2, 3, 1, 0], cap: 5 });
    expect(shown).toEqual([2, 6, 3, 1, 0]);
    expect(folded).toEqual([4, 5, 7]);
    // Base rows show even when the cap is smaller than the base.
    expect(foldDrumRows(rows, notes, { base: [2, 3, 1, 0], cap: 3 }).shown).toEqual([2, 3, 1, 0]);
  });

  it('keeps rows already on screen, and a picked row pushes out the least-used one', () => {
    // On screen: boing (1 hit) and cowbell (3). A busier bongo row does not swap in by itself.
    const kept = foldDrumRows(rows, notes, { base: [2, 3, 1, 0], cap: 6, keep: [7, 6] });
    expect(kept.shown).toEqual([2, 6, 7, 3, 1, 0]);
    // The child picks the crash: it shows, and boing (the least used on screen) folds.
    const picked = foldDrumRows(rows, notes, { base: [2, 3, 1, 0], cap: 6, pinned: [5], keep: kept.shown });
    expect(picked.shown).toEqual([5, 2, 6, 3, 1, 0]);
    expect(picked.folded).toEqual([4, 7]);
  });

  it('a row emptied on screen stays (no jumping), and the newest pick wins when picks overflow', () => {
    const emptied = notes.filter((n) => n.step !== 6);
    expect(foldDrumRows(rows, emptied, { base: [2, 3, 1, 0], cap: 5, keep: [6] }).shown).toEqual([2, 6, 3, 1, 0]);
    expect(foldDrumRows(rows, notes, { base: [2, 3, 1, 0], cap: 5, pinned: [7, 5] }).shown).toEqual([2, 7, 3, 1, 0]);
  });

  it('only changes what is drawn: the notes are untouched', () => {
    foldDrumRows(rows, notes, { base: [2, 3, 1, 0], cap: 4, pinned: [7], keep: [6] });
    expect(JSON.stringify(notes)).toBe(before);
  });
});

describe('projectGrid', () => {
  const rows = [2, 3, 1, 0];
  const g = projectGrid(bandBoom().notes, 8, rows, { sustain: false });
  const states = (pad: number) => g.cells[rows.indexOf(pad)].map((c) => c.state);

  it('shows the band kick: on the beat, and the "ands" as partly lit stones', () => {
    expect(states(0)).toEqual(['one', 'custom', 'one', 'off', 'one', 'custom', 'one', 'off']);
    expect(g.cells[3][1].subs).toEqual([2]);
    expect(g.cells[3][5].subs).toEqual([2]);
  });

  it('shows hats on the "and" and the snare backbeat', () => {
    expect(states(2)).toEqual(['custom', 'custom', 'custom', 'custom', 'custom', 'custom', 'custom', 'off']);
    expect(states(1)).toEqual(['off', 'one', 'off', 'one', 'off', 'one', 'off', 'one']);
    expect(states(3)[7]).toBe('custom');
  });

  it('cellState agrees with the projection, cell by cell', () => {
    const notes = bandBoom().notes;
    rows.forEach((pad, r) => g.cells[r].forEach((cell, c) => expect(cellState(notes, pad, c, 8)).toBe(cell.state)));
  });

  it('maps every note id to its cell', () => {
    expect(g.noteCell.size).toBe(BAND_BOOM.length);
    for (const n of bandBoom().notes) {
      const [r, c] = g.noteCell.get(n.id)!;
      expect(g.cells[r][c].ids).toContain(n.id);
    }
  });

  it('shows a double, and the loudest hit sets the stone size', () => {
    const p = projectGrid([note('a', 3, 2, 0.4), note('b', 3.5, 2, 0.7)], 8, [2], { sustain: false });
    expect(p.cells[0][3]).toMatchObject({ state: 'double', subs: [0, 2], vel: 0.7 });
  });

  it('marks the beats a held note rings through', () => {
    const p = projectGrid([note('a', 1, 4, 0.8, 2.5), note('b', 7.5, 2, 0.8, 1.5)], 8, [4, 2], { sustain: true });
    expect(p.cells[0].map((c) => c.held)).toEqual([false, false, true, true, false, false, false, false]);
    expect(p.cells[1].map((c) => c.held)).toEqual([true, false, false, false, false, false, false, false]);
    expect(p.cells[1][7].state).toBe('custom');
    // A late note shows on beat 1 and rings from there: a half-beat note holds nothing.
    const late = projectGrid([note('c', 7.994, 4, 0.8, 0.5), note('d', 1.49, 4, 0.8, 1)], 8, [4], { sustain: true });
    expect(late.cells[0].map((c) => c.held)).toEqual([false, false, true, false, false, false, false, false]);
  });
});

describe('writeCell (drums)', () => {
  it('writes exact beats: one on the beat, a double on the beat and its "and"', () => {
    const one = writeCell(clipOf([]), drum(0, 3, 'one'));
    expect(one.result).toBe('changed');
    expect(Object.is(one.clip.notes[0].beat, 3)).toBe(true);
    const dbl = writeCell(clipOf([]), drum(2, 5, 'double'));
    expect(dbl.clip.notes.map((n) => n.beat)).toEqual([5, 5.5]);
    expect(dbl.clip.notes.every((n) => n.step === 2 && n.dur === 0.5 && n.tone === 0)).toBe(true);
  });

  it('touches only that drum in that beat', () => {
    const c = bandBoom();
    const out = writeCell(c, drum(0, 1, 'one')).clip;
    const changed = out.notes.filter((n) => !c.notes.includes(n));
    const gone = c.notes.filter((n) => !out.notes.includes(n));
    expect(gone.map((n) => [n.beat, n.step])).toEqual([[1.5, 0]]);
    expect(changed.map((n) => [n.beat, n.step])).toEqual([[1, 0]]);
  });

  it('turning a cell off removes off-grid hits too', () => {
    const c = clipOf([note('a', 0.97, 1), note('b', 1.26, 1), note('c', 1.5, 2), note('d', 7.994, 1)]);
    expect(writeCell(c, drum(1, 1, 'off')).clip.notes.map((n) => n.id)).toEqual(['c', 'd']);
    expect(writeCell(c, drum(1, 0, 'off')).clip.notes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns the very same clip when nothing changes', () => {
    const c = clipOf([note('a', 2, 0)]);
    const r = writeCell(c, drum(0, 2, 'one'));
    expect(r.result).toBe('same');
    expect(r.clip).toBe(c);
    expect(writeCell(c, drum(1, 2, 'off')).clip).toBe(c);
  });

  it('keeps the hit already on the beat when a cell becomes a double', () => {
    const c = clipOf([note('a', 2, 2)]);
    const out = writeCell(c, drum(2, 2, 'double')).clip;
    expect(out.notes[0]).toBe(c.notes[0]);
    expect(out.notes.map((n) => n.beat)).toEqual([2, 2.5]);
  });

  it('refuses a fifth drum in one beat, and a full loop, without deleting anything', () => {
    const four = clipOf([note('a', 4, 0), note('b', 4, 1), note('c', 4.5, 2), note('d', 4, 3)]);
    const fifth = writeCell(four, drum(5, 4, 'one'));
    expect(fifth.result).toBe('full');
    expect(fifth.clip).toBe(four);
    // A drum already in the column can still change.
    expect(writeCell(four, drum(2, 4, 'double')).result).toBe('changed');
    const full = clipOf(Array.from({ length: 96 }, (_, i) => note(`n${i}`, (i % 16) * 0.5, Math.floor(i / 16))));
    const r = writeCell(full, drum(6, 3, 'one', { maxNotes: 96 }));
    expect(r.result).toBe('full');
    expect(r.clip).toBe(full);
    expect(writeCell(full, drum(0, 3, 'off', { maxNotes: 96 })).result).toBe('changed');
  });

  it('on then off gives back exactly the loop it started with', () => {
    const c = bandBoom();
    for (const [pad, col, target] of [[0, 3, 'one'], [3, 0, 'double'], [1, 6, 'double']] as const) {
      const on = writeCell(c, drum(pad, col, target)).clip;
      const off = writeCell(on, drum(pad, col, 'off')).clip;
      expect(off).toEqual(c);
    }
  });

  it('gives new hits groove dynamics', () => {
    const out = writeCell(clipOf([]), drum(2, 4, 'double')).clip.notes;
    expect(out[0].vel).toBe(stepVelocity(2, 4, 4));
    expect(out[1].vel).toBe(stepVelocity(2, 4.5, 4));
  });
});

describe('writeCell (bead lane rules)', () => {
  it('one bead per column: a tap at another height moves it', () => {
    const c = clipOf([note('a', 2, 3, 0.85, 0.9)]);
    const out = writeCell(c, bead(5, 2, 'one')).clip;
    expect(out.notes.map((n) => [n.beat, n.step])).toEqual([[2, 5]]);
    expect(out.notes[0].dur).toBe(0.9);
  });

  it('a column cap of 3 lets go of the oldest bead', () => {
    const c = clipOf([note('a', 2, 1), note('b', 2, 3), note('c', 2.02, 5)]);
    const out = writeCell(c, bead(7, 2, 'one', { columnCap: 3 })).clip;
    expect(out.notes.map((n) => n.id).slice(0, 2)).toEqual(['b', 'c']);
    expect(out.notes[2]).toMatchObject({ beat: 2, step: 7 });
  });

  it('accents the bar downbeat', () => {
    expect(writeCell(clipOf([]), bead(2, 4, 'one')).clip.notes[0].vel).toBe(0.9);
    expect(writeCell(clipOf([]), bead(2, 5, 'one')).clip.notes[0].vel).toBe(0.85);
  });

  it('Puff: a new bead ends the long note ringing into its column', () => {
    const c = clipOf([note('a', 1, 2, 0.8, 1.9)]);
    const out = writeCell(c, bead(4, 2, 'one', { trimPrevious: true, dur: 1.9 })).clip;
    expect(out.notes[0]).toMatchObject({ id: 'a', dur: 1 });
    expect(out.notes[1]).toMatchObject({ beat: 2, step: 4, dur: 1.9 });
    // A long note from the end of the loop rings round into beat 1: it ends there too.
    const wrapped = writeCell(clipOf([note('w', 7, 2, 0.8, 1.9)]), bead(4, 0, 'one', { trimPrevious: true, dur: 1.9 })).clip;
    expect(wrapped.notes[0]).toMatchObject({ id: 'w', dur: 1 });
  });
});

describe('nextTarget', () => {
  it('Little Monsters: on and off (the tiny cymbal turns on as a double)', () => {
    expect(nextTarget('off', { states: 2, rowDefault: 'one' })).toBe('one');
    expect(nextTarget('off', { states: 2, rowDefault: 'double' })).toBe('double');
    expect(nextTarget('double', { states: 2, rowDefault: 'double' })).toBe('off');
    expect(nextTarget('one', { states: 2, rowDefault: 'double' })).toBe('off');
  });

  it('Monster Makers cycle one, double, off', () => {
    const o = { states: 3, rowDefault: 'one' } as const;
    expect(nextTarget('off', o)).toBe('one');
    expect(nextTarget('one', o)).toBe('double');
    expect(nextTarget('double', o)).toBe('off');
  });

  it('a partly lit stone becomes the row default', () => {
    expect(nextTarget('custom', { states: 3, rowDefault: 'one' })).toBe('one');
    expect(nextTarget('custom', { states: 2, rowDefault: 'double' })).toBe('double');
  });
});

describe('stepVelocity', () => {
  it('bar downbeat > beat > "and", always in range', () => {
    for (const pad of [0, 1, 2, 3, 4, 5, 6, 7]) {
      expect(stepVelocity(pad, 4, 4)).toBeGreaterThan(stepVelocity(pad, 5, 4));
      expect(stepVelocity(pad, 5, 4)).toBeGreaterThan(stepVelocity(pad, 5.5, 4));
      for (let b = 0; b < 8; b += 0.25) {
        const v = stepVelocity(pad, b, 4);
        expect(v).toBeGreaterThanOrEqual(0.05);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(stepVelocity(0, 0, 4)).toBeGreaterThan(stepVelocity(2, 0, 4));
  });
});

describe('tidy (the magnet)', () => {
  it('counts grid beats and exact triplets as on the grid', () => {
    expect(isOnGrid(1.5, 0.5)).toBe(true);
    expect(isOnGrid(1.25, 0.5)).toBe(false);
    expect(isOnGrid(1.25, 0.25)).toBe(true);
    expect(isOnGrid(2 + 2 / 3, 0.5)).toBe(true);
    expect(isOnGrid(0.024, 0.5)).toBe(false);
  });

  it('snaps [0.24, 1.26, 7.8] onto halves, wrapping the late one to beat 1', () => {
    const out = snapNotes([note('a', 0.24, 2), note('b', 1.26, 3), note('c', 7.8, 4)], 0.5, 8, { isDrum: false });
    expect(out.map((n) => [n.id, n.beat])).toEqual([
      ['a', 0],
      ['b', 1.5],
      ['c', 0],
    ]);
  });

  it('merges the same key in a slot (the loudest stays) but keeps chords and drum layers', () => {
    const out = snapNotes([note('a', 0.9, 2, 0.5), note('b', 1.1, 2, 0.9), note('c', 1.05, 4)], 0.5, 8, { isDrum: false });
    expect(out.map((n) => n.id)).toEqual(['b', 'c']);
    const drums = snapNotes([note('k1', 2.1, 0, 0.6), note('s', 1.95, 1), note('k2', 1.9, 0, 0.6)], 0.5, 8, { isDrum: true });
    expect(drums.map((n) => n.id)).toEqual(['s', 'k2']);
  });

  it('caps a slot, letting the oldest go', () => {
    const out = snapNotes([note('a', 1, 0), note('b', 1.01, 1), note('c', 0.99, 2), note('d', 1.02, 3)], 0.5, 8, { isDrum: false });
    expect(out.map((n) => n.id)).toEqual(['b', 'c', 'd']);
  });

  it('on 100 random notes: exact, in range, ids and lengths kept, capped, idempotent', () => {
    const rnd = seededRandom(7);
    for (const [grid, isDrum] of [
      [0.5, false],
      [0.25, true],
    ] as const) {
      // Played by hand: anywhere in the loop, but never by chance an exact triplet (those stay put).
      const beat = () => {
        let b = rnd() * 8;
        while (Math.abs(b * 3 - Math.round(b * 3)) < 0.01) b = rnd() * 8;
        return b;
      };
      const notes = Array.from({ length: 100 }, (_, i) =>
        note(`r${i}`, beat(), Math.floor(rnd() * (isDrum ? 4 : 8)), Math.round(rnd() * 100) / 100, 0.25 + Math.floor(rnd() * 8) * 0.25),
      );
      const out = snapNotes(notes, grid, 8, { isDrum });
      const byId = new Map(notes.map((n) => [n.id, n]));
      for (const n of out) {
        expect(Number.isInteger(n.beat / grid)).toBe(true);
        expect(n.beat).toBeGreaterThanOrEqual(0);
        expect(n.beat).toBeLessThan(8);
        expect(n.dur).toBe(byId.get(n.id)!.dur);
        expect(n.step).toBe(byId.get(n.id)!.step);
      }
      const slots = new Map<string, number>();
      for (const n of out) slots.set(`${n.beat}`, (slots.get(`${n.beat}`) ?? 0) + 1);
      expect(Math.max(...slots.values())).toBeLessThanOrEqual(isDrum ? 4 : 3);
      expect(new Set(out.map((n) => `${n.step}@${n.beat}`)).size).toBe(out.length);
      expect(isTidy(out, grid)).toBe(true);
      expect(snapNotes(out, grid, 8, { isDrum })).toEqual(out);
    }
  });

  it('wraps a late note to the downbeat, never to the loop length', () => {
    expect(snapNotes([note('a', 7.99, 0)], 0.25, 8, { isDrum: true })[0].beat).toBe(0);
    expect(Object.is(snapNotes([note('a', -0.1, 0)], 0.5, 8, { isDrum: true })[0].beat, 0)).toBe(true);
  });

  it('leaves the triplets of Row Row Row Your Boat (and every Learn song) alone', () => {
    for (const song of TEACH_SONGS) {
      const p = lessonProject(song, 1);
      for (const t of p.tracks) {
        for (const c of t.clips) {
          expect(isTidy(c.notes, 0.25)).toBe(true);
          expect(isTidy(c.notes, 0.5)).toBe(true);
          expect(snapNotes(c.notes, 0.25, c.lengthBeats, { isDrum: t.monster === 'boom' }).map((n) => n.beat)).toEqual(c.notes.map((n) => n.beat));
        }
      }
    }
    const boat = lessonProject(TEACH_SONGS.find((s) => s.id === 'row-your-boat')!, 1);
    const melody = boat.tracks.flatMap((t) => t.clips.flatMap((c) => c.notes.map((n) => n.beat)));
    expect(melody.some((b) => !Number.isInteger(b * 4))).toBe(true);
  });

  it('wand grooves and grid-built loops are tidy', () => {
    for (const g of GROOVES) expect(isTidy(grooveNotes(g, { beatsPerBar: 4 }), 0.5)).toBe(true);
    let c = clipOf([]);
    c = writeCell(c, drum(0, 0, 'one')).clip;
    c = writeCell(c, drum(2, 3, 'double')).clip;
    expect(isTidy(c.notes, 0.5)).toBe(true);
    expect(isTidy(c.notes, 0.25)).toBe(true);
  });
});
