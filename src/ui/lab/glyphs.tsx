import type { ReactElement } from 'react';
import type { KeyGlyph } from '../../model/monsters';
import { star5 } from '../monsters/shapes';

// Key glyphs never rely on colour alone: their shape tells you which monster is
// on the keys, and they shrink and rise as the pitch goes up (big & low → tiny & high).

export function KeyGlyph({ glyph, index, count }: { glyph: KeyGlyph; index: number; count: number }) {
  const t = count > 1 ? index / (count - 1) : 0;
  const scale = 1.1 - t * 0.45;
  const transform = `translate(50 50) scale(${scale}) translate(-50 -50)`;
  let shape: ReactElement;
  switch (glyph) {
    case 'star':
      shape = <path d={star5(50, 52, 34)} />;
      break;
    case 'cloud':
      shape = <path d="M26,66 C12,66 10,48 24,44 C22,28 42,22 50,34 C56,20 80,24 78,42 C92,42 94,64 78,66 Z" />;
      break;
    case 'heart':
      shape = <path d="M50,80 C20,60 14,44 22,32 C30,20 46,24 50,36 C54,24 70,20 78,32 C86,44 80,60 50,80 Z" />;
      break;
    case 'blob':
      shape = <path d="M50,20 C74,20 84,40 82,56 C80,74 66,82 50,82 C32,82 18,74 18,56 C18,38 28,20 50,20 Z" />;
      break;
    default:
      shape = (
        <>
          <circle cx={50} cy={52} r={30} />
          <circle cx={40} cy={42} r={7} fill="#fff" opacity={0.7} />
        </>
      );
  }
  return (
    <svg className="glyph glyph-stair" viewBox="0 0 100 100" fill="#fff" style={{ ['--glyph-y' as string]: `${70 - t * 42}%` }}>
      <g transform={transform}>{shape}</g>
    </svg>
  );
}

/** One picture per drum, so kids find "the clap" without reading. */
export function DrumIcon({ pad }: { pad: number }) {
  const stroke = { fill: 'none', stroke: '#fff', strokeWidth: 6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (pad) {
    case 0: // kick: big round drum face
      return (
        <svg className="glyph" viewBox="0 0 100 100">
          <circle cx={50} cy={52} r={34} fill="#fff" opacity={0.9} />
          <circle cx={50} cy={52} r={22} fill="none" stroke="rgba(0,0,0,.18)" strokeWidth={5} />
          <circle cx={50} cy={52} r={7} fill="rgba(0,0,0,.2)" />
        </svg>
      );
    case 1: // snare: drum with sticks
      return (
        <svg className="glyph" viewBox="0 0 100 100">
          <path d="M20,48 L20,70 C20,78 80,78 80,70 L80,48" fill="#fff" opacity={0.9} />
          <ellipse cx={50} cy={48} rx={30} ry={10} fill="#fff" />
          <path {...stroke} d="M30,14 L50,42 M72,12 L56,42" />
        </svg>
      );
    case 2: // hat: small cymbal on a stand
      return (
        <svg className="glyph" viewBox="0 0 100 100">
          <ellipse cx={50} cy={40} rx={34} ry={9} fill="#fff" />
          <ellipse cx={50} cy={50} rx={34} ry={9} fill="#fff" opacity={0.7} />
          <path {...stroke} d="M50,50 L50,86 M38,86 L62,86" />
        </svg>
      );
    case 3: // clap: a hand with motion lines
      return (
        <svg className="glyph" viewBox="0 0 100 100">
          <path
            fill="#fff"
            d="M44,30 C47,30 49,32 49,35 L49,50 L51,50 L51,28 C51,25 53,23 56,23 C59,23 61,25 61,28 L61,50 L63,50 L63,33 C63,30 65,28 68,28 C71,28 73,30 73,33 L73,62 C73,76 63,86 50,86 C40,86 33,80 29,72 L21,57 C19,53 21,49 25,49 C28,49 30,51 32,54 L39,64 L39,35 C39,32 41,30 44,30 Z"
          />
          <path {...stroke} strokeWidth={5} d="M18,30 L26,38 M30,14 L33,24 M80,16 L76,26" />
        </svg>
      );
    case 4: // tom: bongos
      return (
        <svg className="glyph" viewBox="0 0 100 100">
          <path d="M14,44 L20,80 L42,80 L48,44 Z" fill="#fff" opacity={0.9} />
          <ellipse cx={31} cy={44} rx={17} ry={6} fill="#fff" />
          <path d="M52,50 L57,82 L76,82 L82,50 Z" fill="#fff" opacity={0.75} />
          <ellipse cx={67} cy={50} rx={15} ry={5} fill="#fff" />
        </svg>
      );
    case 5: // crash: big cymbal with shimmer
      return (
        <svg className="glyph" viewBox="0 0 100 100">
          <ellipse cx={50} cy={46} rx={40} ry={11} fill="#fff" transform="rotate(-12 50 46)" />
          <path {...stroke} d="M50,52 L50,88" />
          <path {...stroke} strokeWidth={4} d="M16,22 L22,30 M84,18 L78,28 M50,10 L50,20" />
        </svg>
      );
    case 6: // cowbell
      return (
        <svg className="glyph" viewBox="0 0 100 100">
          <path d="M34,26 L66,26 L76,78 L24,78 Z" fill="#fff" />
          <path {...stroke} d="M44,26 L44,16 L56,16 L56,26" />
          <path d="M30,64 L70,64" stroke="rgba(0,0,0,.18)" strokeWidth={5} />
        </svg>
      );
    default: // boing: a spring
      return (
        <svg className="glyph" viewBox="0 0 100 100">
          <path {...stroke} d="M26,82 L74,82 M30,70 C70,70 70,60 30,60 C70,60 70,50 30,50 C70,50 70,40 30,40 C70,40 70,30 30,30" />
          <circle cx={50} cy={20} r={10} fill="#fff" />
        </svg>
      );
  }
}
