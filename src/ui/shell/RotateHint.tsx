import { MonsterArt } from '../monsters/MonsterArt';
import { Icon } from '../icons/Icon';

// Phones held upright are too narrow for eight big keys; Bloop asks to turn
// sideways. Shown purely by CSS media query (no JavaScript orientation APIs).

export function RotateHint() {
  return (
    <div className="rotate-hint" role="alert">
      <div className="rotate-monster">
        <MonsterArt kind="bloop" />
      </div>
      <div className="rotate-phone">
        <Icon name="rotate" />
      </div>
      <p>Turn me sideways!</p>
    </div>
  );
}
