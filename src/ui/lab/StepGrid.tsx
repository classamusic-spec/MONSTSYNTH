import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { cellState, fineSlot, foldDrumRows, gridColumns, nextTarget, projectGrid, writeCell, type CellTarget, type CellWrite } from '../../magic/steps';
import { wrap } from '../../magic/timing';
import { setCellEdit } from '../../model/edits';
import { gridColumnCap, MODE_CAPS, MONSTERS } from '../../model/monsters';
import { activeClip } from '../../model/project';
import type { MonsterKind, NoteEvent, Track } from '../../model/types';
import { getState, useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { onFrame, onNote } from '../../studio/visualBus';
import { glow } from '../common/glow';
import { isReducedMotion } from '../hooks/useCaps';
import { BeatRuler, gridTemplate } from './BeatRuler';
import { AddFace, AddRowPicker, DRUM_LANE, rowSignature, type GridLane } from './DrumRows';
import { SurfaceSide } from './SurfaceSide';

// ─────────────────────────────────────────────────────────────────────────────
// BEAT HOP — the back of the keys: a grid of stepping stones for the monster in
// the spotlight (Boom: one row per drum). One column is one beat.
//   tap a dark stone   → it lights (and is heard on the beat)
//   tap a lit stone    → off (Little Monster) or one → double → off (Monster Maker)
//   swipe              → paint across rows and columns (or erase, starting on a lit stone)
//   tap a drum picture → that drum plays (nothing is written)
//   tap the ruler      → that beat's drums play, and the mini monster jumps
// One pointer handler for the whole grid, with maths hit-testing over measured
// cells (gaps are never dead zones); every gesture is one undo step (fingers
// down together share one). A finger may wander a little before a tap becomes
// a swipe. Rows only ever grow while the grid is open (a drum whose last stone
// goes out keeps its row), and when there are more drums than fit at a
// finger's size the least-used extras fold behind a '+N' chip. The playhead,
// the hopping monster and the stone pops are imperative (no React state per
// frame or per note).
// ─────────────────────────────────────────────────────────────────────────────

const NO_NOTES: NoteEvent[] = [];
const ALL_PADS = [0, 1, 2, 3, 4, 5, 6, 7];
/** Phones (the short-screen layout) show at most this many drum rows. */
const PHONE = '(max-height: 559px)';
const PHONE_ROWS = 5;
/** The smallest stone a finger gets (its hit area, half of each gap included). */
const MIN_STONE = 44;
/** Px a finger may wander before a tap becomes a swipe. */
const SLOP = 10;
/** Px past a stone's edge before a swipe leaves it. */
const STICK = 6;

interface Geo {
  cols: { l: number; r: number }[];
  rows: { t: number; b: number; step: number }[];
  headR: number;
  rulerB: number;
  box: DOMRect;
}

interface Gesture {
  key: string;
  mode: 'paint' | 'erase';
  start: { step: number; col: number };
  startTarget: CellTarget;
  /** The cell under the finger now (by row step, so rows changing under a held finger cannot redirect it). */
  at: { step: number; col: number };
  down: [number, number];
  moved: boolean;
  el: HTMLElement | null;
}

/** Index of the band a coordinate falls in: the boundary between two cells is halfway across their gap. */
function bandAt(v: number, bands: { a: number; b: number }[]): number {
  let i = 0;
  while (i < bands.length - 1 && v >= (bands[i].b + bands[i + 1].a) / 2) i++;
  return i;
}

/** Like bandAt, but the band the finger is already in holds on until it is STICK px past its edge. */
function stickyBand(v: number, bands: { a: number; b: number }[], cur: number): number {
  const c = bands[cur];
  return c && v >= c.a - STICK && v <= c.b + STICK ? cur : bandAt(v, bands);
}

const sameList = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** A ring where the finger landed, clipped to the stone (the keys' ripple). */
function ripple(el: HTMLElement, x: number, y: number) {
  if (isReducedMotion() || el.querySelectorAll(':scope > .key-burst').length >= 2) return;
  const r = el.getBoundingClientRect();
  const b = document.createElement('span');
  b.className = 'key-burst';
  const at = document.createElement('span');
  at.className = 'key-burst-at';
  at.style.left = `${Math.min(r.width, Math.max(0, x - r.left))}px`;
  at.style.top = `${Math.min(r.height, Math.max(0, y - r.top))}px`;
  const ring = document.createElement('span');
  ring.className = 'key-ripple';
  at.appendChild(ring);
  b.appendChild(at);
  el.appendChild(b);
  setTimeout(() => b.remove(), 450);
}

/** A short-lived decoration inside a stone (a pop ring, a poof). */
function flash(el: HTMLElement, className: string, ms: number) {
  if (isReducedMotion() || el.querySelectorAll(`:scope > .${className}`).length >= 2) return;
  const s = document.createElement('span');
  s.className = className;
  el.appendChild(s);
  setTimeout(() => s.remove(), ms);
}

/** The kind of rows a monster's grid has (drums now; the bead lane comes next). */
function laneFor(monster: MonsterKind): GridLane | null {
  return monster === 'boom' ? DRUM_LANE : null;
}

/** The grid face for the monster in the spotlight (nothing for a monster without one yet). */
export function StepGrid({ track }: { track: Track }) {
  const lane = laneFor(track.monster);
  return lane ? <LaneGrid track={track} lane={lane} /> : null;
}

function LaneGrid({ track, lane }: { track: Track; lane: GridLane }) {
  const mode = useApp((s) => s.settings.ageMode);
  const loopBeats = useApp((s) => s.project.loopBeats);
  const beatsPerBar = useApp((s) => s.project.beatsPerBar);
  const caps = MODE_CAPS[mode];
  const clip = activeClip(track);
  const notes = clip?.notes ?? NO_NOTES;
  const cols = gridColumns(clip, loopBeats) ?? loopBeats;
  const lengthBeats = clip?.lengthBeats ?? loopBeats;
  const base = lane.base(caps);

  // Rows only grow while the grid is open: a drum whose last stone goes out (a
  // tap, or mid-swipe) keeps its row, so nothing slides under a finger and the
  // stone can go straight back. (The grid is keyed by track, so each visit starts fresh.)
  const [kept, setKept] = useState<number[]>([]);
  const all = useMemo(() => lane.rows(notes, lengthBeats, caps, kept), [lane, notes, lengthBeats, caps, kept]);
  const grown = all.filter((p) => !base.includes(p) && !kept.includes(p));
  if (grown.length > 0) setKept([...kept, ...grown]);

  // More drums than fit at a finger's size: the least-used extras fold behind '+N'.
  // Rows already on screen stay put; a drum picked from the tray pushes out the least used.
  const [fit, setFit] = useState(() => (typeof matchMedia === 'function' && matchMedia(PHONE).matches ? PHONE_ROWS : ALL_PADS.length));
  const [pins, setPins] = useState<number[]>([]);
  const [onScreen, setOnScreen] = useState<number[]>([]);
  const fold = useMemo(
    () => (lane.folds ? foldDrumRows(all, notes, { base, cap: fit, pinned: pins, keep: onScreen }) : { shown: all, folded: [] }),
    [lane.folds, all, notes, base, fit, pins, onScreen],
  );
  if (!sameList(fold.shown, onScreen)) setOnScreen(fold.shown);
  const rows = fold.shown;
  const folded = fold.folded;
  const grid = useMemo(() => projectGrid(notes, lengthBeats, rows, { sustain: lane.sustain }), [notes, lengthBeats, rows, lane.sustain]);
  const spare = caps.gridAddRow ? ALL_PADS.slice(0, caps.drumPads).filter((p) => !all.includes(p)) : [];
  const addSlot = spare.length > 0 || folded.length > 0;
  // The '+' tray: closed, or open (from a touch, or from a keyboard: then focus moves in and back out).
  const [picker, setPicker] = useState<false | 'touch' | 'key'>(false);

  // Roving keyboard focus, by row step (col -1 is the row's drum picture).
  const [focus, setFocus] = useState<{ step: number; col: number }>({ step: 0, col: 0 });
  const fStep = rows.includes(focus.step) ? focus.step : rows[rows.length - 1];
  const fCol = Math.max(-1, Math.min(focus.col, cols - 1));
  const empty = notes.length === 0;

  const rootRef = useRef<HTMLDivElement>(null);
  const cellEls = useRef(new Map<string, HTMLDivElement>());
  const geoRef = useRef<Geo | null>(null);
  const gestures = useRef(new Map<number, Gesture>());
  const nowCol = useRef(-1);
  // What imperative handlers need from the latest render.
  const view = useRef({ rows, grid, cols, lengthBeats, all: all.length, spare: spare.length });
  view.current = { rows, grid, cols, lengthBeats, all: all.length, spare: spare.length };

  const register = useCallback((step: number, col: number, el: HTMLDivElement | null) => {
    if (el) cellEls.current.set(`${step}:${col}`, el);
    else cellEls.current.delete(`${step}:${col}`);
  }, []);
  const cellEl = (step: number, col: number) => cellEls.current.get(`${step}:${col}`) ?? null;

  const measure = useCallback((): Geo | null => {
    const root = rootRef.current;
    const v = view.current;
    if (!root) return null;
    const rowEls = [...root.querySelectorAll<HTMLElement>('[data-grid-row]')];
    const head = root.querySelector<HTMLElement>('[data-grid-head]');
    const ruler = root.querySelector<HTMLElement>('.grid-ruler');
    if (!head || !ruler || rowEls.length === 0) return null;
    const first = Number(rowEls[0].dataset.step);
    const colBoxes: Geo['cols'] = [];
    for (let c = 0; c < v.cols; c++) {
      const b = cellEls.current.get(`${first}:${c}`)?.getBoundingClientRect();
      if (!b) return null;
      colBoxes.push({ l: b.left, r: b.right });
    }
    const geo: Geo = {
      cols: colBoxes,
      rows: rowEls.map((el) => {
        const b = el.getBoundingClientRect();
        return { t: b.top, b: b.bottom, step: Number(el.dataset.step) };
      }),
      headR: head.getBoundingClientRect().right,
      rulerB: ruler.getBoundingClientRect().bottom,
      box: root.getBoundingClientRect(),
    };
    geoRef.current = geo;
    return geo;
  }, []);

  /** How many rows fit at a finger's size: five on phones; taller screens measure. */
  const refit = useCallback(() => {
    const root = rootRef.current;
    const box = root?.querySelector<HTMLElement>('.grid-rows');
    if (!lane.folds || !root || !box) return;
    let n = PHONE_ROWS;
    if (typeof matchMedia !== 'function' || !matchMedia(PHONE).matches) {
      const h = box.getBoundingClientRect().height;
      const rg = parseFloat(getComputedStyle(box).rowGap) || 0;
      if (h <= 0) return;
      const fits = (height: number) => Math.floor((height + rg + 0.5) / (MIN_STONE + rg / 2));
      n = fits(h);
      // The '+' under the drum pictures is only there for folded drums: if every
      // drum would fit in its room, show them all (and the '+' goes away).
      const slot = root.querySelector<HTMLElement>('.grid-add-head');
      const v = view.current;
      if (slot && slot.offsetParent !== null && v.spare === 0 && fits(h + slot.getBoundingClientRect().height + rg) >= v.all) n = v.all;
    }
    setFit((f) => (f === n ? f : n));
  }, [lane.folds]);

  /** The row band and column under a point (col -1: a row head); null over the ruler. */
  const hitTest = (geo: Geo, x: number, y: number): { row: number; col: number } | null => {
    if (y < (geo.rulerB + geo.rows[0].t) / 2) return null;
    if (y > geo.rows[geo.rows.length - 1].b + 4) return null;
    const row = bandAt(y, geo.rows.map((r) => ({ a: r.t, b: r.b })));
    if (x < (geo.headR + geo.cols[0].l) / 2) return { row, col: -1 };
    return { row, col: bandAt(x, geo.cols.map((c) => ({ a: c.l, b: c.r }))) };
  };

  /** A cell as it is right now in the store (a swipe moves faster than React renders). */
  const stateNow = (step: number, col: number) => {
    const t = getState().project.tracks.find((x) => x.id === track.id);
    const c = t ? activeClip(t) : null;
    return cellState(c?.notes ?? NO_NOTES, step, col, c?.lengthBeats ?? view.current.lengthBeats);
  };

  const rowDefault = (step: number) => lane.rowDefault(step, MODE_CAPS[getState().settings.ageMode]);

  /** "No": the stone wobbles (a full beat, or a full loop). Nothing is taken away. */
  const refuse = (step: number, col: number) => {
    const el = cellEl(step, col);
    if (!el) return;
    if (isReducedMotion() || typeof el.animate !== 'function') glow(el, 250, 'full');
    else el.animate([{ rotate: '0deg' }, { rotate: '-8deg' }, { rotate: '7deg' }, { rotate: '-4deg' }, { rotate: '0deg' }], { duration: 250, easing: 'ease-in-out' });
  };

  const write = (step: number, col: number, target: CellTarget, key: string, first: boolean) => {
    const s = getState();
    const t = s.project.tracks.find((x) => x.id === track.id);
    if (!t) return;
    const current = activeClip(t);
    const L = current?.lengthBeats ?? s.project.loopBeats;
    const info = MONSTERS[t.monster];
    const w: CellWrite = {
      step,
      col,
      target,
      lengthBeats: L,
      beatsPerBar: s.project.beatsPerBar,
      isDrum: t.monster === 'boom',
      columnCap: gridColumnCap(t.monster, s.settings.ageMode),
      dur: info.gridDur,
      maxNotes: info.maxClipNotes,
    };
    const probe = writeCell(current ?? { id: '', lengthBeats: L, notes: [] }, w);
    if (probe.result === 'full') return refuse(step, col);
    if (probe.result === 'same') return;
    // While the band plays, only a gesture's first stone gets a preview (a swipe is heard as the loop plays it).
    const preview = first || !s.transport.playing ? 'tap' : 'none';
    studio.stepEdit(t.id, (p) => setCellEdit(p, t.id, w), { col, coalesce: key, preview });
    if (target === 'off') {
      const el = cellEl(step, col);
      if (el) flash(el, 'stone-poof', 380);
    }
  };

  const press = (g: Gesture, step: number, col: number, x: number, y: number) => {
    if (g.el) g.el.dataset.down = 'false';
    const el = cellEl(step, col);
    g.el = el;
    if (!el) return;
    el.dataset.down = 'true';
    ripple(el, x, y);
  };

  const audition = (step: number) => {
    studio.auditionStep(track.id, step, 0.85);
    const head = cellEl(step, -1)?.querySelector<HTMLElement>('.row-pad');
    if (head && !isReducedMotion() && typeof head.animate === 'function') {
      head.animate([{ scale: '1' }, { scale: '0.86' }, { scale: '1.08' }, { scale: '1' }], { duration: 260, easing: 'ease-out' });
    }
  };

  /** The mini monster jumps where it stands (the ruler answers a touch). */
  const jump = () => {
    const hopper = rootRef.current?.querySelector<HTMLElement>('.hopper');
    if (!hopper || isReducedMotion() || typeof hopper.animate !== 'function') return;
    hopper.animate([{ translate: '0 0', scale: '1.12 0.86' }, { translate: '0 -9px', scale: '0.94 1.08', offset: 0.45 }, { translate: '0 0', scale: '1.08 0.9', offset: 0.85 }, { translate: '0 0', scale: '1 1' }], {
      duration: 320,
      easing: 'ease-out',
    });
  };

  /** A touch on the ruler: that beat's drums play together (or a soft tick for an empty beat), and the hopper jumps. */
  const rulerTap = (col: number) => {
    jump();
    const v = view.current;
    const lit = col < 0 ? [] : v.rows.filter((_, r) => v.grid.cells[r]?.[col]?.state !== 'off').slice(0, 4);
    if (lit.length === 0) studio.auditionStep(track.id, 2, 0.35);
    else lit.forEach((step) => studio.auditionStep(track.id, step, 0.75));
    const slot = col < 0 ? null : rootRef.current?.querySelector<HTMLElement>(`.ruler-slot[data-col="${col}"]`);
    if (slot) glow(slot, 220);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || (e.target as HTMLElement).closest('button')) return;
    const geo = measure();
    if (!geo) return;
    setPicker(false);
    const hit = hitTest(geo, e.clientX, e.clientY);
    if (!hit) {
      // Above the stones: the ruler (or its corner, where the mini monster waits).
      if (e.clientY > geo.rows[0].t) return;
      e.preventDefault();
      rulerTap(e.clientX < (geo.headR + geo.cols[0].l) / 2 ? -1 : bandAt(e.clientX, geo.cols.map((c) => ({ a: c.l, b: c.r }))));
      return;
    }
    e.preventDefault();
    rootRef.current?.setPointerCapture?.(e.pointerId);
    const step = geo.rows[hit.row].step;
    if (hit.col < 0) {
      audition(step);
      return;
    }
    const state = stateNow(step, hit.col);
    const target = nextTarget(state, { states: caps.gridCellStates, rowDefault: rowDefault(step) });
    // Fingers down together (two hands drumming in stones) make one undo step.
    const together = gestures.current.values().next().value as Gesture | undefined;
    const g: Gesture = {
      key: together?.key ?? `grid-${e.pointerId}-${Math.round(e.timeStamp)}`,
      mode: state === 'off' ? 'paint' : 'erase',
      start: { step, col: hit.col },
      startTarget: target,
      at: { step, col: hit.col },
      down: [e.clientX, e.clientY],
      moved: false,
      el: null,
    };
    gestures.current.set(e.pointerId, g);
    press(g, step, hit.col, e.clientX, e.clientY);
    write(step, hit.col, target, g.key, true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestures.current.get(e.pointerId);
    const geo = geoRef.current;
    if (!g || !geo) return;
    // A tap that slides a little is still a tap.
    if (!g.moved && Math.hypot(e.clientX - g.down[0], e.clientY - g.down[1]) < SLOP) return;
    const curRow = geo.rows.findIndex((r) => r.step === g.at.step);
    const row = stickyBand(e.clientY, geo.rows.map((r) => ({ a: r.t, b: r.b })), curRow);
    const col = stickyBand(e.clientX, geo.cols.map((c) => ({ a: c.l, b: c.r })), g.at.col);
    const step = geo.rows[row].step;
    if (step === g.at.step && col === g.at.col) return;
    g.at = { step, col };
    press(g, step, col, e.clientX, e.clientY);
    if (!g.moved) {
      g.moved = true;
      // A swipe that began on a lit stone erases, and that first stone goes out too.
      if (g.mode === 'erase' && g.startTarget !== 'off') write(g.start.step, g.start.col, 'off', g.key, false);
    }
    const state = stateNow(step, col);
    if (g.mode === 'paint') {
      if (state === 'off' || state === 'custom') write(step, col, rowDefault(step), g.key, false);
    } else if (state !== 'off') {
      write(step, col, 'off', g.key, false);
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestures.current.get(e.pointerId);
    if (!g) return;
    gestures.current.delete(e.pointerId);
    if (g.el) g.el.dataset.down = 'false';
  };

  // Keyboards (Chromebooks): arrows move between stones and drum pictures, Enter taps one.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).closest('.stone, [data-grid-head]')) return;
    const v = view.current;
    let r = Math.max(0, v.rows.indexOf(fStep));
    let c = fCol;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      const step = v.rows[r];
      if (c < 0) audition(step);
      else write(step, c, nextTarget(stateNow(step, c), { states: caps.gridCellStates, rowDefault: rowDefault(step) }), `grid-key-${performance.now()}`, true);
      return;
    }
    if (e.key === 'ArrowLeft') c = Math.max(-1, c - 1);
    else if (e.key === 'ArrowRight') c = Math.min(v.cols - 1, c + 1);
    else if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
    else if (e.key === 'ArrowDown') r = Math.min(v.rows.length - 1, r + 1);
    else return;
    e.preventDefault();
    setFocus({ step: v.rows[r], col: c });
    cellEl(v.rows[r], c)?.focus();
  };

  const onFocus = (e: ReactFocusEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.stone, [data-grid-head]');
    if (!el) return;
    const step = Number(el.dataset.step);
    const col = Number(el.dataset.col);
    if (step !== focus.step || col !== focus.col) setFocus({ step, col });
  };

  // ── The beat you can see: playhead beam, ruler dot, hopping monster ───────
  const showBeat = useCallback((col: number) => {
    const root = rootRef.current;
    const geo = geoRef.current ?? measure();
    if (!root || !geo) return;
    const v = view.current;
    root.dataset.now = String(col);
    root.querySelector('.ruler-slot[data-now="true"]')?.setAttribute('data-now', 'false');
    if (col >= 0) root.querySelector(`.ruler-slot[data-col="${col}"]`)?.setAttribute('data-now', 'true');
    const beam = root.querySelector<HTMLElement>('.grid-beam');
    const at = geo.cols[Math.max(0, col)];
    if (beam && at) {
      beam.style.width = `${at.r - at.l}px`;
      beam.style.transform = `translateX(${at.l - geo.box.left}px)`;
    }
    const hopper = root.querySelector<HTMLElement>('.hopper');
    if (!hopper || !at) return;
    const half = hopper.offsetWidth / 2;
    const x = (c: number) => (geo.cols[c].l + geo.cols[c].r) / 2 - geo.box.left - half;
    hopper.getAnimations().forEach((a) => a.cancel());
    if (col < 0) {
      // Stopped: the mini monster waits in the corner over the drum pictures (beat 1's star stays in view).
      hopper.style.transform = `translateX(${(geo.headR - geo.box.left) / 2 - half}px)`;
      return;
    }
    if (isReducedMotion() || typeof hopper.animate !== 'function') {
      hopper.style.transform = `translateX(${x(col)}px)`;
      return;
    }
    // A one-beat hop to the next dot, landing (with a squash) exactly as that beat sounds.
    const next = (col + 1) % v.cols;
    const x0 = x(col);
    const x1 = x(next);
    const h = next === 0 ? 16 : 9;
    const frames: Keyframe[] = [{ transform: `translateX(${x0}px) translateY(0) scale(1.14, 0.84)`, offset: 0 }];
    frames.push({ transform: `translateX(${x0}px) translateY(0) scale(1, 1)`, offset: 0.14 });
    for (const t of [0.3, 0.5, 0.7]) {
      const k = (t - 0.2) / 0.75;
      frames.push({ transform: `translateX(${x0 + (x1 - x0) * k}px) translateY(${-4 * h * k * (1 - k)}px) scale(0.96, 1.06)`, offset: t });
    }
    frames.push({ transform: `translateX(${x1}px) translateY(0) scale(1, 1)`, offset: 0.95 });
    frames.push({ transform: `translateX(${x1}px) translateY(0) scale(1.1, 0.88)`, offset: 1 });
    const beatMs = 60000 / getState().project.tempo;
    hopper.style.transform = `translateX(${x1}px)`;
    hopper.animate(frames, { duration: beatMs, easing: 'linear' });
  }, [measure]);

  useEffect(() => {
    const off = onFrame((p) => {
      const v = view.current;
      const col = p.playing && p.mode === 'loop' && p.beat >= 0 ? Math.floor(wrap(p.beat, v.lengthBeats)) % v.cols : -1;
      if (col === nowCol.current) return;
      nowCol.current = col;
      showBeat(col);
    });
    return off;
  }, [showBeat]);

  // Sizes change (rotation, rows shown or folded): measure again, see how many rows
  // fit, and put the beam and the hopper back.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      measure();
      refit();
      showBeat(nowCol.current);
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [measure, refit, showBeat]);

  const rowKey = rows.join(',');
  useLayoutEffect(() => {
    measure();
    refit();
    showBeat(nowCol.current);
  }, [rowKey, cols, addSlot, all.length, measure, refit, showBeat]);

  // A stone pops as its note is heard (the stage monster reacts at the same moment).
  // A drum folded away has no stone: it plays all the same.
  useEffect(
    () =>
      onNote((v) => {
        if (v.trackId !== track.id || !v.noteId) return;
        const at = view.current.grid.noteCell.get(v.noteId);
        const el = at ? cellEl(view.current.rows[at[0]], at[1]) : null;
        if (!el) return;
        if (isReducedMotion() || typeof el.animate !== 'function') {
          glow(el, 160);
          return;
        }
        el.querySelector('.stone-face')?.animate([{ scale: '1' }, { scale: '1.15' }, { scale: '1' }], { duration: 180, easing: 'ease-out' });
        flash(el, 'stone-ring', 420);
      }),
    [track.id],
  );

  // Wand grooves cascade in from left to right; tidied notes slide to their slots.
  const before = useRef<{ ids: Set<string>; slot: Map<string, number> } | null>(null);
  useLayoutEffect(() => {
    const prev = before.current;
    const slot = new Map(notes.map((n) => [n.id, fineSlot(n.beat, lengthBeats)]));
    before.current = { ids: new Set(notes.map((n) => n.id)), slot };
    const root = rootRef.current;
    const geo = geoRef.current;
    if (!prev || !root || isReducedMotion()) return;
    const stoneOf = (id: string) => {
      const cell = grid.noteCell.get(id);
      return cell ? cellEl(rows[cell[0]], cell[1]) : null;
    };
    const fresh = notes.filter((n) => !prev.ids.has(n.id));
    if (fresh.length >= 3) {
      const done = new Set<HTMLElement>();
      for (const n of fresh) {
        const el = stoneOf(n.id)?.querySelector<HTMLElement>('.stone-face');
        if (!el || done.has(el) || typeof el.animate !== 'function') continue;
        done.add(el);
        el.animate([{ scale: '0.2', opacity: 0 }, { scale: '1.15', opacity: 1 }, { scale: '1', opacity: 1 }], {
          duration: 260,
          delay: grid.noteCell.get(n.id)![1] * 30,
          easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
          fill: 'backwards',
        });
      }
      return;
    }
    if (!geo) return;
    // Where a sixteenth sits across the grid (a quarter of its beat's stone per sixteenth).
    const xOf = (s: number) => {
      const c = geo.cols[Math.floor(s / 4)];
      return c ? c.l + ((s % 4) * (c.r - c.l)) / 4 : null;
    };
    const moved = new Map<HTMLElement, number>();
    for (const n of notes) {
      const from = prev.slot.get(n.id);
      const to = slot.get(n.id);
      if (from === undefined || to === undefined || from === to) continue;
      const x0 = xOf(from);
      const x1 = xOf(to);
      const el = stoneOf(n.id)?.querySelector<HTMLElement>('.stone-face');
      if (el && x0 !== null && x1 !== null) moved.set(el, x0 - x1);
    }
    if (moved.size === 0) return;
    root.dataset.flip = 'true';
    moved.forEach((dx, el) => el.animate?.([{ translate: `${dx}px 0` }, { translate: '0 0' }], { duration: 220, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }));
    const t = setTimeout(() => root && (root.dataset.flip = 'false'), 240);
    return () => clearTimeout(t);
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Close the tray; a keyboard user lands back on the '+' they came from. */
  const closePicker = () => {
    setPicker(false);
    if (picker !== 'key') return;
    const btn = [...(rootRef.current?.parentElement?.querySelectorAll<HTMLElement>('.grid-add') ?? [])].find((b) => b.offsetParent !== null);
    btn?.focus({ preventScroll: true });
  };
  const pickRow = (pad: number) => {
    studio.auditionStep(track.id, pad, 0.85);
    if (!base.includes(pad)) setKept((k) => (k.includes(pad) ? k : [...k, pad]));
    setPins((p) => [pad, ...p.filter((x) => x !== pad)]);
    closePicker();
  };
  const addButton = (where: 'head' | 'side') =>
    addSlot && (
      <button
        className={`grid-add grid-add-${where} ${where === 'side' ? 'tool-btn' : ''}`}
        data-folded={folded.length}
        aria-label={folded.length > 0 ? `${folded.length} more drums` : 'More drums'}
        aria-expanded={!!picker}
        onClick={(e) => setPicker((o) => (o ? false : e.detail === 0 ? 'key' : 'touch'))}
      >
        <AddFace folded={folded} />
      </button>
    );

  const tpl = gridTemplate(cols, beatsPerBar);
  const Row = lane.Row;
  return (
    <div className="surface surface-grid" data-monster={track.monster} data-view="grid">
      <SurfaceSide track={track} face="grid" extra={addButton('side')} />
      <div
        ref={rootRef}
        className="step-grid"
        data-rows={rows.length}
        data-empty={empty}
        data-sleeping={track.sleeping}
        data-add={addSlot}
        data-now="-1"
        style={{ ['--rows' as string]: rows.length, ['--tpl' as string]: tpl } as CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
      >
        <BeatRuler cols={cols} beatsPerBar={beatsPerBar} numbers={caps.showNames} monster={track.monster} />
        <div className="grid-rows" role="grid" aria-label={`${MONSTERS[track.monster].name}'s beat grid`} aria-rowcount={rows.length} aria-colcount={cols + 1}>
          {rows.map((step, r) => (
            <Row
              key={step}
              r={r}
              step={step}
              cells={grid.cells[r]}
              sig={rowSignature(grid.cells[r])}
              beatsPerBar={beatsPerBar}
              focusCol={step === fStep ? fCol : null}
              invite={empty}
              register={register}
            />
          ))}
        </div>
        {addButton('head')}
        <span className="grid-beam" aria-hidden />
      </div>
      {picker && addSlot && <AddRowPicker folded={folded} spare={spare} focusFirst={picker === 'key'} onPick={pickRow} onClose={closePicker} />}
    </div>
  );
}
