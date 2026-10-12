import { glow } from '../common/glow';
import { isReducedMotion } from '../hooks/useCaps';

// Learn answers every touch. The studio sings; this is the motion:
//   the teacher → squishes and giggles (a squash, a wiggle, eyes squeezed shut)
//   a lyric word → hops, and its note tag lights up
// Imperative Web Animations on individual transform properties (never React
// state), so they compose with the teacher's own singing and the word's CSS.
// Reduced motion: a soft glow instead of any movement.

export function teacherGiggle(el: HTMLElement | null) {
  if (!el) return;
  const svg = el.querySelector<SVGSVGElement>('.monster-svg');
  if (isReducedMotion() || !svg || typeof svg.animate !== 'function') {
    glow(el, 520, 'tapped');
    return;
  }
  svg.getAnimations().forEach((a) => {
    if (a.id === 'teacher-squish') a.cancel();
  });
  svg.animate(
    [
      { scale: '1 1', rotate: '0deg' },
      { scale: '1.1 0.88', rotate: '0deg', offset: 0.16 },
      { scale: '0.95 1.07', rotate: '-5deg', offset: 0.38 },
      { scale: '1.02 0.98', rotate: '4deg', offset: 0.58 },
      { scale: '1 1', rotate: '-2deg', offset: 0.78 },
      { scale: '1 1', rotate: '0deg' },
    ],
    { duration: 560, easing: 'ease-out', id: 'teacher-squish' },
  );
  // A giggle: the eyes squeeze shut for a moment (happy, never "wrong").
  svg.querySelectorAll<SVGElement>('.m-lid').forEach((lid) =>
    lid.animate(
      [{ transform: 'scaleY(0)' }, { transform: 'scaleY(0.82)', offset: 0.2 }, { transform: 'scaleY(0.82)', offset: 0.65 }, { transform: 'scaleY(0)' }],
      { duration: 480, easing: 'ease-out', id: 'teacher-giggle' },
    ),
  );
}

export function wordHop(el: HTMLElement | null) {
  if (!el) return;
  glow(el, 420, 'tapped');
  if (isReducedMotion() || typeof el.animate !== 'function') return;
  el.getAnimations().forEach((a) => {
    if (a.id === 'word-hop') a.cancel();
  });
  el.animate(
    [{ translate: '0 0' }, { translate: '0 -0.35em', offset: 0.35 }, { translate: '0 0.04em', offset: 0.7 }, { translate: '0 0' }],
    { duration: 380, easing: 'ease-out', id: 'word-hop' },
  );
}
