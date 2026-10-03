import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { DRUM_PADS, MONSTERS, surfaceSize } from '../../model/monsters';
import type { Track } from '../../model/types';
import { getState, useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { onFrame, onNote } from '../../studio/visualBus';
import { glow } from '../common/glow';
import { isReducedMotion } from '../hooks/useCaps';
import { useKeyNames } from '../hooks/useKeyNames';
import { DRUM_COLORS, DrumIcon, KeyGlyph, KeyName } from './glyphs';
import { getSize } from './expression';
import { SurfaceSide } from './SurfaceSide';
import { VoiceButton } from './VoiceButton';

// The eight big keys (or drum pads) for the monster in the spotlight.
// One container handles every finger, so kids can play chords with several
// fingers and slide across keys for a glissando.

/** Sparks per touch, and how many touch bursts one key may show at once (fast rolls stay light). */
const SPARKS = 5;
const MAX_BURSTS = 3;
const BURST_MS = 450;

/**
 * A ring and a few colour sparks right where the finger landed. Purely decorative.
 * The burst is clipped to its key, so a press never seems to light the neighbour.
 */
function burst(el: HTMLElement, x: number, y: number) {
  if (isReducedMotion() || el.querySelectorAll(':scope > .key-burst').length >= MAX_BURSTS) return;
  const r = el.getBoundingClientRect();
  const b = document.createElement('span');
  b.className = 'key-burst';
  const at = document.createElement('span');
  at.className = 'key-burst-at';
  at.style.left = `${Math.min(r.width, Math.max(0, x - r.left))}px`;
  at.style.top = `${Math.min(r.height, Math.max(0, y - r.top))}px`;
  const ripple = document.createElement('span');
  ripple.className = 'key-ripple';
  at.appendChild(ripple);
  const turn = Math.random() * 72;
  for (let i = 0; i < SPARKS; i++) {
    const spark = document.createElement('i');
    spark.className = 'key-spark';
    spark.style.setProperty('--a', `${turn + i * (360 / SPARKS)}deg`);
    at.appendChild(spark);
  }
  b.appendChild(at);
  el.appendChild(b);
  setTimeout(() => b.remove(), BURST_MS);
}

/**
 * The beat you can see: the key panel breathes with every beat the band plays,
 * a little more on each bar's first beat. A soft light and a tiny lift
 * (compositor-only properties); none with reduced motion.
 */
function pulse(surface: HTMLElement, beat: number) {
  const light = surface.querySelector<HTMLElement>('.beat-light');
  if (!light || typeof light.animate !== 'function') return;
  const bar = beat % getState().project.beatsPerBar === 0;
  light.animate([{ opacity: 0 }, { opacity: bar ? 1 : 0.55 }, { opacity: 0 }], { duration: bar ? 260 : 180, easing: 'ease-out' });
  if (bar) surface.querySelector('.keys')?.animate([{ translate: '0 0' }, { translate: '0 -2px' }, { translate: '0 0' }], { duration: 200, easing: 'ease-out' });
}

interface Finger {
  key: number;
  liveId: number;
}

export function PlaySurface({ track }: { track: Track }) {
  const mode = useApp((s) => s.settings.ageMode);
  const count = surfaceSize(track.monster, mode);
  const info = MONSTERS[track.monster];
  const drums = track.monster === 'boom';
  const { names, style } = useKeyNames(count);
  // A recording plays at the child's own pitch, so no letter could be honest there.
  const recorded = track.monster === 'mimic' && track.sampleId !== null;
  const showNames = !drums && !recorded && style !== 'off';
  // Drums have no pitch: Monster Makers get drum words (kick, snare…) instead.
  const drumWords = drums && mode === 'maker' && style !== 'off';
  const labels = useMemo(() => {
    const seen = new Set<string>();
    return names.map((n) => {
      const label = `${info.name}: ${n.spoken}${seen.has(n.spoken) ? ' (higher)' : ''}`;
      seen.add(n.spoken);
      return label;
    });
  }, [names, info.name]);
  const keysRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const keyEls = useRef<(HTMLDivElement | null)[]>([]);
  const fingers = useRef(new Map<number, Finger>());
  const rect = useRef<DOMRect | null>(null);
  const downCount = useRef<number[]>([]);

  const setDown = (k: number, delta: number, e?: ReactPointerEvent) => {
    const counts = downCount.current;
    counts[k] = Math.max(0, (counts[k] ?? 0) + delta);
    const el = keyEls.current[k];
    if (el) el.dataset.down = counts[k] > 0 ? 'true' : 'false';
    if (delta > 0 && el && e) burst(el, e.clientX, e.clientY);
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
    // The touch's own timestamp: recording measures from when the finger landed.
    const liveId = studio.press(track.id, k, { vel: velocity(e), size: getSize(track.id) }, { at: e.timeStamp });
    fingers.current.set(e.pointerId, { key: k, liveId });
    setDown(k, 1, e);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const f = fingers.current.get(e.pointerId);
    if (!f) return;
    const k = keyAt(e.clientX);
    if (k === f.key) return;
    // Glissando: every key the finger slides onto plays.
    studio.release(f.liveId, e.timeStamp);
    setDown(f.key, -1);
    const liveId = studio.press(track.id, k, { vel: velocity(e) * 0.92, size: getSize(track.id) }, { at: e.timeStamp });
    fingers.current.set(e.pointerId, { key: k, liveId });
    setDown(k, 1, e);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const f = fingers.current.get(e.pointerId);
    if (!f) return;
    fingers.current.delete(e.pointerId);
    studio.release(f.liveId, e.timeStamp);
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
        if (el) glow(el, Math.min(400, Math.max(120, v.dur * 1000)));
      }),
    [track.id],
  );

  useEffect(() => {
    let last = -1;
    return onFrame((p) => {
      const beat = p.playing && p.beat >= 0 ? Math.floor(p.beat) : -1;
      if (beat === last) return;
      last = beat;
      if (beat >= 0 && surfaceRef.current && !isReducedMotion()) pulse(surfaceRef.current, beat);
    });
  }, []);

  return (
    <div ref={surfaceRef} className="surface" data-monster={track.monster} data-view="keys">
      <span className="beat-light" aria-hidden />
      <SurfaceSide track={track} face="keys" />
      {track.monster === 'mimic' && <VoiceButton track={track} />}
      <div
        ref={keysRef}
        className="keys"
        data-kind={drums ? 'drums' : 'keys'}
        data-names={showNames || drumWords}
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
            aria-label={drums ? DRUM_PADS[i].name : recorded ? `${info.name} note ${i + 1}` : labels[i]}
          >
            {drums ? <DrumIcon pad={i} /> : <KeyGlyph glyph={info.glyph} index={i} count={count} />}
            {showNames && <KeyName name={names[i]} style={style} />}
            {drumWords && (
              <span className="pad-name" aria-hidden>
                {DRUM_PADS[i].short}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
