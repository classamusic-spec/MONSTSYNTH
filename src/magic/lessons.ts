import { newId } from '../model/ids';
import { createClip, createProject, DEFAULT_LOOP_BEATS } from '../model/project';
import type { Clip, MonsterKind, NoteEvent, Project, Track } from '../model/types';
import { PAINT_ROW } from '../model/types';

// ─────────────────────────────────────────────────────────────────────────────
// MONSTER MAGIC · song lessons ("Learn").
//
// A monster teaches a classic children's tune one phrase at a time: it sings a
// phrase, the next key glows, the child plays it back at their own pace. Every
// phrase is exactly one block (8 beats), so a learned song turns straight into
// a Monster Blocks song — melody, beat, bass and sparkles — to keep and remix.
//
// All tunes are traditional / public domain. Notes are steps of the major
// scale in the song's key (0 = do … 7 = high do): exactly the eight keys.
// Ode to Joy uses new, monster-themed words.
// ─────────────────────────────────────────────────────────────────────────────

export const LESSON_KEYS = 8;
export const PHRASE_BEATS = DEFAULT_LOOP_BEATS;

export type SongPicture = 'buns' | 'lamb' | 'star' | 'boat' | 'farm' | 'bridge' | 'joy' | 'bells';

/** [beat inside the phrase, scale step 0..7, length in beats, sung word or syllable] */
export type LessonNote = [beat: number, step: number, dur: number, word: string];

export interface Phrase {
  notes: LessonNote[];
  /** Harmony, one chord per half bar (2 beats), as the scale step of the chord's root. */
  chords: [number, number, number, number];
}

export interface TeachSong {
  id: string;
  title: string;
  picture: SongPicture;
  /** Who sings it (and plays the melody when it becomes a song). */
  teacher: MonsterKind;
  tempo: number;
  /** Root pitch class of the major key (0 = C). */
  key: number;
  /** 1 = first songs (three to five notes), 3 = longest. */
  level: 1 | 2 | 3;
  phrases: Phrase[];
}

const q = (beat: number, step: number, word: string, dur = 1): LessonNote => [beat, step, dur, word];

// ── The songs ────────────────────────────────────────────────────────────────

const HOT_CROSS_BUNS: TeachSong = {
  id: 'hot-cross-buns',
  title: 'Hot Cross Buns',
  picture: 'buns',
  teacher: 'bloop',
  tempo: 96,
  key: 0,
  level: 1,
  phrases: [
    { notes: [q(0, 2, 'Hot'), q(1, 1, 'cross'), q(2, 0, 'buns', 2), q(4, 2, 'Hot'), q(5, 1, 'cross'), q(6, 0, 'buns', 2)], chords: [0, 0, 0, 0] },
    {
      notes: [
        q(0, 0, 'One', 0.5), q(0.5, 0, 'a', 0.5), q(1, 0, 'pen', 0.5), q(1.5, 0, 'ny', 0.5),
        q(2, 1, 'two', 0.5), q(2.5, 1, 'a', 0.5), q(3, 1, 'pen', 0.5), q(3.5, 1, 'ny', 0.5),
        q(4, 2, 'Hot'), q(5, 1, 'cross'), q(6, 0, 'buns', 2),
      ],
      chords: [0, 4, 0, 0],
    },
  ],
};

const MARY: TeachSong = {
  id: 'mary-lamb',
  title: 'Mary Had a Little Lamb',
  picture: 'lamb',
  teacher: 'mimic',
  tempo: 100,
  key: 0,
  level: 1,
  phrases: [
    { notes: [q(0, 2, 'Ma'), q(1, 1, 'ry'), q(2, 0, 'had'), q(3, 1, 'a'), q(4, 2, 'lit'), q(5, 2, 'tle'), q(6, 2, 'lamb', 2)], chords: [0, 0, 0, 0] },
    { notes: [q(0, 1, 'lit'), q(1, 1, 'tle'), q(2, 1, 'lamb', 2), q(4, 2, 'lit'), q(5, 4, 'tle'), q(6, 4, 'lamb', 2)], chords: [4, 4, 0, 0] },
    {
      notes: [q(0, 2, 'Ma'), q(1, 1, 'ry'), q(2, 0, 'had'), q(3, 1, 'a'), q(4, 2, 'lit'), q(5, 2, 'tle'), q(6, 2, 'lamb'), q(7, 2, 'its')],
      chords: [0, 0, 0, 0],
    },
    { notes: [q(0, 1, 'fleece'), q(1, 1, 'was'), q(2, 2, 'white'), q(3, 1, 'as'), q(4, 0, 'snow', 4)], chords: [4, 4, 0, 0] },
  ],
};

