import { describe, expect, it } from 'vitest';
import { singerTranspose } from '../src/audio/engine';
import { findSong } from '../src/magic/lessons';
import { keyLabel, keyNames, LETTERS, spellStep } from '../src/magic/noteNames';
import { laneForY, PAINT_LANES, yForLane } from '../src/magic/painting';
import { SCALE_ORDER, SCALES, stepToSemitone } from '../src/magic/scales';
import { ALL_MONSTERS, DRUM_PADS, MONSTERS } from '../src/model/monsters';
import type { ScaleId } from '../src/model/types';

const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
const texts = (count: number, scale: ScaleId, key: number) => keyNames(count, scale, key).map((n) => n.text).join(' ');
const sol = (count: number, scale: ScaleId, key = 0) => keyNames(count, scale, key).map((n) => n.solfege).join(' ');

describe('note names on the keys', () => {
  it('spells the default Happy keys in C', () => {
    expect(texts(8, 'pentatonicMajor', 0)).toBe('C D E G A C D E');
  });

  it('spells sharps from the scale degree (Old MacDonald in D)', () => {
    expect(texts(8, 'major', 2)).toBe('D E F♯ G A B C♯ D');
  });

  it('spells the blue note as a flat 5th', () => {
    expect(texts(8, 'blues', 0)).toBe('C E♭ F G♭ G B♭ C E♭');
  });

  it('keeps white piano keys as plain letters (no C♭ in E♭ minor)', () => {
    expect(texts(8, 'minor', 3)).toBe('E♭ F G♭ A♭ B♭ B D♭ E♭');
  });

  it('never writes E♯ (F♯ major)', () => {
    const names = keyNames(8, 'major', 6).map((n) => n.text);
    expect(names.slice(-2)).toEqual(['F', 'F♯']);
    expect(names).not.toContain('E♯');
  });

  it('spells chromatic with sharps, or flats in flat keys', () => {
    expect(texts(8, 'chromatic', 0)).toBe('C C♯ D D♯ E F F♯ G');
    expect(texts(8, 'chromatic', 5)).toBe('F G♭ G A♭ A B♭ B C');
  });

  it('names negative steps (below the first key)', () => {
    expect(spellStep(-1, 'pentatonicMajor', 0).text).toBe('A');
    expect(spellStep(-5, 'pentatonicMajor', 0).text).toBe('C');
  });

  it('gives spoken names for screen readers', () => {
    const d = keyNames(8, 'major', 2);
    expect(d[2].spoken).toBe('F sharp');
    expect(spellStep(1, 'pentatonicMinor', 0).spoken).toBe('E flat');
    expect(d[0].spoken).toBe('D');
  });

  it('sings movable do re mi with the tonic as do', () => {
    expect(sol(8, 'pentatonicMajor')).toBe('do re mi so la do re mi');
    expect(sol(5, 'pentatonicMinor')).toBe('do me fa so te');
    expect(sol(6, 'blues')).toBe('do me fa se so te');
    expect(sol(7, 'minor')).toBe('do re me fa so le te');
    expect(sol(8, 'major', 2)).toBe('do re mi fa so la ti do');
    expect(sol(12, 'chromatic', 0)).toBe('do di re ri mi fa fi so si la li ti');
    expect(sol(12, 'chromatic', 3)).toBe('do ra re me mi fa se so le la te ti');
  });

  it('can put do on a tune\'s home note, changing only the syllables', () => {
    // Old MacDonald sits on the keys of D major but comes home to G (step 3).
    expect(keyNames(8, 'major', 2, 3).map((n) => n.solfege).join(' ')).toBe('so la ti do re mi fi so');
    expect(keyNames(8, 'major', 2, 3).map((n) => n.text).join(' ')).toBe(texts(8, 'major', 2));
    // Home 0 (and any octave of it) is the tonic as before, for every mood.
    for (const scale of SCALE_ORDER) {
      const n = SCALES[scale].steps.length;
      expect(keyNames(12, scale, 3, 0)).toEqual(keyNames(12, scale, 3));
      expect(keyNames(12, scale, 3, n)).toEqual(keyNames(12, scale, 3));
    }
    expect(spellStep(4, 'chromatic', 0, 2).solfege).toBe('re');
    expect(spellStep(-1, 'major', 2, 3).solfege).toBe('fi');
  });

  it('sings Old MacDonald as do do do so la la so (from where the tune ends)', () => {
    const song = findSong('old-macdonald')!;
    const last = song.phrases[song.phrases.length - 1].notes;
    const home = last[last.length - 1][1];
    const names = keyNames(8, 'major', song.key, home);
    expect(song.phrases[0].notes.map((n) => names[n[1]].solfege).join(' ')).toBe('do do do so la la so');
    expect(song.phrases[0].notes.map((n) => names[n[1]].text).join(' ')).toBe('G G G D E E D');
  });

  it('labels in the chosen style, or not at all', () => {
    const fs = spellStep(2, 'major', 2);
    expect(keyLabel(fs, 'letters')).toBe('F♯');
    expect(keyLabel(fs, 'solfege')).toBe('mi');
    expect(keyLabel(fs, 'off')).toBeNull();
  });

  it('is correct for every key, mood and step', () => {
    for (const scale of SCALE_ORDER) {
      for (let key = 0; key < 12; key++) {
        const directions = new Set<number>();
        for (let step = -8; step <= 15; step++) {
          const n = spellStep(step, scale, key);
          const expected = (((key + stepToSemitone(step, scale)) % 12) + 12) % 12;
          const written = (NATURAL_PC[LETTERS.indexOf(n.letter)] + n.accidental + 12) % 12;
          const where = `${scale} key ${key} step ${step}: ${n.text}`;
          expect(n.pc, where).toBe(expected);
          expect(written, where).toBe(expected);
          expect(Math.abs(n.accidental), where).toBeLessThanOrEqual(1);
          if (NATURAL_PC.includes(expected)) expect(n.accidental, where).toBe(0);
          else expect(n.accidental, where).not.toBe(0);
          expect(n.text.length, where).toBeLessThanOrEqual(2);
          if (n.accidental) directions.add(n.accidental);
          // Octaves repeat the same name.
          expect(spellStep(step + SCALES[scale].steps.length, scale, key).text, where).toBe(n.text);
        }
        expect(directions.size, `${scale} key ${key} mixes sharps and flats`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('relies on every monster starting on a C', () => {
    for (const m of ALL_MONSTERS) expect(MONSTERS[m].baseMidi % 12).toBe(0);
  });

  it('gives every drum pad a short word for grown-ups', () => {
    expect(DRUM_PADS).toHaveLength(8);
    for (const pad of DRUM_PADS) {
      expect(pad.short.length).toBeGreaterThan(0);
      expect(pad.short.length).toBeLessThanOrEqual(6);
    }
    expect(DRUM_PADS.map((p) => p.short)).toEqual(['kick', 'snare', 'hat', 'clap', 'bongo', 'crash', 'bell', 'boing']);
  });
});

describe("Mimic's built-in singer stays in key", () => {
  it('moves by whole octaves only', () => {
    expect(singerTranspose(7)).toBe(12); // Chipmunk
    expect(singerTranspose(-9)).toBe(-12); // Giant
    expect(singerTranspose(0)).toBe(0);
    expect(singerTranspose(-3)).toBe(0);
    expect(singerTranspose(12)).toBe(12);
    for (let semis = -24; semis <= 24; semis++) expect(Number.isInteger(singerTranspose(semis) / 12)).toBe(true);
  });
});

describe('paint lane guides', () => {
  // The Paint screen draws its lane lines at y = 1 - (k + 0.5) / 7 and its lane
  // names at yForLane: this pins that visual contract to laneForY.
  it('changes lane exactly at the drawn lines', () => {
    for (let k = 0; k < PAINT_LANES - 1; k++) {
      const line = 1 - (k + 0.5) / (PAINT_LANES - 1);
      expect(laneForY(line + 0.001)).toBe(k);
      expect(laneForY(line - 0.001)).toBe(k + 1);
    }
  });

  it('puts every lane name inside its own lane', () => {
    for (let lane = 0; lane < PAINT_LANES; lane++) expect(laneForY(yForLane(lane))).toBe(lane);
  });
});
