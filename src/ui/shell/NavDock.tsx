import { trackHasLoop } from '../../model/project';
import { setScreen } from '../../store/actions';
import { useApp, type AppState, type Screen } from '../../store/store';
import { Icon, type IconName } from '../icons/Icon';

// Five places, five pictures. Labels are small extras for readers. A new loop
// puts a dot (in its monster's colour) on Blocks until Blocks is visited.

/** The monster whose new loop waits in Monster Blocks (the latest one still there, after an Undo), if any. */
function newBlockMonster(s: AppState): string | undefined {
  for (let i = s.newBlocks.length - 1; i >= 0; i--) {
    const t = s.project.tracks.find((x) => x.id === s.newBlocks[i]);
    if (t && trackHasLoop(t)) return t.monster;
  }
  return undefined;
}

const ITEMS: { screen: Screen; icon: IconName; label: string }[] = [
  { screen: 'songs', icon: 'home', label: 'Songs' },
  { screen: 'lab', icon: 'lab', label: 'Lab' },
  { screen: 'blocks', icon: 'blocks', label: 'Blocks' },
  { screen: 'paint', icon: 'brush', label: 'Paint' },
  { screen: 'learn', icon: 'note', label: 'Learn' },
];

export function NavDock() {
  const screen = useApp((s) => s.screen);
  const fresh = useApp(newBlockMonster);
  return (
    <nav className="dock" aria-label="Places">
      <div className="dock-group">
        {ITEMS.map((it) => (
          <button
            key={it.screen}
            className="dock-btn"
            aria-current={screen === it.screen ? 'page' : undefined}
            aria-label={it.screen === 'blocks' && fresh ? `${it.label}: your new loop is in the song` : it.label}
            data-screen={it.screen}
            data-new={it.screen === 'blocks' ? fresh : undefined}
            onClick={() => setScreen(it.screen)}
          >
            <span className="dock-icon">
              <Icon name={it.icon} />
              {it.screen === 'blocks' && fresh && <i className="dock-new" aria-hidden />}
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
