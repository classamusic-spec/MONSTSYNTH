import { useId, type ReactElement } from 'react';
import type { SongPicture } from '../../magic/lessons';

// One friendly picture per song, so children who can't read yet can still find
// "the star song" or "the boat song". Flat shapes on a 120 × 120 canvas.

const PICTURES: Record<SongPicture, ReactElement> = {
  buns: (
    <g>
      <ellipse cx="60" cy="88" rx="44" ry="10" fill="#f3e2c3" />
      {[
        [38, 70],
        [82, 70],
        [60, 56],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <ellipse cx={x} cy={y} rx="22" ry="17" fill="#e79a4b" />
          <ellipse cx={x - 5} cy={y - 6} rx="10" ry="5" fill="#f6bd79" opacity="0.8" />
          <path d={`M${x - 11} ${y - 2}h22M${x} ${y - 12}v20`} stroke="#fff7e6" strokeWidth="4" strokeLinecap="round" />
        </g>
      ))}
    </g>
  ),
  lamb: (
    <g>
      <rect x="40" y="80" width="8" height="18" rx="4" fill="#4a3b58" />
      <rect x="72" y="80" width="8" height="18" rx="4" fill="#4a3b58" />
      {[
        [40, 62],
        [56, 54],
        [74, 58],
        [82, 72],
        [60, 76],
        [42, 76],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="15" fill="#ffffff" />
      ))}
      <ellipse cx="92" cy="54" rx="12" ry="14" fill="#5b4a6b" />
      <circle cx="96" cy="50" r="2.6" fill="#fff" />
      <ellipse cx="84" cy="44" rx="7" ry="4" fill="#5b4a6b" transform="rotate(-30 84 44)" />
      <path d="M96 62q3 3 6 0" stroke="#ffb3c8" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </g>
  ),
  star: (
    <g>
      <path d="m60 14 12.4 25.2 27.8 4-20.1 19.6 4.7 27.7L60 77.4 35.2 90.5l4.7-27.7-20.1-19.6 27.8-4Z" fill="#ffd233" />
      <path d="m60 22 9.6 19.4" stroke="#fff3b0" strokeWidth="4" strokeLinecap="round" />
      <circle cx="50" cy="56" r="3.6" fill="#3b2a00" />
      <circle cx="70" cy="56" r="3.6" fill="#3b2a00" />
      <path d="M52 66q8 6 16 0" stroke="#3b2a00" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="20" cy="100" r="3" fill="#fff6cf" />
      <circle cx="100" cy="104" r="2.4" fill="#fff6cf" />
      <circle cx="104" cy="22" r="2" fill="#fff6cf" />
    </g>
  ),
  boat: (
    <g>
      <path d="M8 92q13-9 26 0t26 0 26 0 26 0v20H8Z" fill="#3f8cff" />
      <path d="M22 76h76l-12 16H34Z" fill="#ff6b4a" />
      <rect x="57" y="26" width="5" height="50" rx="2" fill="#6b4a2b" />
      <path d="M62 30l28 38H62Z" fill="#ffffff" />
      <path d="M57 38 34 68h23Z" fill="#ffe08a" />
    </g>
  ),
  farm: (
    <g>
      <rect x="10" y="94" width="100" height="16" rx="6" fill="#4cd964" />
      <path d="M26 54 60 28l34 26v42H26Z" fill="#e0453a" />
      <path d="M20 58 60 26l40 32" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="46" y="66" width="28" height="30" rx="3" fill="#fff" />
      <path d="M46 66l28 30M74 66 46 96" stroke="#e0453a" strokeWidth="3.4" />
      <circle cx="60" cy="48" r="6" fill="#fff" />
    </g>
  ),
  bridge: (
    <g>
      <path d="M6 96q13-8 26 0t28 0 28 0 26 0v16H6Z" fill="#2fd0e8" />
      <path d="M8 60h104v12H8Z" fill="#b97a4b" />
      <path d="M16 72v26M104 72v26" stroke="#8a5530" strokeWidth="8" strokeLinecap="round" />
      <path d="M30 60V30M90 60V30" stroke="#8a5530" strokeWidth="8" strokeLinecap="round" />
      <path d="M30 34q30 26 60 0" stroke="#d9a066" strokeWidth="4" fill="none" />
      <path d="M40 72q20 24 40 0" stroke="#8a5530" strokeWidth="6" fill="none" />
      <path d="M44 22h32" stroke="#ffd233" strokeWidth="6" strokeLinecap="round" />
    </g>
  ),
  joy: (
    <g>
      <path d="M60 100 22 62a20 20 0 0 1 38-26 20 20 0 0 1 38 26Z" fill="#ff5fa2" />
      <path d="M40 50a10 10 0 0 1 12-6" stroke="#ffc3dc" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M92 18v26a6 6 0 1 1-4-5.6V22l14-4v8" stroke="#ffd233" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 20v22a5 5 0 1 1-3.6-4.8" stroke="#2fd0e8" strokeWidth="4" fill="none" strokeLinecap="round" />
    </g>
  ),
  bells: (
    <g>
      <path d="M44 22q16 12 32 0" stroke="#4cd964" strokeWidth="6" fill="none" strokeLinecap="round" />
      {[
        [40, -12],
        [80, 12],
      ].map(([x, r]) => (
        <g key={x} transform={`rotate(${r} ${x} 30)`}>
          <path d={`M${x - 22} 82q0-8 6-12 2-38 16-40 14 2 16 40 6 4 6 12Z`} fill="#ffcf2e" />
          <path d={`M${x - 10} 44q2-8 8-10`} stroke="#fff3b0" strokeWidth="4" fill="none" strokeLinecap="round" />
          <circle cx={x} cy="88" r="7" fill="#e0a300" />
        </g>
      ))}
      <circle cx="60" cy="26" r="7" fill="#e0453a" />
    </g>
  ),
};

export function SongArt({ picture, hue }: { picture: SongPicture; hue: number }) {
  // One gradient id per drawing: two pictures on one page must not share a colour.
  const id = `song-art-bg-${picture}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg className="song-art" viewBox="0 0 120 120" aria-hidden>
      <defs>
        <radialGradient id={id} cx="50%" cy="35%" r="75%">
          <stop offset="0%" stopColor={`hsl(${hue} 70% 42%)`} />
          <stop offset="100%" stopColor={`hsl(${hue} 60% 22%)`} />
        </radialGradient>
      </defs>
      <rect width="120" height="120" rx="22" fill={`url(#${id})`} />
      {PICTURES[picture]}
    </svg>
  );
}
