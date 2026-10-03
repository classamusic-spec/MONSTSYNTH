import { seededRandom } from '../model/ids';
import { activeClip, trackHasLoop } from '../model/project';
import type { Arrangement, MonsterKind, Project, Track } from '../model/types';
import { PAINT_ROW } from '../model/types';

// ─────────────────────────────────────────────────────────────────────────────
// MONSTER BLOCKS · arrangement operations (all pure, all undoable by the store).
// ─────────────────────────────────────────────────────────────────────────────

export function cloneArrangement(a: Arrangement): Arrangement {
  const rows: Record<string, (string | null)[]> = {};
  for (const [k, v] of Object.entries(a.rows)) rows[k] = [...v];
  return { length: a.length, rows };
}

/** Make sure every track (and the painting) has a row of the right length. */
export function ensureRows(project: Project): Arrangement {
  const a = cloneArrangement(project.arrangement);
  const ids = [...project.tracks.map((t) => t.id), PAINT_ROW];
  for (const id of ids) {
    const row = a.rows[id] ?? [];
    a.rows[id] = Array.from({ length: a.length }, (_, i) => row[i] ?? null);
  }
  for (const id of Object.keys(a.rows)) if (!ids.includes(id)) delete a.rows[id];
  return a;
}

export function fillRow(a: Arrangement, rowId: string, value: string): Arrangement {
  const next = cloneArrangement(a);
  next.rows[rowId] = new Array(a.length).fill(value);
  return next;
}

export function setCell(a: Arrangement, rowId: string, col: number, value: string | null): Arrangement {
  if (col < 0 || col >= a.length) return a;
  const next = cloneArrangement(a);
  const row = next.rows[rowId] ?? new Array(a.length).fill(null);
  row[col] = value;
  next.rows[rowId] = row;
  return next;
}

/** Move a block along its row. Dropping onto another block swaps them. */
export function moveCell(a: Arrangement, rowId: string, from: number, to: number): Arrangement {
  if (from === to || from < 0 || to < 0 || from >= a.length || to >= a.length) return a;
  const next = cloneArrangement(a);
  const row = next.rows[rowId];
  if (!row) return a;
  const tmp = row[to];
  row[to] = row[from];
  row[from] = tmp;
  return next;
}

export function rowIsEmpty(a: Arrangement, rowId: string): boolean {
  return !(a.rows[rowId] ?? []).some(Boolean);
}

/**
 * Does this row play several different loops? A song kept from Learn does: one
 * phrase per block (A B C A …). Only clips the monster really has count.
 */
export function isMultiClipRow(track: Track, row: readonly (string | null)[] | undefined): boolean {
  if (!row) return false;
  const own = new Set(track.clips.map((c) => c.id));
  return new Set(row.filter((id): id is string => !!id && own.has(id))).size >= 2;
}

/**
 * The loop a tap on an empty block puts there. A row that plays several loops
 * continues the tune: it copies the nearest block to the left. Any other row
 * (or a gap with nothing to its left) plays the monster's loop. Null when the
 * row has nothing to play yet.
 */
export function clipForCell(project: Project, rowId: string, col: number): string | null {
  if (rowId === PAINT_ROW) return project.painting.strokes.length > 0 ? PAINT_ROW : null;
  const track = project.tracks.find((t) => t.id === rowId);
  if (!track) return null;
  const row = project.arrangement.rows[rowId];
  if (row && isMultiClipRow(track, row)) {
    const own = new Set(track.clips.map((c) => c.id));
    for (let c = Math.min(col, row.length) - 1; c >= 0; c--) {
      const id = row[c];
      if (id && own.has(id)) return id;
    }
  }
  return trackHasLoop(track) ? activeClip(track)!.id : null;
}

function sameArrangement(a: Arrangement, b: Arrangement): boolean {
  if (a.length !== b.length) return false;
  const keys = Object.keys(a.rows);
  if (keys.length !== Object.keys(b.rows).length) return false;
  return keys.every((k) => {
    const ra = a.rows[k];
    const rb = b.rows[k];
    return !!rb && ra.length === rb.length && ra.every((v, i) => v === rb[i]);
  });
}

// ── Monster Magic: "make it a song" ─────────────────────────────────────────

interface Layer {
  rowId: string;
  /** What each block plays once the layer is in: one loop everywhere, or the row's own phrase per block. */
  pattern: string[];
  monster: MonsterKind | 'paint';
  /** A tune of several phrases plays the whole song, from block 1 (never brought in late or dropped). */
  whole: boolean;
}

/**
 * A multi-loop row's phrases, block by block. A gap takes the nearest phrase
 * to its left (or the row's first one), so the tune carries on.
 */
function phrasePattern(track: Track, row: (string | null)[]): string[] | null {
  const own = new Map(track.clips.map((c) => [c.id, c]));
  const cells = row.map((id) => (id && own.has(id) ? id : null));
  if (!cells.some((id) => id && own.get(id)!.notes.length > 0)) return null;
  const first = cells.find((id): id is string => !!id)!;
  let last = first;
  return cells.map((id) => (last = id ?? last));
}

