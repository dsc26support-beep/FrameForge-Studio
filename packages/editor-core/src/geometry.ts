/** Pure geometry helpers for direct manipulation on the preview. All positions are canvas percentages unless noted. */

export interface Point {
  x: number;
  y: number;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const round = (v: number, digits = 2): number => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/** Wraps any angle into the range (-180, 180]. */
export function normalizeAngle(deg: number): number {
  let a = ((deg % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return a === -180 ? 180 : a;
}

/** Angle of the pointer around a centre, where 0 means the rotate handle points straight up. */
export function angleFromPoints(center: Point, pointer: Point): number {
  return normalizeAngle((Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180) / Math.PI + 90);
}

/** Snaps to multiples of `step` when `force`, otherwise only when within `tolerance` degrees of one. */
export function snapAngle(deg: number, opts: { force?: boolean; step?: number; tolerance?: number } = {}): number {
  const step = opts.step ?? (opts.force ? 15 : 45);
  const tolerance = opts.tolerance ?? 3;
  const nearest = Math.round(deg / step) * step;
  if (opts.force || Math.abs(deg - nearest) <= tolerance) return normalizeAngle(nearest);
  return normalizeAngle(deg);
}

/** New uniform scale from dragging a corner handle: ratio of pointer distance to the centre. */
export function scaleFromPoints(center: Point, startPointer: Point, pointer: Point, startScale: number, min = 0.1, max = 5): number {
  const d0 = Math.hypot(startPointer.x - center.x, startPointer.y - center.y);
  if (d0 < 1) return startScale;
  const d1 = Math.hypot(pointer.x - center.x, pointer.y - center.y);
  return round(clamp(startScale * (d1 / d0), min, max));
}

export interface SnapResult {
  value: number;
  /** Guide position (percent) to draw, or null when nothing snapped. */
  guide: number | null;
}

/**
 * Snaps one axis of a moving element. `half` is half of the element's extent on that axis (percent).
 * Candidates: the canvas centre (50) for the element centre, and the canvas edges (0 and 100) for its edges.
 */
export function snapAxis(centre: number, half: number, threshold = 1.2): SnapResult {
  const candidates: { target: number; offset: number }[] = [
    { target: 50, offset: 0 },
    { target: 0, offset: -half }, // left/top edge
    { target: 100, offset: half }, // right/bottom edge
  ];
  let best: { value: number; guide: number; dist: number } | null = null;
  for (const c of candidates) {
    const edgeOrCentre = centre + c.offset;
    const dist = Math.abs(edgeOrCentre - c.target);
    if (dist <= threshold && (!best || dist < best.dist)) best = { value: c.target - c.offset, guide: c.target, dist };
  }
  return best ? { value: best.value, guide: best.guide } : { value: centre, guide: null };
}

/** Moves a centre by a pixel delta (already divided by the preview scale) and clamps it to a sane range. */
export function moveByPixels(startPct: number, deltaCanvasPx: number, canvasExtentPx: number, lo = -50, hi = 150): number {
  return clamp(startPct + (deltaCanvasPx / canvasExtentPx) * 100, lo, hi);
}
