import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  bandMonsters,
  findSong,
  LESSON_KEYS,
  lessonStars,
  PHRASE_BEATS,
  phraseBand,
  phraseNotes,
  songLengthBeats,
  songNotes,
  TEACH_SONGS,
  type SongPicture,
  type TeachSong,
} from '../../magic/lessons';
import { MONSTERS } from '../../model/monsters';
import { recordLessonStars, saveLessonAsSong } from '../../store/actions';
import { getState, useApp } from '../../store/store';
import { studio, type LessonEvent } from '../../studio/studio';
import { onNote } from '../../studio/visualBus';
import { isReducedMotion } from '../hooks/useCaps';
import { Icon } from '../icons/Icon';
import { MonsterArt } from '../monsters/MonsterArt';
import { reactToNote } from '../monsters/react';
import { SongArt } from './SongArt';

// LEARN — a monster teaches a song, one phrase at a time.
//   listen → the teacher sings the phrase, the keys light up as it goes
//   play   → the next key glows (a hand points at it); the child plays at their
//            own pace. With Magic help on, any key plays the right note.
//   cheer  → stars, then the next phrase
//   done   → stars for the song, hear it with the band, or keep it as a song
// No timing to fail, no "wrong" buzzers: a wrong key still makes music.

const HUES: Record<SongPicture, number> = { buns: 28, lamb: 195, star: 245, boat: 205, farm: 125, bridge: 170, joy: 320, bells: 350 };
const KEYBOARD = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k'];
const CHEER_MS = 1300;

export function LearnScreen() {
  const [songId, setSongId] = useState<string | null>(null);
  const song = songId ? findSong(songId) : undefined;
  useEffect(() => () => studio.lessonStop(), []);
  return song ? <Lesson key={song.id} song={song} onExit={() => setSongId(null)} /> : <SongPicker onPick={setSongId} />;
}

// ── Picking a song ───────────────────────────────────────────────────────────