const TWINKLE_A: Phrase = {
  notes: [q(0, 0, 'Twin'), q(1, 0, 'kle'), q(2, 4, 'twin'), q(3, 4, 'kle'), q(4, 5, 'lit'), q(5, 5, 'tle'), q(6, 4, 'star', 2)],
  chords: [0, 0, 3, 0],
};
const TWINKLE_B: Phrase = {
  notes: [q(0, 3, 'How'), q(1, 3, 'I'), q(2, 2, 'won'), q(3, 2, 'der'), q(4, 1, 'what'), q(5, 1, 'you'), q(6, 0, 'are', 2)],
  chords: [3, 0, 4, 0],
};
const TWINKLE: TeachSong = {
  id: 'twinkle',
  title: 'Twinkle Twinkle Little Star',
  picture: 'star',
  teacher: 'spark',
  tempo: 96,
  key: 0,
  level: 2,
  phrases: [
    TWINKLE_A,
    TWINKLE_B,
    { notes: [q(0, 4, 'Up'), q(1, 4, 'a'), q(2, 3, 'bove'), q(3, 3, 'the'), q(4, 2, 'world'), q(5, 2, 'so'), q(6, 1, 'high', 2)], chords: [0, 3, 0, 4] },
    { notes: [q(0, 4, 'Like'), q(1, 4, 'a'), q(2, 3, 'dia'), q(3, 3, 'mond'), q(4, 2, 'in'), q(5, 2, 'the'), q(6, 1, 'sky', 2)], chords: [0, 3, 0, 4] },
    TWINKLE_A,
    TWINKLE_B,
  ],
};

const t3 = 1 / 3;
const ROW_YOUR_BOAT: TeachSong = {
  id: 'row-your-boat',
  title: 'Row Row Row Your Boat',
  picture: 'boat',
  teacher: 'bloop',
  tempo: 88,
  key: 0,
  level: 2,
  phrases: [
    {
      notes: [
        q(0, 0, 'Row'), q(1, 0, 'row'), q(2, 0, 'row', 2 * t3), q(2 + 2 * t3, 1, 'your', t3), q(3, 2, 'boat'),
        q(4, 2, 'gent', 2 * t3), q(4 + 2 * t3, 1, 'ly', t3), q(5, 2, 'down', 2 * t3), q(5 + 2 * t3, 3, 'the', t3), q(6, 4, 'stream', 2),
      ],
      chords: [0, 0, 0, 4],
    },
    {
      notes: [
        q(0, 7, 'Mer', t3), q(t3, 7, 'ri', t3), q(2 * t3, 7, 'ly', t3),
        q(1, 4, 'mer', t3), q(1 + t3, 4, 'ri', t3), q(1 + 2 * t3, 4, 'ly', t3),
        q(2, 2, 'mer', t3), q(2 + t3, 2, 'ri', t3), q(2 + 2 * t3, 2, 'ly', t3),
        q(3, 0, 'mer', t3), q(3 + t3, 0, 'ri', t3), q(3 + 2 * t3, 0, 'ly', t3),
        q(4, 4, 'life', 2 * t3), q(4 + 2 * t3, 3, 'is', t3), q(5, 2, 'but', 2 * t3), q(5 + 2 * t3, 1, 'a', t3), q(6, 0, 'dream', 2),
      ],
      chords: [0, 0, 4, 0],
    },
  ],
};

