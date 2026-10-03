import { memo, useEffect, useRef, type ComponentType, type CSSProperties } from 'react';
import type { NoteName } from '../../magic/noteNames';
import { drumRows, nextTarget, type CellState, type CellTarget, type CellView, type GridProjection } from '../../magic/steps';
import { DRUM_PADS, type ModeCaps } from '../../model/monsters';
import type { MonsterKind, NoteEvent, NoteNameStyle } from '../../model/types';
import { Icon } from '../icons/Icon';
import { colTrack } from './BeatRuler';
import { DRUM_COLORS, DrumIcon } from './glyphs';

// Boom's side of Beat Hop: one row per drum (its picture on its pad colour at
// the head), one stepping stone per beat. A dark stone is a socket showing the
// drum's silhouette; a lit stone is a little key (same gradient and lip) that
// grows with how loud it is, with one pip for a hit and two for a double.
// Hits off the beat (live playing, wand grooves) show as small stones where
// they really are. Touches are handled by StepGrid (one handler, maths hit-testing).

const SAYS: Record<CellState, string> = { off: 'off', one: 'on', double: 'on twice', custom: 'a little' };

/** Registers a cell's element under its row's step (drum pad) and column; -1 is the row head. */
export type RegisterCell = (step: number, col: number, el: HTMLDivElement | null) => void;

export interface LaneRowProps {
  r: number;
  /** The row's drum pad (or, for a bead lane, its scale step). */
  step: number;
  cells: CellView[];
  /** Changes whenever anything this row draws changes (rows re-render only then). */
  sig: string;
  beatsPerBar: number;
  /** Column holding the keyboard focus in this row (-1: the row head; null: none). */
  focusCol: number | null;
  /** Empty grid: the big drum's bar-start stones (or the middle band's bar-start spots) shimmer. */
  invite: boolean;
  register: RegisterCell;
  /** The monster in the spotlight (the bead lane draws its key glyph). */
  monster: MonsterKind;
  /** Bead lane: the key's name sticker (null: names off, or a recorded voice). Drums name themselves. */
  name: NoteName | null;
  nameStyle: NoteNameStyle;
  /** Bead lane: what the row says out loud ('Bloop: E'). */
  label: string;
}

/** Where a grid's cells are on screen (measured; client coordinates). */
export interface GridGeometry {
  cols: { l: number; r: number }[];
  rows: { t: number; b: number; step: number }[];
  headR: number;
  rulerB: number;
  box: DOMRect;
}

/**
 * What a grid face needs from its kind of rows: Boom's drum rows, or the bead
 * lane of a melodic monster. Rows and heads carry data-grid-row /
 * data-grid-head, and rows, heads and cells data-step and data-col, so
 * StepGrid measures and focuses any lane the same way.
 */
export interface GridLane {
  /** Drums (tap, cycle, paint and erase stones) or beads (tap, drag and draw a tune). */
  kind: 'drums' | 'beads';
  /** The rows every loop shows in this mode (they never fold). */
  base(caps: ModeCaps): readonly number[];
  /** Every row this loop has, top to bottom (`kept`: extra rows already on screen this visit). */
  rows(notes: readonly NoteEvent[], lengthBeats: number, caps: ModeCaps, kept: readonly number[]): number[];
  /** Rows beyond what fits at a finger's size fold behind a '+N' chip (drums; bead bands never fold). */
  folds: boolean;
  /** What a swipe paints onto a dark cell. */
  rowDefault(step: number, caps: ModeCaps): 'one' | 'double';
  /** What a tap (or Enter) turns a cell into. */
  target(state: CellState, step: number, caps: ModeCaps): CellTarget;
  /** Long notes ring on through the next cells (a sustained monster's tails). */
  sustain(monster: MonsterKind): boolean;
  Row: ComponentType<LaneRowProps>;
  /** Lane-wide drawing over the rows (the bead lane's tails and melody line), redrawn imperatively. */
  ink?(svg: SVGSVGElement, at: GridGeometry, grid: GridProjection, notes: readonly NoteEvent[], lengthBeats: number, sustain: boolean): void;
}

function Stone({ pad, c, cell, beatsPerBar, focused, invite, name, register, r }: { pad: number; c: number; cell: CellView; beatsPerBar: number; focused: boolean; invite: boolean; name: string; register: RegisterCell; r: number }) {
  const lit = cell.state === 'one' || cell.state === 'double';
  return (
    <div
      ref={(el) => register(pad, c, el)}
      role="gridcell"
      className="stone"
      data-row={r}
      data-step={pad}
      data-pad={pad}
      data-col={c}
      data-state={cell.state}
      data-strong={(c % beatsPerBar) % 2 === 0}
      data-invite={invite && pad === 0 && c % beatsPerBar === 0}
      aria-selected={cell.state !== 'off'}
      aria-label={`${name}, beat ${c + 1}, ${SAYS[cell.state]}`}
      tabIndex={focused ? 0 : -1}
      style={{ gridColumn: colTrack(c, beatsPerBar), ['--c' as string]: c, ['--v' as string]: lit ? cell.vel.toFixed(2) : 1 } as CSSProperties}
    >
      <span className="stone-socket">
        <DrumIcon pad={pad} />
      </span>
      <span className="stone-face">
        <span className="stone-lit">
          <DrumIcon pad={pad} />
          <span className="stone-pips">
            <i />
            {cell.state === 'double' && <i />}
          </span>
        </span>
        {cell.state === 'custom' && (
          <span className="stone-subs">
            {cell.subs.map((s) => (
              <i key={s} style={{ ['--s' as string]: s } as CSSProperties} />
            ))}
          </span>
        )}
      </span>
    </div>
  );
}

