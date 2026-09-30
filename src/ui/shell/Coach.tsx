import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../store/store';
import { onNote, onStudioEvent } from '../../studio/visualBus';
import { Icon } from '../icons/Icon';

// ─────────────────────────────────────────────────────────────────────────────
// Wordless coach. A pointing hand appears only when a child seems stuck:
//   nobody has played yet      → points at a key
//   lots of playing, no record → points at Record
//   first loop made            → points at another monster (add a layer)
//   a few loops made           → points at Monster Blocks (make a song)
// Hints never block anything and can be switched off in Parent Space.
// ─────────────────────────────────────────────────────────────────────────────

interface Target {
  selector: string;
  until: number;
}

export function Coach() {
  const enabled = useApp((s) => s.settings.hints);
  const awake = useApp((s) => s.awake);
  const overlay = useApp((s) => s.overlay);
  const [target, setTarget] = useState<Target | null>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const done = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || !awake) return;
    let live = 0;
    let recorded = false;
    let loops = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const show = (id: string, selector: string, ms: number) => {
      if (done.current.has(id)) return;
      done.current.add(id);
      setTarget({ selector, until: performance.now() + ms });
    };
    const hide = () => setTarget(null);

    timers.push(
      setTimeout(() => {
        if (live === 0) show('tap-key', '.keys .key:nth-child(3)', 7000);
      }, 3000),
    );
    const offNote = onNote((v) => {
      if (v.source !== 'live') return;
      live++;
      if (live === 1) hide();
      if (live === 16 && !recorded) show('try-record', '.t-rec', 5000);
    });
    const offEvent = onStudioEvent((e) => {
      if (e.type === 'record-start') {
        recorded = true;
        hide();
      }
      if (e.type === 'record-stop' && e.notes > 0) {
        loops++;
        if (loops === 1) timers.push(setTimeout(() => show('add-layer', '.pod:not([data-selected="true"]) .pod-hit', 5000), 1200));
        if (loops === 3) timers.push(setTimeout(() => show('make-song', '.dock-btn[data-screen="blocks"]', 5000), 1200));
      }
    });
    return () => {
      offNote();
      offEvent();
      timers.forEach(clearTimeout);
    };
  }, [enabled, awake]);

  // Follow the target element while the hint is visible.
  useEffect(() => {
    if (!target) return;
    let raf = 0;
    const place = () => {
      raf = requestAnimationFrame(place);
      if (performance.now() > target.until) {
        setTarget(null);
        return;
      }
      const el = document.querySelector(target.selector);
      if (!el) {
        setTarget(null);
        return;
      }
      const hand = handRef.current;
      const glow = glowRef.current;
      if (!hand || !glow) return;
      const r = el.getBoundingClientRect();
      const size = Math.min(r.width, r.height, 140);
      hand.style.left = `${r.left + r.width / 2}px`;
      hand.style.top = `${r.top + r.height / 2}px`;
      glow.style.left = `${r.left + r.width / 2 - size / 2}px`;
      glow.style.top = `${r.top + r.height / 2 - size / 2}px`;
      glow.style.width = glow.style.height = `${size}px`;
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [target]);

  if (!target || overlay) return null;
  return (
    <>
      <div ref={glowRef} className="coach-glow" aria-hidden />
      <div ref={handRef} className="coach-hand" aria-hidden>
        <Icon name="hand" />
      </div>
    </>
  );
}
