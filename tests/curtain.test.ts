import { describe, expect, it } from 'vitest';
import { magicArrange } from '../src/magic/arrange';
import {
  applauseHits,
  BOW_MS,
  CLAP_TIMES,
  curtainTimes,
  CURTAIN_START_MS,
  HOP_MS,
  MAX_CLAP_VEL,
  noteRow,
  singGate,
  SING_GAP_MS,
  songPerformers,
} from '../src/magic/curtain';
import { songHasSound } from '../src/magic/sequence';
import { monsterBandProject } from '../src/magic/templates';
import { createClip, createProject } from '../src/model/project';
import type { NoteEvent, Project } from '../src/model/types';
import { PAINT_ROW } from '../src/model/types';

const note = (id: string, beat: number, step = 0): NoteEvent => ({ id, beat, step, dur: 0.5, vel: 0.8, tone: 0 });
const stroke = { id: 's1', kind: 'line' as const, brush: 'bloop' as const, points: [0.1, 0.5, 0.5, 0.5, 0.9, 0.5], weight: 0.8 };

/** Track `i` gets a loop with `notes`, placed in the given blocks only. */
function placed(p: Project, i: number, notes: NoteEvent[], cols: number[]): Project {
  const clip = { ...createClip(p.loopBeats), notes };
  const tracks = p.tracks.map((t, k) => (k === i ? { ...t, clips: [clip], activeClipId: clip.id } : t));
  const row = new Array(p.arrangement.length).fill(null).map((_, c) => (cols.includes(c) ? clip.id : null));
  return { ...p, tracks, arrangement: { ...p.arrangement, rows: { ...p.arrangement.rows, [p.tracks[i].id]: row } } };
}

describe('songPerformers · who takes the bow', () => {
  it('nobody in a new song; every band member in the Monster Band song, in row order', () => {
    expect(songPerformers(createProject({ seed: 1 }))).toEqual([]);
    const band = monsterBandProject(4);
    expect(songPerformers(band)).toEqual(band.tracks.map((t) => t.id));
  });

  it('a monster with no blocks just watches, wherever its blocks would be', () => {
    let p = createProject({ seed: 2 });
    p = placed(p, 1, [note('a', 0)], [6]);
    p = placed(p, 3, [note('b', 0)], [0, 2]);
    // Track 0 has a loop but no block: it watches.
    p = { ...p, tracks: p.tracks.map((t, i) => (i === 0 ? { ...t, clips: [{ ...createClip(8), notes: [note('c', 1)] }] } : t)) };
    expect(songPerformers(p)).toEqual([p.tracks[1].id, p.tracks[3].id]);
  });

  it('only what can be heard: sleeping, soloed-out and empty loops stay out', () => {
    const band = monsterBandProject(5);
    const [a, b] = band.tracks;
    expect(songPerformers({ ...band, tracks: band.tracks.map((t) => (t.id === a.id ? { ...t, sleeping: true } : t)) })).not.toContain(a.id);
    const solo = { ...band, tracks: band.tracks.map((t) => (t.id === b.id ? { ...t, solo: true } : t)) };
    expect(songPerformers(solo)).toEqual([b.id]);
    const p = placed(createProject({ seed: 3 }), 0, [], [0, 1, 2]);
    expect(songPerformers(p)).toEqual([]);
  });

  it('blocks past the end of the song do not count', () => {
    const p = placed(createProject({ seed: 4 }), 2, [note('a', 0)], [7]);
    expect(songPerformers(p)).toEqual([p.tracks[2].id]);
    expect(songPerformers({ ...p, arrangement: { ...p.arrangement, length: 7 } })).toEqual([]);
  });

  it('a kept Learn song counts the phrase in each block, not only the active loop', () => {
    let p = createProject({ seed: 5 });
    const empty = { ...createClip(p.loopBeats), notes: [] };
    const phrase = { ...createClip(p.loopBeats), notes: [note('p', 2, 4)] };
    const t = p.tracks[0];
    p = {
      ...p,
      tracks: p.tracks.map((x) => (x.id === t.id ? { ...x, clips: [empty, phrase], activeClipId: empty.id } : x)),
      arrangement: { ...p.arrangement, rows: { ...p.arrangement.rows, [t.id]: [empty.id, phrase.id, ...new Array(p.arrangement.length - 2).fill(null)] } },
    };
    expect(songPerformers(p)).toEqual([t.id]);
  });

  it('the painting bows last, when it sings and its row is on', () => {
    const p = createProject({ seed: 6 });
    const painted: Project = { ...p, painting: { strokes: [stroke], sleeping: false } };
    expect(songPerformers(painted)).toEqual([]);
    const on = { ...painted, arrangement: { ...p.arrangement, rows: { ...p.arrangement.rows, [PAINT_ROW]: [PAINT_ROW, ...new Array(p.arrangement.length - 1).fill(null)] } } };
    const withBloop = placed(on, 0, [note('a', 0)], [1]);
    expect(songPerformers(withBloop)).toEqual([withBloop.tracks[0].id, PAINT_ROW]);
    expect(songPerformers({ ...on, painting: { ...on.painting, sleeping: true } })).toEqual([]);
    // Another monster's solo leaves the painting out too.
    const soloed = { ...withBloop, tracks: withBloop.tracks.map((t, i) => (i === 0 ? { ...t, solo: true } : t)) };
    expect(songPerformers(soloed)).toEqual([withBloop.tracks[0].id]);
  });

  it('agrees with the finale guard: a bow exactly when the song had something to hear', () => {
    const fixtures: Project[] = [createProject({ seed: 7 }), monsterBandProject(8)];
    const band = monsterBandProject(9);
    fixtures.push({ ...band, tracks: band.tracks.map((t) => ({ ...t, sleeping: true })) });
    for (let seed = 1; seed <= 20; seed++) fixtures.push({ ...band, arrangement: magicArrange(band, seed) });
    for (const p of fixtures) expect(songPerformers(p).length > 0).toBe(songHasSound(p, 'song'));
  });
});

