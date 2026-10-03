import { memo, type CSSProperties } from 'react';
import { BEAD_KEYS, cellOf, melodicRows, type CellState, type CellView, type GridProjection } from '../../magic/steps';
import { MONSTERS, type KeyGlyph as Glyph } from '../../model/monsters';
import type { NoteEvent } from '../../model/types';
import { colTrack } from './BeatRuler';
import type { GridGeometry, GridLane, LaneRowProps, RegisterCell } from './DrumRows';
import { KeyGlyph, KeyName } from './glyphs';

// The melodic monsters' side of Beat Hop: the bead lane. The eight keys turned
// sideways into eight bands of their colours (key 1 at the bottom), one column
// per beat. A bead is the monster's key picture in its band's colour, so a bead
// can never be out of key. Puff's beads trail a soft tail as long as they ring,
// and one dotted line joins the beads, showing the tune's shape. Each band's
// head is a mini key that plays its note (with its name sticker when names are
// on). Touches are handled by StepGrid (one handler, maths hit-testing):
//   tap an empty spot → a bead (Little Monsters: one per beat, so it jumps there)
//   tap a bead        → it pops away
//   drag a bead       → up or down through the keys, sounding each one
//   drag sideways     → draws a tune, a bead in every beat the finger crosses

const SAYS: Record<CellState, string> = { off: 'off', one: 'on', double: 'on twice', custom: 'a little' };

/** The key colour of a band (a band above the eight keys reuses the colours). */
export const bandColor = (step: number) => `var(--key-${((step % BEAD_KEYS) + BEAD_KEYS) % BEAD_KEYS})`;

function Spot({ r, step, c, cell, beatsPerBar, focused, invite, label, glyph, register }: { r: number; step: number; c: number; cell: CellView; beatsPerBar: number; focused: boolean; invite: boolean; label: string; glyph: Glyph; register: RegisterCell }) {
  const whole = cell.state === 'one';
  return (
    <div
      ref={(el) => register(step, c, el)}
      role="gridcell"
      className="bead-spot"
      data-row={r}
      data-step={step}
      data-col={c}
      data-state={cell.state}
      data-strong={(c % beatsPerBar) % 2 === 0}
      data-invite={invite && step === 3 && c % beatsPerBar === 0}
      aria-selected={cell.state !== 'off'}
      aria-label={`${label}, beat ${c + 1}, ${SAYS[cell.state]}`}
      tabIndex={focused ? 0 : -1}
      style={{ gridColumn: colTrack(c, beatsPerBar), ['--c' as string]: c, ['--v' as string]: whole ? cell.vel.toFixed(2) : 1 } as CSSProperties}
    >
      <i className="spot-dot" />
      <span className="bead-face">
        {whole && (
          <span className="bead">
            <KeyGlyph glyph={glyph} index={0} count={1} />
          </span>
        )}
        {/* Notes off the beat (played live) show as small beads where they really are. */}
        {cell.state !== 'off' && !whole && (
          <span className="bead-subs">
            {cell.subs.map((s) => (
              <i key={s} style={{ ['--s' as string]: s } as CSSProperties} />
            ))}
          </span>
        )}
      </span>
    </div>
  );
}

export const BeadBand = memo(
  function BeadBand({ r, step, cells, beatsPerBar, focusCol, invite, register, monster, name, nameStyle, label }: LaneRowProps) {
    const glyph = MONSTERS[monster].glyph;
    return (
      <div role="row" className="bead-band" data-grid-row data-row={r} data-step={step} style={{ ['--k' as string]: bandColor(step) } as CSSProperties}>
        <span className="band-tint" aria-hidden />
        {/* The key turned sideways: a touch (or Enter) plays it; nothing is written. */}
        <div ref={(el) => register(step, -1, el)} role="gridcell" className="bead-head" data-grid-head data-row={r} data-step={step} data-col={-1} aria-label={`Play ${label}`} tabIndex={focusCol === -1 ? 0 : -1}>
          <span className="row-key" data-names={!!name}>
            <KeyGlyph glyph={glyph} index={0} count={1} />
            {name && <KeyName name={name} style={nameStyle} className="bead-name" />}
          </span>
        </div>
        {cells.map((cell, c) => (
          <Spot key={c} r={r} step={step} c={c} cell={cell} beatsPerBar={beatsPerBar} focused={focusCol === c} invite={invite} label={label} glyph={glyph} register={register} />
        ))}
      </div>
    );
  },
  (a, b) =>
    a.sig === b.sig &&
    a.r === b.r &&
    a.step === b.step &&
    a.beatsPerBar === b.beatsPerBar &&
    a.focusCol === b.focusCol &&
    a.invite === b.invite &&
    a.register === b.register &&
    a.monster === b.monster &&
    a.name === b.name &&
    a.nameStyle === b.nameStyle &&
    a.label === b.label,
);

// ── The ink: tails and the tune's shape, drawn over the bands ──────────────
// Imperative (it needs measured positions); redrawn when the notes or the
// sizes change, never per frame.

