import { newId } from '../model/ids';
import { ALL_MONSTERS } from '../model/monsters';
import { createClip, createProject } from '../model/project';
import type { FxLevels, MonsterKind, NoteEvent, Project, ScaleId } from '../model/types';

// ─────────────────────────────────────────────────────────────────────────────
// MONSTER MAGIC · demo songs. Six finished songs for the shelf, each a
// different style, speed and mood, so a child can press Play and hear what the
// band can do, then open any monster and see (and change) its loop:
//
//   Jungle Drum Parade      108  happy parade: a beat built one drum at a time
//   Disco Jellyfish         120  sunny disco: four on the floor, bouncy bass
//   Wiggle Wobble Rocket    134  space race: the effect buddies at full speed
//   Grumble's Tummy Rumble   88  bluesy hip-hop: the bass copies the big drum
//   Skeleton Tiptoe          96  spooky (not scary): heartbeat and ticking clock
//   Cloud Castle             76  dreamy chill: Puff's big soft chords
//
// Every song is 8 blocks of 8 beats and four monsters (a Little Monsters stage
// holds four; nobody needs a recording). The band comes in one monster at a
// time, takes a breath in block 6 and plays all together in the last block.
//
// Melodic notes are scale steps 0..7 (the eight keys), so a song keeps working
// in any mood. Puff's step is the root of its chord (it plays step, step+2 and
// step+4). Each song follows one chord plan, written above it as scale steps;
// tunes land on a tone of the chord at every bar start and chord change, and
// the bass plays with the big drum. Drum loops are charts, one character per
// sixteenth, so every hit sits exactly on the grid. A monster's first loop is
// the one the Lab opens on, so it is always the song's main groove.
// ─────────────────────────────────────────────────────────────────────────────

/** [beat, step, length in beats, loudness 0..1] */
type N = [beat: number, step: number, dur?: number, vel?: number];

type DrumName = 'kick' | 'snare' | 'hat' | 'clap' | 'bongo' | 'crash' | 'bell' | 'boing';

/**
 * A drum loop as a chart: one row per drum, one character per sixteenth (four
 * per beat, 8 beats = 32 characters): X loud · x hit · o soft · . rest. Spaces
 * are only there to line the beats up for reading.
 */
export type DrumChart = Partial<Record<DrumName, string>>;

export interface DemoPart {
  preset: string;
  /** Effect buddies at 0, 0.4 or 0.8; missing ones are asleep. */
  fx?: Partial<FxLevels>;
  /** Named 8-beat loops. The first is the one the Lab opens on. */
  loops: Record<string, N[] | DrumChart>;
}

export interface DemoSong {
  id: string;
  title: string;
  /** For grown-ups (Parent Space, labels). */
  style: string;
  /** What the song shows off, for grown-ups (and the tour). */
  shows: string;
  tempo: number;
  scale: ScaleId;
  key: number;
  /** Cover colour on the shelf. */
  hue: number;
  band: Partial<Record<MonsterKind, DemoPart>>;
  /** Monster Blocks: for each monster, the loop each of the 8 blocks plays (null: resting). */
  blocks: Partial<Record<MonsterKind, (string | null)[]>>;
}

const PADS: Record<DrumName, number> = { kick: 0, snare: 1, hat: 2, clap: 3, bongo: 4, crash: 5, bell: 6, boing: 7 };
/** A normal hit's loudness per pad (a tiny cymbal is quieter than the big drum). */
const PAD_VEL = [0.95, 0.88, 0.6, 0.85, 0.8, 0.75, 0.7, 0.75];
const LEVEL: Record<string, number> = { X: 1, x: 0.85, o: 0.6 };

/** A drum chart's hits as [beat, pad, length, loudness]. */
export function drumHits(chart: DrumChart): N[] {
  const out: N[] = [];
  for (const [name, row] of Object.entries(chart) as [DrumName, string][]) {
    const pad = PADS[name];
    [...row.replace(/\s+/g, '')].forEach((ch, i) => {
      const level = LEVEL[ch];
      // A sixteenth lasts a sixteenth, so a hit never rings past the loop's end.
      if (level) out.push([i / 4, pad, i % 2 ? 0.25 : 0.5, Math.round(PAD_VEL[pad] * level * 100) / 100]);
    });
  }
  return out;
}