// Old MacDonald is in D major so the whole tune fits on the keys (G = step 3).
const MAC_A: Phrase = {
  notes: [q(0, 3, 'Old'), q(1, 3, 'Mac'), q(2, 3, 'Don'), q(3, 0, 'ald'), q(4, 1, 'had'), q(5, 1, 'a'), q(6, 0, 'farm', 2)],
  chords: [3, 3, 1, 3],
};
const MAC_EIEIO: Phrase = {
  notes: [q(0, 5, 'E'), q(1, 5, 'I'), q(2, 4, 'E'), q(3, 4, 'I'), q(4, 3, 'O', 3)],
  chords: [3, 0, 3, 3],
};
const OLD_MACDONALD: TeachSong = {
  id: 'old-macdonald',
  title: 'Old MacDonald',
  picture: 'farm',
  teacher: 'bloop',
  tempo: 108,
  key: 2,
  level: 2,
  phrases: [
    MAC_A,
    MAC_EIEIO,
    {
      notes: [q(0, 0, 'And'), q(1, 3, 'on'), q(2, 3, 'his'), q(3, 3, 'farm'), q(4, 0, 'he', 0.5), q(4.5, 1, 'had', 0.5), q(5, 1, 'a'), q(6, 0, 'cow', 2)],
      chords: [3, 3, 1, 3],
    },
    MAC_EIEIO,
    {
      notes: [
        q(0, 0, 'With', 0.5), q(0.5, 0, 'a', 0.5), q(1, 3, 'moo'), q(2, 3, 'moo'), q(3, 3, 'here'),
        q(4, 0, 'and', 0.5), q(4.5, 0, 'a', 0.5), q(5, 3, 'moo'), q(6, 3, 'moo'), q(7, 3, 'there'),
      ],
      chords: [3, 3, 3, 3],
    },
    {
      notes: [
        q(0, 3, 'Here', 0.5), q(0.5, 3, 'a', 0.5), q(1, 3, 'moo'), q(2, 3, 'there', 0.5), q(2.5, 3, 'a', 0.5), q(3, 3, 'moo'),
        q(4, 3, 'ev', 0.5), q(4.5, 3, 'ery', 0.5), q(5, 3, 'where', 0.5), q(5.5, 3, 'a', 0.5), q(6, 3, 'moo'), q(7, 3, 'moo'),
      ],
      chords: [3, 3, 0, 3],
    },
    MAC_A,
    MAC_EIEIO,
  ],
};

const LONDON_A: Phrase = {
  notes: [q(0, 4, 'Lon', 1.5), q(1.5, 5, 'don', 0.5), q(2, 4, 'Bridge'), q(3, 3, 'is'), q(4, 2, 'fall'), q(5, 3, 'ing'), q(6, 4, 'down', 2)],
  chords: [0, 0, 0, 0],
};
const LONDON_BRIDGE: TeachSong = {
  id: 'london-bridge',
  title: 'London Bridge',
  picture: 'bridge',
  teacher: 'bloop',
  tempo: 104,
  key: 0,
  level: 2,
  phrases: [
    LONDON_A,
    { notes: [q(0, 1, 'fall'), q(1, 2, 'ing'), q(2, 3, 'down', 2), q(4, 2, 'fall'), q(5, 3, 'ing'), q(6, 4, 'down', 2)], chords: [4, 4, 0, 0] },
    LONDON_A,
    { notes: [q(0, 1, 'My', 2), q(2, 4, 'fair', 2), q(4, 2, 'la'), q(5, 0, 'dy', 3)], chords: [4, 4, 0, 0] },
  ],
};

const ODE_A = (words: string[]): Phrase => ({
  notes: [2, 2, 3, 4, 4, 3, 2, 1].map((step, i) => q(i, step, words[i])),
  chords: [0, 0, 0, 4],
});
const ODE_TO_JOY: TeachSong = {
  id: 'ode-to-joy',
  title: 'Ode to Joy',
  picture: 'joy',
  teacher: 'spark',
  tempo: 100,
  key: 0,
  level: 3,
  phrases: [
    ODE_A(['Hap', 'py', 'mon', 'sters', 'sing', 'to', 'geth', 'er']),
    { notes: [q(0, 0, 'Play'), q(1, 0, 'a'), q(2, 1, 'song'), q(3, 2, 'for'), q(4, 2, 'ev', 1.5), q(5.5, 1, 'ery', 0.5), q(6, 1, 'one', 2)], chords: [0, 0, 0, 4] },
    ODE_A(['Stomp', 'and', 'bloop', 'and', 'boom', 'and', 'grum', 'ble']),
    { notes: [q(0, 0, 'Mon'), q(1, 0, 'ster'), q(2, 1, 'mu'), q(3, 2, 'sic'), q(4, 1, 'all', 1.5), q(5.5, 0, 'day', 0.5), q(6, 0, 'long', 2)], chords: [0, 0, 4, 0] },
  ],
};

