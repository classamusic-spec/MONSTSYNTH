import type { Clip, NoteEvent } from '../model/types';
import { gridSlot, softQuantize, wrap } from './timing';

// ─────────────────────────────────────────────────────────────────────────────
// MONSTER MAGIC · loop recording rules.
//
// Recording is a looper: while the red button is on, the loop keeps circling and
// everything a child plays is dropped into it. Rules that keep loops musical:
//
//  • Soft quantisation pulls each note towards the grid.
//  • "Replace, don't pile up": a new note replaces notes recorded on an *earlier*
//    pass in the same grid slot. Notes played together on this pass (chords,
//    drum layers) are kept. Loops stay clean however long a child keeps playing.
//  • Drums only replace the same drum in a slot, so kick + snare can layer.
//  • Hard caps on notes per slot and per clip protect the mix and the CPU.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_NOTES_PER_CLIP = 96;

export interface PlacementOptions {
  loopBeats: number;
  grid: number;
  strength: number;
}

export interface Placement {
  /** Position inside the loop, 0 <= beat < loopBeats. */
  beat: number;
  /** Unwrapped transport beat after quantisation (used to avoid double-triggering). */
  absBeat: number;
}

/** Where a note played at transport beat `absBeat` lands in the loop. */
export function placeNote(absBeat: number, opts: PlacementOptions): Placement {
  const q = softQuantize(absBeat, opts.grid, opts.strength);
  return { beat: wrap(q, opts.loopBeats), absBeat: q };
}

export interface InsertOptions {
  grid: number;
  /** Drums: only the same pad is replaced inside a slot. */
  isDrum: boolean;
  /** Notes recorded on the current pass. They are never replaced (chords, layers). */
  protectedIds: ReadonlySet<string>;
  maxPerSlot?: number;
}

export function insertRecordedNote(clip: Clip, note: NoteEvent, opts: InsertOptions): Clip {
  const slots = Math.max(1, Math.round(clip.lengthBeats / opts.grid));
  const slotOf = (n: NoteEvent) => ((gridSlot(n.beat, opts.grid) % slots) + slots) % slots;
  const slot = slotOf(note);
  const maxPerSlot = opts.maxPerSlot ?? (opts.isDrum ? 4 : 3);

  let notes = clip.notes.filter((n) => {
    if (slotOf(n) !== slot) return true;
    if (opts.protectedIds.has(n.id)) {
      // Same pass, same slot, same key: it's a double tap / roll collapsing into one slot.
      return n.step !== note.step;
    }
    if (opts.isDrum) return n.step !== note.step;
    return false;
  });

  const inSlot = notes.filter((n) => slotOf(n) === slot);
  if (inSlot.length >= maxPerSlot) {
    const drop = new Set(inSlot.slice(0, inSlot.length - maxPerSlot + 1).map((n) => n.id));
    notes = notes.filter((n) => !drop.has(n.id));
  }

  notes.push(note);
  notes.sort((a, b) => a.beat - b.beat);
  if (notes.length > MAX_NOTES_PER_CLIP) {
    // Keep the newest material; drop the oldest unprotected notes first.
    const excess = notes.length - MAX_NOTES_PER_CLIP;
    const removable = notes.filter((n) => n.id !== note.id && !opts.protectedIds.has(n.id)).slice(0, excess);
    const drop = new Set(removable.map((n) => n.id));
    notes = notes.filter((n) => !drop.has(n.id));
  }
  return { ...clip, notes };
}

export function setNoteDuration(clip: Clip, noteId: string, dur: number): Clip {
  let changed = false;
  const notes = clip.notes.map((n) => {
    if (n.id !== noteId) return n;
    changed = true;
    return { ...n, dur };
  });
  return changed ? { ...clip, notes } : clip;
}
