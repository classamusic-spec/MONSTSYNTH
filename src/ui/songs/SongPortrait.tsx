import { memo } from 'react';
import { TEACH_SONGS } from '../../magic/lessons';
import { baseSongName, songCover } from '../../magic/names';
import type { ProjectMeta } from '../../model/types';
import { SongArt } from '../learn/SongArt';
import { MonsterArt } from '../monsters/MonsterArt';
import { CoverArt } from './CoverArt';

// A song's "cover": a picture sticker from its name (a rocket, a pancake…) over
// its monsters standing in a row, all in the song's own colour. Monsters that
// have loops are awake; the rest doze. Kids recognise their songs by the
// picture. A song kept from Learn wears that song's own picture (and a copy of
// a song keeps its original's picture).

export const SongPortrait = memo(function SongPortrait({ meta }: { meta: ProjectMeta }) {
  const monsters = meta.monsters.slice(0, 6);
  const base = baseSongName(meta.name);
  const learned = TEACH_SONGS.find((s) => s.title === base);
  const cover = songCover(meta.name, meta.seed);
  return (
    <div className="portrait" style={{ ['--hue' as string]: meta.hue }}>
      <div className="portrait-sky" />
      <span className="cover-sticker" data-picture={learned ? learned.picture : cover}>
        {/* Learn pictures go over a backdrop of their own: two kept copies of one
            Learn song would otherwise share SongArt's gradient (and its colour). */}
        <CoverArt picture={learned ? null : cover} hue={meta.hue} />
        {learned && <SongArt picture={learned.picture} hue={meta.hue} />}
      </span>
      <div className="portrait-cluster portrait-row" data-count={monsters.length}>
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
