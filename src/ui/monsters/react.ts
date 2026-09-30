import type { MonsterKind } from '../../model/types';
import type { NoteVisual } from '../../studio/visualBus';

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

export function reactToNote(root: HTMLElement, v: NoteVisual, o: ReactOptions) {
  const svg = root.querySelector('.monster-svg');
  if (!svg) return;
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
