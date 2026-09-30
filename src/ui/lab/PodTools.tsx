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
// Tablets show them above the monster's head; phones on the left of the keys.

export function PodTools({ track, className = 'pod-tools' }: { track: Track; className?: string }) {
  const caps = useCaps();
  const info = MONSTERS[track.monster];
  const preset = presetInfo(track.monster, track.preset);
  return (
    <div className={className} role="group" aria-label={`${info.name}'s sound toys`}>
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
              setTimeout(() => studio.hit(track.id, track.monster === 'boom' ? 1 : 4), 30);
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
    </div>
  );
}
