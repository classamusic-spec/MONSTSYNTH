import { seededRandom } from '../model/ids';

const ADJECTIVES = [
  'Sleepy', 'Bouncy', 'Sparkly', 'Wobbly', 'Giggly', 'Zippy', 'Fuzzy', 'Jelly',
  'Moonlit', 'Rainbow', 'Bubbly', 'Stompy', 'Dreamy', 'Twinkly', 'Squishy', 'Wiggly',
  'Cosmic', 'Silly', 'Glowy', 'Tiny', 'Giant', 'Starry', 'Gooey', 'Crunchy',
];

const NOUNS = [
  'Party', 'Parade', 'Dance', 'Stomp', 'Lullaby', 'Rocket', 'Jam', 'Groove',
  'Picnic', 'Boogie', 'Adventure', 'Wobble', 'Song', 'Disco', 'Tune', 'Bounce',
  'Choir', 'Circus', 'Garden', 'Rainstorm', 'Banana', 'Volcano', 'Spaceship', 'Pancake',
];

const MONSTER_NAMES = ['Bloop', 'Boom', 'Grumble', 'Spark', 'Puff', 'Mimic'];

/** Playful, readable song names. Kids see artwork first; names are for readers. */
export function songName(seed: number): string {
  const rnd = seededRandom(seed);
  const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)];
  const adj = pick(ADJECTIVES);
  const noun = pick(NOUNS);
  const form = rnd();
  if (form < 0.4) return `${pick(MONSTER_NAMES)}'s ${adj} ${noun}`;
  if (form < 0.7) return `The ${adj} ${noun}`;
  return `${adj} ${noun}`;
}
