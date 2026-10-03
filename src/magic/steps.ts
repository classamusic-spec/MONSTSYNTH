import { newId as makeId } from '../model/ids';
import type { Clip, MonsterKind, NoteEvent } from '../model/types';
import { MAX_NOTES_PER_CLIP } from './recorder';
import { wrap } from './timing';

// ─────────────────────────────────────────────────────────────────────────────
// MONSTER MAGIC · Beat Hop, the step grid on the back of the keys.
//
// The grid is only a second way to look at (and edit) the loop the monster
// already has: one column is one beat, one row is one drum (Boom) or one key
// (the melodic monsters' bead lane: eight bands in the key colours, so a bead
// can never be out of key). Nothing new is stored. A cell is just "the notes of
// this drum (or key) that land in this beat", so live recordings, wand grooves
// and grid taps all show up in the same picture.
//
//   'one'    a hit on the beat              (one pip)
//   'double' on the beat and on its "and"   (two pips: tss-tss)
//   'custom' anything else (an "and" only, sixteenths, a triplet): small pips
//            where the hits really are, until the child taps it or tidies up
//
// Cells are wrap-aware: a hit played a hair before the loop's end (7.994)
// belongs to beat 1, exactly where the ear puts it.
// ─────────────────────────────────────────────────────────────────────────────

/** The finest position the grid shows inside a beat (a sixteenth). */
export const FINE = 0.25;

export type CellState = 'off' | 'one' | 'double' | 'custom';
export type CellTarget = 'off' | 'one' | 'double';

export interface CellView {
  state: CellState;
  ids: string[];
  /** Quarter-beat positions (0..3) of the hits in this cell, sorted. */
  subs: number[];
  /** Loudest hit in the cell (0 when empty). */
  vel: number;
  /** Covered by an earlier held note of this row (a long Puff note). */
  held: boolean;
}

export interface GridProjection {
  /** Steps (or drum pads) of the rows, top to bottom. */
  rows: number[];
  cols: number;
  /** cells[rowIndex][col] */
  cells: CellView[][];
  /** Note id → [rowIndex, col]. */
  noteCell: Map<string, [number, number]>;
}

const GRID_FACES: readonly MonsterKind[] = ['boom', 'bloop', 'grumble', 'spark', 'puff', 'mimic'];

/** Monsters with a grid face: Boom's drum rows, and a bead lane for every melodic monster. */
export function hasGridFace(monster: MonsterKind): boolean {
  return GRID_FACES.includes(monster);
}

/** The keys a bead lane always shows (one band per key). */
export const BEAD_KEYS = 8;

/** Grid columns for a loop: one per beat, for whole loops of 4 to 16 beats; otherwise no grid. */
export function gridColumns(clip: Clip | null, loopBeats: number): number | null {
  const L = clip?.lengthBeats ?? loopBeats;
  return Number.isInteger(L) && L >= 4 && L <= 16 ? L : null;
}

/** The sixteenth a beat sounds on, wrapped into the loop (7.994 in an 8-beat loop → 0). */
export function fineSlot(beat: number, lengthBeats: number): number {
  const n = Math.max(1, Math.round(lengthBeats / FINE));
  const s = Math.round(beat / FINE) % n;
  return s < 0 ? s + n : s + 0;
}

/** Column (beat) and quarter-beat position of a note. */
export function cellOf(beat: number, lengthBeats: number): { col: number; sub: number } {
  const slot = fineSlot(beat, lengthBeats);
  return { col: Math.floor(slot / 4), sub: slot % 4 };
}

/**
 * Every drum, top to bottom: high, short sounds above, the big drum at the
 * bottom (the same head/belly/feet layout as Boom's body).
 */
export const DRUM_ROW_ORDER: readonly number[] = [5, 2, 6, 7, 3, 1, 4, 0];

/**
 * Rows of a drum grid: the mode's base rows, plus every pad the loop already
 * uses (a pattern never hides a drum it plays), plus rows added by hand.
 */
export function drumRows(clip: Clip | null, base: readonly number[], added: readonly number[]): number[] {
  const pads = new Set<number>([...base, ...added]);
  for (const n of clip?.notes ?? []) pads.add(n.step);
  const rank = (p: number) => {
    const i = DRUM_ROW_ORDER.indexOf(p);
    return i < 0 ? DRUM_ROW_ORDER.length + p : i;
  };
  return [...pads].sort((a, b) => rank(a) - rank(b));
}