// ── 1 · Jungle Drum Parade ───────────────────────────────────────────────────
// Shows: Beat Hop. Block by block the beat grows the way a child builds one:
// the big drum alone, then the tiny cymbal, then the snappy drum (the three rows
// a Little Monster's grid starts with), then bongos and cowbell, then claps.
// Happy mood in D: 0 D · 1 E · 2 F♯ · 3 A · 4 B · 5 D · 6 E · 7 F♯.
// Chords: D D | A A | Bm Bm | A D (I V vi V I). The big drum goes
// "boom . boom-boom" and Grumble's oom-pah plays on every big drum.
const BIG_DRUM = 'X... .... x.x. .... X... .... x... x...';
const JUNGLE_DRUM_PARADE: DemoSong = {
  id: 'demo-jungle-drum-parade',
  title: 'Jungle Drum Parade',
  style: 'Drum parade',
  shows: 'Beat Hop: a beat built one drum at a time',
  tempo: 108,
  scale: 'pentatonicMajor',
  key: 2,
  hue: 28,
  band: {
    boom: {
      preset: 'stompy-kit',
      loops: {
        // Everything, with claps, a crash and a boing to finish.
        parade: {
          kick: BIG_DRUM,
          snare: '.... X... .... X... .... X... .... X...',
          clap: ' .... x... .... x... .... x... .... x...',
          hat: '  x.o. x.o. x.o. x.o. x.o. x.o. x.o. x.o.',
          bongo: '..x. ..x. ..x. ..o. ..x. ..x. x.x. x.x.',
          bell: ' x... ..x. .... x... .... x... x... ....',
          crash: 'X... .... .... .... .... .... .... ....',
          boing: '.... .... .... .... .... .... .... ..x.',
        },
        // Block 1: one drum. Every stone is a whole beat or a pair.
        'big-drum': { kick: BIG_DRUM },
        // + the tiny cymbal: tss-tss on every beat.
        tss: {
          kick: BIG_DRUM,
          hat: '  x.o. x.o. x.o. x.o. x.o. x.o. x.o. x.o.',
        },
        // + the snappy drum: the Little grid's three rows, all lit up.
        beat: {
          kick: BIG_DRUM,
          snare: '.... X... .... X... .... X... .... X...',
          hat: '  x.o. x.o. x.o. x.o. x.o. x.o. x.o. x.o.',
        },
        // + bongos on the "and"s and the cowbell's clave (3 + 2).
        jungle: {
          kick: BIG_DRUM,
          snare: '.... X... .... X... .... X... .... X...',
          hat: '  x.o. x.o. x.o. x.o. x.o. x.o. x.o. x.o.',
          bongo: '..x. ..x. ..x. ..o. ..x. ..x. x.x. x.x.',
          bell: ' x... ..x. .... x... .... x... x... ....',
        },
        // The breakdown: only the jungle drums.
        bongos: {
          hat: '  ..o. ..o. ..o. ..o. ..o. ..o. ..o. ..o.',
          bongo: 'x.x. ..x. x.x. ..o. x.x. ..x. x.x. x.x.',
          bell: ' x... ..x. .... x... .... x... x... ....',
        },
        // Back in with a snappy-drum roll.
        fill: {
          kick: BIG_DRUM,
          snare: '.... X... .... X... .... X... o.o. xxxX',
          hat: '  x.o. x.o. x.o. x.o. x.o. x.o. .... ....',
          bongo: '..x. ..x. ..x. ..o. ..x. ..x. .... ....',
        },
      },
    },
    grumble: {
      preset: 'big-belly-bass',
      loops: {
        // D . A E | B . A D : oom-pah, root and fifth, only with the big drum.
        'oom-pah': [
          [0, 0, 1.9, 0.95], [2, 3, 0.45, 0.85], [2.5, 1, 1.4, 0.75],
          [4, 4, 1.9, 0.95], [6, 3, 0.9, 0.85], [7, 0, 0.9, 0.9],
        ],
      },
    },
    spark: {
      preset: 'star-bells',
      fx: { echo: 0.4 },
      loops: {
        // A glockenspiel tinkling on the "and"s, high and low, always in the chord.
        tinkle: [
          [0.5, 5, 0.5, 0.55], [1.5, 2, 0.5, 0.45], [2.5, 6, 0.5, 0.55], [3.5, 3, 0.5, 0.45],
          [4.5, 4, 0.5, 0.55], [5.5, 5, 0.5, 0.45], [6.5, 6, 0.5, 0.55], [7.5, 7, 0.5, 0.45],
        ],
      },
    },
    bloop: {
      preset: 'bubble-lead',
      fx: { gloop: 0.4 },
      loops: {
        // "Here comes the pa-rade!" (ends open, on A) / "Stomp, stomp, hoo-RAY!" (home on D).
        chant: [
          [0, 2, 0.45, 0.85], [0.5, 3, 0.45, 0.75], [1, 5, 0.9, 0.85], [2, 6, 0.9, 0.9], [3, 3, 0.9, 0.8],
          [4, 4, 0.9, 0.9], [5, 4, 0.9, 0.8], [6, 6, 0.9, 0.85], [7, 5, 0.9, 0.95],
        ],
        // The same chant, cheering up high.
        cheer: [
          [0, 5, 0.45, 0.9], [0.5, 5, 0.45, 0.75], [1, 7, 0.9, 0.9], [2, 6, 0.45, 0.85], [2.5, 7, 0.45, 0.75], [3, 6, 0.9, 0.85],
          [4, 4, 0.45, 0.9], [4.5, 5, 0.45, 0.75], [5, 7, 0.9, 0.85], [6, 6, 0.9, 0.85], [7, 5, 0.9, 0.95],
        ],
      },
    },
  },
  blocks: {
    boom: ['big-drum', 'tss', 'beat', 'jungle', 'parade', 'bongos', 'fill', 'parade'],
    grumble: [null, 'oom-pah', 'oom-pah', 'oom-pah', 'oom-pah', null, 'oom-pah', 'oom-pah'],
    spark: [null, null, 'tinkle', 'tinkle', 'tinkle', 'tinkle', 'tinkle', 'tinkle'],
    bloop: [null, null, null, 'chant', 'cheer', 'chant', 'chant', 'cheer'],
  },
};

