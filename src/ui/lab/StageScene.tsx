import { memo } from 'react';
import { twinkle } from '../monsters/shapes';

// The Lab's little world: stars, a moon, and soft hills for monsters to stand on.

const STARS: [number, number, number][] = [
  [60, 40, 3], [140, 90, 2], [230, 30, 2.5], [320, 70, 2], [410, 24, 3], [500, 84, 2],
  [560, 36, 2], [760, 110, 2.5], [40, 130, 2], [300, 140, 1.8], [470, 150, 2], [640, 140, 2],
];

export const StageScene = memo(function StageScene() {
  return (
    <div className="stage-scene" aria-hidden>
      <svg viewBox="0 0 800 300" preserveAspectRatio="xMidYMax slice">
        <defs>
          <radialGradient id="stage-moon" cx="40%" cy="35%" r="70%">
            <stop offset="0" stopColor="#fff4c4" />
            <stop offset="1" stopColor="#ffd566" />
          </radialGradient>
          <radialGradient id="stage-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="rgba(255,224,138,.35)" />
            <stop offset="1" stopColor="rgba(255,224,138,0)" />
          </radialGradient>
        </defs>
        {/* Placed where it stays visible for wide phone stages and tall portrait ones. */}
        <circle cx={505} cy={106} r={62} fill="url(#stage-glow)" />
        <circle cx={505} cy={106} r={25} fill="url(#stage-moon)" />
        <circle cx={497} cy={99} r={5} fill="#f2c24e" opacity={0.55} />
        <circle cx={513} cy={116} r={3.5} fill="#f2c24e" opacity={0.5} />
        <g fill="#fff6cf">
          {STARS.map(([x, y, r], i) => (
            <circle key={i} className="twinkle" cx={x} cy={y} r={r} style={{ animationDelay: `${(i * 0.73) % 4.8}s` }} />
          ))}
          <path className="twinkle" d={twinkle(180, 60, 8)} style={{ animationDelay: '1.2s' }} />
          <path className="twinkle" d={twinkle(600, 100, 7)} style={{ animationDelay: '2.7s' }} />
        </g>
        <path d="M0,218 C90,196 190,206 300,214 C420,224 520,196 640,202 C720,206 770,214 800,218 L800,300 L0,300 Z" fill="#2c3196" />
        <path d="M0,250 C130,236 250,246 390,250 C530,254 650,238 800,244 L800,300 L0,300 Z" fill="#232783" />
        <path d="M0,276 C160,268 300,274 420,276 C560,278 690,268 800,272 L800,300 L0,300 Z" fill="#1c206f" />
      </svg>
    </div>
  );
});
