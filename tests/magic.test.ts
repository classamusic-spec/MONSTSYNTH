import { describe, expect, it } from 'vitest';
import { chordSteps, midiToHz, mimicSemitones, stepToMidi, stepToSemitone } from '../src/magic/scales';
import {
  gridLinesIn,
  gridSlot,
  isBounce,
  nextLine,
  nextOccurrence,
  snapDrum,
  snapDuration,
  softQuantize,
  wrap,
  type DrumSnap,
} from '../src/magic/timing';
import { MODE_CAPS } from '../src/model/monsters';
import { insertRecordedNote, MAX_NOTES_PER_CLIP, placeNote, setNoteDuration } from '../src/magic/recorder';
import type { Clip, NoteEvent } from '../src/model/types';

const note = (id: string, beat: number, step: number, extra: Partial<NoteEvent> = {}): NoteEvent => ({
  id,
  beat,
  step,
  dur: 0.5,
  vel: 0.8,
  tone: 0,
  ...extra,
});

const clipOf = (notes: NoteEvent[], lengthBeats = 8): Clip => ({ id: 'c1', lengthBeats, notes });

describe('scale locking', () => {
  it('maps pentatonic steps across octaves', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((s) => stepToSemitone(s, 'pentatonicMajor'))).toEqual([0, 2, 4, 7, 9, 12, 14, 16]);
  });

  it('supports negative steps', () => {
    expect(stepToSemitone(-1, 'pentatonicMajor')).toBe(-3);
    expect(stepToSemitone(-5, 'pentatonicMajor')).toBe(-12);
  });

  it('places each monster in its own register', () => {
    expect(stepToMidi(0, 'bloop', 'pentatonicMajor', 0)).toBe(60);
    expect(stepToMidi(0, 'grumble', 'pentatonicMajor', 0)).toBe(36);
    expect(stepToMidi(0, 'spark', 'pentatonicMajor', 0)).toBe(72);
    expect(stepToMidi(2, 'bloop', 'pentatonicMajor', 2)).toBe(66);
  });

  it('every key of every mood stays inside the scale', () => {
    for (const scale of ['pentatonicMajor', 'pentatonicMinor', 'major', 'minor', 'blues'] as const) {
      for (let s = 0; s < 8; s++) {
        const pc = ((stepToSemitone(s, scale) % 12) + 12) % 12;
        expect(stepToSemitone(s % 5, scale) >= 0).toBe(true);
        expect(Number.isInteger(pc)).toBe(true);
      }
    }
  });

  it('builds pad chords from scale steps only', () => {
    expect(chordSteps(0)).toEqual([0, 2, 4]);
    expect(chordSteps(3).map((s) => stepToSemitone(s, 'pentatonicMajor'))).toEqual([7, 12, 16]);
  });

  it('centres Mimic around the recorded pitch', () => {
    expect(mimicSemitones(2, 'pentatonicMajor')).toBe(0);
    expect(mimicSemitones(0, 'pentatonicMajor')).toBe(-4);
    expect(mimicSemitones(7, 'pentatonicMajor')).toBe(12);
  });

  it('converts MIDI to Hz', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(57)).toBeCloseTo(220);
  });
});

describe('timing', () => {
  it('wraps beats into the loop', () => {
    expect(wrap(9, 8)).toBe(1);
    expect(wrap(-0.5, 8)).toBe(7.5);
    expect(wrap(8, 8)).toBe(0);
    expect(wrap(7.9999999999, 8)).toBe(0);
  });

  it('soft-quantises towards the grid', () => {
    expect(softQuantize(1.2, 0.5, 1)).toBe(1);
    expect(softQuantize(1.2, 0.5, 0.5)).toBeCloseTo(1.1);
    expect(softQuantize(1.2, 0.5, 0)).toBe(1.2);
    expect(softQuantize(7.9, 0.5, 1)).toBe(8);
  });

  it('computes grid slots', () => {
    expect(gridSlot(1.49, 0.5)).toBe(3);
  });

  it('snaps note ends to the grid, measured from the snapped start', () => {
    expect(snapDuration(0, 1.0, 8)).toBe(1);
    expect(snapDuration(0.5, 0.05, 8)).toBe(0.25);
    expect(snapDuration(6, 5, 8)).toBe(5);
    expect(snapDuration(0, 20, 8)).toBe(8);
    // A soft-quantised start: the end still lands on a sixteenth.
    expect(snapDuration(0.024, 0.9, 8) + 0.024).toBeCloseTo(1, 9);
    // Released before the (late-snapped) start: still the minimum length.
    expect(snapDuration(1, -0.05, 8)).toBe(0.25);
  });
});

