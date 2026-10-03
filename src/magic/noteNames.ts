import type { NoteNameStyle, ScaleId } from '../model/types';
import { SCALES } from './scales';

// ─────────────────────────────────────────────────────────────────────────────
// MONSTER MAGIC · note names.
// The one place that turns a key (a scale step in a key and mood) into the name
// printed on its sticker. Spelling follows the scale degree, starting from the
// usual name of the tonic (E♭ major, C♯ minor), so D major reads F♯ and C minor
// reads E♭. One "piano rule" then keeps it child-friendly: a pitch that is a
// white key on a piano is always its plain letter, so there is never a C♭, E♯ or
// double flat on a sticker. Do re mi is movable: the tonic is always "do" (or a
// lesson tune's home note, when the tune rests on another key: see `home`).
// Every monster's step 0 sits on a C (baseMidi % 12 === 0), so the pitch class
// of a key is simply key + its semitone offset.
// ─────────────────────────────────────────────────────────────────────────────

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export type Accidental = -1 | 0 | 1;

export interface NoteName {
  letter: Letter;
  /** -1 flat, 0 natural, +1 sharp. Never a double accidental. */
  accidental: Accidental;
  /** Pitch class 0..11 (0 = C). */
  pc: number;
  /** Written name with typographic accidentals, e.g. 'F♯' (tests, logs, plain text). */
  text: string;
  /** What a screen reader says, e.g. 'F sharp'. */
  spoken: string;
  /** Movable-do syllable, e.g. 'fi' (the tonic is always 'do'). */
  solfege: string;
}

export const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
/** Pitch class of each natural letter (the white keys). */
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
/** Usual tonic names: fewest accidentals for major-type and minor-type moods. */
const TONIC_MAJOR = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const TONIC_MINOR = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
/** Chromatic ("Wild") reads with flats in these keys and with sharps elsewhere. */
const FLAT_KEYS = new Set([1, 3, 5, 8, 10]);
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Major-scale semitones of each degree: the reference for raised/lowered syllables. */
const MAJOR_SEMIS = [0, 2, 4, 5, 7, 9, 11];
const SYLLABLES = ['do', 're', 'mi', 'fa', 'so', 'la', 'ti'];
const RAISED: Record<number, string> = { 0: 'di', 1: 'ri', 3: 'fi', 4: 'si', 5: 'li' };
const LOWERED: Record<number, string> = { 1: 'ra', 2: 'me', 4: 'se', 5: 'le', 6: 'te' };
const CHROMATIC_SHARP_SOL = ['do', 'di', 're', 'ri', 'mi', 'fa', 'fi', 'so', 'si', 'la', 'li', 'ti'];
const CHROMATIC_FLAT_SOL = ['do', 'ra', 're', 'me', 'mi', 'fa', 'se', 'so', 'le', 'la', 'te', 'ti'];

const mod = (n: number, m: number) => ((n % m) + m) % m;

function parse(name: string): { letter: number; accidental: Accidental } {
  const letter = LETTERS.indexOf(name[0] as Letter);
  const accidental: Accidental = name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0;
  return { letter, accidental };
}

function build(letter: number, accidental: Accidental, pc: number, solfege: string): NoteName {
  const l = LETTERS[letter];
  return {
    letter: l,
    accidental,
    pc,
    text: accidental === 1 ? `${l}♯` : accidental === -1 ? `${l}♭` : l,
    spoken: accidental === 1 ? `${l} sharp` : accidental === -1 ? `${l} flat` : l,
    solfege,
  };
}

/**
 * The name of one key: a scale step (any octave, also negative) in a mood and
 * key (0 = C). `home` is the step that do re mi calls "do": the tonic (step 0)
 * everywhere except a lesson whose tune rests on another key (Old MacDonald sits
 * on the keys of D major but comes home to G). It changes only the syllable.
 */
export function spellStep(step: number, scale: ScaleId, key: number, home = 0): NoteName {
  const info = SCALES[scale];
  const n = info.steps.length;
  const idx = mod(step, n);
  const homeIdx = mod(home, n);
  const semis = info.steps[idx];
  const tonicPc = mod(Math.round(key), 12);
  const pc = mod(tonicPc + semis, 12);
  const flatKey = FLAT_KEYS.has(tonicPc);
  const fromTable = (solfege: string) => {
    const p = parse((flatKey ? FLAT_NAMES : SHARP_NAMES)[pc]);
    return build(p.letter, p.accidental, pc, solfege);
  };
  // Semitones above "do" (the same as `semis` when do is the tonic).
  const fromDo = mod(semis - info.steps[homeIdx], 12);

  if (info.degrees.length === 0) {
    const flatDo = FLAT_KEYS.has(mod(tonicPc + info.steps[homeIdx], 12));
    return fromTable((flatDo ? CHROMATIC_FLAT_SOL : CHROMATIC_SHARP_SOL)[fromDo]);
  }

  const degree = info.degrees[idx];
  const solDegree = mod(degree - info.degrees[homeIdx], 7);
  let alt = fromDo - MAJOR_SEMIS[solDegree];
  if (alt > 6) alt -= 12;
  if (alt < -6) alt += 12;
  const syllable = SYLLABLES[solDegree];
  const solfege = alt > 0 ? (RAISED[solDegree] ?? syllable) : alt < 0 ? (LOWERED[solDegree] ?? syllable) : syllable;

  // Piano rule: a white-key pitch is always its plain letter.
  const white = NATURAL_PC.indexOf(pc);
  if (white >= 0) return build(white, 0, pc, solfege);

  const tonic = parse((info.family === 'minor' ? TONIC_MINOR : TONIC_MAJOR)[tonicPc]);
  const letter = (tonic.letter + degree) % 7;
  let acc = mod(pc - NATURAL_PC[letter], 12);
  if (acc > 6) acc -= 12;
  // Never reached for the built-in moods (the property tests prove it), but a
  // double accidental must not reach a sticker: fall back to the key's table.
  if (acc !== 1 && acc !== -1) return fromTable(solfege);
  return build(letter, acc, pc, solfege);
}

/** Names for keys 0..count-1 (the play surface, left to right); `home` as in spellStep. */
export function keyNames(count: number, scale: ScaleId, key: number, home = 0): NoteName[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => spellStep(i, scale, key, home));
}

/** The words on a sticker in a style; null when names are switched off. */
export function keyLabel(name: NoteName, style: NoteNameStyle): string | null {
  if (style === 'off') return null;
  return style === 'solfege' ? name.solfege : name.text;
}
