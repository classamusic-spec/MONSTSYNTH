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

type Listener = (b: BubbleMsg) => void;
const listeners = new Set<Listener>();
let seq = 0;

export function say(b: BubbleMsg) {
  const msg = { ...b, id: ++seq };
  listeners.forEach((l) => l(msg));
}

export function onSay(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