describe('drum snap', () => {
  const little = MODE_CAPS.little.drumSnap;
  const maker = MODE_CAPS.maker.drumSnap;

  it('pulls late and early taps onto the beat in Little mode', () => {
    expect(snapDrum(1.3, little)).toBe(1);
    expect(snapDrum(0.7, little)).toBe(1);
    expect(snapDrum(1.4, little)).toBe(1.5);
    expect(snapDrum(7.8, little)).toBe(8);
  });

  it('snaps to sixteenths in Maker mode, with a magnet to the eighths', () => {
    expect(snapDrum(0.26, maker)).toBe(0.25);
    expect(snapDrum(0.45, maker)).toBe(0.5);
    expect(snapDrum(0.62, maker)).toBe(0.5);
    expect(snapDrum(0.64, maker)).toBe(0.75);
  });

  it('always returns an exact grid multiple (never -0)', () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (const s of [little, maker] as DrumSnap[]) {
      for (let i = 0; i < 1000; i++) {
        // Every eighth beat is a hair below zero, where a careless snap returns -0.
        const beat = i % 8 === 0 ? -rand() * 0.2 : rand() * 40 - 4;
        const q = snapDrum(beat, s);
        expect(Number.isInteger(q / s.grid)).toBe(true);
        expect(Object.is(q, -0)).toBe(false);
        expect(Math.abs(q - beat)).toBeLessThanOrEqual(Math.max(s.strongWindow, s.grid / 2) + 1e-9);
      }
    }
    expect(Object.is(snapDrum(-0.1, little), 0)).toBe(true);
  });

  it('places drum hits exactly, wrapping the loop end to beat 0', () => {
    const opts = { loopBeats: 8, grid: 0.5, strength: 0.9, snap: little };
    expect(placeNote(7.8, opts)).toEqual({ beat: 0, absBeat: 8 });
    expect(placeNote(10.27, opts)).toEqual({ beat: 2, absBeat: 10 });
    expect(placeNote(3.27, { ...opts, grid: 0.25, snap: maker }).beat).toBe(3.25);
  });

  it('spots finger bounces', () => {
    expect(isBounce(1, 1.1, 100)).toBe(true);
    expect(isBounce(1, 1.2, 100)).toBe(false);
    expect(isBounce(1, 0.95, 100)).toBe(false);
  });
});

describe('grid lines', () => {
  it('lists the lines inside a window', () => {
    expect(gridLinesIn(0.9, 2.1, 0.5)).toEqual([1, 1.5, 2]);
    expect(gridLinesIn(0, 1, 0.5, 0)).toEqual([0.5]);
    expect(gridLinesIn(-1, 0.1, 0.5)).toEqual([-1, -0.5, 0]);
    expect(gridLinesIn(2, 2, 0.5)).toEqual([]);
  });

  it('never repeats or skips a line across adjacent windows', () => {
    expect([...gridLinesIn(0, 0.3, 0.25), ...gridLinesIn(0.3, 1, 0.25)]).toEqual([0, 0.25, 0.5, 0.75]);
    // Windows like the transport's: tempo-based edges full of floating-point dust.
    const spb = 60 / 137;
    const lines: number[] = [];
    let from = 0;
    for (let i = 1; i <= 400; i++) {
      const to = (i * 0.025) / spb;
      lines.push(...gridLinesIn(from, to, 0.25));
      from = to;
    }
    expect(lines).toEqual(Array.from({ length: lines.length }, (_, i) => i * 0.25));
    expect(lines.length).toBe(Math.ceil(from / 0.25 - 1e-9));
  });

  it('finds the next time a loop note comes round', () => {
    expect(nextOccurrence(2.5, 8, 10.6)).toBe(18.5);
    expect(nextOccurrence(2.5, 8, 10.5)).toBe(10.5);
    expect(nextOccurrence(7, 8, -1)).toBe(-1);
    expect(nextOccurrence(0, 8, -0.5)).toBe(0);
  });

  it('finds the next grid line', () => {
    expect(nextLine(3.01, 0.25)).toBe(3.25);
    expect(nextLine(3, 0.25)).toBe(3);
    expect(nextLine(-0.3, 0.5)).toBe(0);
  });
});

