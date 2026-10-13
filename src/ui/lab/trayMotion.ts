import { glow } from '../common/glow';
import { isReducedMotion } from '../hooks/useCaps';

// The Add Monster tray answers every tap with motion (the studio makes the sound):
//   hello → a friend joins the stage: its picture hops up, squashes and lands
//   bye   → a friend goes home: it waves (sways side to side) and hops off to sleep
//   sing  → the last monster on stage stays: a happy bounce while it sings
// Imperative Web Animations on the card's picture (never React state), on
// transform-only properties so the compositor does the work.
// Reduced motion: a soft glow around the card instead of any movement.

export type CardMotion = 'hello' | 'bye' | 'sing';

const FRAMES: Record<CardMotion, Keyframe[]> = {
  hello: [
    { translate: '0 0', scale: '1 1' },
    { translate: '0 0', scale: '1.1 0.88', offset: 0.15 },
    { translate: '0 -16%', scale: '0.94 1.08', offset: 0.45 },
    { translate: '0 0', scale: '1.08 0.92', offset: 0.75 },
    { translate: '0 0', scale: '1 1' },
  ],
  bye: [
    { rotate: '0deg', translate: '0 0', scale: '1 1' },
    { rotate: '-14deg', translate: '0 -4%', scale: '1 1', offset: 0.12 },
    { rotate: '12deg', translate: '0 -6%', scale: '1 1', offset: 0.3 },
    { rotate: '-10deg', translate: '0 -4%', scale: '1 1', offset: 0.48 },
    { rotate: '6deg', translate: '0 0', scale: '1 1', offset: 0.64 },
    { rotate: '0deg', translate: '0 -10%', scale: '0.95 1.04', offset: 0.8 },
    { rotate: '0deg', translate: '0 0', scale: '1 1' },
  ],
  sing: [
    { translate: '0 0', scale: '1 1' },
    { translate: '0 -6%', scale: '0.97 1.04', offset: 0.35 },
    { translate: '0 0', scale: '1.05 0.95', offset: 0.7 },
    { translate: '0 0', scale: '1 1' },
  ],
};

const DURATION: Record<CardMotion, number> = { hello: 560, bye: 900, sing: 420 };

export function cardMotion(card: HTMLElement | null, kind: CardMotion) {
  if (!card) return;
  const art = card.querySelector<HTMLElement>('.tray-art');
  // A new tap starts afresh (a quick bye then hello never stacks two motions,
  // and one still running stops when a grown-up has just turned motion down).
  art?.getAnimations?.().forEach((a) => {
    if (a.id.startsWith('tray-')) a.cancel();
  });
  if (isReducedMotion() || !art || typeof art.animate !== 'function') {
    glow(card, 700);
    return;
  }
  art.animate(FRAMES[kind], { duration: DURATION[kind], easing: 'ease-out', id: `tray-${kind}` });
}
