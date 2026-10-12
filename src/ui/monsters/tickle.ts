import type { StudioEvent } from '../../studio/visualBus';
import { MAX_NOTE_SPRITES } from './react';

// ─────────────────────────────────────────────────────────────────────────────
// Tickle time, as the child sees it (the studio decides when: src/studio/tickle.ts).
//   giggly → ^ ^ eyes, rosy cheeks, a wide grin (CSS on .pod[data-tickle]) and a jiggle
//   more   → a little jiggle and a bubble for every extra poke
//   laugh  → a belly-laugh shake; level 2 hops first ("wheee"), squash and stretch
//   calm   → the face goes back with a happy blink
// Imperative (data attributes + Web Animations), never React state. Reduced
// motion: no jiggle, shake or hop, just the face, a soft glow and the sound.
// Lite visuals (a slow tablet): no bubbles and nothing animated inside the
// drawing; the face swap and whole-monster moves stay.
// ─────────────────────────────────────────────────────────────────────────────

export type TickleEvent = Extract<StudioEvent, { type: 'tickle' }>;

export interface TickleLook {
  reduced: boolean;
  lite: boolean;
}

function anim(el: Element | null | undefined, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation | null {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return null;
  return (el as HTMLElement).animate(frames, opts);
}

/** The squish box: an HTML box, so rotating it is composited (no SVG repaint). */
const squishOf = (root: HTMLElement) => root.querySelector<HTMLElement>('.squish');

/** A wiggle from the feet: `rotate` on the squish box (pinch and drag use `transform`, the beat bob `translate`). */
function jiggle(root: HTMLElement, amount: number) {
  const a = 5 * amount;
  anim(squishOf(root), [{ rotate: '0deg' }, { rotate: `${-a}deg` }, { rotate: `${a}deg` }, { rotate: `${-a * 0.5}deg` }, { rotate: '0deg' }], {
    duration: 300,
    easing: 'ease-out',
    id: 'tickle-jiggle',
  });
}

/** A belly laugh: little shakes for as long as the laugh lasts. */
function shake(root: HTMLElement, ms: number, delay = 0) {
  const n = Math.max(3, Math.round(ms / 140));
  const frames: Keyframe[] = [{ rotate: '0deg', scale: '1 1' }];
  for (let i = 0; i < n; i++) frames.push({ rotate: `${i % 2 ? 3 : -3}deg`, scale: i % 2 ? '1.02 0.98' : '0.99 1.01' });
  frames.push({ rotate: '0deg', scale: '1 1' });
  anim(squishOf(root), frames, { duration: Math.max(300, ms), delay, easing: 'ease-in-out', id: 'tickle-shake' });
}

/**
 * "Wheee!": a squash, a hop up, a squashy landing and a little bounce. Never a
 * spin: the drawing's box is the whole pod, so spinning it would swing the
 * monster through the floor. Lower on short stages, so ears stay on the stage.
 */
function hop(root: HTMLElement) {
  const h = window.innerHeight < 560 ? 6 : 11;
  anim(
    root.querySelector('.squish > .monster-svg'),
    [
      { translate: '0 0', scale: '1 1' },
      { translate: '0 0', scale: '1.1 0.86', offset: 0.12 },
      { translate: `0 -${h}%`, scale: '0.94 1.08', offset: 0.42 },
      { translate: '0 0', scale: '1.1 0.88', offset: 0.68 },
      { translate: `0 -${h * 0.3}%`, scale: '0.98 1.03', offset: 0.84 },
      { translate: '0 0', scale: '1 1' },
    ],
    { duration: 700, easing: 'ease-out', id: 'tickle-hop' },
  );
}

/** A soft light in the monster's colour (reduced motion: opacity only). */
function glow(root: HTMLElement) {
  const host = root.querySelector<HTMLElement>('.pod-hit') ?? root;
  const g = document.createElement('i');
  g.className = 'cheer-glow';
  g.setAttribute('aria-hidden', 'true');
  g.style.setProperty('--glow', getComputedStyle(root).getPropertyValue('--c').trim() || '#ffd84d');
  host.prepend(g);
  const a = anim(g, [{ opacity: 0 }, { opacity: 0.85, offset: 0.35 }, { opacity: 0 }], { duration: 700, easing: 'ease-out', id: 'tickle-glow' });
  if (a) a.onfinish = a.oncancel = () => g.remove();
  else g.remove();
}

const BUBBLE_SVG =
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="currentColor" fill-opacity=".28" stroke="currentColor" stroke-width="2"/><path d="M7.5 9.5a5 5 0 0 1 4-3.6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';
let bubbleTemplate: HTMLElement | null = null;

/** A bubble rises from the giggling monster and pops (shares the note sprites' cap). */
function bubble(root: HTMLElement) {
  const wrap = root.querySelector<HTMLElement>('.monster-wrap');
  if (!wrap || typeof wrap.animate !== 'function') return;
  if (wrap.querySelectorAll(':scope > .note-sprite').length >= MAX_NOTE_SPRITES) return;
  if (!bubbleTemplate) {
    bubbleTemplate = document.createElement('span');
    bubbleTemplate.className = 'note-sprite tickle-bubble';
    bubbleTemplate.setAttribute('aria-hidden', 'true');
    bubbleTemplate.innerHTML = BUBBLE_SVG;
  }
  const b = bubbleTemplate.cloneNode(true) as HTMLElement;
  const side = Math.random() < 0.5 ? -1 : 1;
  b.style.setProperty('--sx', `${(side * (14 + Math.random() * 16)).toFixed(1)}%`);
  wrap.appendChild(b);
  // Up from the cheeks, short of the stage's top on phones (the monster fills those stages).
  const rise = window.innerHeight < 560 ? 26 : 44;
  const dx = side * (4 + Math.random() * 8);
  const a = b.animate(
    [
      { transform: 'translate(0, 0) scale(.3)', opacity: 0 },
      { transform: `translate(${(dx * 0.4).toFixed(1)}cqmin, -${(rise * 0.3).toFixed(0)}cqmin) scale(.9)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${dx.toFixed(1)}cqmin, -${(rise * 0.85).toFixed(0)}cqmin) scale(1)`, opacity: 1, offset: 0.8 },
      { transform: `translate(${(dx * 1.1).toFixed(1)}cqmin, -${rise}cqmin) scale(1.5)`, opacity: 0 },
    ],
    { duration: 720, easing: 'ease-out', id: 'tickle-bubble' },
  );
  a.onfinish = a.oncancel = () => b.remove();
}

/** Stop the eye and mouth reactions of notes still playing, so the happy face shows at once. */
function settleFace(root: HTMLElement) {
  root.querySelectorAll('.squish .m-lid, .squish .m-mouth-open, .squish .m-mouth-closed').forEach((el) => {
    // Only the notes' own animations: the CSS blink is the stylesheet's to stop.
    for (const a of (el as HTMLElement).getAnimations?.() ?? []) if (!(a instanceof CSSAnimation) && !(a instanceof CSSTransition)) a.cancel();
  });
}

/** Eyes open again with a quick happy blink. */
function happyBlink(root: HTMLElement) {
  const lidRest = root.dataset.monster === 'grumble' ? 0.42 : 0;
  root.querySelectorAll('.squish .m-lid').forEach((lid) =>
    anim(lid, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)', offset: 0.3 }, { transform: 'scaleY(1)', offset: 0.55 }, { transform: `scaleY(${lidRest})` }], {
      duration: 460,
      easing: 'ease-out',
      id: 'tickle-blink',
    }),
  );
}

/** Show a tickle event on a monster's pod. */
export function showTickle(root: HTMLElement, e: TickleEvent, look: TickleLook) {
  switch (e.phase) {
    case 'giggly':
      root.dataset.tickle = String(e.level);
      settleFace(root);
      if (look.reduced) glow(root);
      else jiggle(root, 1);
      break;
    case 'more':
      if (look.reduced) break;
      jiggle(root, 0.6);
      if (!look.lite) bubble(root);
      break;
    case 'laugh': {
      root.dataset.tickle = String(e.level);
      const ms = e.ms ?? 800;
      if (look.reduced) {
        glow(root);
        break;
      }
      const big = e.level >= 2 && !!e.sound;
      if (big) hop(root);
      shake(root, big ? ms - 420 : ms, big ? 420 : 0);
      break;
    }
    case 'calm':
      if (root.dataset.tickle === undefined) break;
      delete root.dataset.tickle;
      if (!look.lite && !look.reduced) happyBlink(root);
      break;
  }
}
