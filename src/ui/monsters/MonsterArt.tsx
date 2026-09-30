import { memo, useId, type ReactNode } from 'react';
import type { Accessory } from '../../model/monsters';
import type { MonsterKind } from '../../model/types';
import { Accessory as AccessoryArt, ACCESSORY_ANCHORS, EYE_LINE } from './accessories';
import { fuzzyCircle, roundStar, twinkle } from './shapes';

// ─────────────────────────────────────────────────────────────────────────────
// The monster cast, drawn as layered SVG so every part can move: bodies squash
// and stretch from the feet, eyes follow fingers, lids blink, mouths sing,
// antennae wobble. Shapes hint at sound: round & bubbly Bloop sings, fuzzy wide
// Boom stomps, huge heavy-lidded Grumble rumbles, spiky shiny Spark twinkles,
// soft Puff floats, big-eared Mimic listens.
// ─────────────────────────────────────────────────────────────────────────────

const BOOM_BODY = fuzzyCircle(100, 124, 64, 7, 18, 7);
const SPARK_BODY = roundStar(100, 118, 74, 55, 9);

interface Palette {
  light: string;
  base: string;
  dark: string;
}

const PALETTES: Record<MonsterKind, Palette> = {
  bloop: { light: '#a8ecff', base: '#35bdff', dark: '#1467cf' },
  boom: { light: '#ffc189', base: '#ff7d33', dark: '#d44a14' },
  grumble: { light: '#b2f5a3', base: '#52d65f', dark: '#1f9636' },
  spark: { light: '#fff6c2', base: '#ffd43a', dark: '#eb9c00' },
  puff: { light: '#ffffff', base: '#efeaff', dark: '#b3a2f2' },
  mimic: { light: '#ffc0dc', base: '#ff64a8', dark: '#cf2f76' },
};

function Grad({ id, p, cx = '38%', cy = '30%' }: { id: string; p: Palette; cx?: string; cy?: string }) {
  return (
    <radialGradient id={id} cx={cx} cy={cy} r="78%">
      <stop offset="0%" stopColor={p.light} />
      <stop offset="48%" stopColor={p.base} />
      <stop offset="100%" stopColor={p.dark} />
    </radialGradient>
  );
}

interface EyeProps {
  uid: string;
  n: number;
  cx: number;
  cy: number;
  r: number;
  lidColor: string;
  iris?: string;
}

function Eye({ uid, n, cx, cy, r, lidColor, iris = '#1a3d8f' }: EyeProps) {
  const clip = `${uid}-eye${n}`;
  return (
    <g className="m-eye">
      <clipPath id={clip}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <circle cx={cx} cy={cy} r={r} fill={`url(#${uid}-sclera)`} />
      <g clipPath={`url(#${clip})`}>
        <g className="m-pupil">
          <circle cx={cx} cy={cy + r * 0.08} r={r * 0.6} fill={iris} />
          <circle cx={cx} cy={cy + r * 0.08} r={r * 0.38} fill="#0a0c29" />
          <circle cx={cx - r * 0.22} cy={cy - r * 0.16} r={r * 0.18} fill="#fff" />
          <circle cx={cx + r * 0.2} cy={cy + r * 0.26} r={r * 0.09} fill="#fff" opacity={0.85} />
        </g>
        <rect
          className="m-lid"
          x={cx - r - 1}
          y={cy - r - 1}
          width={r * 2 + 2}
          height={r * 2 + 2}
          fill={lidColor}
          style={{ transformOrigin: `${cx}px ${cy - r}px` }}
        />
      </g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(10,12,41,.18)" strokeWidth={1.4} />
      <path
        className="m-lid-line"
        d={`M${cx - r * 0.62},${cy + r * 0.02} Q${cx},${cy + r * 0.5} ${cx + r * 0.62},${cy + r * 0.02}`}
        fill="none"
        stroke="#1a1440"
        strokeWidth={Math.max(2.4, r * 0.15)}
        strokeLinecap="round"
      />
    </g>
  );
}

