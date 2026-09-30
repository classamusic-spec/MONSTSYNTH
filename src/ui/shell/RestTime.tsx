import { useEffect, useRef } from 'react';
import { setState, useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { MonsterArt } from '../monsters/MonsterArt';

// Optional play-session limit (set by a grown-up in Parent Space). Only time the
// app is awake and visible counts. When it runs out the band stops, the monsters
// fall asleep and a grown-up continues through the usual two-corner gate.
// `resting` lives in the store so every way of playing (touch, keys, record)
// respects it, not just this overlay.

export function RestTime() {
  const minutes = useApp((s) => s.settings.sessionMinutes);
  const awake = useApp((s) => s.awake);
  const overlay = useApp((s) => s.overlay);
  const tracks = useApp((s) => s.project.tracks);
  const resting = useApp((s) => s.resting);
  const used = useRef(0);
  const prevOverlay = useRef(overlay);

  // Closing Parent Space gives a fresh session.
  useEffect(() => {
    if (prevOverlay.current === 'parent' && overlay !== 'parent') {
      used.current = 0;
      if (useApp.getState().resting) setState({ resting: false });
    }
    prevOverlay.current = overlay;
  }, [overlay]);

  useEffect(() => {
    if (!minutes || resting) return;
    const limit = minutes * 60_000;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      if (awake && !document.hidden && getOverlay() !== 'parent') used.current += now - last;
      last = now;
      if (used.current >= limit) {
        studio.stop();
        studio.releaseAll();
        setState({ resting: true });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [minutes, awake, resting]);

  if (!resting || overlay === 'parent') return null;
  return (
    <div className="rest" role="alertdialog" aria-labelledby="rest-title" aria-describedby="rest-text">
      <div className="rest-band" aria-hidden>
        {tracks.slice(0, 4).map((t) => (
          <div key={t.id} className="rest-monster">
            <MonsterArt kind={t.monster} className="is-asleep" />
          </div>
        ))}
      </div>
      <h2 id="rest-title">Time for a break!</h2>
      <p id="rest-text">The monsters are sleepy. Your songs are saved for next time.</p>
    </div>
  );
}

function getOverlay() {
  return useApp.getState().overlay;
}
