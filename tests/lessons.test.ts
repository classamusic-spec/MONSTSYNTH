import { describe, expect, it } from 'vitest';
import {
  LESSON_KEYS,
  lessonProject,
  lessonStars,
  lessonBlocks,
  PHRASE_BEATS,
  phraseBand,
  phraseNotes,
  songLengthBeats,
  songNotes,
  TEACH_SONGS,
} from '../src/magic/lessons';
import { collectEvents } from '../src/magic/sequence';
import { stepToMidi } from '../src/magic/scales';
import { migrateProject, migrateSettings } from '../src/model/schema';
import { PAINT_ROW } from '../src/model/types';

describe('song lessons', () => {
  it('every song fits the eight keys and its blocks', () => {
    for (const song of TEACH_SONGS) {
      expect(song.phrases.length, song.id).toBeGreaterThan(0);
      expect(song.phrases.length, song.id).toBeLessThanOrEqual(8);
      for (const [i, phrase] of song.phrases.entries()) {
        let lastEnd = 0;
        for (const [beat, step, dur, word] of phrase.notes) {
          expect(Number.isInteger(step) && step >= 0 && step < LESSON_KEYS, `${song.id} #${i} step ${step}`).toBe(true);
          expect(beat, `${song.id} #${i} notes in order`).toBeGreaterThanOrEqual(lastEnd - 1e-9);
          expect(beat + dur, `${song.id} #${i} fits the phrase`).toBeLessThanOrEqual(PHRASE_BEATS + 1e-9);
          expect(word.length, `${song.id} #${i} has words`).toBeGreaterThan(0);
          lastEnd = beat + dur;
        }
        expect(phrase.chords).toHaveLength(4);
      }
    }
  });

  it('song ids are unique', () => {
    expect(new Set(TEACH_SONGS.map((s) => s.id)).size).toBe(TEACH_SONGS.length);
  });

  it('plays Twinkle Twinkle in tune (C C G G A A G)', () => {
    const twinkle = TEACH_SONGS.find((s) => s.id === 'twinkle')!;
    const midi = phraseNotes(twinkle, 0).map((n) => stepToMidi(n.step, 'bloop', 'major', twinkle.key));
    expect(midi).toEqual([60, 60, 67, 67, 69, 69, 67]);
  });

  it('lays notes out on one song timeline', () => {
    const song = TEACH_SONGS[0];
    const notes = songNotes(song);
    expect(notes[0].absBeat).toBe(0);
    expect(notes.at(-1)!.absBeat).toBeLessThan(songLengthBeats(song));
    expect(notes.filter((n) => n.phrase === 1)[0].absBeat).toBe(PHRASE_BEATS);
  });

  it('builds a band that follows the chords', () => {
    const band = phraseBand({ notes: [], chords: [0, 3, 4, 0] }, true);
    const bass = band.filter((n) => n.monster === 'grumble').map((n) => n.step);
    expect(bass).toEqual([0, 0, 3, 3, 4, 4, 0, 0]);
    expect(band.some((n) => n.monster === 'boom' && n.step === 0 && n.beat === 0)).toBe(true);
    expect(phraseBand({ notes: [], chords: [0, 0, 0, 0] }, false).some((n) => n.monster === 'spark')).toBe(false);
  });

  it('awards stars kindly', () => {
    expect(lessonStars(0, false)).toBe(3);
    expect(lessonStars(5, false)).toBe(2);
    expect(lessonStars(20, false)).toBe(1);
    expect(lessonStars(0, true)).toBe(2);
  });

  it('turns a lesson into a valid Monster Blocks song', () => {
    for (const song of TEACH_SONGS) {
      const p = lessonProject(song, 7);
      expect(p.name).toBe(song.title);
      expect(p.scale).toBe('major');
      expect(p.arrangement.length).toBe(lessonBlocks(song));
      expect(p.arrangement.length).toBeLessThanOrEqual(8);
      expect(p.arrangement.length % song.phrases.length).toBe(0);
      const teacher = p.tracks.find((t) => t.monster === song.teacher)!;
      expect(teacher.clips.length).toBeLessThanOrEqual(song.phrases.length);
      expect(p.arrangement.rows[teacher.id].every(Boolean)).toBe(true);
      expect(p.arrangement.rows[PAINT_ROW].every((c) => c === null)).toBe(true);
      // Survives a save / load round trip unchanged.
      expect(migrateProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
      // Song mode plays every melody note once.
      const events = collectEvents(p, 0, p.arrangement.length * PHRASE_BEATS, { mode: 'song' }).filter((e) => e.monster === song.teacher);
      expect(events.length).toBe(songNotes(song).length * (p.arrangement.length / song.phrases.length));
    }
  });

  it('shares loops between repeated phrases', () => {
    const twinkle = TEACH_SONGS.find((s) => s.id === 'twinkle')!;
    const p = lessonProject(twinkle, 1);
    const row = p.arrangement.rows[p.tracks[0].id];
    expect(row[0]).toBe(row[4]);
    expect(row[1]).toBe(row[5]);
    expect(p.tracks[0].clips).toHaveLength(3); // "Up above…" and "Like a diamond…" share a tune
  });
});

describe('settings v2', () => {
  it('migrates v1 settings with no stars yet', () => {
    const s = migrateSettings({ schemaVersion: 1, ageMode: 'maker' });
    expect(s.schemaVersion).toBe(2);
    expect(s.lessonStars).toEqual({});
  });

  it('keeps and cleans lesson stars', () => {
    const s = migrateSettings({ lessonStars: { twinkle: 3, mary: 9, bad: 'x', '': 2 } });
    expect(s.lessonStars).toEqual({ twinkle: 3, mary: 3 });
    expect(migrateSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
