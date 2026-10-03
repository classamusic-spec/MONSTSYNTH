import { newId as makeId } from '../model/ids';
import { MONSTERS } from '../model/monsters';
import type { AgeMode, MonsterKind, NoteEvent } from '../model/types';
import { stepVelocity } from './steps';

// ─────────────────────────────────────────────────────────────────────────────
// MONSTER MAGIC · grooves and tunes for the wand (Beat Hop's "Surprise" button).
// One tap stamps a ready-made beat into Boom's loop (or a tune into a melodic
// monster's), the next tap the next one.
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

// ── Tunes for the bead lane ─────────────────────────────────────────────────
// Every tune is written over one shared chord plan, one chord root per beat:
// home for two beats, up for two, higher for two, home again (I IV V I in the
// Sunny mood). Each note is a tone of its beat's chord (the root, or two or
// four keys above it), and Puff, who plays a whole chord on every note, plays
// roots only. So any tunes stamped together agree with each other, in every
// mood, and sit on the same eight beats as the drum grooves: whole beats only,
// keys 0–7. Little Monsters' tunes have one note per beat (one bead per column);
// Monster Makers' may hold chords up to the monster's column cap.

/** The chord root (a key) of each of the 8 beats. */
export const ROOT_PLAN: readonly number[] = [0, 0, 3, 3, 4, 4, 0, 0];

/** The keys of a chord on `root` (the root, and two and four keys above it). */
export const chordTones = (root: number): number[] => [root, root + 2, root + 4];

/** [beat, key] pairs. */
export type TuneStamp = readonly (readonly [beat: number, step: number])[];

export interface Tune {
  id: string;
  /** Monster Maker only (chords, or a second idea). */
  maker: boolean;
  notes: TuneStamp;
}

export const TUNES: Record<Exclude<MonsterKind, 'boom'>, Tune[]> = {
  // The tune: steps and skips around the chords.
  bloop: [
    { id: 'skip', maker: false, notes: [[0, 4], [1, 2], [2, 3], [3, 5], [4, 6], [5, 4], [6, 2], [7, 0]] },
    { id: 'hop', maker: false, notes: [[0, 0], [1, 4], [2, 5], [3, 7], [4, 6], [5, 4], [6, 4], [7, 2]] },
    { id: 'sing', maker: false, notes: [[0, 2], [1, 4], [2, 5], [4, 4], [6, 2], [7, 0]] },
    { id: 'chords', maker: true, notes: [[0, 0], [0, 2], [0, 4], [2, 3], [2, 5], [2, 7], [4, 4], [4, 6], [6, 0], [6, 2], [6, 4]] },
    { id: 'call', maker: true, notes: [[0, 4], [1, 4], [2, 7], [3, 7], [4, 6], [5, 6], [6, 2], [6, 4], [7, 0]] },
  ],
  // The bass: roots, and a walk between them.
  grumble: [
    { id: 'stomp', maker: false, notes: [[0, 0], [2, 3], [4, 4], [6, 0]] },
    { id: 'walk', maker: false, notes: [[0, 0], [1, 2], [2, 3], [3, 5], [4, 4], [5, 6], [6, 4], [7, 2]] },
    { id: 'bounce', maker: false, notes: [[0, 0], [1, 4], [2, 3], [3, 7], [4, 4], [5, 6], [6, 0], [7, 4]] },
    { id: 'steady', maker: true, notes: [[0, 0], [1, 0], [2, 3], [3, 3], [4, 4], [5, 4], [6, 0], [7, 0]] },
    { id: 'gallop', maker: true, notes: [[0, 0], [1, 0], [2, 3], [3, 5], [4, 4], [5, 4], [6, 2], [7, 4]] },
  ],
  // Twinkles high up.
  spark: [
    { id: 'twinkle', maker: false, notes: [[0, 4], [1, 2], [2, 7], [3, 5], [4, 6], [5, 4], [6, 2], [7, 4]] },
    { id: 'drops', maker: false, notes: [[1, 4], [3, 7], [5, 6], [7, 4]] },
    { id: 'climb', maker: false, notes: [[0, 0], [1, 2], [2, 3], [3, 5], [4, 4], [5, 6], [6, 2], [7, 4]] },
    { id: 'bells', maker: true, notes: [[0, 2], [0, 4], [1, 4], [2, 5], [2, 7], [3, 7], [4, 4], [4, 6], [5, 6], [6, 2], [6, 4], [7, 4]] },
    { id: 'rain', maker: true, notes: [[0, 4], [1, 4], [2, 7], [3, 5], [4, 6], [5, 6], [6, 4], [7, 2]] },
  ],
  // Clouds: one long chord at a time, always on the root.
  puff: [
    { id: 'clouds', maker: false, notes: [[0, 0], [2, 3], [4, 4], [6, 0]] },
    { id: 'pulse', maker: false, notes: [[0, 0], [1, 0], [2, 3], [3, 3], [4, 4], [5, 4], [6, 0], [7, 0]] },
    { id: 'sigh', maker: false, notes: [[0, 0], [3, 3], [4, 4], [7, 0]] },
    { id: 'drift', maker: true, notes: [[1, 0], [2, 3], [5, 4], [6, 0]] },
    { id: 'waves', maker: true, notes: [[0, 0], [2, 3], [3, 3], [4, 4], [6, 0], [7, 0]] },
  ],
  // A singer (a banana choir with a recording).
  mimic: [
    { id: 'la-la', maker: false, notes: [[0, 2], [1, 2], [2, 3], [3, 3], [4, 4], [5, 4], [6, 2], [7, 0]] },
    { id: 'hello', maker: false, notes: [[0, 4], [1, 2], [2, 5], [4, 6], [5, 4], [6, 2]] },
    { id: 'hum', maker: false, notes: [[0, 0], [2, 3], [4, 4], [6, 2]] },
    { id: 'duet', maker: true, notes: [[0, 0], [0, 4], [2, 3], [2, 5], [4, 4], [4, 6], [6, 0], [6, 2]] },
    { id: 'chatter', maker: true, notes: [[0, 4], [1, 4], [2, 5], [3, 5], [4, 6], [5, 6], [6, 4], [7, 2]] },
  ],
};

