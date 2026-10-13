import { ALL_MONSTERS, MONSTERS } from '../../model/monsters';
import { trackHasLoop } from '../../model/project';
import type { MonsterKind } from '../../model/types';
import { selectTrack, setOverlay } from '../../store/actions';
import { getState, useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { useCaps } from '../hooks/useCaps';
import { Icon } from '../icons/Icon';
import { MonsterArt } from '../monsters/MonsterArt';
import { cardMotion } from './trayMotion';

// ADD MONSTER — every monster in one tray, and a seat on stage for each of them
// (both modes). Tap a resting monster to invite it on stage: it hops and sings
// hello. Tap one on stage to let it go home: it waves and sings bye-bye, and
// keeps its loop on the bench (one Undo brings it back). The last monster on
// stage stays and sings instead (so does the one the first-beat guide is
// teaching on), so a tap always answers.

export function MonsterTray() {
  const tracks = useApp((s) => s.project.tracks);
  const bench = useApp((s) => s.project.bench);
  /** The first-beat guide's monster stays on stage while it teaches (it sings instead). */
  const guideTrack = useApp((s) => s.guide?.trackId ?? null);
  const caps = useCaps();
  const onStage = new Set(tracks.map((t) => t.monster));
  // A song from elsewhere may hold more monsters than the mode seats: never show "4 of 4" with 6 on stage.
  const seats = Math.max(caps.maxMonsters, tracks.length);
  const alone = tracks.length <= 1;

  const toggle = (m: MonsterKind, card: HTMLElement) => {
    const s = getState();
    const track = s.project.tracks.find((t) => t.monster === m);
    if (track) {
      if (s.project.tracks.length <= 1 || !studio.sendHome(track.id)) {
        studio.preview(track.id);
        cardMotion(card, 'sing');
        return;
      }
      cardMotion(card, 'bye');
      const after = getState();
      if (!after.project.tracks.some((t) => t.id === after.selectedTrackId)) selectTrack(after.project.tracks[0].id);
      return;
    }
    if (s.project.tracks.length >= caps.maxMonsters) {
      // Never with a seat for every monster; still, a tap is never silent.
      studio.chirp(m, 'huh');
      cardMotion(card, 'sing');
      return;
    }
    const added = studio.invite(m);
    if (!added) return;
    selectTrack(added);
    cardMotion(card, 'hello');
    setTimeout(() => studio.preview(added), 60);
  };

  return (
    <div className="sheet-scrim" onClick={() => setOverlay(null)}>
      <div className="sheet tray" role="dialog" aria-modal="true" aria-labelledby="tray-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="tray-title">Monster friends</h2>
          <div className="seats" role="img" aria-label={`${tracks.length} of ${seats} places on stage used`}>
            {Array.from({ length: seats }, (_, i) => (
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
            const stays = on && (alone || tracks.find((t) => t.monster === m)?.id === guideTrack);
            const benched = bench.find((b) => b.track.monster === m);
            const hasLoop = on ? trackHasLoop(tracks.find((t) => t.monster === m)!) : benched ? trackHasLoop(benched.track) : false;
            return (
              <button
                key={m}
                className="tray-card"
                data-monster={m}
                data-on={on}
                aria-pressed={on}
                aria-label={`${info.name}, ${info.role}. ${on ? (stays ? 'On stage. Tap to hear it.' : 'On stage. Tap to send home.') : 'Tap to invite on stage.'}`}
                onClick={(e) => toggle(m, e.currentTarget)}
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
