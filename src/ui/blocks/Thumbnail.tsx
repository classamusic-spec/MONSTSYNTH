import { memo } from 'react';
import type { Clip, MonsterKind, Painting } from '../../model/types';

// A block's face is a tiny picture of its notes. Blocks holding the same loop
// look identical, so repetition in the song is visible at a glance. Faint lines
// mark the beats (stronger at each bar), so drums visibly land on the beat.
// Blocks stretch to any shape, so marks are drawn as round-capped strokes that
// never scale: drums stay round dots and notes stay rounded dashes.

export const ClipThumb = memo(function ClipThumb({ clip, monster }: { clip: Clip; monster: MonsterKind }) {
  const L = clip.lengthBeats || 8;
  const drums = monster === 'boom';
  return (
    <svg className="thumb" viewBox="0 0 100 60" preserveAspectRatio="none" data-drums={drums || undefined} style={{ ['--L' as string]: L }} aria-hidden>
      {Array.from({ length: Math.max(0, Math.ceil(L) - 1) }, (_, i) => {
        const b = i + 1;
        const x = (b / L) * 100;
        return (
          <line
            key={`b${b}`}
            className="thumb-beat"
            x1={x}
            x2={x}
            y1={2}
            y2={58}
            stroke="#fff"
            strokeOpacity={b % 4 === 0 ? 0.3 : 0.12}
            strokeWidth={b % 4 === 0 ? 2 : 1}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {clip.notes.map((n) => {
        const x = (n.beat / L) * 100;
        const lane = Math.max(0, Math.min(7, n.step));
        const y = 52 - (lane / 7) * 44;
        const w = drums ? 0 : (Math.min(n.dur, L - n.beat) / L) * 100;
        return (
          <line
            key={n.id}
            className="thumb-note"
            x1={x + 2}
            x2={x + 2 + Math.max(0, w - 4)}
            y1={y}
            y2={y}
            stroke="#fff"
            strokeWidth={drums ? 9 : 8}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            opacity={0.55 + n.vel * 0.45}
          />
        );
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
