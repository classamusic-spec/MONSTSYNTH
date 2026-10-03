import { useId, type ReactElement } from 'react';
import type { CoverPicture } from '../../magic/names';

// A song's cover picture, picked from the noun in its name ("…Rocket" → a
// rocket), so children who can't read yet can still find "the rocket song".
// Flat shapes on a 120 × 120 canvas, in the same style as the Learn pictures.

/** A four-point twinkle. */
const sparkle = (x: number, y: number, r: number) => `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;

/** A teardrop (raindrop) hanging from its tip at (x, y). */
const drop = (x: number, y: number) => `M${x} ${y}q7 9 0 13q-7-4 0-13Z`;

const INK = '#2a1240';

const PICTURES: Record<CoverPicture, ReactElement> = {
  disco: (
    <g>
      <path d="M60 6v18" stroke="#e8ecff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="58" r="34" fill="#b9c4ff" />
      <path d="M32 38h56M27 48h66M26 58h68M27 68h66M32 78h56" stroke="#8692e6" strokeWidth="2" />
      <ellipse cx="60" cy="58" rx="12" ry="34" fill="none" stroke="#8692e6" strokeWidth="2" />
      <ellipse cx="60" cy="58" rx="25" ry="34" fill="none" stroke="#8692e6" strokeWidth="2" />
      <path d="M50 40h9v8h-9ZM62 60h10v8H62ZM38 60h9v8h-9Z" fill="#f2f4ff" />
      <path d="M74 40h9v8h-9ZM50 70h9v8h-9Z" fill="#ff8fd8" />
      <circle cx="46" cy="44" r="6" fill="#fff" opacity="0.85" />
      <path d={sparkle(20, 24, 8)} fill="#ffd233" />
      <path d={sparkle(100, 30, 7)} fill="#2fd0e8" />
      <path d={sparkle(98, 98, 9)} fill="#ff5fd0" />
      <path d={sparkle(22, 96, 6)} fill="#4cd964" />
    </g>
  ),
  rocket: (
    <g>
      <path d="M48 82q12 34 24 0Z" fill="#ff9a2b" />
      <path d="M53 82q7 20 14 0Z" fill="#ffe066" />
      <path d="M43 62 27 86l17-4ZM77 62l16 24-17-4Z" fill="#ff4f7e" />
      <path d="M60 12c17 13 21 36 18 70H42c-3-34 1-57 18-70Z" fill="#f4f6ff" />
      <path d="M60 12c8 6 13 13 15 20H45c2-7 7-14 15-20Z" fill="#ff4f7e" />
      <circle cx="60" cy="50" r="10" fill="#3f8cff" stroke="#b8c8ff" strokeWidth="4" />
      <circle cx="57" cy="47" r="3" fill="#fff" opacity="0.8" />
      <path d="M51 82V68h18v14" fill="#d8ddff" />
      <path d={sparkle(22, 28, 7)} fill="#ffd233" />
      <path d={sparkle(98, 50, 6)} fill="#fff6cf" />
      <circle cx="96" cy="22" r="2.6" fill="#fff6cf" />
      <circle cx="20" cy="66" r="2.2" fill="#fff6cf" />
      <circle cx="96" cy="90" r="2.4" fill="#fff6cf" />
    </g>
  ),
  moon: (
    <g>
      <path d="M57.3 22A38 38 0 1 0 92.8 75.2 32 32 0 0 1 57.3 22Z" fill="#ffd566" />
      <path d="M50 30a30 30 0 0 0-22 26" stroke="#fff1b8" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M28 58q5 5 11 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="31" cy="68" r="4" fill="#ff9fb8" opacity="0.8" />
      <path d="M33 76q5 4 10 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M80 18h10l-10 10h10M98 6h7l-7 7h7" stroke="#e8ecff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={sparkle(100, 46, 6)} fill="#fff6cf" />
      <circle cx="104" cy="98" r="2.6" fill="#fff6cf" />
      <circle cx="14" cy="20" r="2.2" fill="#fff6cf" />
    </g>
  ),
  basket: (
    <g>
      <path d="M38 56q22-44 44 0" stroke="#8a5530" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M22 56h76l-9 42H31Z" fill="#d99550" />
      <path d="M26 70h68M29 84h62M44 56l-3 42M60 56v42M76 56l3 42" stroke="#a8682f" strokeWidth="3" />
      <path d="M18 50h84v10H18Z" fill="#e0453a" />
      <path d="M18 50h10v10H18ZM38 50h10v10H38ZM58 50h10v10H58ZM78 50h10v10H78ZM98 50h4v10h-4Z" fill="#fff" />
      <circle cx="76" cy="42" r="9" fill="#ff4f4f" />
      <path d="M76 33q1-6 6-8" stroke="#6b4a2b" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <ellipse cx="84" cy="30" rx="5" ry="2.6" fill="#4cd964" transform="rotate(-25 84 30)" />
      <circle cx="73" cy="39" r="2.4" fill="#fff" opacity="0.7" />
    </g>
  ),
  banana: (
    <g>
      <path d="M20 36c6 52 52 74 86 44 2-3 0-6-4-6-30 16-58 2-66-40-1-5-15-4-16 2Z" fill="#ffd233" />
      <path d="M30 46c8 26 30 40 58 36" stroke="#fff3b0" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d="M102 74c5 0 6 4 4 6-2 1-5 0-6-2Z" fill="#6b4a2b" />
      <path d="M20 36l-3-10 8-2 3 9Z" fill="#8a6a2b" />
      <circle cx="58" cy="78" r="3" fill={INK} />
      <circle cx="70" cy="80" r="3" fill={INK} />
      <path d="M59 86q6 4 12 1" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d={sparkle(96, 26, 8)} fill="#fff6cf" />
      <circle cx="18" cy="98" r="2.6" fill="#fff6cf" />
    </g>
  ),
  pancake: (
    <g>
      <ellipse cx="60" cy="98" rx="46" ry="9" fill="#e8ecff" />
      {[86, 74, 62].map((y) => (
        <g key={y}>
          <path d={`M22 ${y}v6a38 10 0 0 0 76 0v-6Z`} fill="#d98b3a" />
          <ellipse cx="60" cy={y} rx="38" ry="10" fill="#f2b766" />
        </g>
      ))}
      <path d="M30 60q30 12 60 0v6q-3 6-6 0-7 12-13 1-6 9-12 0-6 13-12 1-5 8-10-2Z" fill="#b5651d" />
      <path d="M50 48h20v11H50Z" fill="#ffe680" />
      <path d="M52 48h16v3H52Z" fill="#fff6c7" />
      <path d={sparkle(98, 30, 8)} fill="#fff6cf" />
      <path d={sparkle(22, 36, 6)} fill="#ffd233" />
    </g>
  ),
  volcano: (
    <g>
      <circle cx="44" cy="22" r="7" fill="#ff8a2b" />
      <circle cx="62" cy="12" r="8" fill="#ffcf2e" />
      <circle cx="80" cy="24" r="6" fill="#ff4f4f" />
      <path d="M12 104 46 42h28l34 62Z" fill="#7a4565" />
      <path d="M46 42q14 9 28 0l-4 8q-10 5-20 0Z" fill="#ff6b2b" />
      <path d="M50 46q4 16-3 28 7-3 9-12 2 11 8 14-2-17 6-30Z" fill="#ff8a2b" />
      <circle cx="50" cy="80" r="3.2" fill={INK} />
      <circle cx="70" cy="80" r="3.2" fill={INK} />
      <path d="M54 90q6 5 12 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M12 104h96v8H12Z" fill="#4a2f6b" />
    </g>
  ),
  flower: (
    <g>
      <path d="M60 62v40" stroke="#3fbf55" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="46" cy="86" rx="12" ry="6" fill="#4cd964" transform="rotate(-30 46 86)" />
      <ellipse cx="74" cy="80" rx="12" ry="6" fill="#4cd964" transform="rotate(30 74 80)" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <ellipse key={a} cx="60" cy="30" rx="9" ry="15" fill={a % 90 ? '#ff8fc4' : '#ff5fa2'} transform={`rotate(${a} 60 50)`} />
      ))}
      <circle cx="60" cy="50" r="13" fill="#ffd233" />
      <circle cx="55" cy="48" r="2.4" fill={INK} />
      <circle cx="65" cy="48" r="2.4" fill={INK} />
      <path d="M55 55q5 4 10 0" stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M10 102h100v12H10Z" fill="#4cd964" />
      <path d={sparkle(100, 22, 7)} fill="#fff6cf" />
    </g>
  ),
  rain: (
    <g>
      <path d="M66 64l-9 15h8l-6 15 15-19h-8l6-11Z" fill="#ffd233" />
      <path d={drop(36, 76)} fill="#2fd0e8" />
      <path d={drop(50, 90)} fill="#2fd0e8" />
      <path d={drop(84, 80)} fill="#2fd0e8" />
      <path d={drop(96, 94)} fill="#2fd0e8" />
      <path d={drop(24, 96)} fill="#2fd0e8" />
      <circle cx="42" cy="50" r="17" fill="#e8ecff" />
      <circle cx="62" cy="38" r="22" fill="#e8ecff" />
      <circle cx="82" cy="50" r="17" fill="#e8ecff" />
      <path d="M42 50h40v17H42Z" fill="#e8ecff" />
      <path d="M25 52a17 17 0 0 0 17 15h40a17 17 0 0 0 17-15" fill="#c9d0f5" />
      <path d="M52 46q4 4 8 0M66 46q4 4 8 0" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M58 55q5 4 10 0" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </g>
  ),
  tent: (
    <g>
      <path d="M60 22V8" stroke="#e8ecff" strokeWidth="3" strokeLinecap="round" />
      <path d="M60 8l13 5-13 5Z" fill="#ffd233" />
      <path d="M22 58h76v42H22Z" fill="#ff4f7e" />
      <path d="M34 58h12v42H34ZM74 58h12v42H74Z" fill="#fff" />
      <path d="M48 100q12-34 24 0Z" fill="#3b1a5c" />
      <path d="M60 20 104 60H16Z" fill="#ff4f7e" />
      <path d="M60 20 36 60h14ZM60 20l10 40h14Z" fill="#fff" />
      {[22, 34, 46, 58, 70, 82, 94].map((x) => (
        <circle key={x} cx={x + 4} cy="61" r="6" fill="#ffd233" />
      ))}
      <path d={sparkle(16, 30, 6)} fill="#fff6cf" />
      <path d={sparkle(104, 34, 7)} fill="#2fd0e8" />
    </g>
  ),
  notes: (
    <g>
      <path d="M51 84V36l40-8v48" stroke="#fff" strokeWidth="5" fill="none" strokeLinejoin="round" />
      <path d="M51 36l40-8v12l-40 8Z" fill="#ffd233" />
      <ellipse cx="41" cy="86" rx="12" ry="9" fill="#ff5fd0" transform="rotate(-18 41 86)" />
      <ellipse cx="81" cy="78" rx="12" ry="9" fill="#2fd0e8" transform="rotate(-18 81 78)" />
      <path d={sparkle(22, 30, 8)} fill="#fff6cf" />
      <path d={sparkle(102, 98, 7)} fill="#ffd233" />
      <path d={sparkle(100, 20, 5)} fill="#4cd964" />
      <circle cx="20" cy="104" r="2.6" fill="#fff6cf" />
    </g>
  ),
  jelly: (
    <g>
      <ellipse cx="60" cy="98" rx="44" ry="8" fill="#e8ecff" />
      <path d="M28 94q-2-44 12-54 20-12 40 0 14 10 12 54Z" fill="#4cd964" />
      <ellipse cx="60" cy="42" rx="20" ry="7" fill="#8ff09a" />
      <path d="M38 52q-2 16 0 30" stroke="#d4ffd9" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.8" />
      <circle cx="60" cy="26" r="8" fill="#ff4f4f" />
      <path d="M60 18q2-8 8-10" stroke="#6b4a2b" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="57" cy="23" r="2.4" fill="#fff" opacity="0.7" />
      <circle cx="51" cy="66" r="3.2" fill={INK} />
      <circle cx="69" cy="66" r="3.2" fill={INK} />
      <path d="M54 75q6 5 12 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M16 56q-5 8 0 16M104 56q5 8 0 16" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
    </g>
  ),
};

/**
 * The main colour of each picture (a hue), or null when it is mostly white. A
 * song whose colour is too close gets the opposite backdrop, so a yellow banana
 * never melts into a mustard sky.
 */
const KEY_HUE: Record<CoverPicture, number | null> = {
  disco: 230,
  rocket: null,
  moon: 43,
  basket: 31,
  banana: 48,
  pancake: 35,
  volcano: 323,
  flower: 335,
  rain: 188,
  tent: 343,
  notes: null,
  jelly: 128,
};

/** The backdrop hue for a picture on a song of `hue`: the song's own colour, unless they clash. */
function backdropHue(picture: CoverPicture | null, hue: number): number {
  const key = picture ? KEY_HUE[picture] : null;
  if (key === null) return hue;
  const apart = Math.abs((((hue - key) % 360) + 540) % 360 - 180);
  return apart < 45 ? (hue + 180) % 360 : hue;
}

/** A cover picture on its backdrop. With no picture, just the backdrop (another drawing goes on top). */
export function CoverArt({ picture, hue }: { picture: CoverPicture | null; hue: number }) {
  // Several covers can share a picture in different colours: each needs its own gradient.
  const bg = `cover-bg-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const h = backdropHue(picture, hue);
  return (
    <svg className="cover-art" viewBox="0 0 120 120" aria-hidden>
      <defs>
        <radialGradient id={bg} cx="50%" cy="35%" r="75%">
          <stop offset="0%" stopColor={`hsl(${h} 70% 46%)`} />
          <stop offset="100%" stopColor={`hsl(${h} 60% 24%)`} />
        </radialGradient>
      </defs>
      <rect width="120" height="120" rx="22" fill={`url(#${bg})`} />
      {picture && PICTURES[picture]}
    </svg>
  );
}
