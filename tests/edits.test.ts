import { describe, expect, it } from 'vitest';
import { processSamples } from '../src/audio/mic';
import { addMonster, addStroke, clearLoop, cycleFx, recordNote, removeMonster, setRecordedDuration } from '../src/model/edits';
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