/**
 * The notes of a tune for a monster: whole beats, the monster's grid length
 * (a one-note-at-a-time monster's note ends where the next begins), a bar's
 * first beat a little louder, in time order.
 */
export function tuneNotes(monster: Exclude<MonsterKind, 'boom'>, tune: Tune, o: { beatsPerBar: number; lengthBeats?: number; newId?: () => string }): NoteEvent[] {
  const id = o.newId ?? (() => makeId('n'));
  const info = MONSTERS[monster];
  const L = o.lengthBeats ?? 8;
  const sorted = [...tune.notes].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const starts = [...new Set(sorted.map(([beat]) => beat))];
  return sorted.map(([beat, step]) => {
    let dur = info.gridDur;
    if (info.gridMono) {
      const next = starts.find((b) => b > beat) ?? (starts[0] ?? beat) + L;
      dur = Math.min(dur, next - beat);
    }
    return { id: id(), beat, step, dur, vel: beat % o.beatsPerBar === 0 ? 0.9 : 0.85, tone: 0 };
  });
}

/** The tunes a mode's wand cycles through for a melodic monster. */
export function wandTunes(monster: Exclude<MonsterKind, 'boom'>, mode: AgeMode): Tune[] {
  return mode === 'maker' ? TUNES[monster] : TUNES[monster].filter((t) => !t.maker);
}

/** The wand's `index`-th idea for a monster (the index wraps): a groove for Boom, a tune for the others. */
export function wandPattern(monster: MonsterKind, mode: AgeMode, index: number, o: { beatsPerBar: number; newId?: () => string }): NoteEvent[] {
  const wrapAt = (n: number) => ((Math.floor(index) % n) + n) % n;
  if (monster === 'boom') {
    const list = wandGrooves(mode);
    return grooveNotes(list[wrapAt(list.length)], o);
  }
  const list = wandTunes(monster, mode);
  return tuneNotes(monster, list[wrapAt(list.length)], o);
}
