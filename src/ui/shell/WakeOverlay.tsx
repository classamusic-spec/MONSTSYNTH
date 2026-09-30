import { useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { Icon } from '../icons/Icon';
import { Logo } from './Logo';

// The monsters are asleep until the first tap. That tap is also the user
// gesture browsers require before any sound can play — so the very first thing
// a child does is wake the band, and the band says hello.

export function WakeOverlay() {
  const awake = useApp((s) => s.awake);
  const ready = useApp((s) => s.ready);
  if (awake) return null;
  const wake = () => void studio.wake();
  return (
    <div
      className="wake"
      role="button"
      tabIndex={0}
      aria-label="Wake up the monsters"
      onClick={wake}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          wake();
        }
      }}
    >
      <Logo />
      <div className="wake-btn" aria-hidden>
        <span className="wake-sun">
          <Icon name="hand" />
        </span>
      </div>
      <p className="wake-text">{ready ? 'Tap to wake the monsters!' : 'Waking up…'}</p>
    </div>
  );
}
