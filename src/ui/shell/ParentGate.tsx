import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { setOverlay } from '../../store/actions';
import { Icon } from '../icons/Icon';

// ─────────────────────────────────────────────────────────────────────────────
// Grown-up gate. Parent Space opens only when BOTH corner marks (☾ bottom-left,
// ★ top-right) are held at once for three seconds — easy for an adult with two
// hands, very unlikely by accident for a small child.
// Keyboard / screen-reader users activate either mark and answer a
// multiplication question instead.
// ─────────────────────────────────────────────────────────────────────────────

const HOLD_MS = 3000;
const R = 50;
const C = 2 * Math.PI * R;

function question() {
  const a = 6 + Math.floor(Math.random() * 4);
  const b = 6 + Math.floor(Math.random() * 4);
  return { a, b, answer: a * b };
}

export function ParentGate() {
  const held = useRef(new Set<string>());
  const [heldState, setHeldState] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);
  const start = useRef(0);
  const [quiz, setQuiz] = useState<ReturnType<typeof question> | null>(null);
  const [answer, setAnswer] = useState('');
  const [wrong, setWrong] = useState(false);

  const stopTimer = () => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    setProgress(0);
  };

  const tick = () => {
    const p = Math.min(1, (performance.now() - start.current) / HOLD_MS);
    setProgress(p);
    if (p >= 1) {
      stopTimer();
      held.current.clear();
      setHeldState([]);
      setOverlay('parent');
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };

  const update = () => {
    setHeldState([...held.current]);
    if (held.current.size === 2 && !raf.current) {
      start.current = performance.now();
      raf.current = requestAnimationFrame(tick);
    } else if (held.current.size < 2 && raf.current) {
      stopTimer();
    }
  };

  const down = (id: string) => (e: ReactPointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    held.current.add(id);
    update();
  };
  const up = (id: string) => () => {
    held.current.delete(id);
    update();
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const openQuiz = () => {
    setQuiz(question());
    setAnswer('');
    setWrong(false);
  };

  const corner = (id: 'tr' | 'bl') => (
    <button
      className={`corner corner-${id}`}
      data-held={heldState.includes(id)}
      aria-label="Grown-ups: open Parent Space"
      onPointerDown={down(id)}
      onPointerUp={up(id)}
      onPointerCancel={up(id)}
      onLostPointerCapture={up(id)}
      onClick={(e) => {
        // Keyboard activation (detail 0) opens the question gate instead.
        if (e.detail === 0) openQuiz();
      }}
    >
      <Icon name={id === 'tr' ? 'star' : 'moon'} />
    </button>
  );

  return (
    <>
      {corner('tr')}
      {corner('bl')}
      {progress > 0 && (
        <svg className="gate-ring" viewBox="0 0 120 120" aria-hidden>
          <circle className="track" cx={60} cy={60} r={R} />
          <circle className="fill" cx={60} cy={60} r={R} strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
        </svg>
      )}
      {quiz && (
        <div className="modal-scrim" role="presentation" onClick={() => setQuiz(null)}>
          <form
            className="modal quiz"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quiz-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (Number(answer) === quiz.answer) {
                setQuiz(null);
                setOverlay('parent');
              } else {
                setWrong(true);
                setQuiz(question());
                setAnswer('');
              }
            }}
          >
            <h2 id="quiz-title">Grown-ups only</h2>
            <label htmlFor="quiz-answer">
              What is {quiz.a} × {quiz.b}?
            </label>
            <input
              id="quiz-answer"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={answer}
              aria-invalid={wrong}
              onChange={(e) => setAnswer(e.target.value.replace(/[^0-9]/g, ''))}
            />
            {wrong && <p className="quiz-wrong">Not quite — here is a new one.</p>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setQuiz(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Open
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