function Shine({ cx, cy, rx, ry, rot = -25, o = 0.35 }: { cx: number; cy: number; rx: number; ry: number; rot?: number; o?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" opacity={o} transform={`rotate(${rot} ${cx} ${cy})`} />;
}

function Mouth({ d, tongue, closed }: { d: string; tongue?: [number, number, number, number]; closed: string }) {
  return (
    <g className="m-mouth">
      <path className="m-mouth-closed" d={closed} fill="none" stroke="#1b0a2c" strokeWidth={4} strokeLinecap="round" />
      <g className="m-mouth-open">
        <path d={d} fill="#3b0c3a" />
        {tongue && <ellipse cx={tongue[0]} cy={tongue[1]} rx={tongue[2]} ry={tongue[3]} fill="#ff6f8f" />}
      </g>
    </g>
  );
}

const Sparkles = ({ color = '#fff7c7' }: { color?: string }) => (
  <g className="m-sparkles" fill={color}>
    <path d={twinkle(34, 60, 9)} />
    <path d={twinkle(168, 54, 7)} />
    <path d={twinkle(176, 118, 6)} />
    <path d={twinkle(26, 126, 6)} />
  </g>
);

function Bloop({ uid }: { uid: string }) {
  const p = PALETTES.bloop;
  return (
    <>
      <g className="m-antenna m-antenna-l" style={{ transformOrigin: '86px 60px' }}>
        <path d="M86,62 C82,44 70,34 62,24" stroke={p.base} strokeWidth={7} strokeLinecap="round" fill="none" />
        <circle cx={60} cy={21} r={12} fill={`url(#${uid}-ball)`} />
        <circle cx={56} cy={16} r={3.6} fill="#fff" opacity={0.85} />
      </g>
      <g className="m-antenna m-antenna-r" style={{ transformOrigin: '114px 60px' }}>
        <path d="M114,62 C118,44 130,34 138,24" stroke={p.base} strokeWidth={7} strokeLinecap="round" fill="none" />
        <circle cx={140} cy={21} r={12} fill={`url(#${uid}-ball)`} />
        <circle cx={136} cy={16} r={3.6} fill="#fff" opacity={0.85} />
      </g>
      <g className="m-arm m-arm-l" style={{ transformOrigin: '40px 128px' }}>
        <path d="M42,122 C26,122 18,112 20,102 C22,94 32,96 34,104 C35,110 40,112 46,112 Z" fill={p.base} />
      </g>
      <g className="m-arm m-arm-r" style={{ transformOrigin: '160px 128px' }}>
        <path d="M158,122 C174,120 184,108 182,98 C180,90 170,92 168,100 C167,106 162,110 156,112 Z" fill={p.base} />
      </g>
      <path
        className="m-skin"
        d="M100,50 C141,50 163,82 165,121 L167,166 C167,175 160,181 153,179 C147,177 143,186 135,186 C128,186 125,178 118,179 C111,180 108,188 100,188 C92,188 89,180 82,179 C75,178 72,186 65,186 C57,186 53,177 47,179 C40,181 33,175 33,166 L35,121 C37,82 59,50 100,50 Z"
        fill={`url(#${uid}-body)`}
      />
      <Shine cx={70} cy={80} rx={20} ry={11} />
      <g fill={p.light} opacity={0.55}>
        <circle cx={140} cy={138} r={6} />
        <circle cx={151} cy={116} r={4} />
        <circle cx={58} cy={150} r={5} />
        <circle cx={48} cy={128} r={3.5} />
        <circle cx={126} cy={164} r={4} />
        <circle cx={76} cy={168} r={3} />
      </g>
      <g className="m-face">
        <Eye uid={uid} n={1} cx={100} cy={106} r={31} lidColor={p.base} />
        <Mouth closed="M84,150 Q100,164 116,150" d="M80,146 Q100,182 120,146 Q100,154 80,146 Z" tongue={[100, 163, 9, 5.5]} />
      </g>
    </>
  );
}

function Boom({ uid }: { uid: string }) {
  const p = PALETTES.boom;
  return (
    <>
      <g className="m-foot m-foot-l">
        <ellipse cx={74} cy={183} rx={20} ry={10} fill={p.dark} />
      </g>
      <g className="m-foot m-foot-r">
        <ellipse cx={126} cy={183} rx={20} ry={10} fill={p.dark} />
      </g>
      <g className="m-antenna m-antenna-l" style={{ transformOrigin: '76px 70px' }}>
        <path d="M78,68 C72,52 64,46 60,34 C68,38 80,46 88,62 Z" fill="#ffe2a6" />
      </g>
      <g className="m-antenna m-antenna-r" style={{ transformOrigin: '124px 70px' }}>
        <path d="M122,68 C128,52 136,46 140,34 C132,38 120,46 112,62 Z" fill="#ffe2a6" />
      </g>
      <g className="m-arm m-arm-l" style={{ transformOrigin: '44px 130px' }}>
        <path d="M46,124 C30,126 20,118 20,108 C20,100 30,100 32,108 C33,113 38,115 46,114 Z" fill={p.base} />
      </g>
      <g className="m-arm m-arm-r" style={{ transformOrigin: '156px 130px' }}>
        <path d="M154,124 C170,126 180,118 180,108 C180,100 170,100 168,108 C167,113 162,115 154,114 Z" fill={p.base} />
      </g>
      <path className="m-skin" d={BOOM_BODY} fill={`url(#${uid}-body)`} />
      <ellipse cx={100} cy={146} rx={40} ry={30} fill={p.light} opacity={0.45} />
      <Shine cx={72} cy={82} rx={16} ry={9} o={0.3} />
      <g className="m-face">
        <path d="M62,86 Q76,78 90,86" stroke="#7a2600" strokeWidth={4.5} strokeLinecap="round" fill="none" />
        <path d="M110,86 Q124,78 138,86" stroke="#7a2600" strokeWidth={4.5} strokeLinecap="round" fill="none" />
        <Eye uid={uid} n={1} cx={78} cy={106} r={17} lidColor={p.base} />
        <Eye uid={uid} n={2} cx={122} cy={106} r={17} lidColor={p.base} />
        <g className="m-mouth">
          <path className="m-mouth-closed" d="M76,136 Q100,154 124,136" fill="none" stroke="#1b0a2c" strokeWidth={4} strokeLinecap="round" />
          <g className="m-mouth-open">
            <path d="M70,130 Q100,178 130,130 Q100,140 70,130 Z" fill="#3b0c1e" />
            <ellipse cx={100} cy={154} rx={13} ry={7} fill="#ff6f8f" />
            <path d="M82,133 L88,145 L94,135 Z" fill="#fff" />
            <path d="M106,135 L112,145 L118,133 Z" fill="#fff" />
          </g>
        </g>
      </g>
    </>
  );
}

function Grumble({ uid }: { uid: string }) {
  const p = PALETTES.grumble;
  return (
    <>
      <g fill="#b9f5a8">
        <circle cx={56} cy={82} r={10} />
        <circle cx={78} cy={66} r={11} />
        <circle cx={100} cy={61} r={12} />
        <circle cx={122} cy={66} r={11} />
        <circle cx={144} cy={82} r={10} />
      </g>
      <g className="m-arm m-arm-l" style={{ transformOrigin: '30px 136px' }}>
        <path d="M34,128 C18,132 10,146 16,154 C22,160 30,152 32,146 C34,142 38,140 40,140 Z" fill={p.base} />
      </g>
      <g className="m-arm m-arm-r" style={{ transformOrigin: '170px 136px' }}>
        <path d="M166,128 C182,132 190,146 184,154 C178,160 170,152 168,146 C166,142 162,140 160,140 Z" fill={p.base} />
      </g>
      <path
        className="m-skin"
        d="M24,156 C18,106 50,66 100,66 C150,66 182,106 176,156 C173,181 150,189 100,189 C50,189 27,181 24,156 Z"
        fill={`url(#${uid}-body)`}
      />
      <Shine cx={62} cy={92} rx={20} ry={10} o={0.3} />
      <g fill={p.dark} opacity={0.28}>
        <circle cx={46} cy={150} r={7} />
        <circle cx={154} cy={146} r={6} />
        <circle cx={140} cy={170} r={4} />
        <circle cx={62} cy={172} r={4} />
      </g>
      <ellipse cx={100} cy={166} rx={46} ry={18} fill={p.light} opacity={0.35} />
      <g className="m-face">
        <Eye uid={uid} n={1} cx={72} cy={112} r={19} lidColor={p.dark} />
        <Eye uid={uid} n={2} cx={128} cy={112} r={19} lidColor={p.dark} />
        <g className="m-mouth">
          <path className="m-mouth-closed" d="M66,146 Q100,166 134,146" fill="none" stroke="#10301a" strokeWidth={4.5} strokeLinecap="round" />
          <g className="m-mouth-open">
            <path d="M60,140 Q100,184 140,140 Q100,150 60,140 Z" fill="#12321b" />
            <ellipse cx={100} cy={163} rx={14} ry={6} fill="#ff7f97" />
            <g fill="#fff">
              <rect x={76} y={142} width={9} height={9} rx={2} />
              <rect x={90} y={144} width={9} height={9} rx={2} />
              <rect x={104} y={144} width={9} height={9} rx={2} />
              <rect x={118} y={142} width={9} height={9} rx={2} />
            </g>
          </g>
        </g>
      </g>
    </>
  );
}

function Spark({ uid }: { uid: string }) {
  const p = PALETTES.spark;
  return (
    <>
      <path className="m-skin" d={SPARK_BODY} fill={`url(#${uid}-body)`} />
      <circle cx={100} cy={120} r={50} fill={p.light} opacity={0.35} />
      <Shine cx={76} cy={84} rx={15} ry={8} o={0.45} />
      <g className="m-face">
        <Eye uid={uid} n={1} cx={82} cy={112} r={14} lidColor={p.base} iris="#8a4b00" />
        <Eye uid={uid} n={2} cx={118} cy={112} r={14} lidColor={p.base} iris="#8a4b00" />
        <ellipse cx={67} cy={132} rx={8} ry={5} fill="#ff7aa2" opacity={0.6} />
        <ellipse cx={133} cy={132} rx={8} ry={5} fill="#ff7aa2" opacity={0.6} />
        <Mouth closed="M90,136 Q100,146 110,136" d="M86,132 Q100,158 114,132 Q100,138 86,132 Z" tongue={[100, 145, 6, 4]} />
      </g>
      <Sparkles />
    </>
  );
}

function Puff({ uid }: { uid: string }) {
  const p = PALETTES.puff;
  return (
    <>
      <path
        className="m-skin"
        d="M44,168 C24,166 20,140 38,130 C30,106 54,86 76,96 C82,70 118,62 132,86 C156,78 176,100 166,124 C186,130 184,164 160,170 C140,176 64,176 44,168 Z"
        fill={`url(#${uid}-body)`}
      />
      <Shine cx={80} cy={100} rx={18} ry={9} o={0.6} />
      <g className="m-face">
        <Eye uid={uid} n={1} cx={84} cy={130} r={10} lidColor={p.base} iris="#4a3b9a" />
        <Eye uid={uid} n={2} cx={116} cy={130} r={10} lidColor={p.base} iris="#4a3b9a" />
        <ellipse cx={70} cy={146} rx={8} ry={5} fill="#ff9ec4" opacity={0.7} />
        <ellipse cx={130} cy={146} rx={8} ry={5} fill="#ff9ec4" opacity={0.7} />
        <Mouth closed="M92,150 Q100,157 108,150" d="M90,147 Q100,164 110,147 Q100,151 90,147 Z" tongue={[100, 156, 5, 3]} />
      </g>
    </>
  );
}

function Mimic({ uid }: { uid: string }) {
  const p = PALETTES.mimic;
  return (
    <>
      <g className="m-antenna m-antenna-l" style={{ transformOrigin: '66px 88px' }}>
        <circle cx={52} cy={70} r={27} fill={`url(#${uid}-body)`} />
        <circle cx={52} cy={70} r={15} fill="#ffc6de" />
        <path d="M46,70 Q52,60 58,70 Q52,80 46,70" fill="none" stroke="#e45a98" strokeWidth={3} />
      </g>
      <g className="m-antenna m-antenna-r" style={{ transformOrigin: '134px 88px' }}>
        <circle cx={148} cy={70} r={27} fill={`url(#${uid}-body)`} />
        <circle cx={148} cy={70} r={15} fill="#ffc6de" />
        <path d="M142,70 Q148,60 154,70 Q148,80 142,70" fill="none" stroke="#e45a98" strokeWidth={3} />
      </g>
      <path
        className="m-skin"
        d="M100,64 C142,64 162,96 162,130 C162,168 138,188 100,188 C62,188 38,168 38,130 C38,96 58,64 100,64 Z"
        fill={`url(#${uid}-body)`}
      />
      <path d="M96,66 C92,52 100,44 110,48 C104,50 102,56 106,62" fill="none" stroke={p.dark} strokeWidth={5} strokeLinecap="round" />
      <Shine cx={74} cy={90} rx={16} ry={9} o={0.35} />
      <g className="m-face">
        <Eye uid={uid} n={1} cx={80} cy={114} r={15} lidColor={p.base} iris="#7a1745" />
        <Eye uid={uid} n={2} cx={120} cy={114} r={15} lidColor={p.base} iris="#7a1745" />
        <path d="M60,138 l5,-5 l5,5 l-5,5 Z" fill="#fff" opacity={0.5} />
        <path d="M130,138 l5,-5 l5,5 l-5,5 Z" fill="#fff" opacity={0.5} />
        <g className="m-mouth">
          <path className="m-mouth-closed" d="M88,150 Q100,160 112,150" fill="none" stroke="#3b0c2a" strokeWidth={4} strokeLinecap="round" />
          <g className="m-mouth-open">
            <ellipse cx={100} cy={154} rx={15} ry={13} fill="#3b0c2a" />
            <ellipse cx={100} cy={161} rx={8} ry={4.5} fill="#ff8fb0" />
          </g>
        </g>
      </g>
    </>
  );
}

const BODIES: Record<MonsterKind, (p: { uid: string }) => ReactNode> = {
  bloop: Bloop,
  boom: Boom,
  grumble: Grumble,
  spark: Spark,
  puff: Puff,
  mimic: Mimic,
};

export interface MonsterArtProps {
  kind: MonsterKind;
  accessory?: Accessory;
  className?: string;
  /** Echo copies behind the monster (visualises the delay). */
  echoes?: boolean;
  title?: string;
}

export const MonsterArt = memo(function MonsterArt({ kind, accessory = 'none', className, echoes, title }: MonsterArtProps) {
  const uid = `m${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const p = PALETTES[kind];
  const Body = BODIES[kind];
  const anchor = ACCESSORY_ANCHORS[kind];
  return (
    <svg
      className={`monster-svg ${className ?? ''}`}
      viewBox="0 0 200 200"
      data-kind={kind}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      preserveAspectRatio="xMidYMax meet"
    >
      <defs>
        <Grad id={`${uid}-body`} p={p} />
        <radialGradient id={`${uid}-ball`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#e6fbff" />
          <stop offset="55%" stopColor={p.light} />
          <stop offset="100%" stopColor={p.base} />
        </radialGradient>
        <radialGradient id={`${uid}-sclera`} cx="45%" cy="35%" r="70%">
          <stop offset="70%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d6e2ff" />
        </radialGradient>
        {echoes && (
          <filter id={`${uid}-ghost`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="0 0 0 0 0.24  0 0 0 0 0.88  0 0 0 0 0.78  0 0 0 0.75 0" />
          </filter>
        )}
      </defs>
      <ellipse className="m-shadow" cx={100} cy={192} rx={kind === 'grumble' ? 70 : 52} ry={6.5} fill="#050622" opacity={0.35} />
      {echoes && (
        <g className="m-echoes" aria-hidden>
          <use href={`#${uid}-figure`} className="m-echo m-echo-1" filter={`url(#${uid}-ghost)`} />
          <use href={`#${uid}-figure`} className="m-echo m-echo-2" filter={`url(#${uid}-ghost)`} />
        </g>
      )}
      <g className="m-body" style={{ transformOrigin: '100px 190px' }}>
        <g id={`${uid}-figure`}>
          <Body uid={uid} />
          {accessory !== 'none' && (
            <g className="m-accessory" transform={`translate(${anchor.x} ${anchor.y}) scale(${anchor.s}) rotate(${anchor.r ?? 0})`}>
              <AccessoryArt kind={accessory} uid={uid} eyeY={EYE_LINE[kind]} />
            </g>
          )}
        </g>
      </g>
    </svg>
  );
});
