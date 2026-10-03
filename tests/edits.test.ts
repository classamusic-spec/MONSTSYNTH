import { describe, expect, it } from 'vitest';
import { processSamples } from '../src/audio/mic';
import { GROOVES, grooveNotes } from '../src/magic/grooves';
import type { CellWrite } from '../src/magic/steps';
import {
  addMonster,
  addStroke,
  clearLoop,
  cycleFx,
  editActiveClip,
  recordNote,
  removeMonster,
  replaceLoopNotes,
  setCellEdit,
  setRecordedDuration,
  tidyLoop,
} from '../src/model/edits';
import { activeClip, createProject } from '../src/model/project';
import { migrateProject } from '../src/model/schema';
import type { NoteEvent, Stroke } from '../src/model/types';
import { PAINT_ROW } from '../src/model/types';

const note = (id: string, beat: number, step = 2): NoteEvent => ({ id, beat, step, dur: 0.5, vel: 0.8, tone: 0 });
const opts = { grid: 0.5, isDrum: false, protectedIds: new Set<string>() };

describe('recording into a project', () => {
  it('creates the loop and fills the monster row on the first note', () => {
    const p = createProject({ seed: 1 });
    const bloop = p.tracks[0];
    const next = recordNote(p, bloop.id, note('a', 0), opts);
    const clip = activeClip(next.tracks[0])!;
    expect(clip.notes).toHaveLength(1);
    expect(next.arrangement.rows[bloop.id].every((c) => c === clip.id)).toBe(true);
    expect(p.tracks[0].clips).toHaveLength(0);
  });

  it('does not refill a row the child emptied on purpose', () => {
    let p = createProject({ seed: 2 });
    const id = p.tracks[0].id;
    p = recordNote(p, id, note('a', 0), opts);
    p = { ...p, arrangement: { ...p.arrangement, rows: { ...p.arrangement.rows, [id]: new Array(8).fill(null) } } };
    p = recordNote(p, id, note('b', 2), opts);
    expect(p.arrangement.rows[id].every((c) => c === null)).toBe(true);
  });

  it('sets durations and clears loops without losing the clip', () => {
    let p = createProject({ seed: 3 });
    const id = p.tracks[0].id;
    p = recordNote(p, id, note('a', 0), opts);
    p = setRecordedDuration(p, id, 'a', 2);
    expect(activeClip(p.tracks[0])!.notes[0].dur).toBe(2);
    const clipId = activeClip(p.tracks[0])!.id;
    p = clearLoop(p, id);
    expect(activeClip(p.tracks[0])!.notes).toHaveLength(0);
    expect(activeClip(p.tracks[0])!.id).toBe(clipId);
  });

  it('wakes a sleeping monster when you record on it', () => {
    let p = createProject({ seed: 9 });
    const id = p.tracks[0].id;
    p = { ...p, tracks: p.tracks.map((t, i) => (i === 0 ? { ...t, sleeping: true } : i === 1 ? { ...t, solo: true } : t)) };
    p = recordNote(p, id, note('a', 0), opts);
    expect(p.tracks[0].sleeping).toBe(false);
    expect(p.tracks[0].solo).toBe(true);
    expect(p.tracks[1].solo).toBe(true);
  });

  it('cycles effect buddies through three levels', () => {
    let p = createProject({ seed: 4 });
    const id = p.tracks[0].id;
    const levels: number[] = [];
    for (let i = 0; i < 3; i++) {
      p = cycleFx(p, id, 'echo');
      levels.push(p.tracks[0].fx.echo);
    }
    expect(levels).toEqual([0.4, 0.8, 0]);
  });
});

describe('Beat Hop edits', () => {
  const kick = (col: number, target: CellWrite['target'] = 'one'): CellWrite => ({
    step: 0,
    col,
    target,
    lengthBeats: 8,
    beatsPerBar: 4,
    isDrum: true,
    columnCap: Infinity,
    dur: 0.5,
  });
  const boomOf = (p: ReturnType<typeof createProject>) => p.tracks.find((t) => t.monster === 'boom')!;

  it('the first stone creates the loop and fills the empty Blocks row', () => {
    const p = createProject({ seed: 21 });
    const id = boomOf(p).id;
    const next = setCellEdit(p, id, kick(0));
    const boom = boomOf(next);
    const clip = activeClip(boom)!;
    expect(boom.activeClipId).toBe(clip.id);
    expect(clip.notes.map((n) => [n.beat, n.step])).toEqual([[0, 0]]);
    expect(next.arrangement.rows[id].every((c) => c === clip.id)).toBe(true);
  });

  it('never refills a row the child emptied on purpose', () => {
    const p0 = createProject({ seed: 22 });
    const id = boomOf(p0).id;
    let p = setCellEdit(p0, id, kick(0));
    p = { ...p, arrangement: { ...p.arrangement, rows: { ...p.arrangement.rows, [id]: new Array(8).fill(null) } } };
    p = setCellEdit(p, id, kick(2));
    expect(p.arrangement.rows[id].every((c) => c === null)).toBe(true);
  });

  it('wakes a sleeping monster and joins it to the solo group', () => {
    let p = createProject({ seed: 23 });
    const id = boomOf(p).id;
    p = { ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, sleeping: true } : t.monster === 'bloop' ? { ...t, solo: true } : t)) };
    p = setCellEdit(p, id, kick(4));
    expect(boomOf(p).sleeping).toBe(false);
    expect(boomOf(p).solo).toBe(true);
  });

  it('an edit that changes nothing returns the same project', () => {
    const p0 = createProject({ seed: 24 });
    const id = boomOf(p0).id;
    const p = setCellEdit(p0, id, kick(1));
    expect(setCellEdit(p, id, kick(1))).toBe(p);
    expect(setCellEdit(p, id, kick(5, 'off'))).toBe(p);
    expect(editActiveClip(p, id, (c) => c)).toBe(p);
    // Nothing is created for a no-op on a monster with no loop yet.
    const fresh = createProject({ seed: 25 });
    expect(setCellEdit(fresh, boomOf(fresh).id, kick(3, 'off'))).toBe(fresh);
    expect(editActiveClip(fresh, 'nobody', (c) => ({ ...c }))).toBe(fresh);
  });

  it('a wand groove replaces the loop', () => {
    const p0 = createProject({ seed: 26 });
    const id = boomOf(p0).id;
    let p = setCellEdit(p0, id, kick(3));
    const groove = grooveNotes(GROOVES[1], { beatsPerBar: 4 });
    p = replaceLoopNotes(p, id, groove);
    expect(activeClip(boomOf(p))!.notes).toEqual(groove);
    expect(boomOf(p).clips).toHaveLength(1);
  });

  it('tidies only the active loop of that monster, and is a no-op when tidy', () => {
    let p = createProject({ seed: 27 });
    const bloop = p.tracks[0].id;
    p = recordNote(p, bloop, note('a', 0.97), opts);
    p = recordNote(p, bloop, note('b', 7.9, 4), opts);
    const before = p;
    const t = tidyLoop(p, bloop, 0.5);
    expect(activeClip(t.tracks[0])!.notes.map((n) => [n.id, n.beat])).toEqual([
      ['a', 1],
      ['b', 0],
    ]);
    expect(t.tracks.slice(1)).toEqual(before.tracks.slice(1));
    expect(t.arrangement).toBe(before.arrangement);
    expect(tidyLoop(t, bloop, 0.5)).toBe(t);
    expect(tidyLoop(t, boomOf(t).id, 0.5)).toBe(t);
  });
});

