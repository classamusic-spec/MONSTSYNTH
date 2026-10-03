import { describe, expect, it } from 'vitest';
import { baseSongName, COVER_PICTURES, NOUN_PICTURE, NOUNS, songCover, songName, songNoun } from '../src/magic/names';

describe('song cover pictures', () => {
  it('gives every noun a picture, and uses all twelve pictures', () => {
    for (const noun of NOUNS) expect(COVER_PICTURES).toContain(NOUN_PICTURE[noun]);
    expect(new Set(NOUNS.map((n) => NOUN_PICTURE[n])).size).toBe(COVER_PICTURES.length);
  });

  it('finds the noun at the end of a song name', () => {
    expect(songNoun('The Zippy Banana')).toBe('Banana');
    expect(songCover('The Zippy Banana', 1)).toBe('banana');
    expect(songNoun("Boom's Wiggly Lullaby")).toBe('Lullaby');
    expect(songCover("Boom's Wiggly Lullaby", 1)).toBe('moon');
    expect(songCover('Cosmic Spaceship', 1)).toBe('rocket');
  });

  it('forgives grown-up spelling: case, spaces and punctuation', () => {
    expect(songNoun('our big PARTY! ')).toBe('Party');
    expect(songNoun('Rainstorm.')).toBe('Rainstorm');
  });

  it('has no noun for names a grown-up wrote, but still a steady picture', () => {
    expect(songNoun('Grandma and me')).toBeNull();
    expect(songNoun('')).toBeNull();
    // A noun must be the last word, not part of one.
    expect(songNoun('Jamboree')).toBeNull();
    expect(songCover('Grandma and me', 7)).toBe(songCover('Grandma and me', 7));
    expect(COVER_PICTURES).toContain(songCover('Grandma and me', 7));
    expect(COVER_PICTURES).toContain(songCover('Grandma and me', -3));
    expect(COVER_PICTURES).toContain(songCover('Grandma and me', Number.NaN));
  });

  it('keeps the picture when a grown-up duplicates a song', () => {
    expect(baseSongName('Hot Cross Buns (copy)')).toBe('Hot Cross Buns');
    expect(baseSongName('Hot Cross Buns (cop')).toBe('Hot Cross Buns'); // a long name cut at 60 characters
    expect(baseSongName('The Zippy Banana (copy) (copy)')).toBe('The Zippy Banana');
    expect(baseSongName('Grandma and me')).toBe('Grandma and me');
    expect(songNoun('The Zippy Banana (copy) (copy)')).toBe('Banana');
    for (const seed of [1, 3, 7, 11]) {
      expect(songCover('The Zippy Banana (copy)', seed)).toBe('banana');
      expect(songCover('Grandma and me (copy)', seed)).toBe(songCover('Grandma and me', seed));
    }
  });

  it('can read the noun of every generated name', () => {
    for (let seed = 1; seed < 400; seed++) expect(songNoun(songName(seed))).not.toBeNull();
  });
});
