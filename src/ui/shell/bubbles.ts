import type { MonsterKind } from '../../model/types';
import type { IconName } from '../icons/Icon';

// Short speech bubbles from the monsters. Always an icon + a few words, so they
// help readers and grown-ups without being required for non-readers.

export interface BubbleMsg {
  text: string;
  icon?: IconName;
  monster?: MonsterKind;
  id?: number;
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
