import type { Accessory as AccessoryKind } from '../../model/monsters';
import type { MonsterKind } from '../../model/types';
import { star5, twinkle } from './shapes';

// Costumes: changing a monster's sound changes what it wears, so kids can *see*
// which sound is on. Drawn around (0,0) = the spot where a hat sits on a head.

export const ACCESSORY_ANCHORS: Record<MonsterKind, { x: number; y: number; s: number; r?: number }> = {
  bloop: { x: 100, y: 54, s: 0.9 },
  boom: { x: 100, y: 62, s: 1 },
  grumble: { x: 100, y: 70, s: 1.05, r: -4 },
  spark: { x: 100, y: 50, s: 0.85 },
  puff: { x: 104, y: 72, s: 0.85, r: 6 },
  mimic: { x: 100, y: 66, s: 0.9 },
};

/** Distance from the hat spot down to the eyes (accessory units), for glasses. */
export const EYE_LINE: Record<MonsterKind, number> = { bloop: 58, boom: 44, grumble: 40, spark: 73, puff: 68, mimic: 53 };

export function Accessory({ kind, uid, eyeY }: { kind: AccessoryKind; uid: string; eyeY: number }) {
  switch (kind) {
    case 'crown':
      return (
        <g>
          <path d="M-26,0 L-30,-30 L-14,-16 L0,-36 L14,-16 L30,-30 L26,0 Z" fill="#ffd23f" stroke="#e39b00" strokeWidth={2.5} strokeLinejoin="round" />
          <rect x={-27} y={-6} width={54} height={8} rx={3} fill="#ffb300" />
          <circle cx={0} cy={-2} r={3.5} fill="#ff4f8b" />
          <circle cx={-15} cy={-2} r={2.6} fill="#2eb8ff" />
          <circle cx={15} cy={-2} r={2.6} fill="#4fd65c" />
        </g>
      );
    case 'party':
      return (
        <g transform="rotate(12)">
          <path d="M-18,0 L0,-46 L18,0 Z" fill="#9d5cff" />
          <path d="M-12,-15 L12,-15 L8,-25 L-8,-25 Z" fill="#ffd23f" />
          <path d="M-5,-34 L5,-34 L3,-40 L-3,-40 Z" fill="#ff4f8b" />
          <circle cx={0} cy={-48} r={6} fill="#ff4f8b" />
          <ellipse cx={0} cy={0} rx={19} ry={4} fill="#7b3fe0" />
        </g>
      );
    case 'beanie':
      return (
        <g>
          <path d="M-32,0 C-32,-30 32,-30 32,0 Z" fill="#5b6cff" />
          <path d="M-20,-14 C-12,-26 12,-26 20,-14" stroke="#8a97ff" strokeWidth={3} fill="none" />
          <rect x={-34} y={-6} width={68} height={10} rx={5} fill="#ffd23f" />
          <path d="M22,-18 C40,-30 46,-10 52,4" stroke="#5b6cff" strokeWidth={7} strokeLinecap="round" fill="none" />
          <circle cx={53} cy={8} r={7} fill="#ffffff" />
        </g>
      );
    case 'headphones':
      return (
        <g>
          <path d="M-46,14 C-46,-40 46,-40 46,14" stroke="#23264f" strokeWidth={7} fill="none" strokeLinecap="round" />
          <rect x={-56} y={4} width={18} height={30} rx={8} fill="#ff4f8b" />
          <rect x={38} y={4} width={18} height={30} rx={8} fill="#ff4f8b" />
          <rect x={-52} y={10} width={6} height={18} rx={3} fill="#ffa3c4" />
          <rect x={46} y={10} width={6} height={18} rx={3} fill="#ffa3c4" />
        </g>
      );
    case 'flower':
      return (
        <g transform="translate(26 -6)">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx={0} cy={-10} rx={7} ry={10} fill="#ff8ac2" transform={`rotate(${a})`} />
          ))}
          <circle cx={0} cy={0} r={6} fill="#ffd23f" />
          <path d="M-4,8 C-10,18 -6,24 -12,30" stroke="#4fd65c" strokeWidth={3} fill="none" />
        </g>
      );
    case 'bow':
      return (
        <g transform="translate(0 -6)">
          <path d="M0,0 C-10,-14 -30,-16 -30,-2 C-30,10 -12,8 0,0 Z" fill="#ff5fa2" />
          <path d="M0,0 C10,-14 30,-16 30,-2 C30,10 12,8 0,0 Z" fill="#ff5fa2" />
          <circle cx={0} cy={-1} r={6} fill="#ff2f86" />
        </g>
      );
    case 'halo':
      return (
        <g className="m-halo" transform="translate(0 -22)">
          <ellipse cx={0} cy={0} rx={30} ry={8} fill="none" stroke={`url(#${uid}-halo)`} strokeWidth={6} />
          <defs>
            <linearGradient id={`${uid}-halo`} x1="0" x2="1">
              <stop offset="0" stopColor="#fff3a6" />
              <stop offset="0.5" stopColor="#ffd23f" />
              <stop offset="1" stopColor="#fff3a6" />
            </linearGradient>
          </defs>
          <path d={twinkle(34, -8, 6)} fill="#fff7c7" />
        </g>
      );
    case 'shades':
      return (
        <g transform={`translate(0 ${eyeY})`}>
          <path d={star5(-18, 0, 17)} fill="#23264f" stroke="#ff4f8b" strokeWidth={3} strokeLinejoin="round" />
          <path d={star5(18, 0, 17)} fill="#23264f" stroke="#ff4f8b" strokeWidth={3} strokeLinejoin="round" />
          <path d="M-4,-2 L4,-2" stroke="#ff4f8b" strokeWidth={3} />
          <path d="M-24,-6 L-16,-10" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" opacity={0.8} />
          <path d="M12,-6 L20,-10" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" opacity={0.8} />
        </g>
      );
    default:
      return null;
  }
}