// ── 2 · Disco Jellyfish ──────────────────────────────────────────────────────
// Sunny mood in F: 0 F · 1 G · 2 A · 3 B♭ · 4 C · 5 D · 6 E · 7 F.
// Chords, two beats each: F Dm B♭ C (I vi IV V: steps 0 5 3 4). Four on the floor;
// the bass bounces root (with the big drum) and octave or fifth (on the "and").
const DISCO_JELLYFISH: DemoSong = {
  id: 'demo-disco-jellyfish',
  title: 'Disco Jellyfish',
  style: 'Disco dance',
  shows: 'Four on the floor: the big drum on every beat, the bass bouncing with it',
  tempo: 120,
  scale: 'major',
  key: 5,
  hue: 305,
  band: {
    boom: {
      preset: 'stompy-kit',
      loops: {
        disco: {
          kick: '  X... x... x... x... X... x... x... x...',
          clap: '  .... x... .... x... .... x... .... x...',
          hat: '   o.X. o.X. o.X. o.X. o.X. o.X. o.X. o.X.',
        },
        intro: {
          kick: '  X... x... x... x... X... x... x... x...',
          hat: '   ..X. ..X. ..X. ..X. ..X. ..X. ..X. ..X.',
        },
        fill: {
          kick: '  X... x... x... x... X... x... x... x...',
          clap: '  .... x... .... x... .... x... .... ....',
          hat: '   o.X. o.X. o.X. o.X. o.X. o.X. .... ....',
          snare: ' .... .... .... .... .... .... o.o. xxxX',
        },
        big: {
          kick: '  X... x... x... x... X... x... x... x...',
          snare: ' .... x... .... x... .... x... .... x...',
          clap: '  .... X... .... X... .... X... .... X...',
          hat: '   o.X. o.X. o.X. o.X. o.X. o.X. o.X. o.X.',
          crash: ' X... .... .... .... .... .... .... ....',
        },
      },
    },
    grumble: {
      preset: 'big-belly-bass',
      loops: {
        bounce: [
          [0, 0, 0.4, 0.95], [0.5, 7, 0.35, 0.7], [1, 0, 0.4, 0.85], [1.5, 7, 0.35, 0.7],
          [2, 5, 0.4, 0.9], [2.5, 2, 0.35, 0.7], [3, 5, 0.4, 0.85], [3.5, 2, 0.35, 0.7],
          [4, 3, 0.4, 0.9], [4.5, 7, 0.35, 0.7], [5, 3, 0.4, 0.85], [5.5, 7, 0.35, 0.7],
          [6, 4, 0.4, 0.9], [6.5, 1, 0.35, 0.7], [7, 4, 0.4, 0.85], [7.5, 6, 0.35, 0.75],
        ],
      },
    },
    puff: {
      preset: 'dream-glow',
      fx: { gloop: 0.4 },
      loops: {
        chords: [[0, 0, 1.9, 0.65], [2, 5, 1.9, 0.6], [4, 3, 1.9, 0.65], [6, 4, 1.9, 0.6]],
      },
    },
    bloop: {
      preset: 'bubble-lead',
      fx: { echo: 0.4, gloop: 0.4 },
      loops: {
        // "Dis-co, dis-co, jel-ly fish! / Wig-gle, wig-gle in the sea!"
        hook: [
          [0, 4, 0.4, 0.9], [0.5, 2, 0.4, 0.75], [1, 4, 0.4, 0.85], [1.5, 2, 0.4, 0.7], [2, 5, 0.45, 0.9], [2.5, 4, 0.45, 0.75], [3, 2, 0.9, 0.85],
          [4, 3, 0.4, 0.9], [4.5, 5, 0.4, 0.75], [5, 3, 0.4, 0.85], [5.5, 5, 0.4, 0.7], [6, 4, 0.45, 0.9], [6.5, 4, 0.45, 0.75], [7, 6, 0.9, 0.85],
        ],
        // The hook again, up high, for the big finish.
        high: [
          [0, 7, 0.9, 0.95], [1, 7, 0.45, 0.8], [1.5, 5, 0.45, 0.75], [2, 7, 0.9, 0.9], [3, 5, 0.9, 0.8],
          [4, 5, 0.45, 0.9], [4.5, 5, 0.45, 0.75], [5, 7, 0.45, 0.85], [5.5, 5, 0.45, 0.75], [6, 4, 0.9, 0.9], [7, 6, 0.45, 0.85], [7.5, 4, 0.45, 0.75],
        ],
      },
    },
  },
  blocks: {
    boom: ['intro', 'disco', 'disco', 'fill', 'big', null, 'fill', 'big'],
    grumble: [null, 'bounce', 'bounce', 'bounce', 'bounce', 'bounce', 'bounce', 'bounce'],
    puff: [null, null, 'chords', 'chords', 'chords', 'chords', 'chords', 'chords'],
    bloop: [null, null, null, 'hook', 'high', 'hook', 'hook', 'high'],
  },
};

