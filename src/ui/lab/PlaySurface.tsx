import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { DRUM_PADS, MONSTERS, surfaceSize } from '../../model/monsters';
import type { Track } from '../../model/types';
import { useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { onNote } from '../../studio/visualBus';
import { DrumIcon, KeyGlyph } from './glyphs';
import { getSize } from './expression';
import { VoiceButton } from './VoiceButton';

// The eight big keys (or drum pads) for the monster in the spotlight.
// One container handles every finger, so kids can play chords with several
// fingers and slide across keys for a glissando.

/** Drum pad colours, chosen so neighbouring pads never look alike. */
const DRUM_COLORS = [0, 1, 2, 6, 4, 3, 5, 7];

interface Finger {
  key: number;
  liveId: number;
}

export function PlaySurface({ track }: { track: Track }) {
  const mode = useApp((s) => s.settings.ageMode);
  const count = surfaceSize(track.monster, mode);
  const info = MONSTERS[track.monster];
  const drums = track.monster === 'boom';
  const keysRef = useRef<HTMLDivElement>(null);
  const keyEls = useRef<(HTMLDivElement | null)[]>([]);
  const fingers = useRef(new Map<number, Finger>());
  const rect = useRef<DOMRect | null>(null);
  const downCount = useRef<number[]>([]);

  const setDown = (k: number, delta: number) => {
    const counts = downCount.current;
    counts[k] = Math.max(0, (counts[k] ?? 0) + delta);
    const el = keyEls.current[k];
    if (el) el.dataset.down = counts[k] > 0 ? 'true' : 'false';
    if (delta > 0 && el) {
      const ripple = document.createElement('span');
      ripple.className = 'key-ripple';
      el.appendChild(ripple);
      setTimeout(() => ripple.remove(), 450);
    }
  };

  const keyAt = (x: number): number => {
    const r = rect.current ?? keysRef.current?.getBoundingClientRect();
    if (!r) return 0;
    const k = Math.floor(((x - r.left) / r.width) * count);
    return Math.max(0, Math.min(count - 1, k));
  };

  const velocity = (e: ReactPointerEvent) => (e.pointerType === 'pen' && e.pressure > 0 ? 0.45 + e.pressure * 0.55 : 0.86);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    keysRef.current?.setPointerCapture?.(e.pointerId);
    rect.current = keysRef.current?.getBoundingClientRect() ?? null;
    const k = keyAt(e.clientX);
    const liveId = studio.press(track.id, k, { vel: velocity(e), size: getSize(track.id) });
    fingers.current.set(e.pointerId, { key: k, liveId });
    setDown(k, 1);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const f = fingers.current.get(e.pointerId);
    if (!f) return;
    const k = keyAt(e.clientX);
    if (k === f.key) return;
    // Glissando: every key the finger slides onto plays.
    studio.release(f.liveId);
    setDown(f.key, -1);
    const liveId = studio.press(track.id, k, { vel: velocity(e) * 0.92, size: getSize(track.id) });
    fingers.current.set(e.pointerId, { key: k, liveId });
    setDown(k, 1);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const f = fingers.current.get(e.pointerId);
    if (!f) return;
    fingers.current.delete(e.pointerId);
    studio.release(f.liveId);
    setDown(f.key, -1);
  };

  // Release everything if the monster on the keys changes mid-touch.
  useEffect(() => {
    const map = fingers.current;
    return () => {
      for (const f of map.values()) studio.release(f.liveId);
      map.clear();
      downCount.current = [];
    };
  }, [track.id]);

  // Keys light up when the loop plays them, so kids can see what they recorded.
  useEffect(
    () =>
      onNote((v) => {
        if (v.trackId !== track.id || v.source === 'live') return;
        const el = keyEls.current[v.step];
        if (!el) return;
        el.dataset.glow = 'true';
        setTimeout(() => {
          el.dataset.glow = 'false';
        }, Math.min(400, Math.max(120, v.dur * 1000)));
      }),
    [track.id],
  );

  return (
    <div className="surface" data-monster={track.monster}>
      {track.monster === 'mimic' && <VoiceButton track={track} />}
      <div
        ref={keysRef}
        className="keys"
        data-kind={drums ? 'drums' : 'keys'}
        role="group"
        aria-label={`${info.name}'s ${drums ? 'drums' : 'keys'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={`${track.id}-${i}`}
            ref={(el) => {
              keyEls.current[i] = el;
            }}
            className="key"
            data-down="false"
            style={{ ['--k' as string]: `var(--key-${drums ? DRUM_COLORS[i] : i})` }}
            role="button"
            aria-label={drums ? DRUM_PADS[i].name : `${info.name} note ${i + 1}`}
          >
            {drums ? <DrumIcon pad={i} /> : <KeyGlyph glyph={info.glyph} index={i} count={count} />}
          </div>
        ))}
      </div>
    </div>
  );
}
