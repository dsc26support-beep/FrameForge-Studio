import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { angleFromPoints, clamp, moveByPixels, round, scaleFromPoints, snapAngle, snapAxis, type Point } from '@frameforge/editor-core';
import type { SceneElement } from '@frameforge/project-schema';

interface Props {
  elements: readonly SceneElement[];
  canvas: { width: number; height: number };
  /** Preview pixels per canvas pixel. */
  scale: number;
  /** Layout size [w, h] in canvas pixels of each element, measured inside the sandboxed preview. */
  rects: Readonly<Record<string, [number, number]>>;
  selectedId: string | null;
  onSelect(id: string | null): void;
  onChange(id: string, patch: Partial<SceneElement>, coalesceKey: string): void;
}

type Mode = 'move' | 'scale' | 'rotate';
interface Drag {
  mode: Mode;
  id: string;
  startPointer: Point;
  center: Point;
  start: { x: number; y: number; scale: number };
  /** Unrotated size in canvas px at the start of the drag. */
  w: number;
  h: number;
  rotation: number;
}

const label = (el: SceneElement) =>
  el.type === 'text'
    ? `text "${el.text.slice(0, 24)}"`
    : el.type === 'shape'
      ? `shape ${el.name || el.shape}`
      : `image ${el.name || ''}`.trim();

/**
 * Selection boxes and handles drawn above the sandboxed preview. The page inside the iframe is never touched:
 * everything here edits the project, and the preview re-renders from it.
 */
export function CanvasOverlay({ elements, canvas, scale, rects, selectedId, onSelect, onChange }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const W = canvas.width;
  const H = canvas.height;

  const local = (e: PointerEvent): Point => {
    const r = root.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const begin = (e: PointerEvent<HTMLElement>, el: SceneElement, mode: Mode) => {
    e.stopPropagation();
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelect(el.id);
    const baseW = rects[el.id]?.[0] ?? (el.w / 100) * W;
    const baseH = el.type === 'text' ? (rects[el.id]?.[1] ?? 0.08 * H) : (el.h / 100) * H;
    drag.current = {
      mode,
      id: el.id,
      startPointer: local(e),
      center: { x: (el.x / 100) * W * scale, y: (el.y / 100) * H * scale },
      start: { x: el.x, y: el.y, scale: el.scale },
      w: baseW,
      h: baseH,
      rotation: el.rotation,
    };
  };

  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = local(e);
    if (d.mode === 'move') {
      let nx = moveByPixels(d.start.x, (p.x - d.startPointer.x) / scale, W);
      let ny = moveByPixels(d.start.y, (p.y - d.startPointer.y) / scale, H);
      let gx: number | null = null;
      let gy: number | null = null;
      if (!e.altKey) {
        // Snap using the rotated bounding box so edges line up with what the viewer sees.
        const rad = (d.rotation * Math.PI) / 180;
        const bw = (Math.abs(d.w * Math.cos(rad)) + Math.abs(d.h * Math.sin(rad))) * d.start.scale;
        const bh = (Math.abs(d.w * Math.sin(rad)) + Math.abs(d.h * Math.cos(rad))) * d.start.scale;
        const sx = snapAxis(nx, (bw / 2 / W) * 100);
        const sy = snapAxis(ny, (bh / 2 / H) * 100);
        nx = sx.value;
        ny = sy.value;
        gx = sx.guide;
        gy = sy.guide;
      }
      setGuides({ x: gx, y: gy });
      onChange(d.id, { x: round(nx), y: round(ny) }, `drag:${d.id}`);
    } else if (d.mode === 'scale') {
      onChange(d.id, { scale: scaleFromPoints(d.center, d.startPointer, p, d.start.scale) }, `scale:${d.id}`);
    } else {
      const a = snapAngle(angleFromPoints(d.center, p), { force: e.shiftKey });
      onChange(d.id, { rotation: round(a, 1) }, `rotate:${d.id}`);
    }
  };

  const end = (e: PointerEvent<HTMLElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    drag.current = null;
    setGuides({ x: null, y: null });
  };

  const onKey = (e: KeyboardEvent<HTMLElement>, el: SceneElement) => {
    const step = e.shiftKey ? 2 : 0.5;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = d[e.key];
    if (delta) {
      e.preventDefault();
      onChange(el.id, { x: round(clamp(el.x + delta[0], -50, 150)), y: round(clamp(el.y + delta[1], -50, 150)) }, `nudge:${el.id}`);
    } else if (e.key === 'Escape') {
      onSelect(null);
      (e.currentTarget as HTMLElement).blur();
    }
  };

  return (
    <div ref={root} className="ov" data-testid="canvas-overlay">
      {selectedId && <div className="ov-bg" onPointerDown={() => onSelect(null)} aria-hidden="true" />}
      {guides.x !== null && <div className="ov-guide v" style={{ left: `${guides.x}%` }} aria-hidden="true" />}
      {guides.y !== null && <div className="ov-guide h" style={{ top: `${guides.y}%` }} aria-hidden="true" />}
      {elements.map((el) => {
        const baseW = rects[el.id]?.[0] ?? (el.w / 100) * W;
        const baseH = el.type === 'text' ? (rects[el.id]?.[1] ?? 0.08 * H) : (el.h / 100) * H;
        const selected = el.id === selectedId;
        return (
          <div
            key={el.id}
            className={`ov-box${selected ? ' selected' : ''}`}
            data-el-box={el.id}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={`${selected ? 'Selected' : 'Select'} ${label(el)}. Drag to move, arrow keys to nudge.`}
            style={{
              left: `${el.x}%`,
              top: `${el.y}%`,
              width: Math.max(14, baseW * el.scale * scale),
              height: Math.max(14, baseH * el.scale * scale),
              transform: `translate(-50%, -50%) rotate(${el.rotation}deg)`,
            }}
            onPointerDown={(e) => begin(e, el, 'move')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={(e) => onKey(e, el)}
            onFocus={() => onSelect(el.id)}
          >
            {selected && (
              <>
                {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
                  <span
                    key={c}
                    className={`ov-h ${c}`}
                    data-handle="scale"
                    aria-hidden="true"
                    onPointerDown={(e) => begin(e, el, 'scale')}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerCancel={end}
                  />
                ))}
                <span className="ov-stem" aria-hidden="true" />
                <span
                  className="ov-h rot"
                  data-handle="rotate"
                  aria-hidden="true"
                  onPointerDown={(e) => begin(e, el, 'rotate')}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
