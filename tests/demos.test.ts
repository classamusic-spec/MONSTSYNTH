import { describe, expect, it } from 'vitest';
import { DEMO_SONGS, demoProject } from '../src/magic/demos';
import { songHasSound } from '../src/magic/sequence';
import { MONSTERS } from '../src/model/monsters';
import { migrateProject } from '../src/model/schema';

describe('demo songs', () => {
  it('has six songs with unique ids and titles', () => {
    expect(DEMO_SONGS).toHaveLength(6);
    expect(new Set(DEMO_SONGS.map((s) => s.id)).size).toBe(6);
    expect(new Set(DEMO_SONGS.map((s) => s.title)).size).toBe(6);
  });

  for (const song of DEMO_SONGS) {
    describe(song.title, () => {
      const p = demoProject(song, 3);

      it('uses real sounds, at most four monsters, and a sane tempo', () => {
        expect(p.tracks.length).toBeLessThanOrEqual(4);
        expect(p.tempo).toBeGreaterThanOrEqual(70);
        expect(p.tempo).toBeLessThanOrEqual(140);
        for (const t of p.tracks) expect(MONSTERS[t.monster].presets.some((x) => x.id === t.preset), `${t.monster}:${t.preset}`).toBe(true);
      });

      it('keeps every note on the keys, inside its loop, and drums on the grid', () => {
        for (const t of p.tracks) {
          for (const c of t.clips) {
            expect(c.notes.length).toBeLessThanOrEqual(MONSTERS[t.monster].maxClipNotes);
            for (const n of c.notes) {
              expect(n.beat).toBeGreaterThanOrEqual(0);
              expect(n.beat + 1e-9).toBeLessThan(c.lengthBeats);
              expect(n.step).toBeGreaterThanOrEqual(0);
              expect(n.step).toBeLessThan(8);
              if (t.monster === 'boom') expect((n.beat * 4) % 1).toBe(0);
            }
          }
        }
      });

      it('plays something in every block and ends with the whole band', () => {
        const L = p.arrangement.length;
        for (let col = 0; col < L; col++) {
          expect(p.tracks.some((t) => !!p.arrangement.rows[t.id][col]), `block ${col + 1}`).toBe(true);
        }
        expect(p.tracks.every((t) => !!p.arrangement.rows[t.id][L - 1])).toBe(true);
        expect(songHasSound(p, 'song')).toBe(true);
      });

      it('survives save and load unchanged', () => {
        expect(migrateProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
      });
    });
  }
});
