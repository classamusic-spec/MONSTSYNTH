import type { ReactElement, SVGProps } from 'react';

// Chunky, rounded icons drawn on a 24×24 grid. Filled where a child needs a
// clear silhouette (play, record), stroked where lightness helps (undo, grid).

export type IconName =
  | 'home'
  | 'lab'
  | 'blocks'
  | 'brush'
  | 'play'
  | 'stop'
  | 'record'
  | 'undo'
  | 'redo'
  | 'plus'
  | 'minus'
  | 'lock'
  | 'moon'
  | 'star'
  | 'eraser'
  | 'stars'
  | 'wand'
  | 'hat'
  | 'mic'
  | 'trash'
  | 'loop'
  | 'zzz'
  | 'check'
  | 'close'
  | 'turtle'
  | 'rabbit'
  | 'note'
  | 'speaker'
  | 'download'
  | 'copy'
  | 'pencil'
  | 'rainbow'
  | 'hand'
  | 'rotate';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const F = { fill: 'currentColor' } as const;

const ICONS: Record<IconName, ReactElement> = {
  home: (
    <>
      <path {...F} d="M12 3.2 2.8 11a1.2 1.2 0 0 0 .8 2.1H5V20a1.5 1.5 0 0 0 1.5 1.5h3.2v-5.2a1 1 0 0 1 1-1h2.6a1 1 0 0 1 1 1v5.2h3.2A1.5 1.5 0 0 0 19 20v-6.9h1.4a1.2 1.2 0 0 0 .8-2.1Z" />
    </>
  ),
  lab: (
    <>
      <path {...F} d="M12 3.5c4.6 0 7.8 3.4 7.8 8.1v7.6c0 1-.9 1.6-1.8 1.2-.8-.4-1.6.8-2.6.8-1 0-1.4-.9-2.3-.9-.9 0-1.2 1.2-2.4 1.2s-1.5-1.2-2.4-1.2-1.3.9-2.3.9c-1 0-1.8-1.2-2.6-.8-.9.4-1.8-.2-1.8-1.2v-7.6c0-4.7 3.2-8.1 7.8-8.1Z" />
      <circle cx="12" cy="11" r="3.6" fill="var(--icon-hole, #141646)" />
      <circle cx="12.6" cy="11.4" r="1.6" fill="currentColor" />
    </>
  ),
  blocks: (
    <>
      <rect {...F} x="2.5" y="4" width="6" height="7" rx="1.8" />
      <rect {...F} x="9.5" y="4" width="6" height="7" rx="1.8" opacity=".55" />
      <rect {...F} x="16.5" y="4" width="5" height="7" rx="1.8" />
      <rect {...F} x="2.5" y="13" width="6" height="7" rx="1.8" opacity=".55" />
      <rect {...F} x="9.5" y="13" width="6" height="7" rx="1.8" />
      <rect {...F} x="16.5" y="13" width="5" height="7" rx="1.8" opacity=".55" />
    </>
  ),
  brush: (
    <>
      <path {...F} d="M19.7 2.8a1.9 1.9 0 0 1 1.5 3.1l-7.6 9.3-3-2.6 7.6-9.1a1.9 1.9 0 0 1 1.5-.7Z" />
      <path {...F} d="M9.3 14c1.7 0 3.1 1.4 3 3.2-.2 2.7-2.8 4.3-6.5 4.3-1.5 0-2.9-.3-3.6-.8 1.2-.6 1.7-1.6 2-3 .5-2.2 2.8-3.7 5.1-3.7Z" />
    </>
  ),
  play: <path {...F} d="M7.2 3.8c-.9-.5-2 .1-2 1.2v14c0 1.1 1.1 1.7 2 1.2l12-7c1-.6 1-1.9 0-2.4Z" />,
  stop: <rect {...F} x="5" y="5" width="14" height="14" rx="3.4" />,
  record: <circle {...F} cx="12" cy="12" r="7.6" />,
  undo: (
    <>
      <path {...S} d="M9 5.5 4.5 10 9 14.5" />
      <path {...S} d="M4.8 10H14a5.5 5.5 0 0 1 0 11h-3" />
    </>
  ),
  redo: (
    <>
      <path {...S} d="M15 5.5 19.5 10 15 14.5" />
      <path {...S} d="M19.2 10H10a5.5 5.5 0 0 0 0 11h3" />
    </>
  ),
  plus: <path {...S} strokeWidth={3.2} d="M12 5v14M5 12h14" />,
  minus: <path {...S} strokeWidth={3.2} d="M5 12h14" />,
  lock: (
    <>
      <rect {...F} x="4.5" y="10.5" width="15" height="11" rx="3" />
      <path {...S} d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  moon: <path {...F} d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a.6.6 0 0 0-.8-.7A9.6 9.6 0 1 0 21.2 15.4a.6.6 0 0 0-.7-.8Z" />,
  star: <path {...F} d="m12 2.8 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.7l-5.4 2.9 1.1-6.1-4.5-4.3 6.1-.8Z" />,
  eraser: (
    <>
      <path {...F} d="M14.6 3.6a2 2 0 0 1 2.8 0l3 3a2 2 0 0 1 0 2.8l-8 8H7.6l-4-4a2 2 0 0 1 0-2.8Z" />
      <path {...S} d="M7.6 17.4h13" />
    </>
  ),
  stars: (
    <>
      <path {...F} d="M10 3.5c.4 3.4 2.6 5.6 6 6-3.4.4-5.6 2.6-6 6-.4-3.4-2.6-5.6-6-6 3.4-.4 5.6-2.6 6-6Z" />
      <path {...F} d="M18 13.5c.2 1.8 1.2 2.8 3 3-1.8.2-2.8 1.2-3 3-.2-1.8-1.2-2.8-3-3 1.8-.2 2.8-1.2 3-3Z" />
      <path {...F} d="M18 2.5c.15 1.2.8 1.85 2 2-1.2.15-1.85.8-2 2-.15-1.2-.8-1.85-2-2 1.2-.15 1.85-.8 2-2Z" />
    </>
  ),
  wand: (
    <>
      <path {...S} strokeWidth={3} d="m4 20 11-11" />
      <path {...F} d="M17 2.5c.3 2 1.5 3.2 3.5 3.5-2 .3-3.2 1.5-3.5 3.5-.3-2-1.5-3.2-3.5-3.5 2-.3 3.2-1.5 3.5-3.5Z" />
      <circle {...F} cx="20" cy="12.5" r="1.3" />
      <circle {...F} cx="11.5" cy="4" r="1.1" />
    </>
  ),
  hat: (
    <>
      <path {...F} d="M7 4.5h10a1 1 0 0 1 1 1v9.5H6V5.5a1 1 0 0 1 1-1Z" />
      <path {...F} d="M3 16.5c0-.8.7-1.5 1.5-1.5h15c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5h-15c-.8 0-1.5-.7-1.5-1.5Z" />
      <rect x="6" y="11" width="12" height="2.2" fill="var(--icon-hole, #141646)" opacity=".45" />
    </>
  ),
  mic: (
    <>
      <rect {...F} x="8" y="2.5" width="8" height="12" rx="4" />
      <path {...S} d="M5 11.5a7 7 0 0 0 14 0M12 18.5v3" />
    </>
  ),
  trash: (
    <>
      <path {...S} d="M4 6.5h16M9.5 6.5V4.5h5v2" />
      <path {...F} d="M6 8.5h12l-1 11.2a2 2 0 0 1-2 1.8H9a2 2 0 0 1-2-1.8Z" />
    </>
  ),
  loop: (
    <>
      <path {...S} d="M17 7.5H8.5a4.5 4.5 0 0 0 0 9H9" />
      <path {...S} d="M7 16.5h8.5a4.5 4.5 0 0 0 0-9H15" />
      <path {...S} d="m15 4.5 3 3-3 3M9 19.5l-3-3 3-3" />
    </>
  ),
  zzz: (
    <>
      <path {...S} d="M4 11h6l-6 7h6" />
      <path {...S} strokeWidth={2.2} d="M13 4.5h5l-5 5.5h5" />
    </>
  ),
  check: <path {...S} strokeWidth={3.2} d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path {...S} strokeWidth={3.2} d="M6 6l12 12M18 6 6 18" />,
  turtle: (
    <>
      <path {...F} d="M4 15c0-4.4 3.6-8 8-8s8 3.6 8 8Z" />
      <circle {...F} cx="21" cy="13.5" r="2" />
      <path {...S} d="M6.5 15.5v3M17.5 15.5v3" />
    </>
  ),
  rabbit: (
    <>
      <path {...F} d="M8.5 2.5c1.4 0 2 2.8 2 6.2h-2.8c-.4-3.4-.4-6.2.8-6.2ZM14.2 2.5c1.2 0 1.2 2.8.8 6.2h-2.8c0-3.4.6-6.2 2-6.2Z" />
      <path {...F} d="M11.4 8c4 0 7.1 3.1 7.1 6.8 0 3.6-3 6.7-7.1 6.7s-7.1-3.1-7.1-6.7C4.3 11.1 7.4 8 11.4 8Z" />
    </>
  ),
  note: (
    <>
      <path {...F} d="M9 17.5V5.8a1 1 0 0 1 .8-1l8-1.6a1 1 0 0 1 1.2 1v11.3" />
      <circle {...F} cx="6.5" cy="17.5" r="3" />
      <circle {...F} cx="16.5" cy="15.5" r="3" />
    </>
  ),
  speaker: (
    <>
      <path {...F} d="M3.5 9.5h3.5l5-4.5v14l-5-4.5H3.5Z" />
      <path {...S} d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  download: (
    <>
      <path {...S} d="M12 3.5v11M7 10l5 5 5-5M4.5 20.5h15" />
    </>
  ),
  copy: (
    <>
      <rect {...S} x="8.5" y="8.5" width="12" height="12" rx="2.5" />
      <path {...S} d="M15.5 5V4.8A1.8 1.8 0 0 0 13.7 3H5A1.8 1.8 0 0 0 3.2 4.8v8.7A1.8 1.8 0 0 0 5 15.3h.3" />
    </>
  ),
  pencil: <path {...F} d="M16.2 3.8a2.2 2.2 0 0 1 3.1 0l.9.9a2.2 2.2 0 0 1 0 3.1L9.4 18.6 4 20l1.4-5.4Z" />,
  rainbow: (
    <>
      <path fill="none" stroke="#ff4f8b" strokeWidth="2.6" strokeLinecap="round" d="M3 18a9 9 0 0 1 18 0" />
      <path fill="none" stroke="#ffd233" strokeWidth="2.6" strokeLinecap="round" d="M6.2 18a5.8 5.8 0 0 1 11.6 0" />
      <path fill="none" stroke="#2eb8ff" strokeWidth="2.6" strokeLinecap="round" d="M9.4 18a2.6 2.6 0 0 1 5.2 0" />
    </>
  ),
  hand: (
    <path
      {...F}
      d="M9.2 2.8c1 0 1.8.8 1.8 1.8v6.3l.1-.1c.1-1 .9-1.7 1.8-1.7s1.6.6 1.8 1.4c.3-.6 1-1 1.7-1 1 0 1.8.8 1.8 1.8v.3c.3-.3.8-.5 1.3-.5 1 0 1.8.8 1.8 1.8v3.8c0 3.9-3.1 7-7 7h-1.4c-2.1 0-4-.9-5.3-2.5l-3.4-4.2a1.7 1.7 0 0 1 2.4-2.4l1.4 1.2V4.6c0-1 .8-1.8 1.8-1.8Z"
    />
  ),
  rotate: (
    <>
      <rect {...S} x="7" y="3" width="10" height="18" rx="2.5" />
      <path {...S} d="M20.5 9.5a8 8 0 0 1 0 5M3.5 9.5a8 8 0 0 0 0 5" />
    </>
  ),
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number | string;
}

export function Icon({ name, size = '1em', ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false" {...rest}>
      {ICONS[name]}
    </svg>
  );
}