// ── 3 · Wiggle Wobble Rocket ─────────────────────────────────────────────────
// Shows: effect buddies, fast. Echo throws Spark's stars across the sky (a lot),
// Wiggle wobbles Bloop's laser and Echo repeats it (a little), Chomper makes
// Grumble's engine crunchy (Wiggle and Chomper are Monster Maker buddies).
// Mystery mood in D: 0 D · 1 F · 2 G · 3 A · 4 C · 5 D · 6 F · 7 G.
// Chords: Dm for a bar | C, G (i VII IV: steps 0 | 4 2). Big drum on every beat;
// Grumble's engine plays the root with it and the octave in between.
const WIGGLE_WOBBLE_ROCKET: DemoSong = {
  id: 'demo-wiggle-wobble-rocket',
  title: 'Wiggle Wobble Rocket',
  style: 'Space race (electro)',
  shows: 'Effect buddies (Echo, Wiggle, Chomper) at top speed',
  tempo: 134,
  scale: 'pentatonicMinor',
  key: 2,
  hue: 350,
  band: {
    boom: {
      preset: 'robot-beats',
      loops: {
        // Full speed: big drum on every beat, claps, and a crash at the top.
        race: {
          kick: ' X... x... x... x... X... x... x... x...',
          clap: ' .... x... .... x... .... x... .... x...',
          hat: '  o.X. o.X. o.X. o.X. o.X. o.X. o.X. o.X.',
          crash: 'X... .... .... .... .... .... .... ....',
        },
        // "Three, two, one… boing!" twice.
        countdown: {
          bell: ' X... x... x... .... X... x... x... ....',
          hat: '  ..o. ..o. ..o. ..o. ..o. ..o. ..o. ..o.',
          boing: '.... .... .... x... .... .... .... x...',
        },
        engine: {
          kick: ' X... x... x... x... X... x... x... x...',
          hat: '  ..x. ..x. ..x. ..x. ..x. ..x. ..x. ..x.',
        },
        // Lift-off: the snappy drum rolls faster and louder.
        liftoff: {
          kick: ' X... x... x... x... X... x... x... x...',
          clap: ' .... x... .... x... .... .... .... ....',
          hat: '  o.X. o.X. o.X. o.X. o.X. o.X. .... ....',
          snare: '.... .... .... .... x... x... x.x. xxxX',
        },
      },
    },
    grumble: {
      preset: 'chocolate-thunder',
      fx: { chomper: 0.4 },
      loops: {
        // D d D d D d D d | C C C G  G g G g
        engine: [
          [0, 0, 0.35, 0.95], [0.5, 5, 0.3, 0.7], [1, 0, 0.35, 0.85], [1.5, 5, 0.3, 0.7],
          [2, 0, 0.35, 0.9], [2.5, 5, 0.3, 0.7], [3, 0, 0.35, 0.85], [3.5, 5, 0.3, 0.7],
          [4, 4, 0.35, 0.95], [4.5, 4, 0.3, 0.7], [5, 4, 0.35, 0.85], [5.5, 2, 0.3, 0.7],
          [6, 2, 0.35, 0.9], [6.5, 7, 0.3, 0.7], [7, 2, 0.35, 0.85], [7.5, 7, 0.3, 0.7],
        ],
      },
    },
    bloop: {
      preset: 'laser-jelly',
      fx: { echo: 0.4, wiggle: 0.4 },
      loops: {
        // "Three… two… one…" (open, on A) / "BLAST OFF! Zoom, zoom, ZOOM!" (home on D).
        countdown: [
          [0, 5, 0.9, 0.9], [1, 4, 0.9, 0.8], [2, 3, 0.9, 0.85], [3.5, 1, 0.45, 0.7],
          [4, 7, 0.9, 0.95], [5, 4, 0.9, 0.85], [6, 2, 0.45, 0.85], [6.5, 3, 0.45, 0.75], [7, 5, 0.9, 0.9],
        ],
        // The fast one: eighths all the way, down home at the end.
        zoom: [
          [0, 5, 0.4, 0.95], [0.5, 5, 0.4, 0.75], [1, 6, 0.4, 0.85], [1.5, 5, 0.4, 0.75], [2, 3, 0.4, 0.85], [2.5, 4, 0.4, 0.75], [3, 5, 0.9, 0.85],
          [4, 4, 0.4, 0.95], [4.5, 4, 0.4, 0.75], [5, 7, 0.4, 0.85], [5.5, 6, 0.4, 0.75], [6, 7, 0.4, 0.9], [6.5, 6, 0.4, 0.75], [7, 5, 0.9, 0.9],
        ],
      },
    },
    spark: {
      preset: 'robot-raindrops',
      fx: { echo: 0.8 },
      loops: {
        // A few stars, thrown far by Echo.
        stars: [
          [0.5, 5, 0.25, 0.5], [1.75, 3, 0.25, 0.4], [2.5, 6, 0.25, 0.5],
          [4.5, 4, 0.25, 0.5], [5.75, 2, 0.25, 0.4], [6.5, 5, 0.25, 0.5],
        ],
      },
    },
  },
  blocks: {
    boom: ['countdown', 'engine', 'engine', 'race', 'race', null, 'liftoff', 'race'],
    grumble: [null, 'engine', 'engine', 'engine', 'engine', null, 'engine', 'engine'],
    bloop: [null, null, 'countdown', 'countdown', 'zoom', 'countdown', 'countdown', 'zoom'],
    spark: ['stars', 'stars', 'stars', null, 'stars', 'stars', null, 'stars'],
  },
};

