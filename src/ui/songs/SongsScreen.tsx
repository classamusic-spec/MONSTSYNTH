import { useApp } from '../../store/store';
import { newSong, openSong, setScreen } from '../../store/actions';
import { Icon } from '../icons/Icon';
import { Logo } from '../shell/Logo';
import { MonsterArt } from '../monsters/MonsterArt';
import { SongPortrait } from './SongPortrait';

// MY SONGS — a shelf of song pictures. No filenames, no save dialogs, nothing to
// delete by accident (deleting lives in Parent Space).

export function SongsScreen() {
  const songs = useApp((s) => s.songs);
  const currentId = useApp((s) => s.project.id);

  return (
    <section className="songs" aria-label="My songs">
      <header className="songs-head">
        <Logo size="m" />
      </header>
      <div className="song-shelf" role="group" aria-label="Songs">
        <button className="song-card song-new" aria-label="Start a new song" onClick={() => void newSong('blank')}>
          <span className="song-new-plus">
            <Icon name="plus" />
          </span>
          <span className="song-name">New song</span>
        </button>
        <button className="song-card song-band" aria-label="Start with the Monster Band" onClick={() => void newSong('band')}>
          <div className="portrait band-portrait">
            <div className="portrait-sky" />
            <div className="portrait-cluster" data-count={4}>
              {(['boom', 'bloop', 'grumble', 'spark'] as const).map((m) => (
                <div key={m} className="portrait-monster" data-awake="true">
                  <MonsterArt kind={m} />
                </div>
              ))}
            </div>
            <span className="band-notes" aria-hidden>
              <Icon name="note" />
              <Icon name="note" />
            </span>
            <span className="starter-ribbon">Starter</span>
          </div>
          <span className="song-name">Start a band</span>
        </button>
        <button className="song-card song-learn" aria-label="Learn a song with the monsters" onClick={() => setScreen('learn')}>
          <div className="portrait learn-portrait">
            <div className="portrait-sky" />
            <div className="portrait-cluster" data-count={2}>
              {(['spark', 'bloop'] as const).map((m) => (
                <div key={m} className="portrait-monster" data-awake="true">
                  <MonsterArt kind={m} />
                </div>
              ))}
            </div>
            <span className="band-notes" aria-hidden>
              <Icon name="star" />
              <Icon name="note" />
            </span>
            <span className="starter-ribbon">8 songs</span>
          </div>
          <span className="song-name">Learn a song</span>
        </button>
        {songs.map((meta) => (
          <button
            key={meta.id}
            className="song-card"
            data-current={meta.id === currentId}
            aria-label={`Open ${meta.name}`}
            onClick={() => void openSong(meta.id)}
          >
            <SongPortrait meta={meta} />
            <span className="song-name">{meta.name}</span>
          </button>
        ))}
      </div>
      <p className="grown-ups">
        Grown-ups: hold <Icon name="moon" /> and <Icon name="star" /> in the corners together for 3 seconds.
      </p>
    </section>
  );
}
