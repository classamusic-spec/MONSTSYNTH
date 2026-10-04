import type { NoteEvent } from '../model/types';
import { cellState } from './steps';

// ─────────────────────────────────────────────────────────────────────────────
// MONSTER MAGIC · "My first beat", the guided first beat on Boom's stones.
//
// The child lights one stone per beat, bottom row first:
//   big drum on beats 1 and 5 · snappy drum on 3 and 7 · tss-tss on 2 4 6 8
// Progress is never stored: it is read from Boom's loop every time, so Undo,
// the Surprise wand, leaving and coming back all just work.
// ─────────────────────────────────────────────────────────────────────────────

export type BeatWant = 'hit' | 'double';

export interface BeatStep {
  id: 'kick' | 'snare' | 'hat';
  pad: number;
  cols: number[];
  want: BeatWant;
  /** Short words for readers (the cue never depends on them). */
  cue: string;
}

export const FIRST_BEAT_STEPS: readonly BeatStep[] = [
  { id: 'kick', pad: 0, cols: [0, 4], want: 'hit', cue: 'Big drum!' },
  { id: 'snare', pad: 1, cols: [2, 6], want: 'hit', cue: 'Snappy drum!' },
  { id: 'hat', pad: 2, cols: [1, 3, 5, 7], want: 'double', cue: 'Tss-tss!' },
];

export interface BeatTarget {
  pad: number;
  col: number;
  want: BeatWant;
}

export interface BeatProgress {
  /** Index of the first unfinished step (FIRST_BEAT_STEPS.length when done). */
  step: number;
  /** The next stone to light, or null when the beat is done. */
  target: BeatTarget | null;
  done: boolean;
  /** Stones already right, across all steps. */
  met: number;
  total: number;
}

export function targetMet(notes: readonly NoteEvent[], t: BeatTarget, lengthBeats: number): boolean {
  const state = cellState(notes, t.pad, t.col, lengthBeats);
  return t.want === 'double' ? state === 'double' : state === 'one' || state === 'double';
}

export function beatProgress(notes: readonly NoteEvent[], lengthBeats = 8): BeatProgress {
  let met = 0;
  let total = 0;
  let step = FIRST_BEAT_STEPS.length;
  let target: BeatTarget | null = null;
  FIRST_BEAT_STEPS.forEach((s, i) => {
    for (const col of s.cols) {
      const t = { pad: s.pad, col, want: s.want };
      total++;
      if (targetMet(notes, t, lengthBeats)) met++;
      else if (!target) {
        target = t;
        step = i;
      }
    }
  });
  return { step, target, done: target === null, met, total };
}