/**
 * Bands of a bead lane, top to bottom: the eight keys (step 0 at the bottom),
 * plus any key the loop already plays beyond them (a kept Learn song can reach
 * one higher), so a lane never hides a note it plays.
 */
export function melodicRows(notes: readonly NoteEvent[] = [], count = BEAD_KEYS): number[] {
  const steps = new Set<number>(Array.from({ length: count }, (_, i) => i));
  for (const n of notes) steps.add(n.step);
  return [...steps].sort((a, b) => b - a);
}

/**
 * Which drum rows show when not all of them fit at a finger's size (a phone
 * holds five). Folding only changes the picture: folded drums keep playing.
 *   base rows   always show (the mode's own drums)
 *   `pinned`    next (picked by the child, newest first)
 *   `keep`      next (rows already on screen, so nothing jumps under a finger),
 *               the busiest first
 *   the rest    by how many hits they have, then top to bottom
 * `shown` comes back in row order; `folded` busiest first.
 */
export function foldDrumRows(
  rows: readonly number[],
  notes: readonly NoteEvent[],
  o: { base: readonly number[]; cap: number; pinned?: readonly number[]; keep?: readonly number[] },
): { shown: number[]; folded: number[] } {
  if (rows.length <= o.cap) return { shown: [...rows], folded: [] };
  const hits = new Map<number, number>();
  for (const n of notes) hits.set(n.step, (hits.get(n.step) ?? 0) + 1);
  const busiest = (a: number, b: number) => (hits.get(b) ?? 0) - (hits.get(a) ?? 0) || rows.indexOf(a) - rows.indexOf(b);
  const shown = new Set(rows.filter((p) => o.base.includes(p)));
  const take = (pads: readonly number[]) => {
    for (const p of pads) if (shown.size < o.cap && rows.includes(p)) shown.add(p);
  };
  take(o.pinned ?? []);
  take([...(o.keep ?? [])].sort(busiest));
  take([...rows].sort(busiest));
  return { shown: rows.filter((p) => shown.has(p)), folded: rows.filter((p) => !shown.has(p)).sort(busiest) };
}

const EMPTY = (): CellView => ({ state: 'off', ids: [], subs: [], vel: 0, held: false });

function stateOf(subs: number[]): CellState {
  if (subs.length === 0) return 'off';
  if (subs.length === 1 && subs[0] === 0) return 'one';
  if (subs.length === 2 && subs[0] === 0 && subs[1] === 2) return 'double';
  return 'custom';
}

/** The state of one cell, straight from a loop's notes (what a gesture sees mid-swipe). */
export function cellState(notes: readonly NoteEvent[], step: number, col: number, lengthBeats: number): CellState {
  const subs: number[] = [];
  for (const n of notes) {
    if (n.step !== step) continue;
    const c = cellOf(n.beat, lengthBeats);
    if (c.col === col && !subs.includes(c.sub)) subs.push(c.sub);
  }
  return stateOf(subs.sort((a, b) => a - b));
}

/** What the grid shows for a loop's notes. Notes on steps without a row are left out. */
export function projectGrid(notes: readonly NoteEvent[], lengthBeats: number, rows: readonly number[], opts: { sustain: boolean }): GridProjection {
  const cols = Math.max(1, Math.round(lengthBeats));
  const cells = rows.map(() => Array.from({ length: cols }, EMPTY));
  const noteCell = new Map<string, [number, number]>();
  const rowOf = new Map(rows.map((step, i) => [step, i]));
  for (const n of notes) {
    const r = rowOf.get(n.step);
    if (r === undefined) continue;
    const { col, sub } = cellOf(n.beat, lengthBeats);
    const cell = cells[r][col];
    cell.ids.push(n.id);
    if (!cell.subs.includes(sub)) cell.subs.push(sub);
    cell.vel = Math.max(cell.vel, n.vel);
    noteCell.set(n.id, [r, col]);
    if (opts.sustain) {
      // A held note covers the columns it rings through (never past one full loop),
      // measured from where it shows (7.994 shows on beat 1 and rings from there).
      const start = Math.round(n.beat / FINE) * FINE;
      const end = start + n.dur;
      for (let k = 1; k < cols && Math.floor(start) + k < end - 1e-9; k++) cells[r][(col + k) % cols].held = true;
    }
  }
  for (const row of cells) {
    for (const cell of row) {
      cell.subs.sort((a, b) => a - b);
      cell.state = stateOf(cell.subs);
      if (cell.state !== 'off') cell.held = false;
    }
  }
  return { rows: [...rows], cols, cells, noteCell };
}

