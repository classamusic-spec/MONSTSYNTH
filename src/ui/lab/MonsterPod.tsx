import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { clearLoop, toggleSleep } from '../../model/edits';
import { fxStepIndex, MONSTERS, presetInfo } from '../../model/monsters';
import { trackHasLoop } from '../../model/project';
import type { FxKind, Track } from '../../model/types';
import { selectTrack } from '../../store/actions';
import { commit, useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { onNote } from '../../studio/visualBus';
import { FxBuddy } from '../monsters/FxBuddy';
import { MonsterArt } from '../monsters/MonsterArt';
import { liteVisuals, reactToNote, spawnNoteSprite } from '../monsters/react';
import { Icon } from '../icons/Icon';
import { isReducedMotion, useCaps } from '../hooks/useCaps';
import { getSize, onSize, setSize } from './expression';

// ─────────────────────────────────────────────────────────────────────────────
// SQUISH THE MONSTER — the signature interaction.
//   tap            → a note (touch higher on the monster = higher note)
//   drag ↕         → pitch slides through the scale (Monster Magic keeps it in key)
//   drag ↔         → Dark ↔ Sparkly (filter / vowel / bell brightness)
//   hold           → sustain (melodic) or a roll (Boom, Spark)
//   shake          → wobble (vibrato)
//   pinch in / out → squish (short & tight) / stretch (long & open)
// The monster's body follows the finger so sound and shape always agree.
// ─────────────────────────────────────────────────────────────────────────────

interface Gesture {
  pointerId: number;
  liveId: number;
  rollId: number | null;
  startX: number;
  startY: number;
  step0: number;
  rect: DOMRect;
  holdTimer: ReturnType<typeof setTimeout> | null;
  lastDir: number;
  lastX: number;
  reversals: number[];
  wiggling: boolean;
  moved: boolean;
}

interface Pinch {
  ids: [number, number];
  startDist: number;
  startSize: number;
}

const HOLD_MS = 320;

function drumPadFor(rel: number): number {
  if (rel < 0.36) return 0; // feet & belly: big drum
  if (rel < 0.68) return 1; // middle: snappy drum
  return 2; // head & horns: tiny cymbal
}

export const MonsterPod = memo(function MonsterPod({ track, selected }: { track: Track; selected: boolean }) {
  const caps = useCaps();
  const tempo = useApp((s) => s.project.tempo);
  const recording = useApp((s) => s.transport.recording || s.transport.armed);
  const rootRef = useRef<HTMLDivElement>(null);
  const hitRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<Pinch | null>(null);
  const [clearing, setClearing] = useState(false);
  const info = MONSTERS[track.monster];
  const preset = presetInfo(track.monster, track.preset);
  const hasLoop = trackHasLoop(track);
  const reactOpts = useRef({ monster: track.monster, echo: track.fx.echo, gloop: track.fx.gloop, tempo, reduced: false });
  reactOpts.current = { monster: track.monster, echo: track.fx.echo, gloop: track.fx.gloop, tempo, reduced: isReducedMotion() };

  // Start watching the frame budget as soon as a monster is on stage.
  useEffect(() => void liteVisuals(), []);

  // Sound → animation.
  useEffect(
    () =>
      onNote((v) => {
        if (v.trackId !== track.id || !rootRef.current) return;
        // Read at note time: switching motion in Parent Space does not re-render pods.
        reactOpts.current.reduced = isReducedMotion();
        reactToNote(rootRef.current, v, reactOpts.current);
        spawnNoteSprite(rootRef.current, v, reactOpts.current.reduced);
      }),
    [track.id],
  );

  // Pinch squish persists as the monster's shape.
  useEffect(() => {
    const apply = (id: string, size: number) => {
      if (id !== track.id || !squishRef.current) return;
      squishRef.current.style.setProperty('--squish-x', String(1 - size * 0.18));
      squishRef.current.style.setProperty('--squish-y', String(1 + size * 0.22));
    };
    apply(track.id, getSize(track.id));
    return onSize(apply);
  }, [track.id]);

  const squishRef = useRef<HTMLDivElement>(null);
  const shape = (sx: number, sy: number, filter = '', spring = false) => {
    const el = squishRef.current;
    if (!el) return;
    el.classList.toggle('springing', spring);
    el.style.setProperty('--drag-x', String(sx));
    el.style.setProperty('--drag-y', String(sy));
    el.style.filter = filter;
  };

  const endGesture = (at?: number) => {
    const g = gesture.current;
    if (!g) return;
    if (g.holdTimer) clearTimeout(g.holdTimer);
    if (g.rollId !== null) studio.stopRoll(g.rollId);
    studio.release(g.liveId, at);
    if (g.wiggling) studio.setLiveWiggle(track.id, false);
    gesture.current = null;
    shape(1, 1, '', true);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const hit = hitRef.current;
    if (!hit) return;
    hit.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!selected) selectTrack(track.id);

    // Second finger on the same monster → pinch (squish/stretch), no new note.
    if (gesture.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.entries()];
      pinch.current = {
        ids: [a[0], b[0]],
        startDist: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y) || 1,
        startSize: getSize(track.id),
      };
      return;
    }
    if (gesture.current) return;

    const rect = hit.getBoundingClientRect();
    const rel = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height));
    const step = track.monster === 'boom' ? drumPadFor(rel) : Math.round(rel * 7);
    const vel = e.pointerType === 'pen' && e.pressure > 0 ? 0.5 + e.pressure * 0.5 : 0.88;
    const liveId = studio.press(track.id, step, { vel, size: getSize(track.id) }, { at: e.timeStamp });
    const g: Gesture = {
      pointerId: e.pointerId,
      liveId,
      rollId: null,
      startX: e.clientX,
      startY: e.clientY,
      step0: step,
      rect,
      holdTimer: null,
      lastDir: 0,
      lastX: e.clientX,
      reversals: [],
      wiggling: false,
      moved: false,
    };
    if (info.percussive) {
      // Holding on: a roll, locked to the beat grid (its first hit is on the next grid line).
      g.holdTimer = setTimeout(() => {
        if (gesture.current === g && !g.moved) g.rollId = studio.startRoll(track.id, step, { vel: 0.8, size: getSize(track.id) });
      }, HOLD_MS);
    }
    gesture.current = g;
    if (track.monster !== 'boom') {
      const stretch = (rel - 0.4) * 0.3;
      shape(1 - stretch * 0.4, 1 + stretch);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    if (p) {
      const a = pointers.current.get(p.ids[0]);
      const b = pointers.current.get(p.ids[1]);
      if (a && b) {
        const ratio = Math.hypot(a.x - b.x, a.y - b.y) / p.startDist;
        setSize(track.id, p.startSize + Math.log2(ratio) * 1.4);
      }
      return;
    }
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = g.startY - e.clientY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) g.moved = true;

    // Shake detection: several left/right reversals in under a second.
    const dirX = Math.sign(e.clientX - g.lastX);
    if (Math.abs(e.clientX - g.lastX) > 3 && dirX !== 0) {
      if (g.lastDir !== 0 && dirX !== g.lastDir) {
        const now = performance.now();
        g.reversals = [...g.reversals.filter((t) => now - t < 900), now];
        if (!g.wiggling && g.reversals.length >= 4) {
          g.wiggling = true;
          studio.setLiveWiggle(track.id, true);
        }
      }
      g.lastDir = dirX;
      g.lastX = e.clientX;
    }

    const tone = Math.max(-1, Math.min(1, dx / (g.rect.width * 0.55)));
    if (track.monster === 'boom') {
      studio.move(g.liveId, { tone });
      shape(1 + Math.min(0.2, Math.abs(dy) / 400), 1 - Math.min(0.2, Math.abs(dy) / 400), `brightness(${1 + tone * 0.18})`);
      return;
    }
    const stepPx = g.rect.height / 9;
    const step = Math.max(0, Math.min(7, g.step0 + Math.round(dy / stepPx)));
    studio.move(g.liveId, { step, tone });
    const rel = step / 7;
    const stretch = (rel - 0.4) * 0.3;
    shape(1 - stretch * 0.4, 1 + stretch, `brightness(${1 + tone * 0.18}) saturate(${1 + tone * 0.35})`);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current && pinch.current.ids.includes(e.pointerId)) pinch.current = null;
    if (gesture.current?.pointerId === e.pointerId) endGesture(e.timeStamp);
  };

  useEffect(() => () => endGesture(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Loop badge: tap = sleep/wake, hold 1 s = clear the loop (undo brings it back).
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleared = useRef(false);
  const badgeDown = () => {
    cleared.current = false;
    setClearing(true);
    clearTimer.current = setTimeout(() => {
      cleared.current = true;
      setClearing(false);
      commit((p) => clearLoop(p, track.id));
    }, 1000);
  };
  const badgeUp = () => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setClearing(false);
    if (!cleared.current) commit((p) => toggleSleep(p, track.id));
    cleared.current = false;
  };
  const badgeCancel = () => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setClearing(false);
  };

  const fxLevel = (fx: FxKind) => fxStepIndex(track.fx[fx]);

  return (
    <div
      ref={rootRef}
      className="pod"
      data-track={track.id}
      data-monster={track.monster}
      data-selected={selected}
      data-sleeping={track.sleeping}
      data-echo={fxLevel('echo')}
      data-gloop={fxLevel('gloop')}
      data-wiggle={fxLevel('wiggle') || undefined}
    >
      <button
        ref={hitRef}
        className="pod-hit"
        aria-label={`${info.name}, ${info.role}. Touch to play. ${selected ? 'On the keys.' : 'Touch to put on the keys.'}`}
        aria-pressed={selected}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectTrack(track.id);
            studio.hit(track.id, track.monster === 'boom' ? 0 : 2);
          }
        }}
      >
        <div className="goo" />
        <div className="monster-wrap" ref={wrapRef}>
          <div className="squish" ref={squishRef}>
            <MonsterArt kind={track.monster} accessory={preset.accessory} echoes={track.fx.echo > 0} />
          </div>
          {track.fx.chomper > 0 && <FxBuddy kind="chomper" className="chomper-buddy" />}
        </div>
        {caps.showNames && (
          <span className="pod-name">
            {info.name}
            <small>{preset.name}</small>
          </span>
        )}
        {track.sleeping && <span className="zzz">z</span>}
        {recording && selected && <span className="rec-dot" />}
      </button>

      {hasLoop && (
        <button
          className="loop-badge"
          data-sleeping={track.sleeping}
          data-clearing={clearing}
          aria-label={track.sleeping ? `Wake ${info.name}'s loop` : `Let ${info.name}'s loop sleep. Hold to clear it.`}
          onPointerDown={badgeDown}
          onPointerUp={badgeUp}
          onPointerCancel={badgeCancel}
          onPointerLeave={badgeCancel}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              commit((p) => toggleSleep(p, track.id));
            }
            if (e.key === 'Delete' || e.key === 'Backspace') commit((p) => clearLoop(p, track.id));
          }}
        >
          <Icon name={track.sleeping ? 'zzz' : 'loop'} />
        </button>
      )}
    </div>
  );
});