describe('loop recording', () => {
  it('places late notes at the start of the loop', () => {
    const p = placeNote(15.95, { loopBeats: 8, grid: 0.5, strength: 1 });
    expect(p.beat).toBe(0);
    expect(p.absBeat).toBe(16);
  });

  it('replaces notes from earlier passes in the same slot', () => {
    const clip = clipOf([note('old', 2, 3), note('other', 4, 1)]);
    const next = insertRecordedNote(clip, note('new', 2, 5), { grid: 0.5, isDrum: false, protectedIds: new Set() });
    expect(next.notes.map((n) => n.id)).toEqual(['other', 'new']);
  });

  it('keeps chords played on the same pass', () => {
    const clip = clipOf([note('a', 2, 3)]);
    const next = insertRecordedNote(clip, note('b', 2, 5), { grid: 0.5, isDrum: false, protectedIds: new Set(['a']) });
    expect(next.notes.map((n) => n.id).sort()).toEqual(['a', 'b']);
  });

  it('lets drums layer but replaces the same pad', () => {
    const clip = clipOf([note('kick', 0, 0), note('snare', 0, 1)]);
    const next = insertRecordedNote(clip, note('kick2', 0, 0), { grid: 0.5, isDrum: true, protectedIds: new Set() });
    expect(next.notes.map((n) => n.id).sort()).toEqual(['kick2', 'snare']);
  });

  it('collapses a double tap into one note', () => {
    const clip = clipOf([note('a', 1, 2)]);
    const next = insertRecordedNote(clip, note('b', 1, 2), { grid: 0.5, isDrum: true, protectedIds: new Set(['a']) });
    expect(next.notes.map((n) => n.id)).toEqual(['b']);
  });

  it('caps notes per slot', () => {
    const protectedIds = new Set(['a', 'b', 'c']);
    const clip = clipOf([note('a', 1, 0), note('b', 1, 1), note('c', 1, 2)]);
    const next = insertRecordedNote(clip, note('d', 1, 3), { grid: 0.5, isDrum: false, protectedIds });
    expect(next.notes).toHaveLength(3);
    expect(next.notes.some((n) => n.id === 'd')).toBe(true);
  });

  it('drops the oldest notes in a full slot', () => {
    // Recorded on an earlier pass, later in the slot, but first in time: 'x' goes.
    const clip = clipOf([note('x', 1.2, 0, { vel: 0.5 }), note('y', 1, 1), note('z', 1.1, 2)]);
    const next = insertRecordedNote(clip, note('w', 1, 3), { grid: 0.5, isDrum: true, protectedIds: new Set(), maxPerSlot: 3 });
    expect(next.notes.map((n) => n.id)).toEqual(['y', 'z', 'w']);
  });

  it('lets go of the oldest recording when a clip is full, wherever it sits in the loop', () => {
    const first = note('first', 63.5, 1);
    const rest = Array.from({ length: MAX_NOTES_PER_CLIP - 1 }, (_, i) => note(`n${i + 1}`, (i + 1) * 0.5, 1));
    const clip = clipOf([first, ...rest], 64);
    const next = insertRecordedNote(clip, note('new', 50, 2), { grid: 0.5, isDrum: false, protectedIds: new Set() });
    expect(next.notes).toHaveLength(MAX_NOTES_PER_CLIP);
    expect(next.notes.some((n) => n.id === 'first')).toBe(false);
    expect(next.notes.some((n) => n.id === 'n1')).toBe(true);
    expect(next.notes[next.notes.length - 1].id).toBe('new');
  });

  it('honours a per-monster clip cap', () => {
    const clip = clipOf(Array.from({ length: 4 }, (_, i) => note(`n${i}`, i, 1)));
    const next = insertRecordedNote(clip, note('new', 6, 2), { grid: 0.5, isDrum: false, protectedIds: new Set(), maxNotes: 4 });
    expect(next.notes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3', 'new']);
  });

  it('treats the last slot and slot zero as different slots', () => {
    const clip = clipOf([note('end', 7.5, 1)]);
    const next = insertRecordedNote(clip, note('start', 0, 1), { grid: 0.5, isDrum: false, protectedIds: new Set() });
    expect(next.notes).toHaveLength(2);
  });

  it('updates durations immutably', () => {
    const clip = clipOf([note('a', 1, 2)]);
    const next = setNoteDuration(clip, 'a', 2);
    expect(next.notes[0].dur).toBe(2);
    expect(clip.notes[0].dur).toBe(0.5);
    expect(setNoteDuration(clip, 'missing', 1)).toBe(clip);
  });
});
