import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { moveCell, setCell } from '../../magic/arrange';
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
//   tap an empty spot  → the monster's loop plays there
//   tap a block        → it goes away
//   swipe across       → fill several spots at once
//   drag a block       → move it (drop on another block to swap)
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
}

export function BlocksScreen() {
  const project = useApp((s) => s.project);
  const caps = useCaps();
  const gridRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<{ rowId: string; col: number; x: number; y: number } | null>(null);
  const rows = rowsOf(project);
  const cols = project.arrangement.length;

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

  const fill = (rowId: string, col: number, gesture: string) => {
    const row = rowFor(rowId);
    if (!row?.clipId) return;
    const value = row.clipId;
    if (getState().project.arrangement.rows[rowId]?.[col]) return;
    commit((p) => (p.arrangement.rows[rowId]?.[col] ? p : { ...p, arrangement: setCell(p.arrangement, rowId, col, value) }), { coalesce: gesture });
    // A soft "hello" from the row's monster: a swipe across plays a little scale.
    if (row.kind === 'track' && row.monster !== 'paint') studio.hit(row.id, auditionStep(row.monster, col), { vel: 0.55 }, { record: false });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const hit = cellFrom(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();
    gridRef.current?.setPointerCapture?.(e.pointerId);
    const row = rowFor(hit.rowId);
    if (!row) return;
    if (!row.clipId) {
      // A monster with a beat grid can make its loop right here (tap its picture); others record one.
      const track = getState().project.tracks.find((t) => t.id === row.id);
      const grid = canGrid(track, getState().project.loopBeats);
      say({
        text: grid ? `Tap ${row.label} to make a beat!` : `Record a loop for ${row.label} first!`,
        icon: grid ? 'wand' : 'record',
        monster: row.monster === 'paint' ? 'bloop' : row.monster,
      });
      return;
    }
    const filled = !!getState().project.arrangement.rows[hit.rowId]?.[hit.col];
    const gesture = `blocks-${e.pointerId}-${performance.now().toFixed(0)}`;
    drag.current = { pointerId: e.pointerId, rowId: hit.rowId, startCol: hit.col, startFilled: filled, mode: filled ? 'pending' : 'fill', x0: e.clientX, y0: e.clientY, gesture, lastCol: hit.col };
    if (!filled) fill(hit.rowId, hit.col, gesture);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const hit = cellFrom(e.clientX, e.clientY);
    if (d.mode === 'fill') {
      if (hit && hit.rowId === d.rowId && hit.col !== d.lastCol) {
        d.lastCol = hit.col;
        fill(d.rowId, hit.col, d.gesture);
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
    if (d.mode === 'pending') {
      commit((p) => ({ ...p, arrangement: setCell(p.arrangement, d.rowId, d.startCol, null) }));
    } else if (d.mode === 'move') {
      setDragging(null);
      if (d.lastCol !== d.startCol) commit((p) => ({ ...p, arrangement: moveCell(p.arrangement, d.rowId, d.startCol, d.lastCol) }));
    }
  };

  const draggingRow = dragging ? rows.find((r) => r.id === dragging.rowId) : null;

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
                  <div
                    key={c}
                    className="block"
                    data-cell
                    data-row={row.id}
                    data-col={c}
                    data-on={on}
                    data-dragged={isDragged}
                    role="button"
                    aria-label={`${row.label}, block ${c + 1}: ${on ? 'playing' : 'empty'}`}
                  >
                    {on && row.kind === 'track' && (cellClip(c) ?? clip) && <ClipThumb clip={(cellClip(c) ?? clip)!} monster={track!.monster} />}
                    {on && row.kind === 'paint' && <PaintThumb painting={project.painting} />}
                    {!on && <span className="block-plus">+</span>}
                  </div>
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
      {rows.every((r) => !r.clipId) && (
        <div className="blocks-empty">
          <MonsterArt kind="bloop" />
          <p>Make a loop in the Lab first — then build your song here!</p>
          <button className="btn-primary" onClick={() => setScreen('lab')}>
            Go to the Lab
          </button>
        </div>
      )}
    </section>
  );
}
