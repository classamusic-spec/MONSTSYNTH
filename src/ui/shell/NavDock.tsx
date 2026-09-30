import { setScreen } from '../../store/actions';
import { useApp, type Screen } from '../../store/store';
import { Icon, type IconName } from '../icons/Icon';

// Five places, five pictures. Labels are small extras for readers.

const ITEMS: { screen: Screen; icon: IconName; label: string }[] = [
  { screen: 'songs', icon: 'home', label: 'Songs' },
  { screen: 'lab', icon: 'lab', label: 'Lab' },
  { screen: 'blocks', icon: 'blocks', label: 'Blocks' },
  { screen: 'paint', icon: 'brush', label: 'Paint' },
  { screen: 'learn', icon: 'note', label: 'Learn' },
];

export function NavDock() {
  const screen = useApp((s) => s.screen);
  return (
    <nav className="dock" aria-label="Places">
      <div className="dock-group">
        {ITEMS.map((it) => (
          <button
            key={it.screen}
            className="dock-btn"
            aria-current={screen === it.screen ? 'page' : undefined}
            aria-label={it.label}
            data-screen={it.screen}
            onClick={() => setScreen(it.screen)}
          >
            <span className="dock-icon">
              <Icon name={it.icon} />
            </span>
            <span className="dock-label" aria-hidden>
              {it.label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
