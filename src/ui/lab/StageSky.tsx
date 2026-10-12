import { memo, useEffect, useRef, type RefObject } from 'react';
import { skyReady, skyStep } from '../../magic/sky';
import { studio } from '../../studio/studio';
import { isReducedMotion } from '../hooks/useCaps';
import { liteVisuals } from '../monsters/react';
import { twinkle } from '../monsters/shapes';

// ─────────────────────────────────────────────────────────────────────────────
// THE MUSICAL SKY. The Lab's night sky rings: a touch on the bare stage plays
// one of Spark's Star Bells in the song's key (higher on screen, and further
// right, is higher: src/magic/sky.ts), with a sparkle at the finger, and the
// nearest star flares. A sweep plays a twinkly run, one bell per change of note
// (each finger its own, so a two-hand slap rings both). The moon rings a soft
// low bell, glows and winks (mashed, it winks every time and rings now and then).
//
// The layer sits after the scenery and before the pods, so pods, loop badges,
// the + seat and the toys keep every tap: it only hears touches on the bare
// stage. The moon is the one exception: it answers wherever its disc shows
// (z-index above the pods' empty sky, below any monster drawn over it).
// Sky bells are never recorded, never edits (no undo step) and never saved;
// while a take records they are hushed and only sparkle.
// Animated only on touch (nothing runs while nobody touches). Reduced motion:
// a soft glow instead of sparkles and flares. Decorative: aria-hidden.
// ─────────────────────────────────────────────────────────────────────────────

/** Extra stars where the sky is open (tablets: the band above the monsters). [left %, top %, size] */
const SKY_STARS: [number, number, number][] = [
  [55, 5.5, 1],
  [64.5, 10.5, 0.8],
  [73, 4, 0.9],
];

/** Sparkles alive at once (a frantic sweep stays light). */
const MAX_SPARKS = 12;
/** A flare reaches a star this close to the finger (px). */
const STAR_REACH = 48;
/** A sweep leaves a sparkle at least this far apart (px), even between bells. */
const TRAIL_PX = 30;
/** Bells from all fingers together in one sweep gap (a two-hand slap rings both, a ten-finger scribble stays light). */
const MAX_BELLS_PER_GAP = 3;

const SPARK_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${twinkle(12, 12, 11)}" fill="currentColor"/></svg>`;
let sparkTemplate: HTMLElement | null = null;

function anim(el: Element | null | undefined, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation | null {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return null;
  return (el as HTMLElement).animate(frames, opts);
}

/** A sparkle (or, with reduced motion, a soft glow) at a point of the sky layer. */
function sparkle(sky: HTMLElement, x: number, y: number, step: number, reduced: boolean) {
  if (typeof sky.animate !== 'function') return;
  if (sky.querySelectorAll(':scope > .sky-spark').length >= MAX_SPARKS) return;
  let el: HTMLElement;
  if (reduced) {
    el = document.createElement('i');
    el.className = 'sky-spark sky-glow';
  } else {
    if (!sparkTemplate) {
      sparkTemplate = document.createElement('i');
      sparkTemplate.className = 'sky-spark';
      sparkTemplate.innerHTML = SPARK_SVG;
    }
    el = sparkTemplate.cloneNode(true) as HTMLElement;
    // Higher bells are smaller sparkles, like the keys' staircase.
    el.style.setProperty('--spark', String(1.25 - Math.min(9, Math.max(0, step)) * 0.05));
  }
  el.style.left = `${x.toFixed(1)}px`;
  el.style.top = `${y.toFixed(1)}px`;
  sky.appendChild(el);
  const a = reduced
    ? el.animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.3 }, { opacity: 0 }], { duration: 420, easing: 'ease-out', id: 'sky-glow' })
    : el.animate(
        [
          { transform: 'translate(-50%, -50%) scale(.2) rotate(0deg)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1.15) rotate(30deg)', opacity: 1, offset: 0.25 },
          { transform: 'translate(-50%, calc(-50% - 14px)) scale(.5) rotate(80deg)', opacity: 0 },
        ],
        { duration: 520, easing: 'cubic-bezier(.22,1,.36,1)', id: 'sky-spark' },
      );
  a.onfinish = a.oncancel = () => el.remove();
}

/** The star nearest the finger flares (if one is close enough). */
function flareStar(stage: HTMLElement, cx: number, cy: number) {
  let best: Element | null = null;
  let bestD = STAR_REACH;
  stage.querySelectorAll('.sky-star, .stage-scene .twinkle').forEach((s) => {
    const r = s.getBoundingClientRect();
    if (!r.width) return;
    const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  });
  anim(
    best,
    [
      { transform: 'scale(1) rotate(0deg)', opacity: 1 },
      { transform: 'scale(2.4) rotate(45deg)', opacity: 1, offset: 0.3 },
      { transform: 'scale(1) rotate(90deg)', opacity: 1 },
    ],
    { duration: 440, easing: 'ease-out', id: 'sky-flare' },
  );
}

