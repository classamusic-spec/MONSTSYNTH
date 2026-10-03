import { useEffect, useRef, useState } from 'react';
import { magicArrange } from '../../magic/arrange';
import { setOverlay } from '../../store/actions';
import { activeClip } from '../../model/project';
import { commit, getState, labFace, useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { onFrame } from '../../studio/visualBus';
import { useCaps } from '../hooks/useCaps';
import { Icon } from '../icons/Icon';
import { hush, say } from './bubbles';

// Big, always-in-the-same-place controls: Play, Record, Undo (+ Redo and the
// Monster Magic panel for Monster Makers). On Monster Blocks, Record becomes the
// magic wand that turns loops into a song; under Beat Hop's grid it becomes the
// "Surprise" wand that stamps a ready-made groove.

const R = 46;
const C = 2 * Math.PI * R;

function LoopRing() {
  const fg = useRef<SVGCircleElement>(null);
  const ticks = useRef<SVGGElement>(null);
  const [count, setCount] = useState(8);

  useEffect(
    () =>
      onFrame((p) => {
        const el = fg.current;
        if (!el) return;
        const total = p.mode === 'song' ? p.songBeats : p.loopBeats;
        const n = p.mode === 'song' ? Math.max(1, Math.round(p.songBeats / p.loopBeats)) : p.loopBeats;
        if (n !== count) setCount(n);
        let frac = 0;
        if (p.playing && p.beat >= 0) frac = p.mode === 'song' ? Math.min(1, p.beat / total) : (p.beat % total) / total;
        el.style.strokeDashoffset = String(C * (1 - frac));
        const beatIdx = p.playing ? Math.floor(p.mode === 'song' ? (p.beat / total) * n : p.beat % total) : -1;
        const tk = ticks.current;
        if (tk && tk.dataset.beat !== String(beatIdx)) {
          tk.dataset.beat = String(beatIdx);
          tk.querySelectorAll('circle').forEach((c, i) => c.setAttribute('r', i === beatIdx ? '5' : '3'));
        }
      }),
    [count],
  );

  return (
    <svg className="loop-ring" viewBox="0 0 108 108" aria-hidden>
      <circle className="ring-bg" cx={54} cy={54} r={R} />
      <circle ref={fg} className="ring-fg" cx={54} cy={54} r={R} strokeDasharray={C} strokeDashoffset={C} />
      <g ref={ticks}>
        {Array.from({ length: count }, (_, i) => {
          const a = (i / count) * Math.PI * 2 - Math.PI / 2;
          return <circle key={i} className="tick" cx={54 + Math.cos(a) * R} cy={54 + Math.sin(a) * R} r={3} />;
        })}
      </g>
    </svg>
  );
}

export function TransportRail() {
  const screen = useApp((s) => s.screen);
  const t = useApp((s) => s.transport);
  const canRedo = useApp((s) => s.future.length > 0);
  const face = useApp(labFace);
  const selectedId = useApp((s) => s.selectedTrackId);
  // The wand sparkles while the grid is still empty (an invitation, like the shimmering stones).
  const emptyGrid = useApp((s) => {
    const t = s.project.tracks.find((x) => x.id === s.selectedTrackId);
    return !t || (activeClip(t)?.notes.length ?? 0) === 0;
  });
  const caps = useCaps();
  const [bump, setBump] = useState<string | null>(null);
  // "Play something!" goes as soon as the take starts (or is called off), so it
  // never hides the effect buddies a child reaches for mid-take.
  const askId = useRef<number | null>(null);
  useEffect(() => {
    if (t.armed || askId.current === null) return;
    hush(askId.current);
    askId.current = null;
  }, [t.armed]);

  const flash = (k: string) => {
    setBump(k);
    setTimeout(() => setBump(null), 450);
  };

  const recState = t.recording ? 'recording' : t.armed ? 'armed' : 'idle';

  const doUndo = () => {
    if (studio.undo()) flash('undo');
    else say({ text: 'Nothing to undo', icon: 'undo' });
  };

  return (
    <aside className="transport" aria-label="Play and record">
      <button
        className="t-btn t-play"
        data-playing={t.playing}
        aria-label={t.playing ? 'Stop' : screen === 'blocks' ? 'Play the song' : 'Play'}
        aria-pressed={t.playing}
        onClick={() => studio.togglePlay()}
      >
        <span className="t-face">
          <LoopRing />
          <Icon name={t.playing ? 'stop' : 'play'} />
        </span>
        <span className="t-label">{t.playing ? 'Stop' : 'Play'}</span>
      </button>

      {screen === 'lab' && face === 'grid' && (
        <button
          className="t-btn t-wand t-magic t-surprise"
          data-bump={bump === 'surprise'}
          data-invite={emptyGrid}
          aria-label="Surprise beat"
          onClick={() => {
            studio.gridWand(selectedId);
            flash('surprise');
          }}
        >
          <span className="t-face">
            <Icon name="wand" />
          </span>
          <span className="t-label">Surprise</span>
        </button>
      )}

      {screen === 'lab' && face === 'keys' && (
        <button
          className="t-btn t-rec"
          data-state={recState}
          aria-label={recState === 'idle' ? 'Record a loop' : 'Stop recording'}
          aria-pressed={recState !== 'idle'}
          onClick={() => {
            studio.toggleRecord();
            const st = getState();
            if (st.transport.armed) {
              const monster = st.project.tracks.find((t) => t.id === st.selectedTrackId)?.monster;
              askId.current = say({ text: 'Play something!', icon: 'record', monster });
            }
          }}
        >
          <span className="t-face">
            <Icon name="record" />
          </span>
          <span className="t-label">{recState === 'armed' ? 'Play!' : 'Record'}</span>
        </button>
      )}

      {/* Record-sized, but not a Record button (.t-rec): the Coach's "try Record" hand must never land on the wand. */}
      {screen === 'blocks' && (
        <button
          className="t-btn t-wand t-magic"
          data-bump={bump === 'magic'}
          aria-label="Monster Magic: turn my loops into a song"
          onClick={() => {
            commit((p) => ({ ...p, arrangement: magicArrange(p, Math.floor(Math.random() * 1e6)) }));
            flash('magic');
          }}
        >
          <span className="t-face">
            <Icon name="wand" />
          </span>
          <span className="t-label">Magic</span>
        </button>
      )}

      <div className="transport-row">
        <button className="t-btn t-small" data-bump={bump === 'undo'} aria-label="Undo" onClick={doUndo}>
          <span className="t-face">
            <Icon name="undo" />
          </span>
          <span className="t-label">Undo</span>
        </button>
        {caps.redo && (
          <button className="t-btn t-tiny" aria-label="Redo" disabled={!canRedo} onClick={() => studio.redo() && flash('redo')}>
            <span className="t-face">
              <Icon name="redo" />
            </span>
            <span className="t-label">Redo</span>
          </button>
        )}
      </div>

      {caps.magicPanel && screen === 'lab' && (
        <button className="t-btn t-tiny t-magic" aria-label="Monster Magic settings: speed and mood" onClick={() => setOverlay('magic')}>
          <span className="t-face">
            <Icon name="stars" />
          </span>
          <span className="t-label">Magic</span>
        </button>
      )}
    </aside>
  );
}
