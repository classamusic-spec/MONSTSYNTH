import type { MonsterKind } from '../../model/types';
import type { ChirpKind } from '../../studio/studio';
import type { IconName } from '../icons/Icon';

// Short speech bubbles from the monsters. Always an icon + a few words, so they
// help readers and grown-ups without being required for non-readers, and a
// little monster voice, so non-readers hear that the monster said something.

export interface BubbleMsg {
  text: string;
  icon?: IconName;
  /** Who speaks (and chirps); the monster on the keys when left out. */
  monster?: MonsterKind;
  /**
   * Its voice: "yay" for good news (a check), "huh?" otherwise, so "huh?" always
   * means something is missing. A bubble that is not a dead end ("Play
   * something!") passes its own kind, or null for none (also when the sound was already made).
   */
  chirp?: ChirpKind | null;
  id?: number;
}

/** The voice a bubble speaks with. */
export function bubbleChirp(b: BubbleMsg): ChirpKind | null {
  if (b.chirp !== undefined) return b.chirp;
  return b.icon === 'check' ? 'yay' : 'huh';
}

/** A new bubble, or `null` with the id of one taken back early. */
type Listener = (b: BubbleMsg | null, hushed?: number) => void;
const listeners = new Set<Listener>();
let seq = 0;

/** Show a bubble; returns its id (for hush). */
export function say(b: BubbleMsg): number {
  const msg = { ...b, id: ++seq };
  listeners.forEach((l) => l(msg));
  return msg.id;
}

/** Take a bubble back once it no longer applies ("Play something!" after the child played). */
export function hush(id: number) {
  listeners.forEach((l) => l(null, id));
}

export function onSay(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