describe('noteRow · which row head sings a note', () => {
  it('a band note belongs to its track; a painting note to the painting, even in a borrowed voice', () => {
    expect(noteRow({ trackId: 't1', source: 'loop' })).toBe('t1');
    expect(noteRow({ trackId: 't1', source: 'live' })).toBe('t1');
    expect(noteRow({ trackId: 't1', source: 'paint' })).toBe(PAINT_ROW);
    expect(noteRow({ trackId: null, source: 'paint' })).toBe(PAINT_ROW);
    expect(noteRow({ trackId: null, source: 'live' })).toBeNull();
  });
});

describe('singGate · dense rows never thrash', () => {
  it('lets one reaction through per gap, and the big drum always', () => {
    expect(singGate(undefined, 0)).toBe(true);
    expect(singGate(1000, 1000 + SING_GAP_MS - 1)).toBe(false);
    expect(singGate(1000, 1000 + SING_GAP_MS)).toBe(true);
    expect(singGate(1000, 1010, true)).toBe(true);
  });

  it('sixteenth hi-hats at 180 bpm react at most every other note', () => {
    let last: number | undefined;
    let shown = 0;
    const sixteenth = 60000 / 180 / 4; // 83 ms
    for (let i = 0; i < 32; i++) {
      const now = i * sixteenth;
      if (singGate(last, now)) {
        last = now;
        shown++;
      }
    }
    expect(shown).toBe(16);
  });
});

describe('curtainTimes · hop one by one, bow together, then clap and "again"', () => {
  it('hops in row order after the ta-da, a short stagger apart, all within 700 ms', () => {
    for (const n of [1, 2, 4, 6, 7]) {
      const t = curtainTimes(n);
      expect(t.hops).toHaveLength(n);
      expect(t.hops[0]).toBe(CURTAIN_START_MS);
      for (let i = 1; i < n; i++) expect(t.hops[i]).toBeGreaterThan(t.hops[i - 1]);
      expect(t.hops[n - 1] - t.hops[0]).toBeLessThanOrEqual(700);
      // Everybody has landed before the bow; the hands clap during the bow.
      expect(t.bow).toBeGreaterThanOrEqual(t.hops[n - 1] + HOP_MS);
      expect(t.clap).toBeGreaterThan(t.bow);
      expect(t.clap).toBeLessThan(t.bow + BOW_MS);
      // "Again" comes after the last clap, and the stars are gone after that.
      expect(t.again).toBeGreaterThan(t.clap + CLAP_TIMES[CLAP_TIMES.length - 1] * 1000);
      expect(t.done).toBeGreaterThan(t.again);
    }
  });

  it('a band of one bows straight after its hop; nobody on screen still gets the claps', () => {
    expect(curtainTimes(1).hops).toEqual([CURTAIN_START_MS]);
    const none = curtainTimes(0);
    expect(none.hops).toEqual([]);
    expect(none.clap).toBeGreaterThan(CURTAIN_START_MS);
  });
});

describe('applauseHits · an audience, not a drum machine', () => {
  it('two pairs of hands on every clap of the rhythm, sorted, quiet, and deterministic', () => {
    const a = applauseHits(42);
    expect(a).toEqual(applauseHits(42));
    expect(a).not.toEqual(applauseHits(43));
    expect(a).toHaveLength(CLAP_TIMES.length * 2);
    for (let i = 1; i < a.length; i++) expect(a[i].at).toBeGreaterThanOrEqual(a[i - 1].at);
    for (const h of a) {
      expect(h.vel).toBeGreaterThan(0.2);
      expect(h.vel).toBeLessThanOrEqual(MAX_CLAP_VEL);
      expect(Math.abs(h.bend)).toBeLessThanOrEqual(3);
      expect(h.size).toBeGreaterThanOrEqual(-1);
      expect(h.size).toBeLessThanOrEqual(1);
    }
    // Every clap of the rhythm is there, and the second pair of hands is never more than 25 ms late.
    for (const t of CLAP_TIMES) expect(a.filter((h) => h.at >= t - 1e-9 && h.at <= t + 0.025)).toHaveLength(2);
    expect(a[a.length - 1].at).toBeLessThan(0.8);
  });

  it('the last clap is the strongest', () => {
    for (let seed = 1; seed < 20; seed++) {
      const a = applauseHits(seed);
      const last = CLAP_TIMES[CLAP_TIMES.length - 1];
      const top = Math.max(...a.filter((h) => h.at >= last - 1e-9).map((h) => h.vel));
      const before = Math.max(...a.filter((h) => h.at < last - 1e-9).map((h) => h.vel));
      expect(top).toBeGreaterThan(before);
    }
  });
});
