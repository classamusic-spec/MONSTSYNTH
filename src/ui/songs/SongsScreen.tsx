import { useApp } from '../../store/store';
import { DEMO_SONGS } from '../../magic/demos';
import { ALL_MONSTERS } from '../../model/monsters';
import { isUntouchedDemo, newSong, openDemo, openSong, setScreen, startFirstBeat } from '../../store/actions';
import { studio } from '../../studio/studio';
import { Icon } from '../icons/Icon';
import { Logo } from '../shell/Logo';
import { MonsterArt } from '../monsters/MonsterArt';
import { SongPortrait } from './SongPortrait';

// MY SONGS — a shelf of song pictures. No filenames, no save dialogs, nothing to
// delete by accident (deleting lives in Parent Space).

/** The "Make a beat" picture: a little Beat Hop grid (cymbal, snare, big drum × 4 beats), lit by row colour. */
const BEAT_STONES: (string | null)[] = ['hat', 'hat', 'hat', 'hat', null, 'snare', null, 'snare', 'kick', null, 'kick', null];

export function SongsScreen() {
  const songs = useApp((s) => s.songs);
  const currentId = useApp((s) => s.project.id);
  const firstBeatDone = useApp((s) => !!s.settings.lessonStars['first-beat']);
  // An untouched demo copy is the demo card itself; once changed it is the child's song.
  const mine = songs.filter((m) => !isUntouchedDemo(m));

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
        <button className="song-card song-first-beat" data-done={firstBeatDone} aria-label="My first beat: Boom shows you how" onClick={() => void startFirstBeat()}>
          <div className="portrait first-beat-portrait">
            <div className="portrait-sky" />
            <div className="portrait-cluster" data-count={1}>
              <div className="portrait-monster" data-awake="true">
                <MonsterArt kind="boom" />
              </div>
            </div>
            <span className="first-beat-hand" aria-hidden>
              <Icon name="hand" />
            </span>
            <span className="beat-stones first-beat-stones" aria-hidden>
              {BEAT_STONES.map((on, i) => (
                <i key={i} data-on={on || undefined} />
              ))}
            </span>
            <span className="starter-ribbon">{firstBeatDone ? '★★★' : 'Start here'}</span>
          </div>
          <span className="song-name">My first beat</span>
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
        <button className="song-card song-beat" aria-label="Make a beat with Boom" onClick={() => void newSong('beat')}>
          <div className="portrait beat-portrait">
            <div className="portrait-sky" />
            <div className="portrait-cluster" data-count={1}>
              <div className="portrait-monster" data-awake="true">
                <MonsterArt kind="boom" />
              </div>
            </div>
            <span className="beat-stones" aria-hidden>
              {BEAT_STONES.map((on, i) => (
                <i key={i} data-on={on || undefined} />
              ))}
            </span>
            <span className="starter-ribbon">Starter</span>
          </div>
          <span className="song-name">Make a beat</span>
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
        {DEMO_SONGS.map((demo) => {
          const band = ALL_MONSTERS.filter((m) => demo.band[m]);
          return (
            <button
              key={demo.id}
              className="song-card song-demo"
              data-demo={demo.id}
              aria-label={`Listen to ${demo.title}, a song the monsters made`}
              onClick={() => void openDemo(demo.id).then((ok) => ok && studio.play())}
            >
              <div className="portrait demo-portrait" style={{ ['--hue' as string]: demo.hue }}>
                <div className="portrait-sky" />
                <div className="portrait-cluster" data-count={band.length}>
                  {band.map((m) => (
                    <div key={m} className="portrait-monster" data-awake="true">
                      <MonsterArt kind={m} />
                    </div>
                  ))}
                </div>
                <span className="demo-play" aria-hidden>
                  <Icon name="play" />
                </span>
                <span className="starter-ribbon">Listen</span>
              </div>
              <span className="song-name">{demo.title}</span>
            </button>
          );
        })}
        {mine.map((meta) => (
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
