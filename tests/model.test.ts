import { describe, expect, it } from 'vitest';
import { paintingNotes, strokeToNotes } from '../src/magic/painting';
import { songName } from '../src/magic/names';
import { createProject, projectMeta } from '../src/model/project';
import { migrateProject, migrateSettings, DEFAULT_SETTINGS } from '../src/model/schema';
import { nextFxLevel, nextPreset } from '../src/model/monsters';
import type { Stroke } from '../src/model/types';
import { PAINT_ROW } from '../src/model/types';

describe('project factory', () => {
  it('creates the four core monsters with empty rows', () => {
    const p = createProject({ seed: 42, now: 1000 });
    expect(p.tracks.map((t) => t.monster)).toEqual(['bloop', 'boom', 'grumble', 'spark']);
    expect(p.arrangement.rows[PAINT_ROW]).toHaveLength(8);
    expect(p.createdAt).toBe(1000);
    expect(projectMeta(p).filled).toEqual([]);
  });

  it('names songs deterministically', () => {
    expect(songName(5)).toBe(songName(5));
    expect(songName(5).length).toBeGreaterThan(3);
  });
});

describe('schema migration', () => {
  it('round-trips a current project', () => {
    const p = createProject({ seed: 1 });
    expect(migrateProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('upgrades unversioned drafts', () => {
    const p = createProject({ seed: 2 }) as unknown as Record<string, unknown>;
    delete p.schemaVersion;
    expect(migrateProject(p)?.schemaVersion).toBe(1);
  });

  it('repairs broken data instead of failing', () => {
    const repaired = migrateProject({
      tempo: 9999,
      scale: 'nonsense',
      tracks: [
        { monster: 'bloop', clips: [{ id: 'c', notes: [{ beat: 9.5, step: 99, vel: 7 }, { beat: 'x' }] }] },
        { monster: 'bloop' },
        { monster: 'dragon' },
      ],
      arrangement: { length: 4, rows: { nope: ['c'] } },
      painting: { strokes: [{ points: [0.1, 0.2, 5] }, { points: [] }] },
    });
    expect(repaired).not.toBeNull();
    const p = repaired!;
    expect(p.tempo).toBe(140);
    expect(p.scale).toBe('pentatonicMajor');
    expect(p.tracks).toHaveLength(1);
    const clip = p.tracks[0].clips[0];
    expect(clip.notes).toHaveLength(1);
    expect(clip.notes[0].beat).toBe(1.5);
    expect(clip.notes[0].step).toBe(15);
    expect(clip.notes[0].vel).toBe(1);
    expect(p.tracks[0].activeClipId).toBe('c');
    expect(p.arrangement.length).toBe(4);
    expect(p.arrangement.rows.nope).toBeUndefined();
    expect(p.arrangement.rows[p.tracks[0].id]).toEqual([null, null, null, null]);
    expect(p.painting.strokes).toHaveLength(1);
    expect(p.painting.strokes[0].points).toEqual([0.1, 0.2]);
  });

  it('rejects non-objects', () => {
    expect(migrateProject(null)).toBeNull();
    expect(migrateProject('song')).toBeNull();
  });

  it('sanitises settings', () => {
    expect(migrateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    const s = migrateSettings({ ageMode: 'maker', volume: 4, volumeCeiling: 0, motion: 'reduce' });
    expect(s.ageMode).toBe('maker');
    expect(s.volume).toBe(1);
    expect(s.volumeCeiling).toBe(0.1);
    expect(s.motion).toBe('reduce');
    expect(s.micAllowed).toBe(false);
  });
});

describe('monster helpers', () => {
  it('cycles fx levels and presets', () => {
    expect(nextFxLevel(0)).toBe(0.4);
    expect(nextFxLevel(0.4)).toBe(0.8);
    expect(nextFxLevel(0.8)).toBe(0);
    expect(nextPreset('bloop', 'bubble-lead')).toBe('laser-jelly');
    expect(nextPreset('bloop', 'alien-giggle')).toBe('bubble-lead');
  });
});

describe('sound painting', () => {
  const stroke = (points: number[], extra: Partial<Stroke> = {}): Stroke => ({
    id: 's',
    brush: 'bloop',
    kind: 'line',
    points,
    weight: 0.5,
    ...extra,
  });

  it('turns a dot into one short note', () => {
    const notes = strokeToNotes(stroke([0.5, 0, 0.505, 0.01]), 8);
    expect(notes).toHaveLength(1);
    expect(notes[0].beat).toBe(4);
    expect(notes[0].step).toBe(7);
  });

  it('turns a flat line into one held note', () => {
    const notes = strokeToNotes(stroke([0, 1, 0.5, 1]), 8);
    expect(notes).toHaveLength(1);
    expect(notes[0].step).toBe(0);
    expect(notes[0].beat).toBe(0);
    expect(notes[0].dur).toBe(4);
  });

  it('turns a rising line into a rising melody', () => {
    const notes = strokeToNotes(stroke([0, 1, 1, 0]), 8);
    const steps = notes.map((n) => n.step);
    expect(steps[0]).toBe(0);
    expect(steps[steps.length - 1]).toBe(7);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1]);
  });

  it('turns percussive lines into hits', () => {
    const notes = strokeToNotes(stroke([0, 1, 0.5, 1], { brush: 'boom' }), 8);
    expect(notes.map((n) => n.beat)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  });

  it('stamps stars', () => {
    const notes = strokeToNotes(stroke([0.25, 0.5, 0.25, 0.5, 0.75, 0], { kind: 'stars' }), 8);
    expect(notes.map((n) => n.beat)).toEqual([2, 6]);
  });

  it('cycles monsters with the rainbow brush', () => {
    const notes = strokeToNotes(stroke([0, 1, 1, 0], { brush: 'rainbow' }), 8);
    expect(new Set(notes.map((n) => n.monster)).size).toBeGreaterThan(1);
  });

  it('caches painting notes per painting object', () => {
    const painting = { strokes: [stroke([0, 1, 1, 0])], sleeping: false };
    expect(paintingNotes(painting, 8)).toBe(paintingNotes(painting, 8));
  });
});
