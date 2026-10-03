import { memo } from 'react';
import type { MonsterKind } from '../../model/types';
import { MonsterArt } from '../monsters/MonsterArt';
import { star5 } from '../monsters/shapes';

// Beat Hop's ruler: one dot per beat (the same beats as the dots around Play
// and one block in Monster Blocks), a star where each bar starts, bigger dots
// on beats 1 and 3, and beat numbers for Monster Makers. A mini monster hops
// along it on the beat (StepGrid moves it imperatively; it never re-renders).

/** Grid track of beat `col` (a wider gap after each bar). Column 1 is the row heads. */
export function colTrack(col: number, beatsPerBar: number): number {
  return 2 + col + Math.floor(col / beatsPerBar);
}

/** `grid-template-columns` for the rows: heads, then the beats with a bar gap between bars. */
export function gridTemplate(cols: number, beatsPerBar: number): string {
  const parts = ['var(--head)'];
  for (let c = 0; c < cols; c++) {
    if (c > 0 && c % beatsPerBar === 0) parts.push('var(--bar-gap)');
    parts.push('minmax(0, 1fr)');
  }
  return parts.join(' ');
}

export const BeatRuler = memo(function BeatRuler({ cols, beatsPerBar, numbers, monster }: { cols: number; beatsPerBar: number; numbers: boolean; monster: MonsterKind }) {
  return (
    <div className="grid-ruler" aria-hidden>
      <span className="ruler-corner" />
      {Array.from({ length: cols }, (_, c) => {
        const inBar = c % beatsPerBar;
        return (
          <span key={c} className="ruler-slot" data-col={c} data-bar={inBar === 0} data-strong={inBar % 2 === 0} style={{ gridColumn: colTrack(c, beatsPerBar) }}>
            {inBar === 0 ? (
              <svg className="ruler-star" viewBox="0 0 20 20">
                <path d={star5(10, 10.6, 9.5)} />
              </svg>
            ) : (
              <i className="ruler-dot" />
            )}
            {numbers && <b className="ruler-num">{c + 1}</b>}
          </span>
        );
      })}
      <span className="hopper" data-monster={monster}>
        <MonsterArt kind={monster} />
      </span>
    </div>
  );
});
