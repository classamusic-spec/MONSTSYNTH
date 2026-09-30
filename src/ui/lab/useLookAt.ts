import { useEffect, type RefObject } from 'react';

// Monsters watch your finger. Pupils drift towards the last touch anywhere on
// screen, then wander back to looking at you when nobody touches for a while.

export function useLookAt(stageRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let x = 0;
    let y = 0;
    let pending = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const apply = (reset: boolean) => {
      pending = false;
      const stage = stageRef.current;
      if (!stage) return;
      stage.querySelectorAll<SVGSVGElement>('.monster-svg').forEach((svg) => {
        if (reset) {
          svg.style.setProperty('--look-x', '0');
          svg.style.setProperty('--look-y', '0');
          return;
        }
        const r = svg.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height * 0.5;
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 160) * 6;
        svg.style.setProperty('--look-x', ((dx / d) * k).toFixed(2));
        svg.style.setProperty('--look-y', ((dy / d) * k * 0.8).toFixed(2));
      });
    };

    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!pending) {
        pending = true;
        requestAnimationFrame(() => apply(false));
      }
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => apply(true), 2500);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [stageRef]);
}