const RHYTHM: (MonsterKind | 'paint')[] = ['boom', 'grumble'];

const ENTRY_ORDERS: (MonsterKind | 'paint')[][] = [
  // Beat first: drums, then bass, then the tune.
  ['boom', 'grumble', 'spark', 'puff', 'bloop', 'paint', 'mimic'],
  // Dreamy start: clouds and twinkles, then the band arrives.
  ['puff', 'spark', 'boom', 'grumble', 'bloop', 'paint', 'mimic'],
  // Tune first: the melody introduces itself, then the groove.
  ['bloop', 'paint', 'boom', 'grumble', 'spark', 'puff', 'mimic'],
];

export interface ArrangeOptions {
  /** The song's first Magic: with a beat in the song, the song starts on it (Boom enters in block 1). */
  beatFirst?: boolean;
}

/**
 * Turn whatever loops exist into a little song: layers enter one by one, there is
 * a breakdown where the rhythm drops out, and everyone plays at the end. Each seed
 * gives a different (but always musical) arrangement so repeated taps reward play.
 *
 * A row that already plays several loops (a song kept from Learn: the tune, and
 * the bass and sparkles that follow its chords) keeps its phrases, block by
 * block, from block 1: the song still starts at its beginning, and a block Magic
 * emptied can never be refilled with the wrong phrase by the next tap. Magic
 * arranges the other layers around it (the beat comes in, drops out, returns).
 * Returns the project's own arrangement (the same object) when nothing changes.
 */
export function magicArrange(project: Project, seed: number, opts: ArrangeOptions = {}): Arrangement {
  const base = ensureRows(project);
  const length = base.length;
  const rnd = seededRandom(seed);

  const layers: Layer[] = [];
  for (const t of project.tracks) {
    if (t.sleeping) continue;
    const row = base.rows[t.id];
    const phrases = isMultiClipRow(t, row) ? phrasePattern(t, row) : null;
    if (phrases) {
      layers.push({ rowId: t.id, pattern: phrases, monster: t.monster, whole: true });
      continue;
    }
    const clip = activeClip(t);
    if (clip && trackHasLoop(t)) layers.push({ rowId: t.id, pattern: new Array(length).fill(clip.id), monster: t.monster, whole: false });
  }
  if (project.painting.strokes.length > 0 && !project.painting.sleeping) {
    layers.push({ rowId: PAINT_ROW, pattern: new Array(length).fill(PAINT_ROW), monster: 'paint', whole: false });
  }

  const next = cloneArrangement(base);
  for (const id of Object.keys(next.rows)) next.rows[id] = new Array(length).fill(null);
  const result = layers.length === 0 ? next : arrangeLayers(next, layers, seed, rnd, opts);
  return sameArrangement(result, project.arrangement) ? project.arrangement : result;
}

function arrangeLayers(next: Arrangement, layers: Layer[], seed: number, rnd: () => number, opts: ArrangeOptions): Arrangement {
  const length = next.length;
  const beat = opts.beatFirst && layers.some((l) => l.monster === 'boom');
  const order = beat ? ENTRY_ORDERS[0] : ENTRY_ORDERS[Math.abs(Math.floor(seed)) % ENTRY_ORDERS.length];
  layers.sort((a, b) => order.indexOf(a.monster) - order.indexOf(b.monster));

  if (layers.length === 1 || length < 4) {
    for (const l of layers) next.rows[l.rowId] = [...l.pattern];
    return next;
  }

  const breakdownAt = length >= 6 && layers.length >= 2 && rnd() < 0.85 ? length - 3 - (rnd() < 0.3 ? 1 : 0) : -1;
  const entryWindow = breakdownAt > 0 ? breakdownAt : length - 1;
  layers.forEach((layer, i) => {
    const enter = layer.whole ? 0 : Math.min(entryWindow - 1, Math.floor((i * entryWindow) / layers.length));
    for (let col = Math.max(0, enter); col < length; col++) next.rows[layer.rowId][col] = layer.pattern[col];
  });

  const gated = layers.filter((l) => !l.whole);
  if (breakdownAt > 0 && gated.length > 0) {
    let dropped = gated.filter((l) => RHYTHM.includes(l.monster));
    if (dropped.length === 0 || dropped.length === layers.length) dropped = [gated[0]];
    for (const l of dropped) next.rows[l.rowId][breakdownAt] = null;
    // Make sure the breakdown block still has somebody singing.
    const stillPlaying = layers.some((l) => next.rows[l.rowId][breakdownAt]);
    const singer = layers[layers.length - 1];
    if (!stillPlaying) next.rows[singer.rowId][breakdownAt] = singer.pattern[breakdownAt];
  }
  return next;
}
