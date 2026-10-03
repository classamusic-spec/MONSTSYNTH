import { describe, expect, it } from 'vitest';
import { clipForCell, ensureRows, fillRow, isMultiClipRow, magicArrange, moveCell, rowIsEmpty, setCell } from '../src/magic/arrange';
import { lessonProject, TEACH_SONGS } from '../src/magic/lessons';
import { songHasSound } from '../src/magic/sequence';
import { monsterBandProject } from '../src/magic/templates';
import { createProject } from '../src/model/project';
import type { Arrangement, Project } from '../src/model/types';
import { PAINT_ROW } from '../src/model/types';

/** Every block has somebody playing, and everybody with a loop plays the last one. */
function expectSongShape(p: Project, a: Arrangement, ids: string[]) {
  for (let col = 0; col < a.length; col++) expect(ids.some((id) => a.rows[id][col])).toBe(true);
  for (const id of ids) expect(a.rows[id][a.length - 1]).toBeTruthy();
  expect(songHasSound({ ...p, arrangement: a }, 'song')).toBe(true);
}

describe('Monster Blocks operations', () => {
  const p = createProject({ seed: 7 });
  const row = p.tracks[0].id;

  it('fills, toggles and moves blocks immutably', () => {
    const filled = fillRow(p.arrangement, row, 'clip');
    expect(filled.rows[row].every((c) => c === 'clip')).toBe(true);
    expect(rowIsEmpty(p.arrangement, row)).toBe(true);

    const holed = setCell(filled, row, 2, null);
    expect(holed.rows[row][2]).toBeNull();
    expect(filled.rows[row][2]).toBe('clip');

    const moved = moveCell(holed, row, 3, 2);
    expect(moved.rows[row][2]).toBe('clip');
    expect(moved.rows[row][3]).toBeNull();
  });

  it('ignores out-of-range edits', () => {
    expect(setCell(p.arrangement, row, 99, 'x')).toBe(p.arrangement);
    expect(moveCell(p.arrangement, row, 0, 99)).toBe(p.arrangement);
  });

  it('repairs missing rows', () => {
    const broken = { ...p, arrangement: { length: 8, rows: {} } };
    const fixed = ensureRows(broken);
    expect(Object.keys(fixed.rows).sort()).toEqual([...p.tracks.map((t) => t.id), PAINT_ROW].sort());
    expect(fixed.rows[row]).toHaveLength(8);
  });
});

describe('Monster Magic · make it a song', () => {
  it('builds a musical arrangement for every seed', () => {
    const band = monsterBandProject(11);
    for (let seed = 0; seed < 30; seed++) {
      const a = magicArrange(band, seed);
      const ids = band.tracks.map((t) => t.id);
      // Every block has at least one monster playing.
      for (let col = 0; col < a.length; col++) expect(ids.some((id) => a.rows[id][col])).toBe(true);
      // Everybody plays in the finale.
      for (const id of ids) expect(a.rows[id][a.length - 1]).toBeTruthy();
      // Layers enter gradually: the first block is never the full band.
      expect(ids.filter((id) => a.rows[id][0]).length).toBeLessThan(ids.length);
    }
  });

  it('fills everything when there is just one loop', () => {
    const band = monsterBandProject(12);
    const solo = { ...band, tracks: band.tracks.map((t, i) => (i === 0 ? t : { ...t, clips: [], activeClipId: null })) };
    const a = magicArrange(solo, 3);
    expect(a.rows[solo.tracks[0].id].every(Boolean)).toBe(true);
  });

  it('leaves an empty song empty, and returns the very same arrangement', () => {
    const empty = createProject({ seed: 1 });
    const a = magicArrange(empty, 1);
    for (const r of Object.values(a.rows)) expect(r.every((c) => c === null)).toBe(true);
    expect(a).toBe(empty.arrangement);
  });

  it('returns the same arrangement object whenever nothing changes', () => {
    const band = monsterBandProject(12);
    const solo = { ...band, tracks: band.tracks.map((t, i) => (i === 0 ? t : { ...t, clips: [], activeClipId: null })) };
    const once = { ...solo, arrangement: magicArrange(solo, 3) };
    expect(magicArrange(once, 4)).toBe(once.arrangement);
  });

  it('first Magic with a beat: Boom enters in block 1, and the song still works', () => {
    const band = monsterBandProject(21);
    const boom = band.tracks.find((t) => t.monster === 'boom')!.id;
    const ids = band.tracks.map((t) => t.id);
    for (let seed = 0; seed < 30; seed++) {
      const a = magicArrange(band, seed, { beatFirst: true });
      expect(a.rows[boom][0]).toBeTruthy();
      expect(ids.filter((id) => a.rows[id][0]).length).toBeLessThan(ids.length);
      expectSongShape(band, a, ids);
    }
    // Without a beat in the song the flag changes nothing.
    const noBeat = { ...band, tracks: band.tracks.map((t) => (t.monster === 'boom' ? { ...t, clips: [], activeClipId: null } : t)) };
    for (let seed = 0; seed < 6; seed++) expect(magicArrange(noBeat, seed, { beatFirst: true })).toEqual(magicArrange(noBeat, seed));
  });
});

