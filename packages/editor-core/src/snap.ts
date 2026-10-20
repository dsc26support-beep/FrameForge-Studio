import { snapToFrame } from '@frameforge/render-core';

/** Snaps a duration to the grid (default 100 ms) and then to a frame boundary. */
export function snapDuration(ms: number, fps: number, gridMs = 100): number {
  return Math.round(snapToFrame(Math.round(ms / gridMs) * gridMs, fps));
}
