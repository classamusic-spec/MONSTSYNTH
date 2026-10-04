import { describe, expect, it } from 'vitest';
import { beatProgress, FIRST_BEAT_STEPS } from '../src/magic/firstBeat';
import { writeCell } from '../src/magic/steps';
import type { Clip } from '../src/model/types';

const empty = (): Clip => ({ id: 'c', lengthBeats: 8, notes: [] });
const light = (clip: Clip, pad: number, col: number, target: 'one' | 'double') =>
  writeCell(clip, { step: pad, col, target, lengthBeats: 8, beatsPerBar: 4, isDrum: true, columnCap: 4, dur: 0.5 }).clip;

describe('my first beat', () => {
  it('starts with the big drum on beat 1', () => {
    const p = beatProgress([]);
    expect(p).toMatchObject({ step: 0, done: false, met: 0, total: 8 });
    expect(p.target).toEqual({ pad: 0, col: 0, want: 'hit' });
  });

  it('walks big drum, snappy drum, then tss-tss, and finishes', () => {
    let clip = empty();
    const order: string[] = [];
    for (let guard = 0; guard < 20; guard++) {
      const p = beatProgress(clip.notes);
      if (p.done) break;
      const t = p.target!;
      order.push(`${t.pad}:${t.col}`);
      clip = light(clip, t.pad, t.col, t.want === 'double' ? 'double' : 'one');
    }
    expect(order).toEqual(['0:0', '0:4', '1:2', '1:6', '2:1', '2:3', '2:5', '2:7']);
    expect(beatProgress(clip.notes)).toMatchObject({ done: true, met: 8, step: FIRST_BEAT_STEPS.length });
  });

  it('a single tss is not yet a tss-tss', () => {
    let clip = empty();
    for (const [pad, col] of [[0, 0], [0, 4], [1, 2], [1, 6]]) clip = light(clip, pad, col, 'one');
    clip = light(clip, 2, 1, 'one');
    expect(beatProgress(clip.notes).target).toEqual({ pad: 2, col: 1, want: 'double' });
  });

  it('progress follows the loop: extra stones are fine, undoing one goes back', () => {
    let clip = light(empty(), 0, 0, 'one');
    clip = light(clip, 3, 5, 'one'); // a clap somewhere else
    expect(beatProgress(clip.notes).target).toEqual({ pad: 0, col: 4, want: 'hit' });
    expect(beatProgress([]).met).toBe(0);
  });
});
