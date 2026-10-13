import { glow } from '../common/glow';
import { isReducedMotion } from '../hooks/useCaps';

// Learn answers every touch. The studio sings; this is the motion:
//   the teacher → squishes and giggles (a squash, a wiggle, happy ^ ^ eyes)
//   a lyric word → hops, and its note tag lights up in its own colour
// Imperative Web Animations on individual transform properties (never React
// state), so they compose with the teacher's own singing and the word's CSS.
// Reduced motion: a soft glow instead of any movement (the happy eyes only fade).

const SVG = 'http://www.w3.org/2000/svg';
const GIGGLE_MS = 440;

/**
 * Happy ^ ^ eyes for a moment: a lid-coloured cover with a smiling arc over
 * each eye, drawn on top so the singing face underneath (eyes wide on every
 * note) never shows through. Never closed ‿ eyes: those mean "asleep".
 */
function happyEyes(svg: SVGSVGElement, reduced: boolean) {
  svg.querySelectorAll<SVGGElement>('.m-eye').forEach((eye) => {
    // A new tap starts afresh: never a pile of faces.
    eye.querySelectorAll<SVGGElement>(':scope > .m-giggle-eye').forEach((old) => {
      old.getAnimations().forEach((a) => a.cancel());
      old.remove();
    });
    const ball = eye.querySelector<SVGCircleElement>(':scope > circle');
    const lid = eye.querySelector<SVGElement>('.m-lid');
    if (!ball || !lid) return;
    const cx = Number(ball.getAttribute('cx'));
    const cy = Number(ball.getAttribute('cy'));
    const r = Number(ball.getAttribute('r'));
    const g = document.createElementNS(SVG, 'g');
    g.setAttribute('class', 'm-giggle-eye');
    const cover = document.createElementNS(SVG, 'circle');
    cover.setAttribute('cx', String(cx));
    cover.setAttribute('cy', String(cy));
    cover.setAttribute('r', String(r + 0.6));
    cover.setAttribute('fill', lid.getAttribute('fill') ?? '#fff');
    const arc = document.createElementNS(SVG, 'path');
    arc.setAttribute('d', `M${cx - r * 0.6},${cy + r * 0.26} Q${cx},${cy - r * 0.66} ${cx + r * 0.6},${cy + r * 0.26}`);
    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke', '#1a1440');
    arc.setAttribute('stroke-width', String(Math.max(3.2, r * 0.22)));
    arc.setAttribute('stroke-linecap', 'round');
    g.append(cover, arc);
    eye.append(g);
    const a = g.animate([{ opacity: 0 }, { opacity: 1, offset: reduced ? 0.2 : 0.1 }, { opacity: 1, offset: 0.72 }, { opacity: 0 }], {
      duration: GIGGLE_MS,
      easing: 'ease-out',
      id: 'teacher-giggle',
    });
    a.onfinish = a.oncancel = () => g.remove();
  });
}

export function teacherGiggle(el: HTMLElement | null) {
  if (!el) return;
  const svg = el.querySelector<SVGSVGElement>('.monster-svg');
  if (!svg || typeof svg.animate !== 'function') {
    glow(el, 520, 'tapped');
    return;
  }
  if (isReducedMotion()) {
    glow(el, 520, 'tapped');
    happyEyes(svg, true);
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
  happyEyes(svg, false);
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
