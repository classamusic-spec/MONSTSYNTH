import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { laneForY, PAINT_LANES, RAINBOW_CYCLE, yForLane } from '../../magic/painting';
import { addStroke, eraseStrokes, newStrokeId } from '../../model/edits';
import { MONSTERS } from '../../model/monsters';
import type { MonsterKind, PaintBrush, Stroke } from '../../model/types';
import { setPaintBrush, setPaintTool } from '../../store/actions';
import { commit, getState, useApp, type PaintTool } from '../../store/store';
import { studio } from '../../studio/studio';
import { onFrame, onNote } from '../../studio/visualBus';
import { isReducedMotion } from '../hooks/useCaps';
import { Icon, type IconName } from '../icons/Icon';
import { MonsterArt } from '../monsters/MonsterArt';
import { star5 } from '../monsters/shapes';
import { say } from '../shell/bubbles';

// ─────────────────────────────────────────────────────────────────────────────
// SOUND PAINTING — draw your music. Colours are monsters, height is pitch,
// left-to-right is time. Every stroke sings while you draw it, and the whole
// painting plays as a loop in time with the band.
// ─────────────────────────────────────────────────────────────────────────────

const PALETTE: PaintBrush[] = ['mimic', 'boom', 'spark', 'grumble', 'bloop', 'puff', 'rainbow'];
const TOOLS: { tool: PaintTool; icon: IconName; label: string }[] = [
  { tool: 'brush', icon: 'brush', label: 'Brush' },
  { tool: 'stars', icon: 'stars', label: 'Magic' },
  { tool: 'eraser', icon: 'eraser', label: 'Erase' },
];

function colorOf(m: MonsterKind): string {
  return MONSTERS[m].color;
}

function strokeColor(brush: PaintBrush, i: number): string {
  if (brush === 'rainbow') return `hsl(${(i * 9) % 360} 95% 62%)`;
  return colorOf(brush);
}

/** Which monster actually sings this brush right now. */
function brushMonster(brush: PaintBrush, n: number): MonsterKind {
  return brush === 'rainbow' ? RAINBOW_CYCLE[n % RAINBOW_CYCLE.length] : brush;
}