// ── 4 · Grumble's Tummy Rumble ───────────────────────────────────────────────
// Shows: Grumble plays with the big drum. In block 1 it is just the two of
// them, note for drum; the rest of the band joins on top.
// Bluesy mood in G: 0 G · 1 B♭ · 2 C · 3 D♭ (the blue note) · 4 D · 5 F · 6 G · 7 B♭.
// Chords: G7 for a bar | C7, G7 (i iv i blues: steps 0 | 2 0).
// Big drum and bass: "boom-b'boom . boom . boom" (0, ¾, 1½, 2½), then once more
// with a pickup on the way home.
const RUMBLE_KICK = 'X..x ..x. ..x. .... X..x ..x. ..x. ..x.';
const TUMMY_RUMBLE: DemoSong = {
  id: 'demo-tummy-rumble',
  title: "Grumble's Tummy Rumble",
  style: 'Hip-hop',
  shows: 'Grumble’s bass plays with the big drum',
  tempo: 88,
  scale: 'blues',
  key: 7,
  hue: 130,
  band: {
    boom: {
      preset: 'stompy-kit',
      loops: {
        // The main boom-bap: big drum, snappy drum on 2 and 4, tiny cymbal.
        bap: {
          kick: RUMBLE_KICK,
          snare: '.... X... .... X... .... X... .... X...',
          hat: '  x.o. x.o. x.oo x.o. x.o. x.o. x.oo x.o.',
        },
        // The big drum alone: listen to Grumble copy it.
        'big-drum': { kick: RUMBLE_KICK },
        // Claps on the snappy drum, a crash, and a boing at the end.
        'bap-boing': {
          kick: RUMBLE_KICK,
          snare: '.... X... .... X... .... X... .... X...',
          clap: ' .... x... .... x... .... x... .... x...',
          hat: '  x.o. x.o. x.oo x.o. x.o. x.o. x.oo x.o.',
          crash: 'X... .... .... .... .... .... .... ....',
          boing: '.... .... .... .... .... .... .... ...x',
        },
        // Bongos roll us back in.
        fill: {
          kick: RUMBLE_KICK,
          snare: '.... X... .... X... .... X... .... X...',
          hat: '  x.o. x.o. x.oo x.o. x.o. x.o. .... ....',
          bongo: '.... .... .... .... .... .... xxxx xxxX',
        },
      },
    },
    grumble: {
      preset: 'wobble-cave',
      loops: {
        // G G' F D | C C B♭ G D: one bass note on every big drum, nothing in between.
        rumble: [
          [0, 0, 0.6, 0.95], [0.75, 6, 0.3, 0.8], [1.5, 5, 0.45, 0.8], [2.5, 4, 0.9, 0.85],
          [4, 2, 0.6, 0.95], [4.75, 2, 0.3, 0.75], [5.5, 1, 0.45, 0.8], [6.5, 0, 0.9, 0.9], [7.5, 4, 0.45, 0.75],
        ],
      },
    },
    bloop: {
      // A giggly, wobbly voice for a hungry tummy.
      preset: 'alien-giggle',
      fx: { echo: 0.4 },
      loops: {
        // "Rum-ble, rum-ble, TUM-MY!" (ends open, on D) / "Hun-gry, hun-gry, YUM-MMM!" (home on G).
        hungry: [
          [0, 4, 0.4, 0.9], [0.5, 4, 0.4, 0.75], [1, 6, 0.4, 0.85], [1.5, 5, 0.4, 0.75], [2, 6, 0.45, 0.95], [2.5, 4, 0.9, 0.85],
          [4, 2, 0.4, 0.9], [4.5, 2, 0.4, 0.75], [5, 1, 0.4, 0.85], [5.5, 2, 0.4, 0.75], [6, 1, 0.45, 0.85], [6.5, 0, 1.4, 0.9],
        ],
        // "Yum, yum-yum, YUM!" with the blue note sliding down into C.
        yum: [
          [0, 4, 0.45, 0.9], [1, 4, 0.45, 0.8], [1.5, 5, 0.45, 0.8], [2, 6, 0.9, 0.95], [3, 5, 0.45, 0.75], [3.5, 3, 0.45, 0.75],
          [4, 2, 0.9, 0.9], [5, 1, 0.45, 0.8], [5.5, 2, 0.45, 0.75], [6, 0, 1.4, 0.9],
        ],
      },
    },
    spark: {
      preset: 'magic-dust',
      fx: { echo: 0.4 },
      loops: {
        // Little sparkly drips that answer at the end of each bar.
        drips: [
          [3, 4, 0.25, 0.55], [3.25, 5, 0.25, 0.45], [3.5, 6, 0.25, 0.5],
          [7, 0, 0.25, 0.55], [7.25, 1, 0.25, 0.45], [7.5, 4, 0.25, 0.5],
        ],
      },
    },
  },
  blocks: {
    boom: ['big-drum', 'bap', 'bap', 'bap', 'bap-boing', 'big-drum', 'fill', 'bap-boing'],
    grumble: ['rumble', 'rumble', 'rumble', 'rumble', 'rumble', 'rumble', 'rumble', 'rumble'],
    bloop: [null, null, 'hungry', 'hungry', 'yum', null, 'hungry', 'yum'],
    spark: [null, null, null, 'drips', 'drips', 'drips', 'drips', 'drips'],
  },
};