const SVG = 'http://www.w3.org/2000/svg';

/** Where a cell's bead is drawn: a whole bead in the middle, a small one at its quarter (as in CSS). */
function beadX(at: GridGeometry, col: number, cell: CellView): number {
  const c = at.cols[col];
  if (cell.state === 'one') return (c.l + c.r) / 2;
  return c.l + (0.125 + (cell.subs[0] ?? 0) * 0.25) * (c.r - c.l);
}

/** x of a beat anywhere along the loop (between beat centres, the bar gap included). */
function beatX(at: GridGeometry, beat: number): number {
  const n = at.cols.length;
  const mid = (i: number) => (i < n ? (at.cols[i].l + at.cols[i].r) / 2 : (at.cols[n - 1].l + at.cols[n - 1].r) / 2 + (i - n + 1) * ((at.cols[n - 1].r - at.cols[0].l) / n));
  const i = Math.max(0, Math.floor(beat));
  return mid(i) + (beat - i) * (mid(i + 1) - mid(i));
}

function bandY(at: GridGeometry, step: number): number | null {
  const row = at.rows.find((r) => r.step === step);
  return row ? (row.t + row.b) / 2 : null;
}

function paintBeadInk(svg: SVGSVGElement, at: GridGeometry, grid: GridProjection, notes: readonly NoteEvent[], lengthBeats: number, sustain: boolean) {
  const w = at.box.width;
  const h = at.box.height;
  svg.setAttribute('viewBox', `0 0 ${w.toFixed(1)} ${h.toFixed(1)}`);
  svg.setAttribute('width', w.toFixed(1));
  svg.setAttribute('height', h.toFixed(1));
  const ox = at.box.left;
  const oy = at.box.top;
  const tails = svg.querySelector('.bead-tails');
  const line = svg.querySelector('.bead-contour');
  if (!tails || !line || at.cols.length === 0) return;
  const L = lengthBeats;
  const firstL = at.cols[0].l;
  const lastR = at.cols[at.cols.length - 1].r;
  const band = at.rows.length > 0 ? at.rows[0].b - at.rows[0].t : 0;
  const tail = Math.max(6, band * 0.42);

  // Tails: a held note's soft trail from its bead to where it stops (round the loop's end too).
  const paths: string[] = [];
  const colours: string[] = [];
  if (sustain) {
    for (const n of notes) {
      const y = bandY(at, n.step);
      if (y === null || n.dur < 1 - 1e-9) continue;
      const { col, sub } = cellOf(n.beat, L);
      const r = grid.rows.indexOf(n.step);
      const cell = r >= 0 ? grid.cells[r][col] : null;
      if (!cell) continue;
      const x0 = beadX(at, col, cell.state === 'one' ? cell : { ...cell, subs: [sub] });
      const start = col + sub * 0.25;
      const end = start + Math.min(n.dur, L);
      const seg = (a: number, b: number) => {
        paths.push(`M${(a - ox).toFixed(1)} ${(y - oy).toFixed(1)}H${(b - ox).toFixed(1)}`);
        colours.push(bandColor(n.step));
      };
      // A tail never reaches past the loop's last beat: one that rings round the end goes on from beat 1.
      const cap = (x: number) => Math.min(x, lastR - tail / 2);
      if (end <= L + 1e-9) seg(x0, cap(beatX(at, end)));
      else {
        seg(x0, cap(lastR));
        seg(firstL + tail / 2, cap(beatX(at, end - L)));
      }
    }
  }
  tails.replaceChildren(
    ...paths.map((d, i) => {
      const p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', d);
      p.setAttribute('style', `--k:${colours[i]}`);
      return p;
    }),
  );
  (tails as SVGGElement).style.setProperty('--tail', `${tail.toFixed(1)}px`);

  // The tune's shape: the top bead of each beat, joined left to right.
  const pts: string[] = [];
  for (let c = 0; c < grid.cols; c++) {
    const r = grid.cells.findIndex((row) => row[c].state !== 'off');
    if (r < 0) continue;
    const y = bandY(at, grid.rows[r]);
    if (y === null || !at.cols[c]) continue;
    pts.push(`${(beadX(at, c, grid.cells[r][c]) - ox).toFixed(1)},${(y - oy).toFixed(1)}`);
  }
  line.setAttribute('points', pts.length > 1 ? pts.join(' ') : '');
}

/** The bead lane of a melodic monster: eight key bands (more only if a loop plays higher), never folded. */
export const BEAD_LANE: GridLane = {
  kind: 'beads',
  base: () => melodicRows(),
  rows: (notes, _lengthBeats, _caps, kept) => {
    const rows = melodicRows(notes);
    return [...new Set([...rows, ...kept])].sort((a, b) => b - a);
  },
  folds: false,
  rowDefault: () => 'one',
  // A tap puts a bead on an empty spot and takes a bead (even a small, off-the-beat one) away.
  target: (state) => (state === 'off' ? 'one' : 'off'),
  sustain: (monster) => MONSTERS[monster].sustain,
  Row: BeadBand,
  ink: paintBeadInk,
};