interface Burst {
  x: number;
  y: number;
  color: string;
  t0: number;
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number) {
  const pts = s.points;
  const base = Math.max(6, h * 0.02) * (0.7 + s.weight * 0.6);
  if (s.kind === 'stars') {
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const x = pts[i] * w;
      const y = pts[i + 1] * h;
      const color = strokeColor(s.brush, i);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.28;
      ctx.fill(new Path2D(star5(x, y, base * 2.4)));
      ctx.globalAlpha = 1;
      ctx.fill(new Path2D(star5(x, y, base * 1.5)));
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(x - base * 0.3, y - base * 0.3, base * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    return;
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length <= 2) {
    const color = strokeColor(s.brush, 0);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(pts[0] * w, pts[1] * h, base * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(pts[0] * w, pts[1] * h, base * 0.9, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  for (const pass of [0, 1, 2]) {
    for (let i = 0; i + 3 < pts.length; i += 2) {
      ctx.strokeStyle = pass === 2 ? 'rgba(255,255,255,0.55)' : strokeColor(s.brush, i);
      ctx.globalAlpha = pass === 0 ? 0.25 : 1;
      ctx.lineWidth = pass === 0 ? base * 2.6 : pass === 1 ? base : base * 0.28;
      ctx.beginPath();
      ctx.moveTo(pts[i] * w, pts[i + 1] * h - (pass === 2 ? base * 0.18 : 0));
      ctx.lineTo(pts[i + 2] * w, pts[i + 3] * h - (pass === 2 ? base * 0.18 : 0));
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function distanceToStroke(s: Stroke, x: number, y: number, aspect: number): number {
  let best = Infinity;
  const p = s.points;
  if (p.length <= 2 || s.kind === 'stars') {
    for (let i = 0; i + 1 < p.length; i += 2) best = Math.min(best, Math.hypot((p[i] - x) * aspect, p[i + 1] - y));
    return best;
  }
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i] * aspect;
    const ay = p[i + 1];
    const bx = p[i + 2] * aspect;
    const by = p[i + 3];
    const px = x * aspect;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (y - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(px - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

export function PaintScreen() {
  const painting = useApp((s) => s.project.painting);
  const tracks = useApp((s) => s.project.tracks);
  const tool = useApp((s) => s.paint.tool);
  const brush = useApp((s) => s.paint.brush);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<{ pointerId: number; stroke: Stroke; lastLane: number; lastX: number; lastNoteAt: number; notes: number } | null>(null);
  const erasing = useRef<Set<string> | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const bursts = useRef<Burst[]>([]);
  const size = useRef({ w: 1, h: 1 });

  useEffect(() => {
    say({ text: 'Draw your music!', icon: 'brush', monster: 'bloop' });
  }, []);

  // Resize canvases to the element and the screen's pixel density.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size.current = { w: r.width, h: r.height };
      for (const c of [canvasRef.current, fxRef.current]) {
        if (!c) continue;
        c.width = Math.round(r.width * dpr);
        c.height = Math.round(r.height * dpr);
        c.style.width = `${r.width}px`;
        c.style.height = `${r.height}px`;
        c.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      redraw();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    fit();
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const redraw = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const { w, h } = size.current;
    ctx.clearRect(0, 0, w, h);
    const strokes = getState().project.painting.strokes;
    for (const s of strokes) if (!hiddenRef.current.has(s.id)) drawStroke(ctx, s, w, h);
    if (live.current) drawStroke(ctx, live.current.stroke, w, h);
  };

  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  useEffect(redraw, [painting, hidden]); // eslint-disable-line react-hooks/exhaustive-deps

  // Playhead + note bursts on the effects layer.
  useEffect(() => {
    let playing = false;
    let beatFrac = 0;
    const offFrame = onFrame((p) => {
      playing = p.playing;
      beatFrac = p.playing && p.beat >= 0 ? (p.beat % p.loopBeats) / p.loopBeats : 0;
      const c = fxRef.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      const { w, h } = size.current;
      ctx.clearRect(0, 0, w, h);
      if (playing) {
        const x = beatFrac * w;
        const g = ctx.createLinearGradient(x - 40, 0, x, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(1, 'rgba(255,255,255,0.18)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 40, 0, 40, h);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(x - 1.5, 0, 3, h);
      }
      const now = performance.now();
      bursts.current = bursts.current.filter((b) => now - b.t0 < 500);
      for (const b of bursts.current) {
        const k = (now - b.t0) / 500;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(b.x * w, b.y * h, 8 + k * 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });
    const offNote = onNote((v) => {
      if (v.source !== 'paint' || isReducedMotion()) return;
      // A ring pops where the note sits: x at the playhead, y at its pitch lane.
      bursts.current.push({ x: beatFrac, y: yForLane(v.step), color: colorOf(v.monster), t0: performance.now() });
    });
    return () => {
      offFrame();
      offNote();
    };
  }, []);

  const norm = (e: ReactPointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const singAt = (y: number, n: number, weight: number) => {
    const monster = brushMonster(brush, n);
    const track = tracks.find((t) => t.monster === monster);
    if (track) studio.hit(track.id, laneForY(y), { vel: 0.55 + weight * 0.4 });
    else studio.hitMonster(monster, laneForY(y), 0.55 + weight * 0.4);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    wrapRef.current?.setPointerCapture?.(e.pointerId);
    const { x, y } = norm(e);
    if (tool === 'eraser') {
      erasing.current = new Set();
      eraseAt(x, y);
      return;
    }
    if (live.current) return;
    const weight = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.6;
    live.current = {
      pointerId: e.pointerId,
      stroke: { id: newStrokeId(), brush, kind: tool === 'stars' ? 'stars' : 'line', points: [x, y], weight },
      lastLane: laneForY(y),
      lastX: e.clientX,
      lastNoteAt: performance.now(),
      notes: 1,
    };
    singAt(y, 0, weight);
    redraw();
  };

  const eraseAt = (x: number, y: number) => {
    const set = erasing.current;
    if (!set) return;
    const { w, h } = size.current;
    const aspect = w / Math.max(1, h);
    let changed = false;
    for (const s of getState().project.painting.strokes) {
      if (!set.has(s.id) && distanceToStroke(s, x, y, aspect) < 0.05) {
        set.add(s.id);
        changed = true;
      }
    }
    if (changed) setHidden(new Set(set));
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (erasing.current) {
      const { x, y } = norm(e);
      eraseAt(x, y);
      return;
    }
    const l = live.current;
    if (!l || l.pointerId !== e.pointerId) return;
    const { x, y } = norm(e);
    const pts = l.stroke.points;
    const { w, h } = size.current;
    const dx = (x - pts[pts.length - 2]) * w;
    const dy = (y - pts[pts.length - 1]) * h;
    const minStep = l.stroke.kind === 'stars' ? 34 : 4;
    if (Math.hypot(dx, dy) < minStep) return;
    pts.push(x, y);
    const lane = laneForY(y);
    const now = performance.now();
    const moved = Math.abs(e.clientX - l.lastX);
    if ((lane !== l.lastLane || moved > w / 16 || l.stroke.kind === 'stars') && now - l.lastNoteAt > 90) {
      singAt(y, l.notes, l.stroke.weight);
      l.notes++;
      l.lastLane = lane;
      l.lastX = e.clientX;
      l.lastNoteAt = now;
    }
    redraw();
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (erasing.current) {
      const ids = [...erasing.current];
      erasing.current = null;
      if (ids.length) commit((p) => eraseStrokes(p, ids));
      setHidden(new Set());
      return;
    }
    const l = live.current;
    if (!l || l.pointerId !== e.pointerId) return;
    live.current = null;
    const stroke = l.stroke;
    if (stroke.points.length === 2 && stroke.kind === 'line') stroke.points.push(stroke.points[0], stroke.points[1]);
    commit((p) => addStroke(p, stroke));
  };

  return (
    <section className="paint" aria-label="Sound Painting">
      <div
        ref={wrapRef}
        className="paint-canvas"
        data-tool={tool}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label={`Painting with ${painting.strokes.length} marks. Draw to make music: higher is higher notes, left to right is time.`}
      >
        <div className="paint-lanes" aria-hidden>
          {Array.from({ length: PAINT_LANES }, (_, i) => (
            <span key={i} />
          ))}
        </div>
        <div className="paint-beats" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
        <canvas ref={canvasRef} />
        <canvas ref={fxRef} className="paint-fx" />
        {painting.strokes.length === 0 && (
          <div className="paint-hello" aria-hidden>
            <MonsterArt kind="bloop" />
          </div>
        )}
      </div>

      <div className="paint-bar">
        <div className="paint-tools" role="radiogroup" aria-label="Tools">
          {TOOLS.map((t) => (
            <button key={t.tool} className="paint-tool" role="radio" aria-checked={tool === t.tool} data-on={tool === t.tool} onClick={() => setPaintTool(t.tool)}>
              <Icon name={t.icon} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="palette" role="radiogroup" aria-label="Which monster paints">
          {PALETTE.map((b) => (
            <button
              key={b}
              className="swatch"
              role="radio"
              aria-checked={brush === b && tool !== 'eraser'}
              aria-label={b === 'rainbow' ? 'Rainbow: many monsters' : `${MONSTERS[b].name} paints`}
              data-on={brush === b && tool !== 'eraser'}
              data-brush={b}
              onClick={() => {
                setPaintBrush(b);
                singAt(0.4, 0, 0.6);
              }}
            >
              {b !== 'rainbow' && <MonsterArt kind={b} />}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