// ── 5 · Skeleton Tiptoe ──────────────────────────────────────────────────────
// Mystery mood in A: 0 A · 1 C · 2 D · 3 E · 4 G · 5 A · 6 C · 7 D.
// The bass tiptoes up the stairs (A C D E) and back down (G E D C) under a heartbeat;
// the fog is A minor for a bar (step 1: C E A), then hollow A D G (step 0).
const SKELETON_TIPTOE: DemoSong = {
  id: 'demo-skeleton-tiptoe',
  title: 'Skeleton Tiptoe',
  style: 'Spooky mystery',
  shows: 'A soft heartbeat beat and a whistle that asks and answers',
  tempo: 96,
  scale: 'pentatonicMinor',
  key: 9,
  hue: 268,
  band: {
    boom: {
      preset: 'pillow-drums',
      fx: { gloop: 0.4 },
      loops: {
        bones: {
          kick: '  X.o. .... .... .... X.o. .... .... ....',
          snare: ' .... .... X... .... .... .... X... ....',
          hat: '   x.o. x.o. x.o. x.o. x.o. x.o. x.o. x.o.',
          bongo: ' .... .... .... ..x. .... .... .... x.X.',
        },
        // Heartbeat and a ticking clock.
        clock: {
          kick: '  X.o. .... .... .... X.o. .... .... ....',
          hat: '   x... o... x... o... x... o... x... o...',
        },
        boo: {
          kick: '  X.o. .... .... .... X.o. .... .... ....',
          snare: ' .... .... X... .... .... .... X... ....',
          clap: '  .... .... x... .... .... .... x... ....',
          hat: '   x.o. x.o. x.o. x.o. x.o. x.o. x.o. x.o.',
          bongo: ' .... .... .... ..x. .... .... .... x.X.',
          crash: ' X... .... .... .... .... .... .... ....',
        },
      },
    },
    grumble: {
      preset: 'sleepy-dinosaur',
      fx: { gloop: 0.4 },
      loops: {
        // Lub-dub with the heartbeat, then tiptoe: A-a C D E | G-g E D C.
        creep: [
          [0, 0, 0.4, 0.95], [0.5, 0, 0.3, 0.55], [1, 1, 0.4, 0.7], [2, 2, 0.4, 0.85], [3, 3, 0.4, 0.7],
          [4, 4, 0.4, 0.9], [4.5, 4, 0.3, 0.55], [5, 3, 0.4, 0.7], [6, 2, 0.4, 0.85], [7, 1, 0.4, 0.7],
        ],
      },
    },
    puff: {
      preset: 'slow-sunrise',
      fx: { gloop: 0.8 },
      loops: {
        fog: [[0, 1, 3.9, 0.6], [4, 0, 3.9, 0.55]],
      },
    },
    bloop: {
      preset: 'rainbow-whistle',
      fx: { echo: 0.8, gloop: 0.8 },
      loops: {
        // "Who's that creep-ing…?" (left hanging) / "down the hall-way… BOO!" (home).
        ghost: [
          [0, 5, 0.45, 0.85], [0.5, 6, 0.45, 0.7], [1, 5, 0.45, 0.8], [1.5, 3, 0.45, 0.7], [2, 4, 1.5, 0.85],
          [4, 4, 0.45, 0.85], [4.5, 3, 0.45, 0.7], [5, 2, 0.45, 0.8], [5.5, 1, 0.45, 0.7], [6, 0, 1.5, 0.9],
        ],
        // Higher and closer: up to a hanging high D, then down to A.
        high: [
          [0, 5, 0.45, 0.85], [0.5, 6, 0.45, 0.7], [1, 7, 0.45, 0.8], [1.5, 6, 0.45, 0.7], [2, 7, 1.5, 0.85],
          [4, 7, 0.45, 0.85], [4.5, 5, 0.45, 0.7], [5, 4, 0.45, 0.8], [5.5, 3, 0.45, 0.7], [6, 5, 1.5, 0.9],
        ],
      },
    },
  },
  blocks: {
    boom: ['clock', 'clock', 'bones', 'bones', 'boo', 'clock', 'bones', 'boo'],
    grumble: [null, 'creep', 'creep', 'creep', 'creep', null, 'creep', 'creep'],
    puff: ['fog', 'fog', 'fog', 'fog', 'fog', 'fog', 'fog', 'fog'],
    bloop: [null, null, 'ghost', 'ghost', 'high', 'ghost', 'high', 'high'],
  },
};

