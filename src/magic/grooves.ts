import { newId as makeId } from '../model/ids';
import type { AgeMode, NoteEvent } from '../model/types';
import { stepVelocity } from './steps';

// ─────────────────────────────────────────────────────────────────────────────
// MONSTER MAGIC · grooves for the wand (Beat Hop's "Surprise" button).
// One tap stamps a ready-made beat into Boom's loop, the next tap the next one.
// Each groove is written like a drum chart, one 8-beat row per drum:
//   x  a hit on the beat      d  on the beat and its "and" (tss-tss)
//   a  only on the "and"      .  rest
// Every groove starts with the big drum on beat 1, and every hit lands exactly
// on an eighth, so a stamped beat is always on the beat.
// Pads: 0 big drum · 1 snappy drum · 2 tiny cymbal · 3 clap · 4 bongos ·
// 5 crash · 6 cowbell · 7 boing. Little Monsters get grooves on pads 0–3 only.
// ─────────────────────────────────────────────────────────────────────────────

export interface Groove {
  id: string;
  /** Monster Maker only (uses the extra drums or sixteenth-feel ideas). */
  maker: boolean;
  /** Drum pad → 8 characters, one per beat. */
  rows: Partial<Record<number, string>>;
}

export const GROOVES: Groove[] = [
  // The Monster Band's own beat (templates.ts plays this one), so the wand's first idea is a familiar one.
  { id: 'stomp', maker: false, rows: { 0: 'xax.xax.', 1: '.x.x.x.x', 2: 'aaaaaaa.', 3: '.......a' } },
  { id: 'bouncy', maker: false, rows: { 0: 'x..ax.a.', 1: '.x.x.x.x', 2: 'dddddddd' } },
  { id: 'march', maker: false, rows: { 0: 'x.x.x.x.', 1: '.x.x.xdd', 2: 'x.x.x.x.' } },
  { id: 'disco', maker: false, rows: { 0: 'xxxxxxxx', 2: 'aaaaaaaa', 3: '.x.x.x.x' } },
  { id: 'sleepy', maker: false, rows: { 0: 'x...x...', 1: '..x...x.', 2: '.x.x.x.x' } },
  { id: 'clap-party', maker: false, rows: { 0: 'x.x.x.x.', 2: 'aaaaaaaa', 3: '.x.d.x.d' } },
  { id: 'funky', maker: true, rows: { 0: 'x..a.ax.', 1: '.x.x.x.x', 2: 'dddddddd', 3: '...a...a' } },
  { id: 'bongo-jungle', maker: true, rows: { 0: 'x..ax...', 2: '.a.a.a.a', 4: 'dxadxadd' } },
  { id: 'robot', maker: true, rows: { 0: 'x.x.x.x.', 1: '.x.x.x.x', 2: 'dddddddd', 6: 'x.a.x.a.', 7: '...a...a' } },
  { id: 'rock', maker: true, rows: { 0: 'x.d.x.d.', 1: '.x.x.x.x', 2: 'dddddddd', 5: 'x.......' } },
];

/** The notes of a groove: exact eighths, dynamics from stepVelocity, in time order. */
export function grooveNotes(g: Groove, o: { beatsPerBar: number; newId?: () => string }): NoteEvent[] {
  const id = o.newId ?? (() => makeId('n'));
  const hits: [beat: number, pad: number][] = [];
  for (const [padKey, row] of Object.entries(g.rows)) {
    const pad = Number(padKey);
    [...(row ?? '')].forEach((ch, col) => {
      if (ch === 'x' || ch === 'd') hits.push([col, pad]);
      if (ch === 'a' || ch === 'd') hits.push([col + 0.5, pad]);
    });
  }
  hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return hits.map(([beat, pad]) => ({ id: id(), beat, step: pad, dur: 0.5, vel: stepVelocity(pad, beat, o.beatsPerBar), tone: 0 }));
}

/** The grooves a mode's wand cycles through. */
export function wandGrooves(mode: AgeMode): Groove[] {
  return mode === 'maker' ? GROOVES : GROOVES.filter((g) => !g.maker);
}

/**
 * The wand's `index`-th beat for Boom (the index wraps). Tunes for the melodic
 * monsters arrive with their bead lane.
 */
export function wandPattern(mode: AgeMode, index: number, o: { beatsPerBar: number; newId?: () => string }): NoteEvent[] {
  const list = wandGrooves(mode);
  const i = ((Math.floor(index) % list.length) + list.length) % list.length;
  return grooveNotes(list[i], o);
}
