import { describe, expect, it } from 'vitest';
import { GROOVES, grooveNotes, wandGrooves, wandPattern } from '../src/magic/grooves';
import { monsterBandProject } from '../src/magic/templates';
import { MONSTERS } from '../src/model/monsters';
import { activeClip } from '../src/model/project';

const sig = (notes: { beat: number; step: number }[]) =>
  notes
    .map((n) => `${n.step}@${n.beat}`)
    .sort()
    .join(' ');

/** The Monster Band's beat as it was written before it moved into grooves.ts. */
const BAND_BOOM: [number, number][] = [
  [0, 0], [1.5, 0], [2, 0], [4, 0], [5.5, 0], [6, 0],
  [1, 1], [3, 1], [5, 1], [7, 1],
  [0.5, 2], [1.5, 2], [2.5, 2], [3.5, 2], [4.5, 2], [5.5, 2], [6.5, 2], [7.5, 3],
];

describe('wand grooves', () => {
  it('are deterministic', () => {
    let i = 0;
    const ids = () => `n${i++}`;
    const a = GROOVES.map((g) => grooveNotes(g, { beatsPerBar: 4, newId: ids }));
    i = 0;
    const b = GROOVES.map((g) => grooveNotes(g, { beatsPerBar: 4, newId: ids }));
    expect(a).toEqual(b);
  });

  it('land every hit exactly on an eighth inside the loop', () => {
    for (const g of GROOVES) {
      for (const row of Object.values(g.rows)) expect(row).toMatch(/^[xda.]{8}$/);
      for (const n of grooveNotes(g, { beatsPerBar: 4 })) {
        expect(Number.isInteger(n.beat * 2)).toBe(true);
        expect(n.beat).toBeGreaterThanOrEqual(0);
        expect(n.beat).toBeLessThan(8);
      }
    }
  });

  it('start with the big drum on beat 1', () => {
    for (const g of GROOVES) expect(grooveNotes(g, { beatsPerBar: 4 }).some((n) => n.beat === 0 && n.step === 0)).toBe(true);
  });

  it('give Little Monsters six grooves on the first four drums, Monster Makers four more', () => {
    const little = wandGrooves('little');
    expect(little).toHaveLength(6);
    for (const g of little) for (const n of grooveNotes(g, { beatsPerBar: 4 })) expect(n.step).toBeLessThanOrEqual(3);
    expect(wandGrooves('maker')).toHaveLength(10);
    for (let k = 0; k < 12; k++) for (const n of wandPattern('little', k, { beatsPerBar: 4 })) expect(n.step).toBeLessThanOrEqual(3);
  });

  it('the first groove is the Monster Band beat', () => {
    expect(GROOVES[0].id).toBe('stomp');
    expect(sig(grooveNotes(GROOVES[0], { beatsPerBar: 4 }))).toBe(sig(BAND_BOOM.map(([beat, step]) => ({ beat, step }))));
    const band = monsterBandProject(5);
    const boom = band.tracks.find((t) => t.monster === 'boom')!;
    expect(sig(activeClip(boom)!.notes)).toBe(sig(BAND_BOOM.map(([beat, step]) => ({ beat, step }))));
  });

  it('fit in a loop, with every drum used at most once per position', () => {
    for (const g of GROOVES) {
      const notes = grooveNotes(g, { beatsPerBar: 4 });
      expect(notes.length).toBeLessThanOrEqual(96);
      expect(notes.length).toBeLessThanOrEqual(MONSTERS.boom.maxClipNotes);
      expect(new Set(notes.map((n) => `${n.step}@${n.beat}`)).size).toBe(notes.length);
      for (let col = 0; col < 8; col++) expect(new Set(notes.filter((n) => Math.floor(n.beat) === col).map((n) => n.step)).size).toBeLessThanOrEqual(4);
    }
  });

  it('wraps the wand index both ways', () => {
    const at = (k: number) => sig(wandPattern('little', k, { beatsPerBar: 4 }));
    expect(at(6)).toBe(at(0));
    expect(at(-1)).toBe(at(5));
    expect(at(1)).not.toBe(at(0));
    expect(sig(wandPattern('maker', 9, { beatsPerBar: 4 }))).toBe(sig(grooveNotes(GROOVES[9], { beatsPerBar: 4 })));
  });
});
