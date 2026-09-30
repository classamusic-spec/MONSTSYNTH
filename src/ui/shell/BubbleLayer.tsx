import { useEffect, useState } from 'react';
import { MonsterArt } from '../monsters/MonsterArt';
import { Icon } from '../icons/Icon';
import { onSay, type BubbleMsg } from './bubbles';

export function BubbleLayer() {
  const [msg, setMsg] = useState<BubbleMsg | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onSay((m) => {
      setMsg(m);
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
