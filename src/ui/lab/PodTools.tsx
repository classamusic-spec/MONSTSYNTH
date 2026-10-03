import type { ReactNode } from 'react';
import { cycleFx, cyclePreset } from '../../model/edits';
import { FX_BUDDIES, fxStepIndex, MONSTERS, presetInfo } from '../../model/monsters';
import type { Track } from '../../model/types';
import { commit } from '../../store/store';
import { studio } from '../../studio/studio';
import { useCaps } from '../hooks/useCaps';
import { FxBuddy } from '../monsters/FxBuddy';
import { Icon } from '../icons/Icon';

// The spotlight monster's toys: a costume (= a new sound) and its effect
// buddies. Each buddy has three friendly levels: asleep, a little, a lot.
// Tablets show them in a toolbar along the top of the stage; phones on the left
// of the keys, where the play surface's own buttons (`lead`, `tail`) join them.

interface PodToolsProps {
  track: Track;
  className?: string;
  /** Buttons before the toys (the grid flip) and after them (the tidy magnet). */
  lead?: ReactNode;
  tail?: ReactNode;
  data?: Record<`data-${string}`, string | number | boolean | undefined>;
}

export function PodTools({ track, className = 'pod-tools', lead, tail, data }: PodToolsProps) {
  const caps = useCaps();
  const info = MONSTERS[track.monster];
  const preset = presetInfo(track.monster, track.preset);
  return (
    <div className={className} data-monster={track.monster} role="group" aria-label={`${info.name}'s sound toys`} {...data}>
      {lead}
      <button
        className="tool-btn tool-costume"
        aria-label={`Change ${info.name}'s sound. Now: ${preset.name}`}
        onClick={() => {
          commit((p) => cyclePreset(p, track.id));
          setTimeout(() => studio.preview(track.id), 30);
        }}
      >
        <Icon name="hat" />
      </button>
      {caps.fx.map((fx) => {
        const level = fxStepIndex(track.fx[fx]);
        return (
          <button
            key={fx}
            className="tool-btn"
            data-level={level}
            style={{ ['--fx' as string]: FX_BUDDIES[fx].color }}
            aria-label={`${FX_BUDDIES[fx].name} ${FX_BUDDIES[fx].does}: ${['off', 'a little', 'a lot'][level]}`}
            onClick={() => {
              commit((p) => cycleFx(p, track.id, fx));
              // A taste of the new effect: never written into a loop.
              setTimeout(() => studio.hit(track.id, track.monster === 'boom' ? 1 : 4, {}, { record: false }), 30);
            }}
          >
            <FxBuddy kind={fx} />
            <span className="pips" aria-hidden>
              <i data-on={level >= 1} />
              <i data-on={level >= 2} />
            </span>
          </button>
        );
      })}
      {tail}
    </div>
  );
}