// ── 6 · Cloud Castle ─────────────────────────────────────────────────────────
// Shows: Puff. Big soft chords that change every two beats, first held long
// ("clouds"), then breathing on every beat ("breathe"), in a choir of ooohs with
// the Gloop buddy making it huge. Puff starts the song all alone; a soft
// tick joins with the tune in block 2, so the beat never waits too long.
// Moody mood in E: 0 E · 1 F♯ · 2 G · 3 A · 4 B · 5 C · 6 D · 7 E.
// Chords, two beats each: Em C G D (i VI III VII: steps 0 5 2 6).
const LOFI_KICK = 'X... .... x.x. .... X... .... x.x. ....';
const CLOUD_CASTLE: DemoSong = {
  id: 'demo-cloud-castle',
  title: 'Cloud Castle',
  style: 'Dreamy chill',
  shows: 'Puff’s big soft chords, with the Gloop buddy',
  tempo: 76,
  scale: 'minor',
  key: 4,
  hue: 205,
  band: {
    puff: {
      preset: 'pillow-choir',
      fx: { gloop: 0.8 },
      loops: {
        clouds: [[0, 0, 1.9, 0.6], [2, 5, 1.9, 0.55], [4, 2, 1.9, 0.6], [6, 6, 1.9, 0.55]],
        // The same chords, one "ooh" per beat.
        breathe: [
          [0, 0, 0.9, 0.6], [1, 0, 0.9, 0.45], [2, 5, 0.9, 0.55], [3, 5, 0.9, 0.45],
          [4, 2, 0.9, 0.6], [5, 2, 0.9, 0.45], [6, 6, 0.9, 0.55], [7, 6, 0.9, 0.45],
        ],
      },
    },
    bloop: {
      preset: 'moon-drops',
      fx: { echo: 0.4, gloop: 0.4 },
      loops: {
        // B . G | E' . D | B . G | A F♯: one long drop on every chord.
        stars: [
          [0, 4, 1.4, 0.8], [1.5, 2, 0.45, 0.65], [2, 7, 1.4, 0.8], [3.5, 6, 0.45, 0.6],
          [4, 4, 1.4, 0.8], [5.5, 2, 0.45, 0.65], [6, 3, 0.9, 0.75], [7, 1, 0.9, 0.65],
        ],
        // Higher up, the answer: E' D B | C' B | D' B | A.
        wish: [
          [0, 7, 0.9, 0.8], [1, 6, 0.45, 0.6], [1.5, 4, 0.45, 0.6], [2, 5, 1.4, 0.75], [3.5, 4, 0.45, 0.6],
          [4, 6, 0.9, 0.8], [5, 4, 0.9, 0.65], [6, 3, 1.9, 0.75],
        ],
      },
    },
    grumble: {
      preset: 'sleepy-dinosaur',
      loops: {
        // E . C G | G . D A: the root with each big drum, its fifth on the drum's echo.
        roots: [
          [0, 0, 1.9, 0.85], [2, 5, 0.45, 0.8], [2.5, 2, 1.4, 0.7],
          [4, 2, 1.9, 0.85], [6, 6, 0.45, 0.8], [6.5, 3, 1.4, 0.7],
        ],
      },
    },
    boom: {
      preset: 'pillow-drums',
      fx: { gloop: 0.4 },
      loops: {
        // The main lazy beat.
        soft: {
          kick: LOFI_KICK,
          snare: '.... x... .... x... .... x... .... x...',
          hat: '  x.o. x.o. x.o. x.o. x.o. x.o. x.o. x.o.',
        },
        // Just a soft tick: big drum on 1, tiny cymbal on every beat.
        tick: {
          kick: ' X... .... .... .... X... .... .... ....',
          hat: '  o... o... o... o... o... o... o... o...',
        },
      },
    },
  },
  blocks: {
    puff: ['clouds', 'clouds', 'clouds', 'breathe', 'clouds', 'breathe', 'clouds', 'breathe'],
    bloop: [null, 'stars', 'stars', 'wish', 'stars', 'wish', 'stars', 'wish'],
    grumble: [null, null, 'roots', 'roots', 'roots', null, 'roots', 'roots'],
    boom: [null, 'tick', 'tick', 'soft', 'soft', 'tick', 'soft', 'soft'],
  },
};