/** The moon glows, gives a little boing and shows a face that winks. */
function moonWink(stage: HTMLElement, reduced: boolean) {
  const moon = stage.querySelector('.stage-moon');
  if (!moon) return;
  const face = moon.querySelector('.moon-face');
  for (const a of moon.getAnimations?.({ subtree: true }) ?? []) if (String(a.id).startsWith('moon-')) a.cancel();
  anim(moon.querySelector('.moon-glow'), [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.5)', opacity: 1, offset: 0.3 }, { transform: 'scale(1)', opacity: 1 }], {
    duration: 900,
    easing: 'ease-out',
    id: 'moon-glow',
  });
  anim(face, [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1700, easing: 'ease-out', id: 'moon-face' });
  if (reduced || liteVisuals()) return;
  anim(moon.querySelector('.moon-disc'), [{ transform: 'scale(1)' }, { transform: 'scale(1.14, 0.9)', offset: 0.2 }, { transform: 'scale(0.96, 1.05)', offset: 0.5 }, { transform: 'scale(1)' }], {
    duration: 520,
    easing: 'ease-out',
    id: 'moon-boing',
  });
  anim(moon.querySelector('.moon-eye-r'), [{ transform: 'scaleY(1)' }, { transform: 'scaleY(1)', offset: 0.3 }, { transform: 'scaleY(0.12)', offset: 0.42 }, { transform: 'scaleY(0.12)', offset: 0.6 }, { transform: 'scaleY(1)', offset: 0.72 }, { transform: 'scaleY(1)' }], {
    duration: 1500,
    easing: 'ease-in-out',
    id: 'moon-wink',
  });
}

interface Finger {
  step: number;
  x: number;
  y: number;
  /** When this finger last rang a bell (ms). */
  at: number;
}

export const StageSky = memo(function StageSky({ stageRef }: { stageRef: RefObject<HTMLDivElement | null> }) {
  const skyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const sky = skyRef.current;
    if (!stage || !sky) return;
    const fingers = new Map<number, Finger>();
    /** When the latest bells rang, from any finger (ms). */
    let rang: number[] = [];

    /** Ring the bell under (x, y) unless this finger rang a moment ago; sparkle either way. */
    const ring = (e: PointerEvent, finger: Finger | null): Finger => {
      const sr = stage.getBoundingClientRect();
      const lr = sky.getBoundingClientRect();
      const step = skyStep((e.clientX - sr.left) / sr.width, (e.clientY - sr.top) / sr.height);
      const x = e.clientX - lr.left;
      const y = e.clientY - lr.top;
      const now = performance.now();
      const reduced = isReducedMotion();
      const changed = !finger || step !== finger.step;
      rang = rang.filter((t) => !skyReady(t, now));
      if (changed && skyReady(finger?.at ?? -Infinity, now) && rang.length < MAX_BELLS_PER_GAP) {
        rang.push(now);
        studio.skyBell(step);
        sparkle(sky, x, y, step, reduced);
        if (!reduced && !liteVisuals()) flareStar(stage, e.clientX, e.clientY);
        return { step, x, y, at: now };
      }
      if (finger && Math.hypot(x - finger.x, y - finger.y) >= TRAIL_PX) {
        if (!reduced) sparkle(sky, x, y, finger.step, reduced);
        return { ...finger, x, y };
      }
      if (finger) return finger;
      // A finger that could not ring yet still sparkles where it landed.
      sparkle(sky, x, y, step, reduced);
      return { step: -1, x, y, at: -Infinity };
    };

    const down = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.('.moon-hit')) {
        e.preventDefault();
        studio.moonBell();
        moonWink(stage, isReducedMotion());
        return;
      }
      if (!target || !sky.contains(target)) return;
      e.preventDefault();
      sky.setPointerCapture?.(e.pointerId);
      fingers.set(e.pointerId, ring(e, null));
    };
    const move = (e: PointerEvent) => {
      const f = fingers.get(e.pointerId);
      if (f) fingers.set(e.pointerId, ring(e, f));
    };
    const up = (e: PointerEvent) => {
      fingers.delete(e.pointerId);
    };
    stage.addEventListener('pointerdown', down);
    sky.addEventListener('pointermove', move);
    sky.addEventListener('pointerup', up);
    sky.addEventListener('pointercancel', up);
    sky.addEventListener('lostpointercapture', up);
    return () => {
      stage.removeEventListener('pointerdown', down);
      sky.removeEventListener('pointermove', move);
      sky.removeEventListener('pointerup', up);
      sky.removeEventListener('pointercancel', up);
      sky.removeEventListener('lostpointercapture', up);
    };
  }, [stageRef]);

  return (
    <div className="stage-sky" ref={skyRef} aria-hidden>
      {SKY_STARS.map(([left, top, size], i) => (
        <i key={i} className="sky-star" style={{ left: `${left}%`, top: `${top}%`, ['--star' as string]: size }}>
          <svg viewBox="0 0 24 24">
            <path d={twinkle(12, 12, 11)} fill="currentColor" />
          </svg>
        </i>
      ))}
    </div>
  );
});
