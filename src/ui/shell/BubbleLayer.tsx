import { useEffect, useState } from 'react';
import { getState } from '../../store/store';
import { studio } from '../../studio/studio';
import { MonsterArt } from '../monsters/MonsterArt';
import { Icon } from '../icons/Icon';
import { bubbleChirp, onSay, type BubbleMsg } from './bubbles';

/** Every bubble has a voice: its monster (or the one on the keys) chirps as it appears. */
function speak(m: BubbleMsg) {
  const kind = bubbleChirp(m);
  if (!kind) return;
  const s = getState();
  const monster = m.monster ?? s.project.tracks.find((t) => t.id === s.selectedTrackId)?.monster;
  if (monster) studio.chirp(monster, kind);
}

export function BubbleLayer() {
  const [msg, setMsg] = useState<BubbleMsg | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onSay((m, hushed) => {
      if (!m) {
        setMsg((cur) => (cur?.id === hushed ? null : cur));
        return;
      }
      setMsg(m);
      speak(m);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 2600);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div className="bubble-layer" aria-live="polite">
      {msg && (
        <div className="bubble" key={msg.id}>
          {msg.monster && (
            <span className="bubble-face">
              <MonsterArt kind={msg.monster} />
            </span>
          )}
          {msg.icon && <Icon name={msg.icon} className="bubble-icon" />}
          <span>{msg.text}</span>
        </div>
      )}
    </div>
  );
}
