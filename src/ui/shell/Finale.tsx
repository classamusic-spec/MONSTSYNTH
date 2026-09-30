import { useEffect, useState } from 'react';
import { onStudioEvent } from '../../studio/visualBus';
import { isReducedMotion } from '../hooks/useCaps';
import { star5 } from '../monsters/shapes';

// When a song reaches its end the band takes a bow: stars rain down and the
// monsters say what every child should feel — "I made a song!"

const COLORS = ['#ff4f7e', '#ffcf2e', '#4cd964', '#2fd0e8', '#9a5cff', '#ff8a2b'];

export function Finale() {
  const [show, setShow] = useState(0);

  useEffect(
    () =>
      onStudioEvent((e) => {
        if (e.type !== 'finale') return;
        setShow((n) => n + 1);
        document.querySelectorAll<HTMLElement>('.pod .monster-svg .m-body').forEach((el, i) => {
          if (typeof el.animate !== 'function' || isReducedMotion()) return;
          el.animate(
            [{ transform: 'rotate(0) scale(1)' }, { transform: 'rotate(0) scale(1.04, 0.8)', offset: 0.35 }, { transform: 'rotate(0) scale(1)' }],
            { duration: 700, delay: i * 90, easing: 'ease-in-out' },
          );
        });
        setTimeout(() => setShow(0), 2800);
      }),
    [],
  );

  if (!show) return null;
  const reduced = isReducedMotion();
  return (
    <div className="finale" aria-hidden key={show}>
      {!reduced &&
        Array.from({ length: 28 }, (_, i) => (
          <svg
            key={i}
            className="confetti"
            viewBox="0 0 20 20"
            style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.12}s`, animationDuration: `${1.8 + (i % 5) * 0.25}s` }}
          >
            <path d={star5(10, 10, 9)} fill={COLORS[i % COLORS.length]} />
          </svg>
        ))}
      <div className="finale-title">You made a song!</div>
    </div>
  );
}
