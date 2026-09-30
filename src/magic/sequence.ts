import { activeClip } from '../model/project';
import type { Clip, MonsterKind, NoteEvent, Project, Track } from '../model/types';
import { PAINT_ROW } from '../model/types';
import { paintingNotes } from './painting';

// ─────────────────────────────────────────────────────────────────────────────
// MONSTER MAGIC · the sequencer's brain.
// A pure function answers one question: "which notes start between beat A and
// beat B?" The transport asks it every few milliseconds with a small look-ahead
// window and schedules the answers sample-accurately in the audio engine.
//
//  loop mode  → every awake monster's loop repeats forever (the Monster Lab)
//  song mode  → Monster Blocks decide which loop plays in which block (the song)
// ─────────────────────────────────────────────────────────────────────────────

export type PlayMode = 'loop' | 'song';

export interface SeqEvent {
  /** Unwrapped transport beat of this occurrence. */
  absBeat: number;
  /** Audio channel that should play it (a track id, or `paint:<monster>`). */
  channelId: string;
  /** Track that owns the note, when there is one (for monster animation). */
  trackId: string | null;
  monster: MonsterKind;
  note: NoteEvent;
  source: 'clip' | 'paint';
}

export interface CollectOptions {
  mode: PlayMode;
  /** Return true to skip an occurrence (e.g. a note the child is playing live right now). */
  skip?: (noteId: string, absBeat: number) => boolean;
}

const EPS = 1e-9;

/** Tracks that make sound: awake, and soloed if anyone is soloed. */
export function audibleTracks(project: Project): Track[] {
  const anySolo = project.tracks.some((t) => t.solo);
  return project.tracks.filter((t) => !t.sleeping && (!anySolo || t.solo));
}

export function paintingAudible(project: Project): boolean {
  const anySolo = project.tracks.some((t) => t.solo);
  return !anySolo && !project.painting.sleeping && project.painting.strokes.length > 0;
}

export function paintChannel(project: Project, monster: MonsterKind): { channelId: string; trackId: string | null } {
  const track = project.tracks.find((t) => t.monster === monster);
  return track ? { channelId: track.id, trackId: track.id } : { channelId: `paint:${monster}`, trackId: null };
}

function occurrences(offset: number, period: number, from: number, to: number, out: (abs: number) => void) {
  if (period <= 0) return;
  let k = Math.ceil((from - offset) / period - EPS);
  let abs = k * period + offset;
  while (abs < to - EPS) {
    if (abs >= from - EPS) out(abs);
    k++;
    abs = k * period + offset;
  }
}

export function collectEvents(project: Project, from: number, to: number, opts: CollectOptions): SeqEvent[] {
  if (to <= from) return [];
  const events: SeqEvent[] = [];
  const skip = opts.skip;
  const tracks = audibleTracks(project);
  const paintOn = paintingAudible(project);
  const paint = paintOn ? paintingNotes(project.painting, project.loopBeats) : [];

  const pushClipNote = (track: Track, note: NoteEvent, abs: number) => {
    if (skip && skip(note.id, abs)) return;
    events.push({ absBeat: abs, channelId: track.id, trackId: track.id, monster: track.monster, note, source: 'clip' });
  };
  const pushPaint = (abs: number, pn: (typeof paint)[number]) => {
    const ch = paintChannel(project, pn.monster);
    events.push({
      absBeat: abs,
      channelId: ch.channelId,
      trackId: ch.trackId,
      monster: pn.monster,
      note: { id: pn.id, beat: pn.beat, dur: pn.dur, step: pn.step, vel: pn.vel, tone: 0 },
      source: 'paint',
    });
  };

  if (opts.mode === 'loop') {
    for (const track of tracks) {
      const clip = activeClip(track);
      if (!clip) continue;
      for (const note of clip.notes) occurrences(note.beat, clip.lengthBeats, from, to, (abs) => pushClipNote(track, note, abs));
    }
    for (const pn of paint) occurrences(pn.beat, project.loopBeats, from, to, (abs) => pushPaint(abs, pn));
  } else {
    const L = project.loopBeats;
    const blocks = project.arrangement.length;
    const firstCol = Math.max(0, Math.floor(from / L + EPS));
    const lastCol = Math.min(blocks - 1, Math.floor((to - EPS) / L));
    for (let col = firstCol; col <= lastCol; col++) {
      const colStart = col * L;
      const lo = Math.max(from, colStart);
      const hi = Math.min(to, colStart + L);
      if (hi <= lo) continue;
      for (const track of tracks) {
        const clipId = project.arrangement.rows[track.id]?.[col];
        if (!clipId) continue;
        const clip: Clip | undefined = track.clips.find((c) => c.id === clipId);
        if (!clip) continue;
        for (const note of clip.notes) {
          occurrences(colStart + note.beat, clip.lengthBeats, lo, hi, (abs) => pushClipNote(track, note, abs));
        }
      }
      if (paintOn && project.arrangement.rows[PAINT_ROW]?.[col]) {
        for (const pn of paint) occurrences(colStart + pn.beat, L, lo, hi, (abs) => pushPaint(abs, pn));
      }
    }
  }

  events.sort((a, b) => a.absBeat - b.absBeat);
  return events;
}
