import type { Project } from '@frameforge/project-schema';

export interface SceneTiming {
  sceneId: string;
  index: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  /** Milliseconds this scene overlaps the previous one (transition window). */
  overlapMs: number;
}

export interface Timeline {
  scenes: SceneTiming[];
  totalMs: number;
}

/**
 * Computes scene start times. A scene's transition plays over the end of the previous scene,
 * so the overlap shortens the total length. Overlap is capped at half of either scene.
 */
export function computeTimeline(project: Pick<Project, 'scenes'>): Timeline {
  const scenes: SceneTiming[] = [];
  let cursor = 0;
  for (const [index, scene] of project.scenes.entries()) {
    const prev = project.scenes[index - 1];
    let overlapMs = 0;
    if (prev && scene.transition.type !== 'none') {
      overlapMs = Math.max(0, Math.min(scene.transition.durationMs, Math.floor(prev.durationMs / 2), Math.floor(scene.durationMs / 2)));
    }
    const startMs = index === 0 ? 0 : cursor - overlapMs;
    const endMs = startMs + scene.durationMs;
    scenes.push({ sceneId: scene.id, index, startMs, endMs, durationMs: scene.durationMs, overlapMs });
    cursor = endMs;
  }
  return { scenes, totalMs: cursor };
}

export function frameCountFor(totalMs: number, fps: number): number {
  return Math.max(1, Math.round((totalMs * fps) / 1000));
}

/** Timestamp (ms) at which frame `n` is presented. Pure function of the frame number. */
export function frameTimeMs(frame: number, fps: number): number {
  return (frame * 1000) / fps;
}

export function msToFrame(ms: number, fps: number): number {
  return Math.round((ms * fps) / 1000);
}

/** Snaps a time to the nearest frame boundary. */
export function snapToFrame(ms: number, fps: number): number {
  return frameTimeMs(msToFrame(ms, fps), fps);
}

export function formatTimecode(ms: number): string {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const t = Math.floor((total % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${t}`;
}

/** Index of the scene that is visible at time `tMs` (the later scene wins inside a transition). */
export function sceneIndexAt(timeline: Timeline, tMs: number): number {
  let found = 0;
  for (const s of timeline.scenes) {
    if (tMs >= s.startMs) found = s.index;
  }
  return found;
}
