import { memo } from 'react';
import type { ProjectMeta } from '../../model/types';
import { MonsterArt } from '../monsters/MonsterArt';

// A song's "cover": its monsters in its own colour. Monsters that have loops
// are awake; the rest doze. Kids recognise their songs by the picture.

export const SongPortrait = memo(function SongPortrait({ meta }: { meta: ProjectMeta }) {
  const monsters = meta.monsters.slice(0, 6);
  return (
    <div className="portrait" style={{ ['--hue' as string]: meta.hue }}>
      <div className="portrait-sky" />
      <div className="portrait-cluster" data-count={monsters.length}>
        {monsters.map((m) => {
          const awake = meta.filled.includes(m);
          return (
            <div key={m} className="portrait-monster" data-awake={awake}>
              <MonsterArt kind={m} className={awake ? undefined : 'is-asleep'} />
            </div>
          );
        })}
      </div>
      {meta.filled.length > 0 && (
        <div className="portrait-notes" aria-hidden>
          {meta.filled.map((m) => (
            <span key={m} data-monster={m} />
          ))}
        </div>
      )}
    </div>
  );
});