const JINGLE_A: Phrase = {
  notes: [q(0, 2, 'Jin'), q(1, 2, 'gle'), q(2, 2, 'bells', 2), q(4, 2, 'jin'), q(5, 2, 'gle'), q(6, 2, 'bells', 2)],
  chords: [0, 0, 0, 0],
};
const JINGLE_B: Phrase = {
  notes: [q(0, 2, 'jin'), q(1, 4, 'gle'), q(2, 0, 'all', 1.5), q(3.5, 1, 'the', 0.5), q(4, 2, 'way', 4)],
  chords: [0, 0, 0, 0],
};
const JINGLE_C: Phrase = {
  notes: [
    q(0, 3, 'Oh'), q(1, 3, 'what'), q(2, 3, 'fun', 1.5), q(3.5, 3, 'it', 0.5),
    q(4, 3, 'is'), q(5, 2, 'to'), q(6, 2, 'ride'), q(7, 2, 'in', 0.5), q(7.5, 2, 'a', 0.5),
  ],
  chords: [3, 3, 0, 0],
};
const JINGLE_BELLS: TeachSong = {
  id: 'jingle-bells',
  title: 'Jingle Bells',
  picture: 'bells',
  teacher: 'spark',
  tempo: 116,
  key: 0,
  level: 3,
  phrases: [
    JINGLE_A,
    JINGLE_B,
    JINGLE_C,
    { notes: [q(0, 2, 'one'), q(1, 1, 'horse'), q(2, 1, 'o'), q(3, 2, 'pen'), q(4, 1, 'sleigh', 2), q(6, 4, 'hey!', 2)], chords: [1, 1, 4, 4] },
    JINGLE_A,
    JINGLE_B,
    JINGLE_C,
    { notes: [q(0, 4, 'one'), q(1, 4, 'horse'), q(2, 3, 'o'), q(3, 1, 'pen'), q(4, 0, 'sleigh', 4)], chords: [4, 4, 0, 0] },
  ],
};

/** Easiest first. */
export const TEACH_SONGS: TeachSong[] = [
  HOT_CROSS_BUNS,
  MARY,
  TWINKLE,
  ROW_YOUR_BOAT,
  OLD_MACDONALD,
  LONDON_BRIDGE,
  ODE_TO_JOY,
  JINGLE_BELLS,
];

export function findSong(id: string): TeachSong | undefined {
  return TEACH_SONGS.find((s) => s.id === id);
}

// ── Timelines ────────────────────────────────────────────────────────────────

export interface TimedNote {
  /** Beat from the start of the song. */
  absBeat: number;
  phrase: number;
  /** Index inside the phrase. */
  index: number;
  step: number;
  dur: number;
  word: string;
}

export function phraseNotes(song: TeachSong, phrase: number): TimedNote[] {
  const p = song.phrases[phrase];
  if (!p) return [];
  return p.notes.map(([beat, step, dur, word], index) => ({ absBeat: phrase * PHRASE_BEATS + beat, phrase, index, step, dur, word }));
}

export function songNotes(song: TeachSong): TimedNote[] {
  return song.phrases.flatMap((_, i) => phraseNotes(song, i));
}

export function songLengthBeats(song: TeachSong): number {
  return song.phrases.length * PHRASE_BEATS;
}

/** A note for the band: `step` is a drum pad for Boom. */
export interface BandNote {
  monster: MonsterKind;
  beat: number;
  step: number;
  dur: number;
  vel: number;
}

const DRUM_PATTERN: BandNote[] = [
  ...[0, 2, 4, 6].map((beat) => ({ monster: 'boom' as const, beat, step: 0, dur: 0.5, vel: 0.8 })),
  ...[1, 3, 5, 7].map((beat) => ({ monster: 'boom' as const, beat, step: 1, dur: 0.5, vel: 0.55 })),
  ...[0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5].map((beat) => ({ monster: 'boom' as const, beat, step: 2, dur: 0.5, vel: 0.4 })),
];

