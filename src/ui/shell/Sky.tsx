import { memo } from 'react';

// Quiet backdrop behind every screen. Deliberately calm: the monsters are the colour.

const STARS = Array.from({ length: 34 }, (_, i) => {
  const x = (i * 197.3) % 160;
  const y = (i * 61.7) % 70;
  const r = 0.12 + ((i * 7) % 5) * 0.05;
  return [x, y, r] as const;
});

export const Sky = memo(function Sky() {
  return (
    <div className="sky" aria-hidden>
      <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice">
        <g fill="#fff6cf">
          {STARS.map(([x, y, r], i) => (
            <circle key={i} className={i % 4 === 0 ? 'twinkle' : undefined} cx={x} cy={y} r={r} opacity={0.55} style={{ animationDelay: `${(i * 0.37) % 4}s` }} />
          ))}
        </g>
      </svg>
    </div>
  );
});