function SongPicker({ onPick }: { onPick: (id: string) => void }) {
  const stars = useApp((s) => s.settings.lessonStars);
  return (
    <section className="learn" aria-label="Learn a song">
      <header className="learn-head">
        <div className="learn-teachers" aria-hidden>
          <MonsterArt kind="bloop" />
          <MonsterArt kind="spark" />
          <MonsterArt kind="mimic" />
        </div>
        <h1 className="learn-title">Learn a song</h1>
      </header>
      <div className="lesson-shelf" role="group" aria-label="Songs to learn">
        {TEACH_SONGS.map((song) => {
          const earned = stars[song.id] ?? 0;
          return (
            <button
              key={song.id}
              className="lesson-card"
              data-song={song.id}
              aria-label={`${song.title}. ${earned ? `${earned} of 3 stars.` : 'New!'}`}
              onClick={() => onPick(song.id)}
            >
              <SongArt picture={song.picture} hue={HUES[song.picture]} />
              <span className="lesson-card-title">{song.title}</span>
              <span className="lesson-card-foot">
                <span className="lesson-level" aria-hidden title="How long">
                  {Array.from({ length: song.level }, (_, i) => (
                    <Icon key={i} name="note" />
                  ))}
                </span>
                <Stars count={earned} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Stars({ count, big = false }: { count: number; big?: boolean }) {
  return (
    <span className={big ? 'lesson-stars lesson-stars-big' : 'lesson-stars'} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="lesson-star" data-on={i < count} style={{ '--i': i } as CSSProperties}>
          <Icon name="star" />
        </span>
      ))}
    </span>
  );
}

// ── A lesson ─────────────────────────────────────────────────────────────────

type Phase = 'listen' | 'play' | 'cheer' | 'done' | 'band';

function phraseEvents(song: TeachSong, phrase: number): LessonEvent[] {
  return phraseNotes(song, phrase).map((n) => ({
    absBeat: n.absBeat - phrase * PHRASE_BEATS,
    monster: song.teacher,
    step: n.step,
    dur: n.dur,
    vel: 0.85,
    tag: `${phrase}:${n.index}`,
  }));
}

function bandEvents(song: TeachSong): LessonEvent[] {
  const events: LessonEvent[] = songNotes(song).map((n) => ({
    absBeat: n.absBeat,
    monster: song.teacher,
    step: n.step,
    dur: n.dur,
    vel: 0.85,
    tag: `${n.phrase}:${n.index}`,
  }));
  const sparkles = bandMonsters(song).includes('spark');
  song.phrases.forEach((phrase, i) => {
    for (const b of phraseBand(phrase, sparkles)) {
      events.push({ absBeat: i * PHRASE_BEATS + b.beat, monster: b.monster, step: b.step, dur: b.dur, vel: b.vel * 0.85 });
    }
  });
  return events;
}

function Lesson({ song, onExit }: { song: TeachSong; onExit: () => void }) {
  const awake = useApp((s) => s.awake);
  const [phrase, setPhrase] = useState(0);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('listen');
  const [helper, setHelper] = useState(() => getState().settings.ageMode === 'little');
  const [stars, setStars] = useState(0);
  const mistakes = useRef(0);
  /** Magic help counts only if it actually played a note for the child. */
  const usedHelper = useRef(false);
  const phraseRef = useRef(phrase);
  phraseRef.current = phrase;
  const keyEls = useRef<(HTMLButtonElement | null)[]>([]);
  const wordEls = useRef<(HTMLSpanElement | null)[]>([]);
  const teacherRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const notes = song.phrases[phrase].notes;
  const target = phase === 'play' ? notes[index] : undefined;
  const spb = 60 / song.tempo;
  const teacher = MONSTERS[song.teacher];

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const listen = useCallback(
    (p: number) => {
      clearTimer();
      setPhrase(p);
      setIndex(0);
      setPhase('listen');
      const events = phraseEvents(song, p);
      const end = Math.max(...events.map((e) => e.absBeat + e.dur));
      const ok = studio.lessonPlay(events, {
        tempo: song.tempo,
        key: song.key,
        lengthBeats: end + 0.35,
        onEnd: () => setPhase((ph) => (ph === 'listen' ? 'play' : ph)),
      });
      if (!ok) setPhase('play');
    },
    [song],
  );

  // The teacher sings the current phrase whenever the monsters are (re)awake;
  // the cleanup stops it (leaving, or the audio going to sleep).
  useEffect(() => {
    if (!awake || phaseRef.current === 'done') return;
    listen(phraseRef.current);
    return () => {
      clearTimer();
      studio.lessonStop();
    };
  }, [awake, listen]);

  // Sound → the teacher bounces, keys light up, the words follow along.
  useEffect(() => {
    const opts = { monster: song.teacher, echo: 0, gloop: 0, tempo: song.tempo, reduced: false };
    return onNote((v) => {
      if (v.trackId !== null) return;
      if (v.monster === song.teacher && teacherRef.current) reactToNote(teacherRef.current, v, { ...opts, reduced: isReducedMotion() });
      if (v.source !== 'loop' || !v.noteId?.startsWith('lesson:')) return;
      const [p, i] = v.noteId.slice(7).split(':').map(Number);
      if (p !== phraseRef.current) setPhrase(p);
      const key = keyEls.current[v.step];
      if (key) {
        key.dataset.glow = 'true';
        setTimeout(() => (key.dataset.glow = 'false'), Math.min(450, Math.max(140, v.dur * 1000)));
      }
      requestAnimationFrame(() => {
        wordEls.current.forEach((w, j) => {
          if (w) w.dataset.now = String(j === i);
        });
      });
    });
  }, [song]);

  // Karaoke highlights belong to the teacher's singing only.
  useEffect(() => {
    if (phase === 'listen' || phase === 'band') return;
    wordEls.current.forEach((w) => {
      if (w) w.dataset.now = 'false';
    });
  }, [phase, phrase]);

  const flash = (k: number, attr: 'down' | 'wrong' | 'hint', ms: number) => {
    const el = keyEls.current[k];
    if (!el) return;
    el.dataset[attr] = 'true';
    setTimeout(() => (el.dataset[attr] = 'false'), ms);
  };

  const finish = () => {
    const earned = lessonStars(mistakes.current, usedHelper.current);
    setStars(earned);
    setPhase('done');
    recordLessonStars(song.id, earned);
    // A little fanfare from the teacher.
    studio.lessonPlay(
      [0, 2, 4, 7].map((step, i) => ({ absBeat: i * 0.5, monster: song.teacher, step, dur: i === 3 ? 1.5 : 0.45, vel: 0.8 })),
      { tempo: 120, key: song.key, lengthBeats: 3.5 },
    );
  };

  const phraseDone = () => {
    setPhase('cheer');
    clearTimer();
    timer.current = setTimeout(() => {
      const next = phraseRef.current + 1;
      if (next < song.phrases.length) listen(next);
      else finish();
    }, CHEER_MS);
  };

  const press = (k: number) => {
    flash(k, 'down', 140);
    if (phase !== 'listen' && phase !== 'play') {
      // Between lessons the keys are free to play.
      studio.lessonHit(song.teacher, k, song.key, { durSec: 0.4 });
      return;
    }
    let i = index;
    if (phase === 'listen') {
      // An eager player: stop the demo and start from the top of the phrase.
      studio.lessonStop();
      setPhase('play');
      i = 0;
    }
    const note = notes[i];
    if (!note) return;
    const [, step, dur] = note;
    if (helper || k === step) {
      if (helper) usedHelper.current = true;
      studio.lessonHit(song.teacher, step, song.key, { durSec: Math.min(1.2, Math.max(0.25, dur * spb)) });
      if (helper && k !== step) flash(step, 'down', 180);
      if (i + 1 >= notes.length) {
        setIndex(notes.length);
        phraseDone();
      } else setIndex(i + 1);
    } else {
      mistakes.current++;
      studio.lessonHit(song.teacher, k, song.key, { durSec: 0.3, vel: 0.5 });
      flash(k, 'wrong', 380);
      flash(step, 'hint', 700);
      if (i !== index) setIndex(i);
    }
  };
  const pressRef = useRef(press);
  pressRef.current = press;

  // Computer keyboards: A–K play the eight keys.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const s = getState();
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || s.overlay || !s.awake || s.resting) return;
      const k = KEYBOARD.indexOf(e.key.toLowerCase());
      if (k < 0) return;
      e.preventDefault();
      pressRef.current(k);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  const again = () => {
    mistakes.current = 0;
    usedHelper.current = false;
    listen(0);
  };

  const withBand = () => {
    clearTimer();
    setPhase('band');
    setPhrase(0);
    const ok = studio.lessonPlay(bandEvents(song), {
      tempo: song.tempo,
      key: song.key,
      lengthBeats: songLengthBeats(song) + 0.5,
      onEnd: () => setPhase((ph) => (ph === 'band' ? 'done' : ph)),
    });
    if (!ok) setPhase('done');
  };

  const stopBand = () => {
    studio.lessonStop();
    setPhase('done');
  };

  const toggleHelper = () => setHelper((h) => !h);

  const words = notes.map((n) => n[3]);
  const lastPhrase = song.phrases.length - 1;

  return (
    <section className="lesson" data-phase={phase} aria-label={`Learning ${song.title}`} style={{ '--song-hue': HUES[song.picture] } as CSSProperties}>
      <header className="lesson-bar">
        <button className="lesson-btn" aria-label="Other songs" onClick={onExit}>
          <Icon name="close" />
        </button>
        <div className="lesson-heading">
          <span className="lesson-name">{song.title}</span>
          <span className="lesson-dots" aria-label={`Part ${Math.min(phrase + 1, song.phrases.length)} of ${song.phrases.length}`}>
            {song.phrases.map((_, i) => (
              <i key={i} data-state={i < phrase || phase === 'done' || (i === phrase && phase === 'cheer') ? 'done' : i === phrase ? 'now' : 'todo'} />
            ))}
          </span>
        </div>
        {phase === 'band' ? (
          <button className="lesson-btn" aria-label="Stop" onClick={stopBand}>
            <Icon name="stop" />
          </button>
        ) : (
          <button
            className="lesson-btn"
            aria-label="Listen again"
            disabled={phase === 'done' || phase === 'cheer'}
            onClick={() => listen(phrase)}
          >
            <Icon name="speaker" />
          </button>
        )}
        <button className="lesson-btn lesson-helper" aria-label="Magic help: any key plays the right note" aria-pressed={helper} onClick={toggleHelper}>
          <Icon name="wand" />
        </button>
      </header>

      <div className="lesson-stage">
        <div className="lesson-teacher" ref={teacherRef} data-monster={song.teacher}>
          <MonsterArt kind={song.teacher} />
        </div>
        <div className="lesson-bubble">
          <span className="lesson-cue" data-phase={phase}>
            {phase === 'listen' && (
              <>
                <Icon name="speaker" /> Listen…
              </>
            )}
            {phase === 'play' && (
              <>
                <Icon name="hand" /> Your turn!
              </>
            )}
            {phase === 'cheer' && (
              <>
                <Icon name="star" /> {phrase === lastPhrase ? 'You did it!' : 'Yay!'}
              </>
            )}
            {phase === 'band' && (
              <>
                <Icon name="note" /> {teacher.name} and the band
              </>
            )}
            {phase === 'done' && (
              <>
                <Icon name="star" /> Well played!
              </>
            )}
          </span>
          {phase !== 'done' && (
            <p className="lesson-words" aria-live="polite">
              {words.map((w, i) => (
                <span
                  key={`${phrase}-${i}`}
                  ref={(el) => {
                    wordEls.current[i] = el;
                  }}
                  className="lesson-word"
                  data-state={phase === 'play' ? (i < index ? 'sung' : i === index ? 'next' : 'todo') : phase === 'cheer' ? 'sung' : 'todo'}
                >
                  {w}
                </span>
              ))}
            </p>
          )}
        </div>
        {phase === 'cheer' && (
          <div className="lesson-burst" key={`burst-${phrase}`} aria-hidden>
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} style={{ '--a': `${i * 45}deg` } as CSSProperties}>
                <Icon name="star" />
              </span>
            ))}
          </div>
        )}
        {phase === 'done' && (
          <div className="lesson-done" role="dialog" aria-label="Song finished">
            <Stars count={stars} big />
            <p className="lesson-done-title">You played {song.title}!</p>
            <div className="lesson-actions">
              <button className="lesson-action" onClick={withBand}>
                <Icon name="play" />
                <span>With the band</span>
              </button>
              <button className="lesson-action lesson-keep" onClick={() => void saveLessonAsSong(song)}>
                <Icon name="blocks" />
                <span>Keep my song</span>
              </button>
              <button className="lesson-action" onClick={again}>
                <Icon name="loop" />
                <span>Again</span>
              </button>
              <button className="lesson-action" onClick={onExit}>
                <Icon name="note" />
                <span>More songs</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="lesson-keys" role="group" aria-label={`${teacher.name}'s keys`}>
        {Array.from({ length: LESSON_KEYS }, (_, k) => {
          const next = !!target && target[1] === k;
          return (
            <button
              key={k}
              ref={(el) => {
                keyEls.current[k] = el;
              }}
              className="key lesson-key"
              data-next={next}
              style={{ '--k': `var(--key-${k})` } as CSSProperties}
              aria-label={`Note ${k + 1}${next ? ', play this one' : ''}`}
              onPointerDown={(e) => {
                e.preventDefault();
                press(k);
              }}
              onClick={(e) => {
                // Keyboard / switch access (pointer presses were handled on pointerdown).
                if (e.detail === 0) press(k);
              }}
            >
              <span className="lesson-key-num" aria-hidden>
                {k + 1}
              </span>
              {next && (
                <span className="lesson-hand" data-helper={helper} aria-hidden>
                  <Icon name="hand" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