/** Beat, bass and sparkles for one phrase, built from its chords (never the melody). */
export function phraseBand(phrase: Phrase, withSparkles: boolean): BandNote[] {
  const out: BandNote[] = DRUM_PATTERN.map((n) => ({ ...n }));
  phrase.chords.forEach((root, i) => {
    const at = i * 2;
    out.push({ monster: 'grumble', beat: at, step: root, dur: 0.9, vel: 0.8 });
    out.push({ monster: 'grumble', beat: at + 1, step: root, dur: 0.9, vel: 0.6 });
    if (withSparkles) {
      out.push({ monster: 'spark', beat: at + 0.5, step: root + 2, dur: 0.5, vel: 0.4 });
      out.push({ monster: 'spark', beat: at + 1.5, step: root + 4, dur: 0.5, vel: 0.35 });
    }
  });
  return out.sort((a, b) => a.beat - b.beat);
}

export function bandMonsters(song: TeachSong): MonsterKind[] {
  return song.teacher === 'spark' ? ['boom', 'grumble'] : ['boom', 'grumble', 'spark'];
}

// ── Stars ────────────────────────────────────────────────────────────────────

/**
 * Everyone who finishes gets a star. With the helper on (any key plays the right
 * note) a song is worth two; three for playing it yourself with few slips.
 */
export function lessonStars(mistakes: number, helper: boolean): 1 | 2 | 3 {
  if (helper) return 2;
  if (mistakes <= 2) return 3;
  if (mistakes <= 8) return 2;
  return 1;
}

// ── From lesson to song ──────────────────────────────────────────────────────

const toEvent = (beat: number, step: number, dur: number, vel: number): NoteEvent => ({ id: newId('n'), beat, step, dur, vel, tone: 0 });

/** Blocks a kept song fills: the whole tune, repeated while it fits in 8 blocks. */
export function lessonBlocks(song: TeachSong): number {
  const n = song.phrases.length;
  return n * Math.max(1, Math.floor(8 / n));
}

/**
 * A finished lesson becomes a real song: one block per phrase (the tune repeats
 * to fill the 8 blocks when it is short), the teacher on the melody, and a band
 * that follows the chords. Repeated phrases share a loop, so Monster Blocks
 * shows the song's shape (A B C A …) and kids can rearrange it.
 */
export function lessonProject(song: TeachSong, seed?: number): Project {
  const monsters: MonsterKind[] = [song.teacher, ...bandMonsters(song)];
  const project = createProject({ monsters, seed });
  project.name = song.title;
  project.tempo = song.tempo;
  project.key = song.key;
  project.scale = 'major';
  project.loopBeats = PHRASE_BEATS;
  const length = lessonBlocks(song);
  const rows: Record<string, (string | null)[]> = { [PAINT_ROW]: new Array(length).fill(null) };

  const withClips = (track: Track, perPhrase: (phrase: Phrase) => NoteEvent[]): Track => {
    const clips: Clip[] = [];
    const bySignature = new Map<string, Clip>();
    const row = Array.from({ length }, (_, i) => song.phrases[i % song.phrases.length]).map((phrase) => {
      const notes = perPhrase(phrase);
      const signature = JSON.stringify(notes.map((n) => [n.beat, n.step, n.dur, n.vel]));
      let clip = bySignature.get(signature);
      if (!clip) {
        clip = { ...createClip(PHRASE_BEATS), notes };
        bySignature.set(signature, clip);
        clips.push(clip);
      }
      return clip.id;
    });
    rows[track.id] = row;
    return { ...track, clips, activeClipId: clips[0]?.id ?? null };
  };

  project.tracks = project.tracks.map((t) => {
    if (t.monster === song.teacher) {
      return withClips(t, (phrase) => phrase.notes.map(([beat, step, dur]) => toEvent(beat, step, dur, 0.85)));
    }
    return withClips(t, (phrase) =>
      phraseBand(phrase, true)
        .filter((n) => n.monster === t.monster)
        .map((n) => toEvent(n.beat, n.step, n.dur, n.vel)),
    );
  });
  project.arrangement = { length, rows };
  return project;
}
