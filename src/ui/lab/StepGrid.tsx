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
import { cellState, drumRows, fineSlot, gridColumns, nextTarget, projectGrid, writeCell, type CellTarget, type CellWrite } from '../../magic/steps';
import { wrap } from '../../magic/timing';
import { setCellEdit } from '../../model/edits';
import { gridColumnCap, MODE_CAPS, MONSTERS } from '../../model/monsters';
import { activeClip } from '../../model/project';
import type { NoteEvent, Track } from '../../model/types';
import { getState, useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { onFrame, onNote } from '../../studio/visualBus';
import { glow } from '../common/glow';
import { isReducedMotion } from '../hooks/useCaps';
import { Icon } from '../icons/Icon';
import { BeatRuler, gridTemplate } from './BeatRuler';
import { AddRowPicker, DrumRow, rowSignature } from './DrumRows';
import { SurfaceSide } from './SurfaceSide';

// ─────────────────────────────────────────────────────────────────────────────
// BEAT HOP — the back of the keys: a grid of stepping stones for the monster in
// the spotlight (Boom: one row per drum). One column is one beat.
//   tap a dark stone   → it lights (and is heard on the beat)
//   tap a lit stone    → off (Little Monster) or one → double → off (Monster Maker)
//   swipe              → paint across rows and columns (or erase, starting on a lit stone)
//   tap a drum picture → that drum plays (nothing is written)
// One pointer handler for the whole grid, with maths hit-testing over measured
// cells (gaps are never dead zones); every gesture is one undo step. The
// playhead, the hopping monster and the stone pops are imperative (no React
// state per frame or per note).
// ─────────────────────────────────────────────────────────────────────────────

const NO_NOTES: NoteEvent[] = [];
const ALL_PADS = [0, 1, 2, 3, 4, 5, 6, 7];

interface Geo {
  cols: { l: number; r: number }[];
  rows: { t: number; b: number }[];
  headR: number;
  rulerB: number;
  box: DOMRect;
}

interface Gesture {
  key: string;
  mode: 'paint' | 'erase';
  start: [number, number];
  startTarget: CellTarget;
  at: string;
  moved: boolean;
  el: HTMLElement | null;
}

/** Index of the band a coordinate falls in: the boundary between two cells is halfway across their gap. */
function bandAt(v: number, bands: { a: number; b: number }[]): number {
  let i = 0;
  while (i < bands.length - 1 && v >= (bands[i].b + bands[i + 1].a) / 2) i++;
  return i;
}

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

export function StepGrid({ track }: { track: Track }) {
  const mode = useApp((s) => s.settings.ageMode);
  const loopBeats = useApp((s) => s.project.loopBeats);
  const beatsPerBar = useApp((s) => s.project.beatsPerBar);
  const caps = MODE_CAPS[mode];
  const clip = activeClip(track);
  const notes = clip?.notes ?? NO_NOTES;
  const cols = gridColumns(clip, loopBeats) ?? loopBeats;
  const lengthBeats = clip?.lengthBeats ?? loopBeats;
  const [added, setAdded] = useState<number[]>([]);
  const [picker, setPicker] = useState(false);
  const rows = useMemo(() => drumRows({ id: '', lengthBeats, notes }, caps.gridDrumRows, added), [notes, lengthBeats, caps.gridDrumRows, added]);
  const grid = useMemo(() => projectGrid(notes, lengthBeats, rows, { sustain: false }), [notes, lengthBeats, rows]);
  const [focus, setFocus] = useState<[number, number]>(() => [Math.max(0, rows.indexOf(0)), 0]);
  const fr = Math.min(focus[0], rows.length - 1);
  const fc = Math.min(focus[1], cols - 1);
  const empty = notes.length === 0;
  const spare = caps.gridAddRow ? ALL_PADS.slice(0, caps.drumPads).filter((p) => !rows.includes(p)) : [];

  const rootRef = useRef<HTMLDivElement>(null);
  const cellEls = useRef<(HTMLDivElement | null)[][]>([]);
  const geoRef = useRef<Geo | null>(null);
  const gestures = useRef(new Map<number, Gesture>());
  const nowCol = useRef(-1);
  // What imperative handlers need from the latest render.
  const view = useRef({ rows, grid, cols, lengthBeats, mode });
  view.current = { rows, grid, cols, lengthBeats, mode };

  const register = useCallback((r: number, c: number, el: HTMLDivElement | null) => {
    (cellEls.current[r] ??= [])[c] = el;
  }, []);

  const measure = useCallback((): Geo | null => {
    const root = rootRef.current;
    const v = view.current;
    if (!root) return null;
    const first = cellEls.current[0];
    const rowEls = root.querySelectorAll<HTMLElement>('.drum-row');
    const head = root.querySelector<HTMLElement>('.drum-head');
    const ruler = root.querySelector<HTMLElement>('.grid-ruler');
    if (!first || !head || !ruler || rowEls.length === 0) return null;
    const colBoxes: Geo['cols'] = [];
    for (let c = 0; c < v.cols; c++) {
      const b = first[c]?.getBoundingClientRect();
      if (!b) return null;
      colBoxes.push({ l: b.left, r: b.right });
    }
    const geo: Geo = {
      cols: colBoxes,
      rows: [...rowEls].map((el) => {
        const b = el.getBoundingClientRect();
        return { t: b.top, b: b.bottom };
      }),
      headR: head.getBoundingClientRect().right,
      rulerB: ruler.getBoundingClientRect().bottom,
      box: root.getBoundingClientRect(),
    };
    geoRef.current = geo;
    return geo;
  }, []);

  /** The cell under a point; `col` -1 is a row head, null is the ruler (or below the rows). */
  const hitTest = (geo: Geo, x: number, y: number, clamp: boolean): { row: number; col: number } | null => {
    if (!clamp && y < (geo.rulerB + geo.rows[0].t) / 2) return null;
    if (!clamp && y > geo.rows[geo.rows.length - 1].b + 4) return null;
    const row = bandAt(y, geo.rows.map((r) => ({ a: r.t, b: r.b })));
    if (!clamp && x < (geo.headR + geo.cols[0].l) / 2) return { row, col: -1 };
    return { row, col: bandAt(x, geo.cols.map((c) => ({ a: c.l, b: c.r }))) };
  };

  const rowDefault = (pad: number): 'one' | 'double' => (view.current.mode === 'little' && pad === 2 ? 'double' : 'one');

  /** A cell as it is right now in the store (a swipe moves faster than React renders). */
  const stateNow = (row: number, col: number) => {
    const t = getState().project.tracks.find((x) => x.id === track.id);
    const c = t ? activeClip(t) : null;
    return cellState(c?.notes ?? NO_NOTES, view.current.rows[row], col, c?.lengthBeats ?? view.current.lengthBeats);
  };

  const cellEl = (row: number, col: number) => cellEls.current[row]?.[col] ?? null;

  /** "No": the stone wobbles (a full beat, or a full loop). Nothing is taken away. */
  const refuse = (row: number, col: number) => {
    const el = cellEl(row, col);
    if (!el) return;
    if (isReducedMotion() || typeof el.animate !== 'function') glow(el, 250, 'full');
    else el.animate([{ rotate: '0deg' }, { rotate: '-8deg' }, { rotate: '7deg' }, { rotate: '-4deg' }, { rotate: '0deg' }], { duration: 250, easing: 'ease-in-out' });
  };

  const write = (row: number, col: number, target: CellTarget, key: string, first: boolean) => {
    const s = getState();
    const t = s.project.tracks.find((x) => x.id === track.id);
    if (!t) return;
    const current = activeClip(t);
    const L = current?.lengthBeats ?? s.project.loopBeats;
    const info = MONSTERS[t.monster];
    const w: CellWrite = {
      step: view.current.rows[row],
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
    if (probe.result === 'full') return refuse(row, col);
    if (probe.result === 'same') return;
    // While the band plays, only a gesture's first stone gets a preview (a swipe is heard as the loop plays it).
    const preview = first || !s.transport.playing ? 'tap' : 'none';
    studio.stepEdit(t.id, (p) => setCellEdit(p, t.id, w), { col, coalesce: key, preview });
    if (target === 'off') {
      const el = cellEl(row, col);
      if (el) flash(el, 'stone-poof', 380);
    }
  };

  const press = (g: Gesture, row: number, col: number, x: number, y: number) => {
    if (g.el) g.el.dataset.down = 'false';
    const el = cellEl(row, col);
    g.el = el;
    if (!el) return;
    el.dataset.down = 'true';
    ripple(el, x, y);
  };

  const audition = (row: number) => {
    const pad = view.current.rows[row];
    studio.auditionStep(track.id, pad, 0.85);
    const head = rootRef.current?.querySelectorAll<HTMLElement>('.drum-head .row-pad')[row];
    if (head && !isReducedMotion() && typeof head.animate === 'function') {
      head.animate([{ scale: '1' }, { scale: '0.86' }, { scale: '1.08' }, { scale: '1' }], { duration: 260, easing: 'ease-out' });
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || (e.target as HTMLElement).closest('button')) return;
    const geo = measure();
    if (!geo) return;
    const hit = hitTest(geo, e.clientX, e.clientY, false);
    if (!hit) return;
    e.preventDefault();
    rootRef.current?.setPointerCapture?.(e.pointerId);
    setPicker(false);
    if (hit.col < 0) {
      audition(hit.row);
      return;
    }
    const pad = view.current.rows[hit.row];
    const state = stateNow(hit.row, hit.col);
    const target = nextTarget(state, { states: caps.gridCellStates, rowDefault: rowDefault(pad) });
    const g: Gesture = {
      key: `grid-${e.pointerId}-${Math.round(e.timeStamp)}`,
      mode: state === 'off' ? 'paint' : 'erase',
      start: [hit.row, hit.col],
      startTarget: target,
      at: `${hit.row}:${hit.col}`,
      moved: false,
      el: null,
    };
    gestures.current.set(e.pointerId, g);
    press(g, hit.row, hit.col, e.clientX, e.clientY);
    write(hit.row, hit.col, target, g.key, true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestures.current.get(e.pointerId);
    const geo = geoRef.current;
    if (!g || !geo) return;
    const hit = hitTest(geo, e.clientX, e.clientY, true)!;
    const at = `${hit.row}:${hit.col}`;
    if (at === g.at) return;
    g.at = at;
    press(g, hit.row, hit.col, e.clientX, e.clientY);
    if (!g.moved) {
      g.moved = true;
      // A swipe that began on a lit stone erases, and that first stone goes out too.
      if (g.mode === 'erase' && g.startTarget !== 'off') write(g.start[0], g.start[1], 'off', g.key, false);
    }
    const state = stateNow(hit.row, hit.col);
    if (g.mode === 'paint') {
      if (state === 'off' || state === 'custom') write(hit.row, hit.col, rowDefault(view.current.rows[hit.row]), g.key, false);
    } else if (state !== 'off') {
      write(hit.row, hit.col, 'off', g.key, false);
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestures.current.get(e.pointerId);
    if (!g) return;
    gestures.current.delete(e.pointerId);
    if (g.el) g.el.dataset.down = 'false';
  };

  // Keyboards (Chromebooks): arrows move between stones, Enter taps one.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).closest('.stone')) return;
    const v = view.current;
    let [r, c] = [Math.min(focus[0], v.rows.length - 1), Math.min(focus[1], v.cols - 1)];
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      const pad = v.rows[r];
      write(r, c, nextTarget(stateNow(r, c), { states: caps.gridCellStates, rowDefault: rowDefault(pad) }), `grid-key-${performance.now()}`, true);
      return;
    }
    if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
    else if (e.key === 'ArrowRight') c = Math.min(v.cols - 1, c + 1);
    else if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
    else if (e.key === 'ArrowDown') r = Math.min(v.rows.length - 1, r + 1);
    else return;
    e.preventDefault();
    setFocus([r, c]);
    cellEl(r, c)?.focus();
  };

  const onFocus = (e: ReactFocusEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.stone');
    if (!el) return;
    const r = Number(el.dataset.row);
    const c = Number(el.dataset.col);
    if (r !== focus[0] || c !== focus[1]) setFocus([r, c]);
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
    if (col < 0 || isReducedMotion() || typeof hopper.animate !== 'function') {
      hopper.style.transform = `translateX(${x(Math.max(0, col))}px)`;
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

  // Sizes change (rotation, rows added): measure again and put the beam and the hopper back.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      measure();
      showBeat(nowCol.current);
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [measure, showBeat]);

  useLayoutEffect(() => {
    measure();
    showBeat(nowCol.current);
  }, [rows.length, cols, measure, showBeat]);

  // A stone pops as its note is heard (the stage monster reacts at the same moment).
  useEffect(
    () =>
      onNote((v) => {
        if (v.trackId !== track.id || !v.noteId) return;
        const at = view.current.grid.noteCell.get(v.noteId);
        const el = at ? cellEl(at[0], at[1]) : null;
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
    const fresh = notes.filter((n) => !prev.ids.has(n.id));
    if (fresh.length >= 3) {
      const done = new Set<HTMLElement>();
      for (const n of fresh) {
        const cell = grid.noteCell.get(n.id);
        const el = cell ? cellEl(cell[0], cell[1])?.querySelector<HTMLElement>('.stone-face') : null;
        if (!el || done.has(el) || typeof el.animate !== 'function') continue;
        done.add(el);
        el.animate([{ scale: '0.2', opacity: 0 }, { scale: '1.15', opacity: 1 }, { scale: '1', opacity: 1 }], {
          duration: 260,
          delay: cell![1] * 30,
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
      const cell = grid.noteCell.get(n.id);
      if (from === undefined || to === undefined || from === to || !cell) continue;
      const x0 = xOf(from);
      const x1 = xOf(to);
      const el = cellEl(cell[0], cell[1])?.querySelector<HTMLElement>('.stone-face');
      if (el && x0 !== null && x1 !== null) moved.set(el, x0 - x1);
    }
    if (moved.size === 0) return;
    root.dataset.flip = 'true';
    moved.forEach((dx, el) => el.animate?.([{ translate: `${dx}px 0` }, { translate: '0 0' }], { duration: 220, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }));
    const t = setTimeout(() => root && (root.dataset.flip = 'false'), 240);
    return () => clearTimeout(t);
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickRow = (pad: number) => {
    studio.auditionStep(track.id, pad, 0.85);
    setAdded((a) => (a.includes(pad) ? a : [...a, pad]));
    setPicker(false);
  };
  const addButton = (where: 'head' | 'side') =>
    spare.length > 0 && (
      <button className={`grid-add grid-add-${where} ${where === 'side' ? 'tool-btn' : ''}`} aria-label="More drums" aria-expanded={picker} onClick={() => setPicker((o) => !o)}>
        <Icon name="plus" />
      </button>
    );

  const tpl = gridTemplate(cols, beatsPerBar);
  return (
    <div className="surface surface-grid" data-monster={track.monster} data-view="grid">
      <SurfaceSide track={track} face="grid" extra={addButton('side')} />
      <div
        ref={rootRef}
        className="step-grid"
        data-rows={rows.length}
        data-empty={empty}
        data-sleeping={track.sleeping}
        data-add={caps.gridAddRow && spare.length > 0}
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
          {rows.map((pad, r) => (
            <DrumRow
              key={pad}
              r={r}
              pad={pad}
              cells={grid.cells[r]}
              sig={rowSignature(grid.cells[r])}
              beatsPerBar={beatsPerBar}
              focusCol={r === fr ? fc : -1}
              invite={empty}
              register={register}
            />
          ))}
        </div>
        {addButton('head')}
        <span className="grid-beam" aria-hidden />
      </div>
      {picker && spare.length > 0 && <AddRowPicker pads={spare} onPick={pickRow} onClose={() => setPicker(false)} />}
    </div>
  );
}