export const DrumRow = memo(
  function DrumRow({ r, step: pad, cells, beatsPerBar, focusCol, invite, register }: LaneRowProps) {
    const name = DRUM_PADS[pad]?.name ?? 'Drum';
    return (
      <div role="row" className="drum-row" data-grid-row data-row={r} data-step={pad} data-pad={pad} style={{ ['--k' as string]: `var(--key-${DRUM_COLORS[pad] ?? 0})` } as CSSProperties}>
        {/* The drum's picture: a touch (or Enter) plays it; nothing is written. */}
        <div ref={(el) => register(pad, -1, el)} role="gridcell" className="drum-head" data-grid-head data-row={r} data-step={pad} data-pad={pad} data-col={-1} aria-label={`Play ${name}`} tabIndex={focusCol === -1 ? 0 : -1}>
          <span className="row-pad">
            <DrumIcon pad={pad} />
          </span>
        </div>
        {cells.map((cell, c) => (
          <Stone key={c} r={r} pad={pad} c={c} cell={cell} beatsPerBar={beatsPerBar} focused={focusCol === c} invite={invite} name={name} register={register} />
        ))}
      </div>
    );
  },
  (a, b) =>
    a.sig === b.sig && a.r === b.r && a.step === b.step && a.beatsPerBar === b.beatsPerBar && a.focusCol === b.focusCol && a.invite === b.invite && a.register === b.register,
);

/** Boom's lane: base rows of the mode, every drum the loop plays, and every row already shown this visit. */
const drumDefault = (pad: number, caps: ModeCaps) => (caps.gridCellStates === 2 && pad === 2 ? 'double' : 'one');

export const DRUM_LANE: GridLane = {
  kind: 'drums',
  base: (caps) => caps.gridDrumRows,
  rows: (notes, lengthBeats, caps, kept) => drumRows({ id: '', lengthBeats, notes: [...notes] }, caps.gridDrumRows, kept),
  folds: true,
  rowDefault: drumDefault,
  target: (state, pad, caps) => nextTarget(state, { states: caps.gridCellStates, rowDefault: drumDefault(pad, caps) }),
  sustain: () => false,
  Row: DrumRow,
};

/** Everything a row draws, as a string (cheap to compare). */
export function rowSignature(cells: CellView[]): string {
  return cells.map((c) => `${c.state}${c.subs.join('')}:${c.vel.toFixed(2)}`).join('|');
}

/**
 * The '+' (or '+N') tray: drums folded away for lack of room come first, each
 * with a lit dot (they hold stones and keep playing), then (Monster Makers)
 * the drums that have no row yet. Each one plays when touched, and its row
 * appears; rows stay while the grid is open.
 */
export function AddRowPicker({
  folded,
  spare,
  focusFirst,
  onPick,
  onClose,
}: {
  folded: number[];
  spare: number[];
  /** Opened from a keyboard: focus moves into the tray (Escape closes it). */
  focusFirst: boolean;
  onPick: (pad: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusFirst) ref.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }, [focusFirst]);
  return (
    <div
      ref={ref}
      className="grid-picker"
      role="group"
      aria-label="More drums"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      {[...folded, ...spare].map((pad) => {
        const has = folded.includes(pad);
        return (
          <button
            key={pad}
            className="picker-pad"
            data-has={has}
            style={{ ['--k' as string]: `var(--key-${DRUM_COLORS[pad] ?? 0})` } as CSSProperties}
            aria-label={`${has ? 'Show' : 'Add'} ${DRUM_PADS[pad].name}`}
            onClick={() => onPick(pad)}
          >
            <DrumIcon pad={pad} />
          </button>
        );
      })}
      <button className="picker-close" aria-label="Close" onClick={onClose}>
        <Icon name="close" />
      </button>
    </div>
  );
}

/** The '+' button's face: a plus, or (rows folded away) peeks of those drums and how many. */
export function AddFace({ folded }: { folded: number[] }) {
  if (folded.length === 0) return <Icon name="plus" />;
  return (
    <>
      <span className="add-peek" aria-hidden>
        {folded.slice(0, 2).map((pad) => (
          <i key={pad} style={{ ['--k' as string]: `var(--key-${DRUM_COLORS[pad] ?? 0})` } as CSSProperties}>
            <DrumIcon pad={pad} />
          </i>
        ))}
      </span>
      <b className="add-count" aria-hidden>
        +{folded.length}
      </b>
    </>
  );
}
