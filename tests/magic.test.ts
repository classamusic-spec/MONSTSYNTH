import { describe, expect, it } from 'vitest';
import { chordSteps, midiToHz, mimicSemitones, stepToMidi, stepToSemitone } from '../src/magic/scales';
import { gridSlot, quantizeDuration, softQuantize, wrap } from '../src/magic/timing';
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

  it('computes grid slots and durations', () => {
    expect(gridSlot(1.49, 0.5)).toBe(3);
    expect(quantizeDuration(0.1, 0.25, 8)).toBe(0.25);
    expect(quantizeDuration(1.3, 0.25, 8)).toBe(1.25);
    expect(quantizeDuration(20, 0.25, 8)).toBe(8);
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
