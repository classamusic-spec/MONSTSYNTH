import { useState } from 'react';
import { addMonster, removeMonster } from '../../model/edits';
import { ALL_MONSTERS, MONSTERS } from '../../model/monsters';
import { trackHasLoop } from '../../model/project';
import type { MonsterKind } from '../../model/types';
import { selectTrack, setOverlay } from '../../store/actions';
import { commit, getState, useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { useCaps } from '../hooks/useCaps';
import { Icon } from '../icons/Icon';
import { MonsterArt } from '../monsters/MonsterArt';

// ADD MONSTER — every monster in one tray. Tap a resting monster to invite it on
// stage; tap one on stage to let it go home (it keeps its loop on the bench).

export function MonsterTray() {
  const tracks = useApp((s) => s.project.tracks);
  const bench = useApp((s) => s.project.bench);
  const caps = useCaps();
  const [full, setFull] = useState<MonsterKind | null>(null);
  const onStage = new Set(tracks.map((t) => t.monster));
  const seatsLeft = caps.maxMonsters - tracks.length;

  const toggle = (m: MonsterKind) => {
    const s = getState();
    const track = s.project.tracks.find((t) => t.monster === m);
    if (track) {
      if (s.project.tracks.length <= 1) return;
      commit((p) => removeMonster(p, track.id));
      const after = getState();
      if (!after.project.tracks.some((t) => t.id === after.selectedTrackId)) selectTrack(after.project.tracks[0].id);
      return;
    }
    if (s.project.tracks.length >= caps.maxMonsters) {
      setFull(m);
      setTimeout(() => setFull(null), 900);
      return;
    }
    commit((p) => addMonster(p, m));
    const added = getState().project.tracks.find((t) => t.monster === m);
    if (added) {
      selectTrack(added.id);
      setTimeout(() => studio.preview(added.id), 60);
    }
  };

  return (
    <div className="sheet-scrim" onClick={() => setOverlay(null)}>
      <div className="sheet tray" role="dialog" aria-modal="true" aria-labelledby="tray-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="tray-title">Monster friends</h2>
          <div className="seats" role="img" aria-label={`${tracks.length} of ${caps.maxMonsters} places on stage used`}>
            {Array.from({ length: caps.maxMonsters }, (_, i) => (
              <span key={i} data-on={i < tracks.length} />
            ))}
          </div>
          <button className="sheet-close" aria-label="Close" onClick={() => setOverlay(null)}>
            <Icon name="close" />
          </button>
        </div>
        <div className="tray-grid">
          {ALL_MONSTERS.map((m) => {
            const info = MONSTERS[m];
            const on = onStage.has(m);
            const benched = bench.find((b) => b.track.monster === m);
            const hasLoop = on ? trackHasLoop(tracks.find((t) => t.monster === m)!) : benched ? trackHasLoop(benched.track) : false;
            return (
              <button
                key={m}
                className="tray-card"
                data-monster={m}
                data-on={on}
                data-full={full === m}
                aria-pressed={on}
                aria-label={`${info.name}, ${info.role}. ${on ? 'On stage. Tap to send home.' : seatsLeft > 0 ? 'Tap to invite on stage.' : 'The stage is full.'}`}
                onClick={() => toggle(m)}
              >
                <span className="tray-art">
                  <MonsterArt kind={m} className={on ? undefined : 'is-asleep'} />
                </span>
                <span className="tray-name">{info.name}</span>
                <span className="tray-role">{info.role}</span>
                <span className="tray-badge" aria-hidden>
                  <Icon name={on ? 'check' : 'plus'} />
                </span>
                {hasLoop && (
                  <span className="tray-loop" aria-hidden>
                    <Icon name="loop" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
