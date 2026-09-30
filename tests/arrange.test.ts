import { describe, expect, it } from 'vitest';
import { ensureRows, fillRow, magicArrange, moveCell, rowIsEmpty, setCell } from '../src/magic/arrange';
import { monsterBandProject } from '../src/magic/templates';
import { createProject } from '../src/model/project';
import { PAINT_ROW } from '../src/model/types';

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

  it('leaves an empty song empty', () => {
    const a = magicArrange(createProject({ seed: 1 }), 1);
    for (const r of Object.values(a.rows)) expect(r.every((c) => c === null)).toBe(true);
  });
});
