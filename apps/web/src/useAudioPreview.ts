import { useEffect, useRef } from 'react';
import type { Project } from '@frameforge/project-schema';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Length (ms) of audio a track contributes, mirroring the renderer's rule. */
export function trackLengthMs(project: Project, trackId: string, totalMs: number): number {
  const t = project.audioTracks.find((x) => x.id === trackId);
  if (!t) return 0;
  const asset = project.assets.find((a) => a.id === t.assetId);
  const available = asset?.durationMs !== undefined ? asset.durationMs - t.trimStartMs : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(t.durationMs ?? available, available, totalMs - t.startMs));
}

/**
 * Plays the project's audio tracks in step with the preview playhead. This is a convenience for editing:
 * browsers cap element volume at 100%, so gain above 1 is only applied by the exported video.
 */
export function useAudioPreview(
  project: Project,
  assetUrls: ReadonlyMap<string, string>,
  timeMs: number,
  playing: boolean,
  totalMs: number,
): void {
  const els = useRef(new Map<string, HTMLAudioElement>());

  useEffect(() => {
    for (const t of project.audioTracks) {
      const url = assetUrls.get(t.assetId);
      let el = els.current.get(t.id);
      if (!url) {
        el?.pause();
        continue;
      }
      if (!el) {
        el = new Audio();
        el.preload = 'auto';
        els.current.set(t.id, el);
      }
      if (el.getAttribute('data-src') !== url) {
        el.src = url;
        el.setAttribute('data-src', url);
      }
      const len = trackLengthMs(project, t.id, totalMs);
      const local = timeMs - t.startMs;
      const active = playing && !t.muted && local >= 0 && local < len;
      if (!active) {
        if (!el.paused) el.pause();
        continue;
      }
      const target = (local + t.trimStartMs) / 1000;
      if (el.paused) {
        el.currentTime = target;
        void el.play().catch(() => undefined);
      } else if (Math.abs(el.currentTime - target) > 0.3) {
        el.currentTime = target;
      }
      const fadeIn = t.fadeInMs > 0 ? clamp01(local / t.fadeInMs) : 1;
      const fadeOut = t.fadeOutMs > 0 ? clamp01((len - local) / t.fadeOutMs) : 1;
      el.volume = clamp01(t.volume * fadeIn * fadeOut);
    }
    // Pause and drop elements of removed tracks.
    for (const [id, el] of els.current) {
      if (!project.audioTracks.some((t) => t.id === id)) {
        el.pause();
        els.current.delete(id);
      }
    }
  }, [project, assetUrls, timeMs, playing, totalMs]);

  useEffect(() => {
    const map = els.current;
    return () => {
      for (const el of map.values()) el.pause();
      map.clear();
    };
  }, []);
}
