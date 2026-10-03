import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { clipForCell, moveCell, setCell } from '../../magic/arrange';
import { toggleSleep, toggleSolo, togglePaintSleep } from '../../model/edits';
import { MONSTERS } from '../../model/monsters';
import { activeClip, trackHasLoop } from '../../model/project';
import type { MonsterKind, Project } from '../../model/types';
import { PAINT_ROW } from '../../model/types';
import { selectTrack, setLabView, setScreen } from '../../store/actions';
import { canGrid, commit, getState, useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { onFrame } from '../../studio/visualBus';
import { isReducedMotion, useCaps } from '../hooks/useCaps';
import { Icon } from '../icons/Icon';
import { MonsterArt } from '../monsters/MonsterArt';
import { say } from '../shell/bubbles';
import { ClipThumb, PaintThumb } from './Thumbnail';

// ─────────────────────────────────────────────────────────────────────────────
// MONSTER BLOCKS — the song, as rows of blocks (one row per monster, one column
// per loop). No timeline, no rulers:
//   tap an empty spot  → the monster's loop plays there (a song kept from Learn
//                        continues its tune: the phrase to the left)
//   tap a block        → it goes away (with a little "pop")
//   swipe across       → fill several spots at once
//   drag a block       → move it (drop on another block to swap)
// Every touch is heard: filling sings a note at once, then the loop you placed
// plays its first two beats; pressing a block lets you hear it.
// Keyboards and switches: one tab stop for all the blocks, arrows move,
// Enter or Space fills or clears, Shift+←/→ moves a block along its row.
// ─────────────────────────────────────────────────────────────────────────────

interface Row {
  id: string;
  kind: 'track' | 'paint';
  label: string;
  monster: MonsterKind | 'paint';
  clipId: string | null;
  sleeping: boolean;
  solo: boolean;
}

function rowsOf(p: Project): Row[] {
  const rows: Row[] = p.tracks.map((t) => ({
    id: t.id,
    kind: 'track',
    label: MONSTERS[t.monster].name,
    monster: t.monster,
    clipId: trackHasLoop(t) ? activeClip(t)!.id : null,
    sleeping: t.sleeping,
    solo: t.solo,
  }));
  if (p.painting.strokes.length > 0) {
    rows.push({ id: PAINT_ROW, kind: 'paint', label: 'Painting', monster: 'paint', clipId: PAINT_ROW, sleeping: p.painting.sleeping, solo: false });
  }
  return rows;
}

/** The note a monster sings when a block is filled: drums alternate big and
 *  snappy, everyone else climbs the scale from left to right. */
function auditionStep(monster: MonsterKind, col: number): number {
  return monster === 'boom' ? col % 2 : col % 8;
}

/** Who speaks for a row (the painting's row speaks with Bloop's voice). */
function voiceOf(row: Row): MonsterKind {
  return row.monster === 'paint' ? 'bloop' : row.monster;
}

/** A row's monster says hello on a block: the note for that spot, at once. */
function hello(row: Row, col: number) {
  if (row.kind === 'track') studio.hit(row.id, auditionStep(voiceOf(row), col), { vel: 0.55 }, { record: false });
  else studio.hitMonster(voiceOf(row), auditionStep(voiceOf(row), col), 0.55);
}

/** Let the loop in a block be heard (its first two beats); the painting's row just says hello. */
function listen(row: Row, clipId: string | null, col: number) {
  if (row.kind === 'track' && clipId) studio.audition(row.id, clipId);
  else hello(row, col);
}

/** A row with nothing to play yet: its monster says how to make some. */
function noLoopHint(row: Row) {
  // A monster with a beat grid can make its loop right here (tap its picture); others record one.
  const track = getState().project.tracks.find((t) => t.id === row.id);
  const grid = canGrid(track, getState().project.loopBeats);
  say({
    text: grid ? `Tap ${row.label} to make a beat!` : `Record a loop for ${row.label} first!`,
    icon: grid ? 'wand' : 'record',
    monster: voiceOf(row),
  });
}

/** The playhead's star hops on each beat; the playing column's number bounces with it. */
function hop(grid: HTMLElement) {
  const bead = grid.querySelector<HTMLElement>('.playhead-bead');
  if (!bead || typeof bead.animate !== 'function') return;
  bead.animate([{ translate: '0 0' }, { translate: '0 -6px' }, { translate: '0 0' }], { duration: 160, easing: 'ease-out', id: 'bead-hop' });
  grid.querySelector<HTMLElement>('.col-num[data-now="true"]')?.animate([{ scale: '1' }, { scale: '1.18' }, { scale: '1' }], { duration: 160, easing: 'ease-out' });
}

interface Drag {
  pointerId: number;
  rowId: string;
  startCol: number;
  startFilled: boolean;
  mode: 'pending' | 'fill' | 'move';
  x0: number;
  y0: number;
  gesture: string;
  lastCol: number;
  /** The loop the last filled spot got (heard when the finger lifts). */
  filled: string | null;
  /** A held block starts its preview; a quick tap only pops (no cut-off fragment first). */
  listenTimer: ReturnType<typeof setTimeout> | null;
}

/** How long a finger rests on a block before it is heard. */
const LISTEN_HOLD_MS = 120;

export function BlocksScreen() {
  const project = useApp((s) => s.project);
  const caps = useCaps();
  const gridRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<{ rowId: string; col: number; x: number; y: number } | null>(null);
  // The one block keyboards and switches land on (roving tab stop).
  const [focus, setFocus] = useState<{ rowId: string; col: number } | null>(null);
  const rows = rowsOf(project);
  const cols = project.arrangement.length;
  const tabRow = rows.find((r) => r.id === focus?.rowId)?.id ?? rows[0]?.id;
  const tabCol = Math.max(0, Math.min(cols - 1, focus?.col ?? 0));

  // Playhead: highlight the block column that is playing, fill its blocks as
  // the loop goes by (--in-col), and hop the playhead's star on every beat.
  useEffect(() => {
    let lastBeat = -1;
    return onFrame((p) => {
      const grid = gridRef.current;
      if (!grid) return;
      const song = p.playing && p.mode === 'song' && p.beat >= 0;
      const col = song ? Math.floor(p.beat / p.loopBeats) : -1;
      const frac = song ? Math.min(1, Math.max(0, p.beat / p.songBeats)) : 0;
      if (grid.dataset.col !== String(col)) {
        grid.dataset.col = String(col);
        grid.querySelectorAll<HTMLElement>('[data-now="true"]').forEach((el) => (el.dataset.now = 'false'));
        if (col >= 0) grid.querySelectorAll<HTMLElement>(`[data-col="${col}"][data-cell], .col-num[data-c="${col}"]`).forEach((el) => (el.dataset.now = 'true'));
      }
      grid.style.setProperty('--playhead', frac.toFixed(4));
      grid.style.setProperty('--in-col', song ? ((p.beat % p.loopBeats) / p.loopBeats).toFixed(3) : '0');
      const beat = song ? Math.floor(p.beat) : -1;
      if (beat !== lastBeat) {
        lastBeat = beat;
        if (beat >= 0 && !isReducedMotion()) hop(grid);
      }
    });
  }, []);

  const cellFrom = (x: number, y: number): { rowId: string; col: number } | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cell]');
    if (!el) return null;
    return { rowId: el.dataset.row!, col: Number(el.dataset.col) };
  };

  const rowFor = (id: string) => rowsOf(getState().project).find((r) => r.id === id);

  /** Put the row's loop on an empty spot; returns the loop placed there (null if nothing changed). */
  const fill = (rowId: string, col: number, gesture: string, sing = true): string | null => {
    const row = rowFor(rowId);
    const p = getState().project;
    if (!row?.clipId || p.arrangement.rows[rowId]?.[col]) return null;
    // Usually the monster's loop; a song kept from Learn continues the tune (the phrase to the left).
    const value = clipForCell(p, rowId, col);
    if (!value) return null;
    commit((q) => (q.arrangement.rows[rowId]?.[col] ? q : { ...q, arrangement: setCell(q.arrangement, rowId, col, value) }), { coalesce: gesture });
    // A soft "hello" from the row's monster at once: a swipe across plays a little scale.
    if (sing) hello(row, col);
    return value;
  };

  /** Take a block away: the preview stops and the monster goes "pop". */
  const clear = (rowId: string, col: number) => {
    const row = rowFor(rowId);
    if (!commit((p) => (p.arrangement.rows[rowId]?.[col] ? { ...p, arrangement: setCell(p.arrangement, rowId, col, null) } : p))) return;
    studio.stopAudition();
    if (row) studio.chirp(voiceOf(row), 'pop');
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const hit = cellFrom(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();
    gridRef.current?.setPointerCapture?.(e.pointerId);
    const row = rowFor(hit.rowId);
    if (!row) return;
    if (!row.clipId) {
      noLoopHint(row);
      return;
    }
    const cell = getState().project.arrangement.rows[hit.rowId]?.[hit.col] ?? null;
    const gesture = `blocks-${e.pointerId}-${performance.now().toFixed(0)}`;
    const d: Drag = {
      pointerId: e.pointerId,
      rowId: hit.rowId,
      startCol: hit.col,
      startFilled: !!cell,
      mode: cell ? 'pending' : 'fill',
      x0: e.clientX,
      y0: e.clientY,
      gesture,
      lastCol: hit.col,
      filled: null,
      listenTimer: null,
    };
    drag.current = d;
    // Holding a block lets you hear it; a tap (lifting without moving) takes it away with a pop.
    if (cell) d.listenTimer = setTimeout(() => drag.current === d && listen(row, cell, hit.col), LISTEN_HOLD_MS);
    else d.filled = fill(hit.rowId, hit.col, gesture);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const hit = cellFrom(e.clientX, e.clientY);
    if (d.mode === 'fill') {
      if (hit && hit.rowId === d.rowId && hit.col !== d.lastCol) {
        d.lastCol = hit.col;
        d.filled = fill(d.rowId, hit.col, d.gesture) ?? d.filled;
      }
      return;
    }
    if (d.mode === 'pending' && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 12) {
      d.mode = 'move';
      setDragging({ rowId: d.rowId, col: d.startCol, x: e.clientX, y: e.clientY });
    }
    if (d.mode === 'move') {
      const ghost = ghostRef.current;
      if (ghost) ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      if (hit && hit.rowId === d.rowId) d.lastCol = hit.col;
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (d.listenTimer) clearTimeout(d.listenTimer);
    if (d.mode === 'pending') {
      clear(d.rowId, d.startCol);
    } else if (d.mode === 'move') {
      setDragging(null);
      if (d.lastCol !== d.startCol && commit((p) => ({ ...p, arrangement: moveCell(p.arrangement, d.rowId, d.startCol, d.lastCol) }))) {
        const row = rowFor(d.rowId);
        if (row) hello(row, d.lastCol);
      }
    } else if (d.filled && rowFor(d.rowId)?.kind === 'track') {
      // The finger lifts off what it placed: hear the loop that now lives there.
      studio.audition(d.rowId, d.filled);
    }
  };

  // ── Keyboards and switches ──
  const focusCell = (rowId: string, col: number) => {
    setFocus({ rowId, col });
    gridRef.current?.querySelector<HTMLElement>(`[data-cell][data-row="${CSS.escape(rowId)}"][data-col="${col}"]`)?.focus();
  };

  /** Enter / Space (and a switch's or screen reader's click): fill an empty spot, or clear a block. */
  const toggleCell = (rowId: string, col: number) => {
    const row = rowFor(rowId);
    if (!row) return;
    if (!row.clipId) {
      noLoopHint(row);
      return;
    }
    if (getState().project.arrangement.rows[rowId]?.[col]) {
      clear(rowId, col);
      return;
    }
    // One sound, not two: the placed loop is heard (the painting's row says hello).
    const placed = fill(rowId, col, `blocks-key-${performance.now().toFixed(0)}`, row.kind !== 'track');
    if (placed && row.kind === 'track') studio.audition(rowId, placed);
  };

  const onCellKey = (e: ReactKeyboardEvent<HTMLButtonElement>, rowId: string, col: number) => {
    const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const dy = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    const all = rowsOf(getState().project);
    if (e.shiftKey && dx) {
      // Shift+←/→ carries the block along its row (dropping on another block swaps them).
      const to = col + dx;
      const row = all.find((r) => r.id === rowId);
      if (!row || to < 0 || to >= cols || !getState().project.arrangement.rows[rowId]?.[col]) return;
      if (commit((p) => ({ ...p, arrangement: moveCell(p.arrangement, rowId, col, to) }))) hello(row, to);
      focusCell(rowId, to);
      return;
    }
    const r = Math.max(0, Math.min(all.length - 1, all.findIndex((x) => x.id === rowId) + dy));
    focusCell(all[r].id, Math.max(0, Math.min(cols - 1, col + dx)));
  };

  const draggingRow = dragging ? rows.find((r) => r.id === dragging.rowId) : null;
  // No loops yet: the blocks sit under the empty card, so Tab goes straight to its buttons.
  const noLoops = rows.every((r) => !r.clipId);
  // A song with no loops yet can start straight on Boom's beat grid.
  const beatTrack = project.tracks.find((t) => t.monster === 'boom' && canGrid(t, project.loopBeats));

  return (
    <section className="blocks" aria-label="Monster Blocks: arrange your song">
      <div
        ref={gridRef}
        className="blocks-grid"
        style={{ ['--cols' as string]: cols, ['--rows' as string]: rows.length }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-col="-1"
        role="group"
        aria-label="Song blocks"
      >
        <div className="blocks-head" aria-hidden>
          <span />
          {Array.from({ length: cols }, (_, c) => (
            <span key={c} className="col-num" data-c={c}>
              {c + 1}
            </span>
          ))}
        </div>
        {rows.map((row) => {
          const cells = project.arrangement.rows[row.id] ?? [];
          const track = project.tracks.find((t) => t.id === row.id);
          const clip = track ? activeClip(track) : null;
          // A block shows the loop it actually plays (learned songs have one per phrase).
          const cellClip = (c: number) => track?.clips.find((x) => x.id === cells[c]) ?? null;
          return (
            <div key={row.id} className="block-row" data-monster={row.monster} data-sleeping={row.sleeping} data-empty={!row.clipId}>
              <div className="row-head">
                <button
                  className="row-avatar"
                  aria-label={
                    row.clipId
                      ? `${row.label}: ${row.sleeping ? 'sleeping, tap to wake' : 'awake, tap to let it sleep'}`
                      : track && canGrid(track, project.loopBeats)
                        ? `${row.label} has no loop yet. Tap to make one right here.`
                        : `${row.label} has no loop yet. Tap to go and record one.`
                  }
                  onClick={() => {
                    if (!row.clipId && track) {
                      selectTrack(track.id);
                      setScreen('lab');
                      // Boom's empty row opens straight onto its beat grid.
                      if (canGrid(track, project.loopBeats)) setLabView('grid');
                      return;
                    }
                    if (row.kind === 'paint') commit((p) => togglePaintSleep(p));
                    else commit((p) => toggleSleep(p, row.id));
                  }}
                >
                  {row.kind === 'paint' ? (
                    <span className="paint-avatar">
                      <Icon name="brush" />
                    </span>
                  ) : (
                    <MonsterArt kind={track!.monster} className={row.sleeping ? 'is-asleep' : undefined} />
                  )}
                  {row.sleeping && <span className="row-zzz">z</span>}
                </button>
                {caps.rowMuteSolo && row.kind === 'track' && row.clipId && (
                  <button className="row-solo" data-on={row.solo} aria-pressed={row.solo} aria-label={`Solo ${row.label}`} onClick={() => commit((p) => toggleSolo(p, row.id))}>
                    S
                  </button>
                )}
              </div>
              {Array.from({ length: cols }, (_, c) => {
                const on = !!cells[c];
                const isDragged = dragging?.rowId === row.id && dragging.col === c;
                return (
                  <button
                    key={c}
                    type="button"
                    className="block"
                    data-cell
                    data-row={row.id}
                    data-col={c}
                    data-on={on}
                    data-dragged={isDragged}
                    tabIndex={!noLoops && row.id === tabRow && c === tabCol ? 0 : -1}
                    aria-label={`${row.label}, block ${c + 1}: ${on ? 'playing' : 'empty'}`}
                    onFocus={() => (focus?.rowId !== row.id || focus.col !== c) && setFocus({ rowId: row.id, col: c })}
                    onKeyDown={(e) => onCellKey(e, row.id, c)}
                    // Fingers and mice use the grid's pointer handlers; only keyboard and switch clicks (detail 0) land here.
                    onClick={(e) => e.detail === 0 && toggleCell(row.id, c)}
                  >
                    {on && row.kind === 'track' && (cellClip(c) ?? clip) && <ClipThumb clip={(cellClip(c) ?? clip)!} monster={track!.monster} />}
                    {on && row.kind === 'paint' && <PaintThumb painting={project.painting} />}
                    {!on && <span className="block-plus" aria-hidden>+</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
        <div className="playhead" aria-hidden>
          <i className="playhead-bead" />
        </div>
      </div>
      {dragging && draggingRow && (
        <div
          ref={ghostRef}
          className="block-ghost"
          data-monster={draggingRow.monster}
          style={{ transform: `translate(${dragging.x}px, ${dragging.y}px)` }}
          aria-hidden
        >
          <span />
        </div>
      )}
      {noLoops && (
        <div className="blocks-empty">
          <MonsterArt kind="bloop" />
          <p>Make a loop in the Lab first — then build your song here!</p>
          <div className="blocks-empty-go">
            <button className="btn-primary" onClick={() => setScreen('lab')}>
              Go to the Lab
            </button>
            {/* No words needed: Boom and the stones open Boom's beat grid, ready for a first stone. */}
            {beatTrack && (
              <button
                className="blocks-empty-beat"
                aria-label="Make a beat with Boom"
                onClick={() => {
                  selectTrack(beatTrack.id);
                  setScreen('lab');
                  setLabView('grid');
                }}
              >
                <MonsterArt kind="boom" />
                <Icon name="grid" />
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
