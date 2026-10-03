import { describe, expect, it } from 'vitest';
import { TICK_PAD } from '../src/audio/voices/drums';
import { noteRequest } from '../src/studio/notes';

describe('note requests', () => {
  const song = { scale: 'major' as const, key: 0 };

  it('plays Boom steps 0–7 on their own drums', () => {
    for (let step = 0; step < 8; step++) expect(noteRequest(song, 'boom', 'b', step, { vel: 0.8 }).pad).toBe(step);
  });

  it('never lets a Boom note reach the metronome tick, whatever step a loaded song holds', () => {
    for (const step of [8, 9, 15, 99]) {
      const pad = noteRequest(song, 'boom', 'b', step, { vel: 0.8 }).pad;
      expect(pad).toBeLessThan(TICK_PAD);
      expect(pad).toBe(7);
    }
    expect(noteRequest(song, 'boom', 'b', -3, { vel: 0.8 }).pad).toBe(0);
  });
});