describe('Monster Magic keeps a song kept from Learn', () => {
  const twinkle = TEACH_SONGS.find((s) => s.id === 'twinkle')!;
  const song = lessonProject(twinkle, 9);
  const melody = song.tracks.find((t) => t.monster === twinkle.teacher)!;
  const distinct = (row: (string | null)[]) => new Set(row.filter(Boolean)).size;

  it('a learned tune is a multi-loop row (one phrase per block)', () => {
    expect(isMultiClipRow(melody, song.arrangement.rows[melody.id])).toBe(true);
    expect(distinct(song.arrangement.rows[melody.id])).toBe(3);
  });

  it('Magic never collapses the tune to its first phrase', () => {
    const ids = song.tracks.map((t) => t.id);
    for (let seed = 0; seed <= 20; seed++) {
      const a = magicArrange(song, seed);
      expect(distinct(a.rows[melody.id])).toBeGreaterThanOrEqual(3);
      for (const t of song.tracks) {
        const own = new Set(t.clips.map((c) => c.id));
        a.rows[t.id].forEach((cell, col) => {
          if (cell) expect(cell === song.arrangement.rows[t.id][col] || own.has(cell)).toBe(true);
        });
      }
      // Where the tune plays, it plays its own phrase for that block.
      a.rows[melody.id].forEach((cell, col) => {
        if (cell) expect(cell).toBe(song.arrangement.rows[melody.id][col]);
      });
      expectSongShape(song, a, ids);
    }
  });

  it('tap after tap, the tune and its chords stay whole and in order', () => {
    let p = song;
    for (let seed = 0; seed < 12; seed++) {
      p = { ...p, arrangement: magicArrange(p, seed * 7 + 1, { beatFirst: seed === 0 }) };
      for (const t of song.tracks) {
        if (isMultiClipRow(t, song.arrangement.rows[t.id])) expect(p.arrangement.rows[t.id]).toEqual(song.arrangement.rows[t.id]);
      }
    }
    // Magic still arranges the beat around the tune: it does not always play.
    const boom = song.tracks.find((t) => t.monster === 'boom')!.id;
    const shapes = new Set(Array.from({ length: 12 }, (_, seed) => magicArrange(song, seed).rows[boom].map((c) => (c ? 'X' : '.')).join('')));
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('every kept lesson survives Magic with all of its phrases', () => {
    for (const lesson of TEACH_SONGS) {
      const p = lessonProject(lesson, 3);
      const teacher = p.tracks.find((t) => t.monster === lesson.teacher)!;
      expect(distinct(p.arrangement.rows[teacher.id])).toBeGreaterThanOrEqual(2);
      for (let seed = 0; seed < 8; seed++) {
        const a = magicArrange(p, seed);
        // The tune may come in late, but from then on every block sings its own phrase.
        a.rows[teacher.id].forEach((cell, col) => {
          if (cell) expect(cell).toBe(p.arrangement.rows[teacher.id][col]);
        });
        expect(distinct(a.rows[teacher.id])).toBeGreaterThanOrEqual(2);
        expectSongShape(p, a, p.tracks.map((t) => t.id));
      }
    }
  });

  it('a gap is filled with the nearest phrase to its left', () => {
    const row = song.arrangement.rows[melody.id];
    const holed: Project = { ...song, arrangement: setCell(song.arrangement, melody.id, 3, null) };
    expect(clipForCell(holed, melody.id, 3)).toBe(row[2]);
    const cleared: Project = { ...song, arrangement: { ...song.arrangement, rows: { ...song.arrangement.rows, [melody.id]: row.map((c, i) => (i < 2 ? null : c)) } } };
    // Nothing to the left: the monster's own (first) loop.
    expect(clipForCell(cleared, melody.id, 0)).toBe(melody.activeClipId);
  });

  it('other rows fill with the monster\'s loop; rows without one stay empty', () => {
    const band = monsterBandProject(30);
    const t = band.tracks[0];
    expect(clipForCell(band, t.id, 2)).toBe(t.activeClipId);
    const empty = createProject({ seed: 4 });
    expect(clipForCell(empty, empty.tracks[0].id, 0)).toBeNull();
    expect(clipForCell(empty, PAINT_ROW, 0)).toBeNull();
    expect(clipForCell(empty, 'nobody', 0)).toBeNull();
  });
});