/** The shelf's demo songs: the beat first (it leads into the first-beat tutorial), the calmest last. */
export const DEMO_SONGS: readonly DemoSong[] = [
  JUNGLE_DRUM_PARADE,
  DISCO_JELLYFISH,
  WIGGLE_WOBBLE_ROCKET,
  TUMMY_RUMBLE,
  SKELETON_TIPTOE,
  CLOUD_CASTLE,
];

export function findDemo(id: string): DemoSong | undefined {
  return DEMO_SONGS.find((s) => s.id === id);
}

const note = ([beat, step, dur = 0.5, vel = 0.85]: N): NoteEvent => ({ id: newId('n'), beat, step, dur, vel, tone: 0 });

/** The notes of one demo loop, in time order. */
export function demoLoopNotes(loop: N[] | DrumChart): NoteEvent[] {
  const tuples = Array.isArray(loop) ? loop : drumHits(loop);
  return tuples.map(note).sort((a, b) => a.beat - b.beat || a.step - b.step);
}

/**
 * A fresh, editable copy of a demo song: new ids every time, so the demo on the
 * shelf never changes, whatever a child does to their copy.
 */
export function demoProject(song: DemoSong, seed = Math.floor(Math.random() * 1e9)): Project {
  const monsters = ALL_MONSTERS.filter((m) => song.band[m]);
  const project = createProject({ monsters, seed });
  const rows = { ...project.arrangement.rows };
  const tracks = project.tracks.map((t) => {
    const part = song.band[t.monster]!;
    const ids = new Map<string, string>();
    const clips = Object.entries(part.loops).map(([name, loop]) => {
      const clip = createClip(project.loopBeats);
      clip.notes = demoLoopNotes(loop);
      ids.set(name, clip.id);
      return clip;
    });
    const plan = song.blocks[t.monster] ?? [];
    rows[t.id] = Array.from({ length: project.arrangement.length }, (_, i) => ids.get(plan[i] ?? '') ?? null);
    return { ...t, preset: part.preset, fx: { echo: 0, gloop: 0, chomper: 0, wiggle: 0, ...part.fx }, clips, activeClipId: clips[0]?.id ?? null };
  });
  return {
    ...project,
    name: song.title,
    tempo: song.tempo,
    scale: song.scale,
    key: song.key,
    tracks,
    arrangement: { ...project.arrangement, rows },
    art: { ...project.art, hue: song.hue },
  };
}
