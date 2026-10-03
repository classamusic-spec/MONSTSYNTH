import { useEffect } from 'react';
import { trackHasLoop } from '../../model/project';
import { clearNewBlocks, markNewBlock } from '../../store/actions';
import { getState, useApp } from '../../store/store';
import { onStudioEvent } from '../../studio/visualBus';
import { isReducedMotion } from '../hooks/useCaps';

// ─────────────────────────────────────────────────────────────────────────────
// The band cheers the big moments, with no words needed:
//   a monster's first loop → a dot on the Blocks button says "your loop is in
//                            the song now" (until Blocks is visited); when the
//                            take ends, the monster jumps and sparkles and its
//                            loop badge pops (never mid-take: the child is still
//                            playing, and timing comes first)
//   waking up              → every monster bounces as it sings hello
// Reduced motion: a soft glow instead of any movement.
// Everything is imperative (Web Animations on transform and opacity only, so
// the compositor does the work), never React state.
// ─────────────────────────────────────────────────────────────────────────────

const SPARKS = 7;

function animate(el: Element | null, frames: Keyframe[], opts: KeyframeAnimationOptions) {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return null;
  return (el as HTMLElement).animate(frames, opts);
}

/** The monster's own colour, for its glow and sparkles. */
function colourOf(pod: HTMLElement): string {
  return getComputedStyle(pod).getPropertyValue('--c').trim() || '#ffd84d';
}

/** A soft light in the monster's colour swells behind it and fades (opacity only). */
function glowMonster(pod: HTMLElement, delay = 0) {
  const host = pod.querySelector<HTMLElement>('.pod-hit') ?? pod;
  const g = document.createElement('i');
  g.className = 'cheer-glow';
  g.setAttribute('aria-hidden', 'true');
  g.style.setProperty('--glow', colourOf(pod));
  host.prepend(g);
  const anim = animate(g, [{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 900, delay, easing: 'ease-out', id: 'cheer-glow' });
  if (anim) anim.onfinish = anim.oncancel = () => g.remove();
  else g.remove();
}

function sparkle(pod: HTMLElement) {
  const host = pod.querySelector<HTMLElement>('.pod-hit') ?? pod;
  const c = colourOf(pod);
  for (let i = 0; i < SPARKS; i++) {
    const s = document.createElement('i');
    s.className = 'cheer-spark';
    s.setAttribute('aria-hidden', 'true');
    s.style.background = i % 2 ? '#fff6c7' : c;
    host.appendChild(s);
    const a = ((i / SPARKS) * 2 - 1) * 1.1 - Math.PI / 2;
    const r = 60 + (i % 3) * 18;
    const anim = animate(
      s,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: `translate(calc(-50% + ${(Math.cos(a) * r * 0.5).toFixed(0)}px), calc(-50% + ${(Math.sin(a) * r * 0.5).toFixed(0)}px)) scale(1.1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(calc(-50% + ${(Math.cos(a) * r).toFixed(0)}px), calc(-50% + ${(Math.sin(a) * r).toFixed(0)}px)) scale(0.6) rotate(90deg)`, opacity: 0 },
      ],
      { duration: 800, delay: i * 25, easing: 'cubic-bezier(.22,1,.36,1)', id: 'cheer-spark' },
    );
    if (anim) anim.onfinish = anim.oncancel = () => s.remove();
    else s.remove();
  }
}

/** A happy jump: up, a little squash on landing. */
function jump(pod: HTMLElement, delay: number, height: string, id: string) {
  animate(
    pod.querySelector('.squish > .monster-svg'),
    [
      { translate: '0 0', scale: '1 1' },
      { translate: '0 0', scale: '1.06 0.92', offset: 0.15 },
      { translate: `0 -${height}`, scale: '0.96 1.06', offset: 0.45 },
      { translate: '0 0', scale: '1.08 0.9', offset: 0.75 },
      { translate: '0 0', scale: '1 1' },
    ],
    { duration: 620, delay, easing: 'ease-out', id },
  );
}

function cheerLoop(trackId: string) {
  // A loop made on the grid gets its badge with this very edit: look once React has drawn it.
  requestAnimationFrame(() => {
    const track = getState().project.tracks.find((t) => t.id === trackId);
    const pod = document.querySelector<HTMLElement>(`.pod[data-track="${CSS.escape(trackId)}"]`);
    // Gone already (an Undo, another screen): nothing to cheer.
    if (!pod || !track || !trackHasLoop(track)) return;
    const badge = pod.querySelector('.loop-badge');
    glowMonster(pod);
    if (isReducedMotion()) {
      animate(badge, [{ boxShadow: '0 0 0 0 rgba(255,255,255,0.9)' }, { boxShadow: '0 0 0 12px rgba(255,255,255,0)' }], { duration: 700, easing: 'ease-out', id: 'cheer-glow' });
      return;
    }
    jump(pod, 0, '14%', 'cheer-jump');
    sparkle(pod);
    animate(badge, [{ scale: '0.2' }, { scale: '1.3', offset: 0.6 }, { scale: '1' }], { duration: 480, easing: 'cubic-bezier(.34,1.56,.64,1)', id: 'cheer-pop' });
  });
}

/** Waking up: each monster bounces as it sings its hello note (the studio's hello is 120 ms apart). */
function bounceHello() {
  const reduced = isReducedMotion();
  document.querySelectorAll<HTMLElement>('.stage .pod').forEach((pod, i) => {
    const delay = 50 + i * 120;
    if (reduced) glowMonster(pod, delay);
    else jump(pod, delay, '8%', 'hello-bounce');
  });
}

export function Cheer() {
  useEffect(() => {
    // First loops made during a take, cheered when the take ends.
    const waiting = new Set<string>();
    const offEvent = onStudioEvent((e) => {
      if (e.type === 'loop-created') {
        markNewBlock(e.trackId);
        const t = getState().transport;
        if (t.recording || t.armed) waiting.add(e.trackId);
        else cheerLoop(e.trackId);
      }
      if (e.type === 'record-stop') {
        waiting.forEach(cheerLoop);
        waiting.clear();
      }
      if (e.type === 'wake') bounceHello();
    });
    // Visiting Monster Blocks (any way: the dock, "make it a song", a kept lesson) clears the dot.
    const clear = (s: ReturnType<typeof getState>) => s.screen === 'blocks' && s.newBlocks.length > 0 && clearNewBlocks();
    clear(getState());
    const offStore = useApp.subscribe(clear);
    return () => {
      offEvent();
      offStore();
    };
  }, []);
  return null;
}