/**
 * What a tap turns a cell into. Little Monsters have two states (on/off; the
 * tiny cymbal's "on" is a double); Monster Makers cycle one → double → off.
 * A partly lit cell always becomes the row's default.
 */
export function nextTarget(state: CellState, o: { states: 2 | 3; rowDefault: 'one' | 'double' }): CellTarget {
  if (state === 'off' || state === 'custom') return o.rowDefault;
  if (o.states === 3 && state === 'one') return 'double';
  return 'off';
}

const DRUM_BASE: Record<number, number> = { 0: 0.95, 1: 0.88, 2: 0.6, 3: 0.85 };

/**
 * Groove feel without skill: bar downbeats loudest, other beats a little
 * softer, the "ands" softer still. Pad sets the base (a hat is quieter than a kick).
 */
export function stepVelocity(pad: number, beat: number, beatsPerBar: number): number {
  const base = DRUM_BASE[pad] ?? 0.8;
  const onBeat = Math.abs(beat - Math.round(beat)) < 1e-9;
  const accent = onBeat ? (Math.round(beat) % beatsPerBar === 0 ? 1 : 0.92) : 0.72;
  const v = Math.round(base * accent * 1000) / 1000;
  return Math.min(1, Math.max(0.05, v));
}

export interface CellWrite {
  /** Drum pad or scale step. */
  step: number;
  col: number;
  target: CellTarget;
  lengthBeats: number;
  beatsPerBar: number;
  isDrum: boolean;
  /** Melodic: notes allowed in one column (the oldest goes first). Drums ignore it. */
  columnCap: number;
  /** Length of a new note in beats. */
  dur: number;
  /** Mono monsters (Puff): an earlier note ringing into this column ends where it starts. */
  trimPrevious?: boolean;
  /** Drums: different pads in one column (default 4, as when recording). */
  maxDrumsPerCell?: number;
  /** Notes in the loop (default MAX_NOTES_PER_CLIP). */
  maxNotes?: number;
  newId?: () => string;
}

export type WriteResult = 'changed' | 'same' | 'full';

/**
 * Set one cell. Only notes of `w.step` in column `w.col` are touched; 'off'
 * removes them all (off-grid pips too). Notes already where the target wants
 * them keep their ids. Drums: a full column or loop is refused, never evicted,
 * and 'same' and 'full' return the very same clip object. Beads: a full column
 * lets go of its oldest bead, which really *moves* to the new key (it keeps its
 * id, so it glides there and is never heard twice).
 */
export function writeCell(clip: Clip, w: CellWrite): { clip: Clip; result: WriteResult } {
  const L = w.lengthBeats;
  const inCol = (n: NoteEvent) => cellOf(n.beat, L).col === w.col;
  const mine = clip.notes.filter((n) => n.step === w.step && inCol(n));
  const want = w.target === 'off' ? [] : w.target === 'one' ? [w.col] : [w.col, w.col + 0.5];
  const keep = new Set<string>();
  for (const beat of want) {
    const hit = mine.find((n) => n.beat === beat && !keep.has(n.id));
    if (hit) keep.add(hit.id);
  }
  if (keep.size === want.length && mine.length === want.length) return { clip, result: 'same' };

  const missing = want.filter((beat) => !mine.some((n) => keep.has(n.id) && n.beat === beat));
  let notes = clip.notes.filter((n) => !(n.step === w.step && inCol(n)) || keep.has(n.id));
  /** Ids of beads that make room: they move to the new key. */
  const moving: string[] = [];

  if (missing.length > 0) {
    if (w.isDrum) {
      const pads = new Set(notes.filter(inCol).map((n) => n.step));
      if (!pads.has(w.step) && pads.size >= (w.maxDrumsPerCell ?? 4)) return { clip, result: 'full' };
    } else {
      // A full column lets go of its oldest bead to make room (one bead per column: it jumps).
      const others = notes.filter((n) => inCol(n) && n.step !== w.step);
      const over = others.length + want.length - Math.max(1, w.columnCap);
      if (over > 0) {
        const drop = new Set(others.slice(0, over).map((n) => n.id));
        moving.push(...drop);
        notes = notes.filter((n) => !drop.has(n.id));
      }
    }
    if (notes.length + missing.length > (w.maxNotes ?? MAX_NOTES_PER_CLIP)) return { clip, result: 'full' };
    if (w.trimPrevious) {
      // Also a note that wraps round the loop's end into this column.
      notes = notes.map((n) => {
        const start = n.beat < w.col ? n.beat : n.beat - L;
        return start < w.col && start + n.dur > w.col + 1e-9 ? { ...n, dur: w.col - start } : n;
      });
    }
    const id = w.newId ?? (() => makeId('n'));
    const added = missing.map((beat): NoteEvent => {
      const vel = w.isDrum ? stepVelocity(w.step, beat, w.beatsPerBar) : beat % w.beatsPerBar === 0 ? 0.9 : 0.85;
      return { id: moving.shift() ?? id(), beat, step: w.step, dur: w.dur, vel, tone: 0 };
    });
    if (w.trimPrevious) {
      // One note at a time (Puff): a new note also ends where the next one begins.
      for (const a of added) {
        for (const n of [...notes, ...added]) {
          const gap = (((n.beat - a.beat) % L) + L) % L;
          if (gap > 1e-9 && gap < a.dur) a.dur = gap;
        }
      }
    }
    notes.push(...added);
  }
  return { clip: { ...clip, notes }, result: 'changed' };
}

