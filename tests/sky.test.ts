import { describe, expect, it } from 'vitest';
import { moonSteps, SKY_GAP_MS, SKY_HIGH, SKY_LOW, skyReady, skyStep } from '../src/magic/sky';
import { stepToSemitone } from '../src/magic/scales';

describe('the musical sky', () => {
  it('always rings a whole scale step inside the sky’s range', () => {
    for (let x = -0.2; x <= 1.2; x += 0.05) {
      for (let y = -0.2; y <= 1.2; y += 0.05) {
        const s = skyStep(x, y);
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(SKY_LOW);
        expect(s).toBeLessThanOrEqual(SKY_HIGH);
      }
    }
  });

  it('higher on screen is never lower, and the top is higher than the bottom', () => {
    for (let x = 0; x <= 1; x += 0.1) {
      let last = -Infinity;
      for (let y = 1; y >= 0; y -= 0.05) {
        const s = skyStep(x, y);
        expect(s).toBeGreaterThanOrEqual(last);
        last = s;
      }
      expect(skyStep(x, 0)).toBeGreaterThan(skyStep(x, 1));
    }
  });

  it('left to right climbs like the keys, and a sweep along the top band is a run of several bells', () => {
    for (const y of [0, 0.1, 0.5, 1]) {
      let last = -Infinity;
      for (let x = 0; x <= 1; x += 0.02) {
        const s = skyStep(x, y);
        expect(s).toBeGreaterThanOrEqual(last);
        last = s;
      }
    }
    // The open band above the monsters on a tablet: from past the toys to the moon.
    const band = new Set<number>();
    for (let x = 0.3; x <= 0.95; x += 0.01) band.add(skyStep(x, 0.1));
    expect(band.size).toBeGreaterThanOrEqual(5);
    expect(skyStep(0, 1)).toBe(SKY_LOW);
    expect(skyStep(1, 0)).toBe(SKY_HIGH);
  });

  it('never throws on odd input (NaN, outside the stage)', () => {
    expect(skyStep(Number.NaN, Number.NaN)).toBe(skyStep(0.5, 0.5));
    expect(skyStep(-3, 9)).toBe(SKY_LOW);
    expect(skyStep(5, -5)).toBe(SKY_HIGH);
  });

  it('a sweep rings at most one bell every SKY_GAP_MS', () => {
    expect(skyReady(-Infinity, 0)).toBe(true);
    expect(skyReady(1000, 1000 + SKY_GAP_MS - 1)).toBe(false);
    expect(skyReady(1000, 1000 + SKY_GAP_MS)).toBe(true);
    // 30 moves inside 200 ms let through at most 3 bells.
    let last = -Infinity;
    let rang = 0;
    for (let i = 0; i < 30; i++) {
      const now = 5000 + (i * 200) / 30;
      if (skyReady(last, now)) {
        rang++;
        last = now;
      }
    }
    expect(rang).toBeLessThanOrEqual(3);
  });

  it('the moon rings the mood’s root, an octave down and at home, in every mood', () => {
    for (const scale of ['pentatonicMajor', 'pentatonicMinor', 'major', 'minor', 'blues', 'chromatic'] as const) {
      const [low, home] = moonSteps(scale);
      expect(stepToSemitone(low, scale)).toBe(-12);
      expect(stepToSemitone(home, scale)).toBe(0);
    }
  });
});
