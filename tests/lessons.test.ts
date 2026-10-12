import { describe, expect, it } from 'vitest';
import {
  judgeLessonKey,
  LESSON_KEYS,
  lessonProject,
  lessonStars,
  lessonBlocks,
  nextLessonNote,
  PHRASE_BEATS,
  phraseBand,
  phraseNotes,
  songLengthBeats,
  songNotes,
  TEACH_SONGS,
} from '../src/magic/lessons';
import { collectEvents } from '../src/magic/sequence';
import { stepToMidi } from '../src/magic/scales';
import { DEFAULT_SETTINGS, migrateProject, migrateSettings, SETTINGS_SCHEMA_VERSION } from '../src/model/schema';
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
    expect(lessonStars(0)).toBe(3);
    expect(lessonStars(2, 0)).toBe(3);
    expect(lessonStars(5, 0)).toBe(2);
    expect(lessonStars(20, 0)).toBe(1);
  });

  it('a perfect run earns three stars with Magic help on (help that fixed nothing does not count)', () => {
    for (const song of TEACH_SONGS) {
      const verdicts = songNotes(song).map((n) => judgeLessonKey(n.step, n.step, true));
      expect(verdicts.every((v) => v === 'right'), song.id).toBe(true);
      expect(lessonStars(0, verdicts.filter((v) => v === 'helped').length), song.id).toBe(3);
    }
  });

  it('counts a key Magic help fixed like a slip, never below one star', () => {
    expect(judgeLessonKey(3, 2, true)).toBe('helped');
    expect(judgeLessonKey(3, 2, false)).toBe('slip');
    expect(judgeLessonKey(2, 2, false)).toBe('right');
    expect(lessonStars(0, 2)).toBe(3);
    expect(lessonStars(0, 3)).toBe(2);
    expect(lessonStars(1, 1)).toBe(3);
    expect(lessonStars(1, 2)).toBe(2);
    expect(lessonStars(2, 1)).toBe(2);
    expect(lessonStars(4, 4)).toBe(2);
    expect(lessonStars(0, 9)).toBe(1);
    // A whole song carried by help (every key wrong) still earns a star.
    const jingle = TEACH_SONGS.find((s) => s.id === 'jingle-bells')!;
    const all = songNotes(jingle).map((n) => judgeLessonKey((n.step + 1) % LESSON_KEYS, n.step, true));
    expect(all.every((v) => v === 'helped')).toBe(true);
    expect(lessonStars(0, all.length)).toBe(1);
    // Stars are always 1..3, whatever the counts.
    for (const [slips, helped] of [
      [0, 0],
      [-3, 0],
      [0, 1e6],
      [1e6, 1e6],
      [3, 7],
    ]) {
      const s = lessonStars(slips, helped);
      expect(s >= 1 && s <= 3, `${slips}/${helped}`).toBe(true);
    }
  });

  it('knows the note the child needs next (and the next phrase’s first after a phrase)', () => {
    const buns = TEACH_SONGS.find((s) => s.id === 'hot-cross-buns')!;
    expect(nextLessonNote(buns, 0, 0)?.[1]).toBe(2);
    expect(nextLessonNote(buns, 0, 2)?.[3]).toBe('buns');
    // Phrase 1 played through: the next phrase starts on "One" (do).
    expect(nextLessonNote(buns, 0, buns.phrases[0].notes.length)?.[3]).toBe('One');
    // The end of the song: nothing more to play.
    expect(nextLessonNote(buns, 1, buns.phrases[1].notes.length)).toBeUndefined();
    expect(nextLessonNote(buns, 5, 0)).toBeUndefined();
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
    expect(s.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(s.lessonStars).toEqual({});
  });

  it('keeps and cleans lesson stars', () => {
    const s = migrateSettings({ lessonStars: { twinkle: 3, mary: 9, bad: 'x', '': 2 } });
    expect(s.lessonStars).toEqual({ twinkle: 3, mary: 3 });
    expect(migrateSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

describe('settings v3', () => {
  it('migrates v2 settings to letters on the keys', () => {
    const s = migrateSettings({ schemaVersion: 2, ageMode: 'little', lessonStars: { twinkle: 2 } });
    expect(SETTINGS_SCHEMA_VERSION).toBe(3);
    expect(s.schemaVersion).toBe(3);
    expect(s.noteNames).toBe('letters');
    expect(s.lessonStars).toEqual({ twinkle: 2 });
    expect(DEFAULT_SETTINGS.noteNames).toBe('letters');
  });

  it('keeps do re mi and none, and replaces garbage with letters', () => {
    expect(migrateSettings({ schemaVersion: 3, noteNames: 'solfege' }).noteNames).toBe('solfege');
    expect(migrateSettings({ schemaVersion: 3, noteNames: 'off' }).noteNames).toBe('off');
    for (const bad of ['numbers', 'LETTERS', '', 7, null, true, { style: 'off' }, ['off']]) {
      expect(migrateSettings({ schemaVersion: 3, noteNames: bad }).noteNames).toBe('letters');
    }
  });

  it('survives a JSON round trip unchanged', () => {
    for (const noteNames of ['letters', 'solfege', 'off'] as const) {
      const s = migrateSettings({ ...DEFAULT_SETTINGS, ageMode: 'maker', noteNames });
      expect(migrateSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
      expect(s.noteNames).toBe(noteNames);
    }
  });
});
