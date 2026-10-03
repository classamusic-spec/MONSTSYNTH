import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { isTidy } from '../../magic/steps';
import { MODE_CAPS } from '../../model/monsters';
import { activeClip } from '../../model/project';
import type { Track } from '../../model/types';
import { setLabView } from '../../store/actions';
import { canGrid, useApp, type LabView } from '../../store/store';
import { studio } from '../../studio/studio';
import { onFrame } from '../../studio/visualBus';
import { isReducedMotion } from '../hooks/useCaps';
import { Icon } from '../icons/Icon';
import { PodTools } from './PodTools';

// The play surface's side column, on both faces: the flip button that turns the
// keys over into Beat Hop's grid (and back), and the tidy magnet whenever the
// loop has notes off the grid. Phones also keep the monster's sound toys here
// (tall screens have them in the stage toolbar), so it is one column of buttons.

/** The flip button invites once per session, the first time Boom is on the keys. */
let flipInvited = false;

/** The flip icon's middle stones blink on every beat the band plays (no React state per beat). */
function useBeatBlink(ref: RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    if (!on) return;
    let last = -1;
    return onFrame((p) => {
      const beat = p.playing && p.beat >= 0 ? Math.floor(p.beat) : -1;
      if (beat === last) return;
      last = beat;
      const el = ref.current;
      if (beat < 0 || !el || isReducedMotion() || typeof el.animate !== 'function') return;
      el.querySelectorAll('.icon-beat').forEach((dot) =>
        dot.animate([{ fill: '#ffe066', scale: '1.3' }, { fill: 'currentColor', scale: '1' }], { duration: 260, easing: 'ease-out' }),
      );
    });
  }, [ref, on]);
}

export function SurfaceSide({ track, face, extra }: { track: Track; face: LabView; extra?: ReactNode }) {
  const mode = useApp((s) => s.settings.ageMode);
  const loopBeats = useApp((s) => s.project.loopBeats);
  const caps = MODE_CAPS[mode];
  const clip = activeClip(track);
  const grid = track.monster === 'boom' ? caps.drumSnap.grid : caps.quantizeGrid;
  const untidy = !!clip && !isTidy(clip.notes, grid);
  const flip = canGrid(track, loopBeats);
  const flipRef = useRef<HTMLButtonElement>(null);
  const [invite, setInvite] = useState(false);
  useBeatBlink(flipRef, flip && face === 'keys');

  useEffect(() => {
    if (flipInvited || !flip || face !== 'keys' || track.monster !== 'boom') return;
    flipInvited = true;
    setInvite(true);
    // Not cancelled on cleanup: the invitation must always end (setting state after unmount is harmless).
    setTimeout(() => setInvite(false), 3800);
  }, [flip, face, track.monster]);

  const flipBtn = flip && (
    <button
      ref={flipRef}
      className="tool-btn surface-flip"
      data-face={face}
      data-invite={invite}
      aria-label="Beat grid"
      aria-pressed={face === 'grid'}
      onClick={(e) => {
        setLabView(face === 'grid' ? 'keys' : 'grid');
        // The surface turns over (a new button on the other face): a keyboard user stays on the flip.
        if (e.detail === 0) requestAnimationFrame(() => document.querySelector<HTMLElement>('.surface-flip')?.focus());
      }}
    >
      <Icon name={face === 'grid' ? 'keys' : 'grid'} />
    </button>
  );
  const magnet = untidy && (
    <button className="tool-btn surface-tidy" aria-label="Pull the notes onto the beat" onClick={() => studio.tidy(track.id)}>
      <Icon name="magnet" />
    </button>
  );
  return (
    <PodTools
      track={track}
      className="pod-tools surface-tools surface-side"
      lead={flipBtn}
      tail={
        <>
          {magnet}
          {extra}
        </>
      }
      data={{
        'data-face': face,
        // Little Monsters' single column of toys becomes two when the keys share it with the flip or the magnet.
        'data-wide': mode === 'little' && face === 'keys' && (flip || untidy),
        'data-buttons': Number(flip) + Number(untidy),
      }}
    />
  );
}
