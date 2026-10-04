import type { MonsterKind } from '../../model/types';
import type { NoteVisual } from '../../studio/visualBus';
// The drum pads' colours, so a drum's sprite matches the pad that played it.
import { DRUM_COLORS } from '../lab/glyphs';

// How each monster *shows* its sound. Driven imperatively with the Web
// Animations API so dozens of notes per second never trigger React renders.

export interface ReactOptions {
  monster: MonsterKind;
  echo: number;
  gloop: number;
  tempo: number;
  reduced: boolean;
}

const EASE = 'cubic-bezier(.34,1.56,.64,1)';

function anim(el: Element | null, frames: Keyframe[], opts: KeyframeAnimationOptions) {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return;
  (el as HTMLElement).animate(frames, opts);
}

// ── Frame budget ─────────────────────────────────────────────────────────────
// Animating parts inside the SVG (lids, antennae, mouths) repaints on the main
// thread. Fast devices don't notice; slow tablets drop frames. A tiny sampler
// watches frame times and switches to a lite mode (one compositor-friendly
// bounce of the whole monster per note, no note sprites) while frames are slow,
// and back again once they recover.

let slowness = 0; // smoothed share of frames over budget, 0..1
let lite = false;
let sampling = false;

function startSampler() {
  if (sampling || typeof requestAnimationFrame !== 'function') return;
  sampling = true;
  let last = performance.now();
  const tick = (now: number) => {
    const dt = now - last;
    last = now;
    // Ignore long gaps (tab hidden, debugger): they say nothing about load.
    if (dt < 250) {
      slowness = slowness * 0.85 + (dt > 24 ? 1 : 0) * 0.15;
      if (!lite && slowness > 0.35) lite = true;
      else if (lite && slowness < 0.05) lite = false;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** True while frames are slow: per-note visuals stay cheap. */
export function liteVisuals(): boolean {
  startSampler();
  return lite;
}

export function reactToNote(root: HTMLElement, v: NoteVisual, o: ReactOptions) {
  const svg = root.querySelector('.monster-svg');
  if (!svg) return;
  if (liteVisuals()) {
    // One transform on an HTML box: composited, no SVG repaint.
    const box = root.querySelector('.squish') ?? root.querySelector('.monster-wrap') ?? root;
    const s = (o.reduced ? 0.02 : 0.06) * (0.6 + v.vel * 0.4);
    anim(box, [{ scale: '1 1' }, { scale: `${1 + s} ${1 - s}` }, { scale: '1 1' }], { duration: 180, easing: 'ease-out' });
    return;
  }
  const a = o.reduced ? 0.25 : 1;
  const body = svg.querySelector('.m-body');
  const t = Math.min(1, Math.max(0, v.step / 7));
  const loud = 0.6 + v.vel * 0.4;

  switch (o.monster) {
    case 'boom': {
      const s = 0.18 * a * loud;
      anim(body, [
        { transform: 'scale(1,1)' },
        { transform: `scale(${1 + s * 0.9},${1 - s})`, offset: 0.25 },
        { transform: `scale(${1 - s * 0.3},${1 + s * 0.35})`, offset: 0.6 },
        { transform: 'scale(1,1)' },
      ], { duration: 240, easing: 'ease-out' });
      const foot = svg.querySelectorAll(v.step % 2 === 0 ? '.m-foot-l' : '.m-foot-r');
      foot.forEach((f) => anim(f, [{ transform: 'translateY(0)' }, { transform: `translateY(${-8 * a}px)` }, { transform: 'translateY(0)' }], { duration: 200 }));
      break;
    }
    case 'grumble': {
      const r = 4 * a;
      anim(body, [
        { transform: 'rotate(0) scale(1,1)' },
        { transform: `rotate(${-r}deg) scale(1.05,0.95)`, offset: 0.2 },
        { transform: `rotate(${r * 0.8}deg) scale(0.98,1.02)`, offset: 0.45 },
        { transform: `rotate(${-r * 0.4}deg)`, offset: 0.7 },
        { transform: 'rotate(0) scale(1,1)' },
      ], { duration: 560, easing: 'ease-out' });
      break;
    }
    case 'bloop': {
      // High notes stretch Bloop upwards, low notes squash it down.
      const sy = 1 + (t - 0.35) * 0.32 * a;
      anim(body, [
        { transform: 'scale(1,1)' },
        { transform: `scale(${1 / Math.sqrt(sy)},${sy})`, offset: 0.3 },
        { transform: 'scale(1,1)' },
      ], { duration: 320, easing: EASE });
      break;
    }
    case 'spark': {
      const r = 12 * a;
      anim(body, [
        { transform: 'rotate(0) scale(1)' },
        { transform: `rotate(${v.step % 2 ? r : -r}deg) scale(${1 + 0.1 * a})`, offset: 0.3 },
        { transform: 'rotate(0) scale(1)' },
      ], { duration: 260, easing: EASE });
      anim(svg.querySelector('.m-sparkles'), [
        { opacity: 0, transform: 'scale(.6) rotate(0)' },
        { opacity: 1, transform: `scale(1.1) rotate(${20 * a}deg)`, offset: 0.3 },
        { opacity: 0, transform: `scale(1.3) rotate(${35 * a}deg)` },
      ], { duration: 520, easing: 'ease-out' });
      break;
    }
    case 'puff': {
      anim(body, [
        { transform: 'scale(1) translateY(0)' },
        { transform: `scale(${1 + 0.08 * a}) translateY(${-6 * a}px)`, offset: 0.4 },
        { transform: 'scale(1) translateY(0)' },
      ], { duration: Math.max(600, v.dur * 1000), easing: 'ease-in-out' });
      break;
    }
    case 'mimic': {
      anim(body, [
        { transform: 'scale(1,1)' },
        { transform: `scale(${1 + 0.06 * a},${1 - 0.06 * a})`, offset: 0.3 },
        { transform: 'scale(1,1)' },
      ], { duration: 260, easing: EASE });
      break;
    }
  }

  // Mouth opens for as long as the note sounds (at least a moment).
  const mouthMs = Math.min(1600, Math.max(180, v.dur * 1000 + 80));
  const open = svg.querySelector('.m-mouth-open');
  const closed = svg.querySelector('.m-mouth-closed');
  anim(open, [
    { opacity: 0, transform: 'scaleY(.5)' },
    { opacity: 1, transform: `scaleY(${1 + t * 0.25})`, offset: 0.12 },
    { opacity: 1, transform: `scaleY(${1 + t * 0.25})`, offset: 0.85 },
    { opacity: 0, transform: 'scaleY(.6)' },
  ], { duration: mouthMs, easing: 'ease-out' });
  anim(closed, [{ opacity: 0 }, { opacity: 0, offset: 0.85 }, { opacity: 1 }], { duration: mouthMs });

  // Eyes widen with every note (lids lift), then settle back.
  const lidRest = o.monster === 'grumble' ? 0.42 : 0;
  svg.querySelectorAll('.m-lid').forEach((lid) =>
    anim(lid, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(0)', offset: 0.7 }, { transform: `scaleY(${lidRest})` }], { duration: 420 }),
  );

  if (!o.reduced) {
    svg.querySelectorAll('.m-antenna').forEach((ant, i) =>
      anim(ant, [
        { transform: 'rotate(0)' },
        { transform: `rotate(${i ? 14 : -14}deg)`, offset: 0.25 },
        { transform: `rotate(${i ? -6 : 6}deg)`, offset: 0.6 },
        { transform: 'rotate(0)' },
      ], { duration: 460, easing: 'ease-out' }),
    );
  }

  // Echo: ghost copies light up in time with the delay repeats.
  if (o.echo > 0) {
    const delay = 0.75 * (60 / o.tempo) * 1000;
    const peak = 0.25 + o.echo * 0.45;
    anim(svg.querySelector('.m-echo-1'), [{ opacity: 0 }, { opacity: peak }, { opacity: 0 }], { duration: 320, delay });
    anim(svg.querySelector('.m-echo-2'), [{ opacity: 0 }, { opacity: peak * 0.6 }, { opacity: 0 }], { duration: 320, delay: delay * 2 });
  }

  // Gloop: every note makes a ripple in the goo puddle.
  if (o.gloop > 0 && !o.reduced) {
    const host = root.querySelector('.pod-hit') ?? root;
    const ring = document.createElement('div');
    ring.className = 'goo-ring';
    host.appendChild(ring);
    setTimeout(() => ring.remove(), 1150);
  }
}

// ── Note sprites: little notes float up from the monster that is singing ─────

/** At most this many sprites per monster: fast drum rolls stay light. */
export const MAX_NOTE_SPRITES = 8;
const SPRITE_MS = 850;
/** Half a sprite (its size is clamp(20px, 5vmin, 30px) in lab.css). */
const HALF_SPRITE = 'clamp(10px, 2.5vmin, 15px)';

const SPRITE_SVG: Record<'note' | 'star' | 'burst', string> = {
  note: '<path d="M9 17.5V5.2l11-2.6v12.2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><ellipse cx="6.2" cy="17.8" rx="3.8" ry="3.1" fill="currentColor"/><ellipse cx="17.2" cy="15" rx="3.8" ry="3.1" fill="currentColor"/>',
  star: '<path d="m12 1.8 3.1 6.4 7 1-5.1 4.9 1.2 7L12 17.8l-6.2 3.3 1.2-7L1.9 9.2l7-1Z" fill="currentColor" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>',
  burst: '<path d="m12 1 2.2 6.2L20.5 4l-2.7 6.3L23 12l-5.2 1.7 2.7 6.3-6.3-3.2L12 23l-2.2-6.2L3.5 20l2.7-6.3L1 12l5.2-1.7L3.5 4l6.3 3.2Z" fill="currentColor" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>',
};

const templates = new Map<string, HTMLElement>();

function spriteNode(kind: keyof typeof SPRITE_SVG): HTMLElement {
  let t = templates.get(kind);
  if (!t) {
    t = document.createElement('span');
    t.className = 'note-sprite';
    t.setAttribute('aria-hidden', 'true');
    t.innerHTML = `<svg viewBox="0 0 24 24">${SPRITE_SVG[kind]}</svg>`;
    templates.set(kind, t);
  }
  return t.cloneNode(true) as HTMLElement;
}

/**
 * A note (a star for Spark, a burst for Boom) in the colour of the key that
 * played floats up from the monster's mouth to just above its head, stays
 * bright for most of the way, and fades. Purely decorative, so it is skipped
 * entirely when motion is reduced.
 *
 * Distances are in the wrap's container units (1cqmin = 1% of the drawing's
 * size), so a note never has to measure the page.
 */
export function spawnNoteSprite(root: HTMLElement, v: NoteVisual, reduced: boolean) {
  if (reduced || liteVisuals()) return;
  const wrap = root.querySelector<HTMLElement>('.monster-wrap');
  if (!wrap || typeof wrap.animate !== 'function') return;
  if (wrap.querySelectorAll(':scope > .note-sprite').length >= MAX_NOTE_SPRITES) return;
  const drums = v.monster === 'boom';
  const step = Math.max(0, Math.min(7, Math.round(v.step)));
  const sprite = spriteNode(drums ? 'burst' : v.monster === 'spark' ? 'star' : 'note');
  sprite.style.color = `var(--key-${drums ? DRUM_COLORS[step] : step})`;
  sprite.style.setProperty('--sx', `${(Math.random() * 20 - 10).toFixed(1)}%`);
  wrap.appendChild(sprite);
  // From the mouth (68% down the drawing) to just clear of the head. Short
  // stages (phones held sideways) have no sky above the spotlight monster, so
  // there the note stops at the stage's top edge, drifting off to the side.
  const short = window.innerHeight < 560;
  const clear = `calc(90cqmin + ${HALF_SPRITE})`;
  const rise = short ? `min(${clear}, calc(100cqh - 32cqmin - ${HALF_SPRITE}))` : clear;
  const up = (k: number) => `calc(${rise} * ${-k})`;
  const side = Math.random() < 0.5 ? -1 : 1;
  const dx = side * ((short ? 24 : 12) + Math.random() * 12); // cqmin: off the central eye (and the head, on phones)
  const tilt = side * (8 + Math.random() * 10);
  const a = sprite.animate(
    [
      { transform: 'translate(0, 0) scale(.4)', opacity: 0, easing: 'cubic-bezier(.22,1,.36,1)' },
      { transform: `translate(${(dx * 0.4).toFixed(1)}cqmin, ${up(0.2)}) scale(1.1)`, opacity: 1, offset: 0.15, easing: 'ease-out' },
      { transform: `translate(${dx.toFixed(1)}cqmin, ${up(0.8)}) scale(1) rotate(${tilt.toFixed(0)}deg)`, opacity: 1, offset: 0.7, easing: 'ease-in' },
      { transform: `translate(${(dx * 1.2).toFixed(1)}cqmin, ${up(1)}) scale(.8) rotate(${(tilt * 1.5).toFixed(0)}deg)`, opacity: 0 },
    ],
    { duration: SPRITE_MS, easing: 'linear' },
  );
  a.onfinish = a.oncancel = () => sprite.remove();
}
