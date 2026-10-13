import { useEffect, type RefObject } from 'react';
import { noteRow, singGate } from '../../magic/curtain';
import type { MonsterKind } from '../../model/types';
import { PAINT_ROW } from '../../model/types';
import { getState } from '../../store/store';
import { onNote } from '../../studio/visualBus';
import { isReducedMotion } from '../hooks/useCaps';
import { liteVisuals, reactToNote } from '../monsters/react';

// ─────────────────────────────────────────────────────────────────────────────
// Monster Blocks: the row heads sing their own notes. While a song plays (and
// for every hello, preview and pop) the monster at the head of the row squashes,
// opens its mouth and widens its eyes on each of its notes, the same way it
// sings on the Lab's stage, so a child sees who is making which sound.
//   · one listener for the whole grid, imperative (never React state per note)
//   · a row reacts at most every 90 ms (dense hi-hats), Boom's big drum always
//   · sleeping rows stay asleep (a preview of a sleeping row never opens its eyes)
//   · painting notes light the painting's row, even when they borrow a monster's voice
//   · slow devices get one composited bounce per note (liteVisuals)
// ─────────────────────────────────────────────────────────────────────────────

export function useSingingRows(gridRef: RefObject<HTMLElement | null>) {
  // Demos open straight onto Blocks: start watching the frame budget here too.
  useEffect(() => void liteVisuals(), []);

  useEffect(() => {
    const last = new Map<string, number>();
    return onNote((v) => {
      const grid = gridRef.current;
      const rowId = noteRow(v);
      if (!grid || !rowId) return;
      const row = grid.querySelector<HTMLElement>(`.block-row[data-track="${CSS.escape(rowId)}"]`);
      if (!row || row.dataset.sleeping === 'true') return;
      const now = performance.now();
      if (!singGate(last.get(rowId), now, v.monster === 'boom' && v.step === 0)) return;
      last.set(rowId, now);
      const avatar = row.querySelector<HTMLElement>('.row-avatar');
      if (!avatar) return;
      const reduced = isReducedMotion();
      if (rowId === PAINT_ROW) {
        pulse(avatar.querySelector('.paint-avatar'), reduced);
        return;
      }
      reactToNote(avatar, v, { monster: (row.dataset.monster as MonsterKind) ?? v.monster, echo: 0, gloop: 0, tempo: getState().project.tempo, reduced });
    });
  }, [gridRef]);
}

/** The painting's row has no face: its rainbow badge pulses with each note (a composited scale). */
function pulse(el: Element | null, reduced: boolean) {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return;
  const s = reduced ? 1.04 : 1.14;
  (el as HTMLElement).animate([{ scale: '1' }, { scale: String(s) }, { scale: '1' }], { duration: 200, easing: 'ease-out', id: 'row-sing' });
}
