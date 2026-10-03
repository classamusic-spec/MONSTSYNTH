import { memo, type CSSProperties } from 'react';
import type { CellState, CellView } from '../../magic/steps';
import { DRUM_PADS } from '../../model/monsters';
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

export interface DrumRowProps {
  r: number;
  pad: number;
  cells: CellView[];
  /** Changes whenever anything this row draws changes (rows re-render only then). */
  sig: string;
  beatsPerBar: number;
  /** Column holding the keyboard focus in this row (-1: none). */
  focusCol: number;
  /** Empty grid: the big drum's bar-start stones shimmer. */
  invite: boolean;
  register: (r: number, c: number, el: HTMLDivElement | null) => void;
}

function Stone({ pad, c, cell, beatsPerBar, focused, invite, name, register, r }: { pad: number; c: number; cell: CellView; beatsPerBar: number; focused: boolean; invite: boolean; name: string; register: DrumRowProps['register']; r: number }) {
  const lit = cell.state === 'one' || cell.state === 'double';
  return (
    <div
      ref={(el) => register(r, c, el)}
      role="gridcell"
      className="stone"
      data-row={r}
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
  function DrumRow({ r, pad, cells, beatsPerBar, focusCol, invite, register }: DrumRowProps) {
    const name = DRUM_PADS[pad]?.name ?? 'Drum';
    return (
      <div role="row" className="drum-row" data-row={r} data-pad={pad} style={{ ['--k' as string]: `var(--key-${DRUM_COLORS[pad] ?? 0})` } as CSSProperties}>
        <div role="gridcell" className="drum-head" data-row={r} aria-label={name}>
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
    a.sig === b.sig && a.r === b.r && a.pad === b.pad && a.beatsPerBar === b.beatsPerBar && a.focusCol === b.focusCol && a.invite === b.invite && a.register === b.register,
);

/** Everything a row draws, as a string (cheap to compare). */
export function rowSignature(cells: CellView[]): string {
  return cells.map((c) => `${c.state}${c.subs.join('')}:${c.vel.toFixed(2)}`).join('|');
}

/**
 * Monster Makers' "+": the drums that have no row yet. Each one plays when
 * touched, and its row appears (while the grid is open; a row with stones stays).
 */
export function AddRowPicker({ pads, onPick, onClose }: { pads: number[]; onPick: (pad: number) => void; onClose: () => void }) {
  return (
    <div className="grid-picker" role="group" aria-label="More drums">
      {pads.map((pad) => (
        <button
          key={pad}
          className="picker-pad"
          style={{ ['--k' as string]: `var(--key-${DRUM_COLORS[pad] ?? 0})` } as CSSProperties}
          aria-label={`Add ${DRUM_PADS[pad].name}`}
          onClick={() => onPick(pad)}
        >
          <DrumIcon pad={pad} />
        </button>
      ))}
      <button className="picker-close" aria-label="Close" onClick={onClose}>
        <Icon name="close" />
      </button>
    </div>
  );
}