/**
 * Bead lane: a bead dragged up or down. The notes of `fromStep` in column `col`
 * move to `toStep` (kept within 0..`maxStep`), keeping their ids, beats and
 * lengths. A bead already on `toStep` in that column gives way (one bead per key
 * per beat). The same clip when nothing moves.
 */
export function moveCell(clip: Clip, col: number, fromStep: number, toStep: number, lengthBeats: number, maxStep = BEAD_KEYS - 1): Clip {
  const to = Math.max(0, Math.min(maxStep, Math.round(toStep)));
  const inCol = (n: NoteEvent) => cellOf(n.beat, lengthBeats).col === col;
  if (to === fromStep || !clip.notes.some((n) => n.step === fromStep && inCol(n))) return clip;
  const notes = clip.notes.filter((n) => n.step !== to || !inCol(n)).map((n) => (n.step === fromStep && inCol(n) ? { ...n, step: to } : n));
  return { ...clip, notes };
}

// ── Tidy (the magnet): pull a loop's notes exactly onto the grid ────────────

const TIDY_EPS = 1e-3;

function nearMultiple(beat: number, step: number): boolean {
  const q = beat / step;
  return Math.abs(q - Math.round(q)) * step < TIDY_EPS;
}

/** On the grid, or an exact triplet (songs from Learn swing in threes on purpose). */
export function isOnGrid(beat: number, grid: number): boolean {
  return nearMultiple(beat, grid) || nearMultiple(beat, 1 / 3);
}

export function isTidy(notes: readonly NoteEvent[], grid: number): boolean {
  return notes.every((n) => isOnGrid(n.beat, grid));
}

/**
 * Snap every note exactly onto the grid (wrapping at the loop's end), keeping
 * ids, lengths and order. Triplets stay where they are. Two notes of one key
 * meeting in a slot become one (the louder; on a tie the newer), and a slot
 * keeps at most `maxPerSlot` notes (4 drums, 3 melodic), letting the oldest go.
 */
export function snapNotes(
  notes: readonly NoteEvent[],
  grid: number,
  lengthBeats: number,
  o: { isDrum: boolean; maxPerSlot?: number },
): NoteEvent[] {
  const cap = o.maxPerSlot ?? (o.isDrum ? 4 : 3);
  const snapped = notes.map((n) => {
    if (!nearMultiple(n.beat, grid) && nearMultiple(n.beat, 1 / 3)) return n;
    const beat = wrap(Math.round(n.beat / grid) * grid, lengthBeats) + 0;
    return beat === n.beat ? n : { ...n, beat };
  });
  const key = (n: NoteEvent) => Math.round(n.beat * 3000);
  // Same key, same slot: keep the loudest (on a tie, the newer one).
  const best = new Map<string, number>();
  snapped.forEach((n, i) => {
    const k = `${n.step}@${key(n)}`;
    const j = best.get(k);
    if (j === undefined || n.vel >= snapped[j].vel) best.set(k, i);
  });
  const merged = snapped.filter((n, i) => best.get(`${n.step}@${key(n)}`) === i);
  // Per-slot cap: the newest notes stay.
  const count = new Map<number, number>();
  for (const n of merged) count.set(key(n), (count.get(key(n)) ?? 0) + 1);
  const out = merged.filter((n) => {
    const k = key(n);
    const c = count.get(k)!;
    if (c <= cap) return true;
    count.set(k, c - 1);
    return false;
  });
  return out;
}