describe('the monster bench', () => {
  it('keeps loops and blocks when a monster goes home and comes back', () => {
    let p = createProject({ seed: 5 });
    const boom = p.tracks[1];
    p = recordNote(p, boom.id, note('k', 0, 0), { ...opts, isDrum: true });
    p = { ...p, arrangement: { ...p.arrangement, rows: { ...p.arrangement.rows, [boom.id]: p.arrangement.rows[boom.id].map((c, i) => (i % 2 ? null : c)) } } };
    const row = p.arrangement.rows[boom.id];

    p = removeMonster(p, boom.id);
    expect(p.tracks.some((t) => t.monster === 'boom')).toBe(false);
    expect(p.bench.map((b) => b.track.monster)).toEqual(['boom']);
    expect(p.arrangement.rows[boom.id]).toBeUndefined();

    p = addMonster(p, 'boom');
    const back = p.tracks.find((t) => t.monster === 'boom')!;
    expect(back.id).toBe(boom.id);
    expect(activeClip(back)!.notes).toHaveLength(1);
    expect(p.arrangement.rows[boom.id]).toEqual(row);
    expect(p.bench).toHaveLength(0);
  });

  it('never removes the last monster and never duplicates one', () => {
    let p = createProject({ seed: 6, monsters: ['bloop'] });
    expect(removeMonster(p, p.tracks[0].id)).toBe(p);
    p = addMonster(p, 'puff');
    expect(addMonster(p, 'puff')).toBe(p);
  });

  it('survives a save/load round trip', () => {
    let p = createProject({ seed: 7 });
    p = recordNote(p, p.tracks[0].id, note('a', 1), opts);
    p = removeMonster(p, p.tracks[0].id);
    const loaded = migrateProject(JSON.parse(JSON.stringify(p)))!;
    expect(loaded.bench).toHaveLength(1);
    expect(activeClip(loaded.bench[0].track)!.notes).toHaveLength(1);
  });
});

describe('painting', () => {
  it('fills the painting row on the first stroke', () => {
    const stroke: Stroke = { id: 's1', brush: 'bloop', kind: 'line', points: [0, 0.5, 0.5, 0.5], weight: 0.5 };
    const p = addStroke(createProject({ seed: 8 }), stroke);
    expect(p.arrangement.rows[PAINT_ROW].every((c) => c === PAINT_ROW)).toBe(true);
  });
});

describe('Mimic voice processing', () => {
  const rate = 8000;
  const withVoice = (lead: number, voice: number, tail: number, amp = 0.2) => {
    const n = Math.floor((lead + voice + tail) * rate);
    const x = new Float32Array(n);
    for (let i = Math.floor(lead * rate); i < Math.floor((lead + voice) * rate); i++) x[i] = amp * Math.sin((i / rate) * 2 * Math.PI * 220);
    return x;
  };

  it('trims silence and normalises the peak', () => {
    const out = processSamples(withVoice(0.8, 0.5, 0.7), rate)!;
    expect(out).not.toBeNull();
    const seconds = out.length / rate;
    expect(seconds).toBeGreaterThan(0.5);
    expect(seconds).toBeLessThan(0.75);
    const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeGreaterThan(0.8);
    expect(peak).toBeLessThanOrEqual(0.9);
    expect(Math.abs(out[0])).toBeLessThan(0.01);
    expect(Math.abs(out[out.length - 1])).toBeLessThan(0.01);
  });

  it('ignores silence', () => {
    expect(processSamples(new Float32Array(rate), rate)).toBeNull();
  });

  it('caps recordings at three seconds', () => {
    const out = processSamples(withVoice(0, 5, 0), rate)!;
    expect(out.length).toBe(3 * rate);
  });
});
