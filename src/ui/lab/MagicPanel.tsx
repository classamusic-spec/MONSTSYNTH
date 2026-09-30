import { SCALE_ORDER, SCALES } from '../../magic/scales';
import { setScale, setTempo } from '../../model/edits';
import { MAX_TEMPO, MIN_TEMPO } from '../../model/project';
import { setOverlay } from '../../store/actions';
import { commit, getState, useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { Icon } from '../icons/Icon';

// MONSTER MAGIC panel (Monster Maker mode): the two musical choices older kids
// ask for — how fast, and what mood. Every choice stays in tune automatically.

const MOOD_HINT: Record<string, string> = {
  pentatonicMajor: 'bright & safe',
  pentatonicMinor: 'spooky & cool',
  major: 'sunny & singing',
  minor: 'moody & mysterious',
  blues: 'wobbly & bluesy',
  chromatic: 'every note — watch out!',
};

export function MagicPanel() {
  const tempo = useApp((s) => s.project.tempo);
  const scale = useApp((s) => s.project.scale);

  const pick = (id: (typeof SCALE_ORDER)[number]) => {
    commit((p) => setScale(p, id));
    const t = getState().project.tracks.find((x) => x.monster !== 'boom') ?? getState().project.tracks[0];
    if (t) setTimeout(() => studio.preview(t.id), 30);
  };

  return (
    <div className="sheet-scrim" onClick={() => setOverlay(null)}>
      <div className="sheet magic" role="dialog" aria-modal="true" aria-labelledby="magic-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="magic-title">
            <Icon name="stars" /> Monster Magic
          </h2>
          <button className="sheet-close" aria-label="Close" onClick={() => setOverlay(null)}>
            <Icon name="close" />
          </button>
        </div>

        <div className="magic-row">
          <span className="magic-label">Speed</span>
          <div className="speed">
            <button className="speed-btn" aria-label="Slower" onClick={() => commit((p) => setTempo(p, Math.max(MIN_TEMPO, p.tempo - 5)), { coalesce: 'tempo' })}>
              <Icon name="turtle" />
            </button>
            <input
              type="range"
              min={MIN_TEMPO}
              max={MAX_TEMPO}
              step={1}
              value={tempo}
              aria-label="Speed (beats per minute)"
              onChange={(e) => commit((p) => setTempo(p, Number(e.target.value)), { coalesce: 'tempo' })}
            />
            <button className="speed-btn" aria-label="Faster" onClick={() => commit((p) => setTempo(p, Math.min(MAX_TEMPO, p.tempo + 5)), { coalesce: 'tempo' })}>
              <Icon name="rabbit" />
            </button>
            <output className="bpm">{tempo} bpm</output>
          </div>
        </div>

        <div className="magic-row">
          <span className="magic-label">Mood</span>
          <div className="moods" role="radiogroup" aria-label="Mood (musical scale)">
            {SCALE_ORDER.map((id) => (
              <button key={id} className="mood" role="radio" aria-checked={scale === id} data-on={scale === id} onClick={() => pick(id)}>
                <strong>{SCALES[id].kidName}</strong>
                <span>{MOOD_HINT[id]}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="magic-note">Your loops change mood too — Monster Magic keeps every note in tune.</p>
      </div>
    </div>
  );
}
