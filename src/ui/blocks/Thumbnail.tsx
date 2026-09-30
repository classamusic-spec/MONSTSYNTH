import { memo } from 'react';
import type { Clip, MonsterKind, Painting } from '../../model/types';

// A block's face is a tiny picture of its notes. Blocks holding the same loop
// look identical, so repetition in the song is visible at a glance.

export const ClipThumb = memo(function ClipThumb({ clip, monster }: { clip: Clip; monster: MonsterKind }) {
  const L = clip.lengthBeats || 8;
  const drums = monster === 'boom';
  return (
    <svg className="thumb" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden>
      {clip.notes.map((n) => {
        const x = (n.beat / L) * 100;
        const lane = drums ? Math.min(7, n.step) : n.step;
        const y = 52 - (lane / 7) * 44;
        const w = drums ? 5 : Math.max(4, (Math.min(n.dur, L - n.beat) / L) * 100 - 1);
        return <rect key={n.id} x={x + 1} y={y - 3.5} width={w} height={7} rx={3.5} fill="#fff" opacity={0.55 + n.vel * 0.45} />;
      })}
    </svg>
  );
});

export const PaintThumb = memo(function PaintThumb({ painting }: { painting: Painting }) {
  return (
    <svg className="thumb" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden>
      {painting.strokes.slice(0, 24).map((s) => {
        const pts: string[] = [];
        for (let i = 0; i + 1 < s.points.length; i += 4) pts.push(`${(s.points[i] * 100).toFixed(1)},${(4 + s.points[i + 1] * 52).toFixed(1)}`);
        if (pts.length === 1) pts.push(pts[0]);
        return (
          <polyline
            key={s.id}
            points={pts.join(' ')}
            fill="none"
            stroke="#fff"
            strokeWidth={s.kind === 'stars' ? 6 : 4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={s.kind === 'stars' ? '0.1 9' : undefined}
            vectorEffect="non-scaling-stroke"
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
});
