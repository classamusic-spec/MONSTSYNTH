import { describe, expect, it } from 'vitest';
import { GROOVES, grooveNotes } from '../src/magic/grooves';
import { collectEvents } from '../src/magic/sequence';
import { writeCell } from '../src/magic/steps';
import { seededRandom } from '../src/model/ids';
import { createClip, createProject, songBeats } from '../src/model/project';
import type { NoteEvent, Project } from '../src/model/types';
import { PAINT_ROW } from '../src/model/types';

const note = (id: string, beat: number, step = 0): NoteEvent => ({ id, beat, step, dur: 0.5, vel: 0.8, tone: 0 });

function withLoop(project: Project, trackIndex: number, notes: NoteEvent[]): Project {
  const tracks = project.tracks.map((t, i) => {
    if (i !== trackIndex) return t;
    const clip = { ...createClip(project.loopBeats), notes };
    return { ...t, clips: [clip], activeClipId: clip.id };
  });
  return { ...project, tracks };
}

describe('collectEvents · loop mode', () => {
  const base = withLoop(createProject({ seed: 1 }), 0, [note('a', 0), note('b', 3.5)]);

  it('returns notes inside the window', () => {
    const ev = collectEvents(base, 0, 4, { mode: 'loop' });
    expect(ev.map((e) => [e.note.id, e.absBeat])).toEqual([
      ['a', 0],
      ['b', 3.5],
    ]);
  });

  it('repeats loops forever', () => {
    const ev = collectEvents(base, 8, 20, { mode: 'loop' });
    expect(ev.map((e) => e.absBeat)).toEqual([8, 11.5, 16, 19.5]);
  });

  it('never double-schedules across contiguous windows', () => {
    const seen: number[] = [];
    let from = 0;
    for (let i = 0; i < 400; i++) {
      const to = from + 0.037 * (1 + (i % 5));
      for (const e of collectEvents(base, from, to, { mode: 'loop' })) seen.push(e.absBeat);
      from = to;
    }
    const expected: number[] = [];
    for (let k = 0; k * 8 < from; k++) {
      if (k * 8 < from) expected.push(k * 8);
      if (k * 8 + 3.5 < from) expected.push(k * 8 + 3.5);
    }
    expect(seen).toEqual(expected);
  });

  it('skips sleeping monsters and honours solo', () => {
    let p = withLoop(base, 1, [note('kick', 1)]);
    expect(collectEvents(p, 0, 8, { mode: 'loop' })).toHaveLength(3);
    p = { ...p, tracks: p.tracks.map((t, i) => (i === 0 ? { ...t, sleeping: true } : t)) };
    expect(collectEvents(p, 0, 8, { mode: 'loop' }).map((e) => e.note.id)).toEqual(['kick']);
    p = { ...p, tracks: p.tracks.map((t, i) => (i === 0 ? { ...t, sleeping: false, solo: true } : t)) };
    expect(collectEvents(p, 0, 8, { mode: 'loop' }).map((e) => e.note.id)).toEqual(['a', 'b']);
  });

  it('lets the caller skip occurrences', () => {
    const ev = collectEvents(base, 0, 16, { mode: 'loop', skip: (id, abs) => id === 'a' && abs < 8 });
    expect(ev.map((e) => e.absBeat)).toEqual([3.5, 8, 11.5]);
  });

  it('repeats short clips inside a longer loop', () => {
    const p = withLoop(createProject({ seed: 2 }), 0, []);
    const clip = { ...createClip(4), notes: [note('x', 1)] };
    const q = { ...p, tracks: p.tracks.map((t, i) => (i === 0 ? { ...t, clips: [clip], activeClipId: clip.id } : t)) };
    expect(collectEvents(q, 0, 8, { mode: 'loop' }).map((e) => e.absBeat)).toEqual([1, 5]);
  });
});

describe('collectEvents · song mode', () => {
  it('follows Monster Blocks', () => {
    const p0 = withLoop(createProject({ seed: 3 }), 0, [note('a', 0)]);
    const t = p0.tracks[0];
    const row = new Array(p0.arrangement.length).fill(null);
    row[0] = t.activeClipId;
    row[2] = t.activeClipId;
    const p = { ...p0, arrangement: { ...p0.arrangement, rows: { ...p0.arrangement.rows, [t.id]: row } } };
    const ev = collectEvents(p, 0, songBeats(p), { mode: 'song' });
    expect(ev.map((e) => e.absBeat)).toEqual([0, 16]);
  });

  it('stops at the end of the song', () => {
    const p0 = withLoop(createProject({ seed: 4 }), 0, [note('a', 0)]);
    const t = p0.tracks[0];
    const p = {
      ...p0,
      arrangement: { ...p0.arrangement, rows: { ...p0.arrangement.rows, [t.id]: new Array(8).fill(t.activeClipId) } },
    };
    const ev = collectEvents(p, 60, 200, { mode: 'song' });
    expect(ev.map((e) => e.absBeat)).toEqual([]);
    expect(collectEvents(p, 56, 200, { mode: 'song' }).map((e) => e.absBeat)).toEqual([56]);
  });

  it('plays the painting where its blocks are', () => {
    const p0 = createProject({ seed: 5 });
    const p: Project = {
      ...p0,
      painting: { sleeping: false, strokes: [{ id: 's', brush: 'bloop', kind: 'stars', points: [0.5, 0.5], weight: 0.5 }] },
      arrangement: { ...p0.arrangement, rows: { ...p0.arrangement.rows, [PAINT_ROW]: [null, PAINT_ROW, null, null, null, null, null, null] } },
    };
    const ev = collectEvents(p, 0, songBeats(p), { mode: 'song' });
    expect(ev).toHaveLength(1);
    expect(ev[0].absBeat).toBe(12);
    expect(ev[0].source).toBe('paint');
    expect(ev[0].channelId).toBe(p.tracks[0].id);
  });
});

describe('collectEvents · Beat Hop grids', () => {
  // A grid-built Boom loop: random stones (ones and doubles) plus a wand groove.
  const rnd = seededRandom(11);
  let clip = { ...createClip(8), notes: grooveNotes(GROOVES[8], { beatsPerBar: 4 }) };
  for (let i = 0; i < 24; i++) {
    const w = {
      step: Math.floor(rnd() * 8),
      col: Math.floor(rnd() * 8),
      target: rnd() < 0.5 ? ('one' as const) : ('double' as const),
      lengthBeats: 8,
      beatsPerBar: 4,
      isDrum: true,
      columnCap: Infinity,
      dur: 0.5,
    };
    clip = writeCell(clip, w).clip;
  }
  const p0 = createProject({ seed: 9 });
  const project: Project = { ...p0, tracks: p0.tracks.map((t) => (t.monster === 'boom' ? { ...t, clips: [clip], activeClipId: clip.id } : t)) };

  it('over 400 random contiguous windows plays every stone exactly on an eighth, never missed or doubled', () => {
    const seen: string[] = [];
    let from = 0;
    for (let i = 0; i < 400; i++) {
      const to = from + 0.02 + rnd() * 0.25;
      for (const e of collectEvents(project, from, to, { mode: 'loop' })) {
        expect(Number.isInteger(e.absBeat * 2)).toBe(true);
        seen.push(`${e.note.id}@${e.absBeat}`);
      }
      from = to;
    }
    const expected: string[] = [];
    for (let k = 0; k * 8 < from; k++) for (const n of clip.notes) if (k * 8 + n.beat < from) expected.push(`${n.id}@${k * 8 + n.beat}`);
    expect(seen.length).toBe(expected.length);
    expect(new Set(seen)).toEqual(new Set(expected));
  });
});
