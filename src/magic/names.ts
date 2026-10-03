import { seededRandom } from '../model/ids';

const ADJECTIVES = [
  'Sleepy', 'Bouncy', 'Sparkly', 'Wobbly', 'Giggly', 'Zippy', 'Fuzzy', 'Jelly',
  'Moonlit', 'Rainbow', 'Bubbly', 'Stompy', 'Dreamy', 'Twinkly', 'Squishy', 'Wiggly',
  'Cosmic', 'Silly', 'Glowy', 'Tiny', 'Giant', 'Starry', 'Gooey', 'Crunchy',
];

export const NOUNS = [
  'Party', 'Parade', 'Dance', 'Stomp', 'Lullaby', 'Rocket', 'Jam', 'Groove',
  'Picnic', 'Boogie', 'Adventure', 'Wobble', 'Song', 'Disco', 'Tune', 'Bounce',
  'Choir', 'Circus', 'Garden', 'Rainstorm', 'Banana', 'Volcano', 'Spaceship', 'Pancake',
] as const;

export type Noun = (typeof NOUNS)[number];

/** The flat pictures a song cover can show (drawn in ui/songs/CoverArt). */
export const COVER_PICTURES = ['disco', 'rocket', 'moon', 'basket', 'banana', 'pancake', 'volcano', 'flower', 'rain', 'tent', 'notes', 'jelly'] as const;

export type CoverPicture = (typeof COVER_PICTURES)[number];

/** Every noun a song name can end with has a picture, so kids who can't read find "the rocket song". */
export const NOUN_PICTURE: Record<Noun, CoverPicture> = {
  Party: 'disco',
  Disco: 'disco',
  Boogie: 'disco',
  Dance: 'disco',
  Groove: 'disco',
  Jam: 'disco',
  Rocket: 'rocket',
  Spaceship: 'rocket',
  Adventure: 'rocket',
  Lullaby: 'moon',
  Picnic: 'basket',
  Banana: 'banana',
  Pancake: 'pancake',
  Volcano: 'volcano',
  Garden: 'flower',
  Rainstorm: 'rain',
  Circus: 'tent',
  Parade: 'tent',
  Choir: 'notes',
  Song: 'notes',
  Tune: 'notes',
  Stomp: 'jelly',
  Bounce: 'jelly',
  Wobble: 'jelly',
};

const MONSTER_NAMES = ['Bloop', 'Boom', 'Grumble', 'Spark', 'Puff', 'Mimic'];

/** Playful, readable song names. Kids see artwork first; names are for readers. */
export function songName(seed: number): string {
  const rnd = seededRandom(seed);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];
  const adj = pick(ADJECTIVES);
  const noun = pick(NOUNS);
  const form = rnd();
  if (form < 0.4) return `${pick(MONSTER_NAMES)}'s ${adj} ${noun}`;
  if (form < 0.7) return `The ${adj} ${noun}`;
  return `${adj} ${noun}`;
}

/**
 * A song's name without trailing "(copy)"-style notes, so a duplicate keeps its
 * original's picture. Also drops an unclosed "(cop" left when a long name was cut.
 */
export function baseSongName(name: string): string {
  return name.replace(/(\s*\([^)]*\)?)+\s*$/, '').trim();
}

/** The noun a song's name ends with ("The Zippy Banana" → "Banana"), or null for names a grown-up wrote. */
export function songNoun(name: string): Noun | null {
  const last = baseSongName(name).split(/\s+/).pop()?.replace(/[^a-z]/gi, '').toLowerCase() ?? '';
  return NOUNS.find((n) => n.toLowerCase() === last) ?? null;
}

/**
 * The picture on a song's cover: from the noun in its name, or (for a name
 * without one) picked by the song's seed so every song still gets its own.
 */
export function songCover(name: string, seed: number): CoverPicture {
  const noun = songNoun(name);
  if (noun) return NOUN_PICTURE[noun];
  const i = Math.abs(Math.floor(seed)) % COVER_PICTURES.length;
  return COVER_PICTURES[Number.isFinite(i) ? i : 0];
}
