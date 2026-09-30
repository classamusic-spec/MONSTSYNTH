import type { FxKind } from '../../model/types';

// Effect buddies — tiny monsters that change sound instead of making it.
//  Echo repeats things (it has copies of itself), Gloop is gooey and huge,
//  Chomper eats sounds and makes them crunchy, Wiggle can't stay still.

export function FxBuddy({ kind, className }: { kind: FxKind; className?: string }) {
  switch (kind) {
    case 'echo':
      return (
        <svg className={className} viewBox="0 0 48 48" aria-hidden>
          <path d="M30,10 C38,10 42,17 42,24 L42,36 C42,38 40,39 38,38 L36,37 L34,38 L32,37 L30,38 Z" fill="#3de0c8" opacity={0.3} />
          <path d="M26,10 C34,10 38,17 38,24 L38,36 C38,38 36,39 34,38 L32,37 L30,38 L28,37 L26,38 Z" fill="#3de0c8" opacity={0.5} />
          <path d="M18,8 C27,8 31,15 31,23 L31,37 C31,39 29,40 27,39 L25,38 L22.5,39.5 L20,38 L17.5,39.5 L15,38 L12.5,39.5 L10,38 C8,39 6,38 6,36 L6,23 C6,15 10,8 18,8 Z" fill="#3de0c8" />
          <circle cx={14} cy={21} r={4} fill="#fff" />
          <circle cx={23} cy={21} r={4} fill="#fff" />
          <circle cx={14.8} cy={21.6} r={2} fill="#0a3a36" />
          <circle cx={23.8} cy={21.6} r={2} fill="#0a3a36" />
          <ellipse cx={18.5} cy={29} rx={3} ry={2.4} fill="#0a3a36" />
        </svg>
      );
    case 'gloop':
      return (
        <svg className={className} viewBox="0 0 48 48" aria-hidden>
          <ellipse cx={24} cy={40} rx={18} ry={4} fill="#5fb52f" opacity={0.6} />
          <path d="M24,6 C34,6 40,16 40,26 C40,34 34,40 24,40 C14,40 8,34 8,26 C8,16 14,6 24,6 Z" fill="#8be04e" />
          <path d="M12,30 C12,38 14,42 16,42 C18,42 18,36 18,34" fill="#8be04e" />
          <path d="M33,32 C33,38 34,41 36,41 C38,41 37.5,36 37,33" fill="#8be04e" />
          <circle cx={24} cy={20} r={7} fill="#fff" />
          <circle cx={25} cy={21} r={3.6} fill="#1b3a0a" />
          <circle cx={23.5} cy={19} r={1.2} fill="#fff" />
          <path d="M18,30 Q24,34 30,30" stroke="#1b3a0a" strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <ellipse cx={15} cy={13} rx={3} ry={2} fill="#fff" opacity={0.5} />
        </svg>
      );
    case 'chomper':
      return (
        <svg className={className} viewBox="0 0 48 48" aria-hidden>
          <circle cx={24} cy={25} r={18} fill="#b061ff" />
          <path d="M10,26 L38,26 Q36,42 24,42 Q12,42 10,26 Z" fill="#2a0b45" />
          <path d="M11,26 L15,32 L19,26 L23,32 L27,26 L31,32 L35,26 L37,26" fill="#fff" />
          <circle cx={18} cy={16} r={4.5} fill="#fff" />
          <circle cx={30} cy={16} r={4.5} fill="#fff" />
          <circle cx={18.5} cy={17} r={2.2} fill="#2a0b45" />
          <circle cx={30.5} cy={17} r={2.2} fill="#2a0b45" />
          <path d="M13,9 L17,12 M35,9 L31,12" stroke="#2a0b45" strokeWidth={2.4} strokeLinecap="round" />
        </svg>
      );
    case 'wiggle':
      return (
        <svg className={className} viewBox="0 0 48 48" aria-hidden>
          <path d="M6,32 C10,20 16,20 20,30 C24,40 30,40 34,28 C36,22 40,18 44,20" stroke="#ff5ccf" strokeWidth={9} fill="none" strokeLinecap="round" />
          <circle cx={42} cy={20} r={6.5} fill="#ff5ccf" />
          <circle cx={40.5} cy={18.5} r={2.4} fill="#fff" />
          <circle cx={44.5} cy={18.5} r={2.4} fill="#fff" />
          <circle cx={41} cy={19} r={1.1} fill="#3a0a30" />
          <circle cx={45} cy={19} r={1.1} fill="#3a0a30" />
        </svg>
      );
  }
}
