import { describe, expect, it } from 'vitest';
import { createProject, createScene } from '@frameforge/project-schema';
import { computeTimeline, frameCountFor, frameTimeMs, formatTimecode, sceneCacheKey, snapToFrame } from '@frameforge/render-core';

describe('timeline', () => {
  it('sums scene durations and shortens by transition overlap', () => {
    const p = createProject('T');
    p.scenes = [
      createScene({ id: 'a', durationMs: 2000 }),
      createScene({ id: 'b', durationMs: 2000, transition: { type: 'fade', durationMs: 500 } }),
      createScene({ id: 'c', durationMs: 1000, transition: { type: 'none', durationMs: 500 } }),
    ];
    const t = computeTimeline(p);
    expect(t.scenes.map((s) => s.startMs)).toEqual([0, 1500, 3500]);
    expect(t.totalMs).toBe(4500);
  });

  it('caps overlap at half the shorter scene', () => {
    const p = createProject('T');
    p.scenes = [
      createScene({ id: 'a', durationMs: 400 }),
      createScene({ id: 'b', durationMs: 4000, transition: { type: 'fade', durationMs: 3000 } }),
    ];
    expect(computeTimeline(p).scenes[1]?.overlapMs).toBe(200);
  });

  it('counts frames for a 5 minute 30fps video without allocating them', () => {
    expect(frameCountFor(5 * 60 * 1000, 30)).toBe(9000);
    expect(frameTimeMs(9000, 30)).toBe(300000);
    expect(frameCountFor(0, 30)).toBe(1);
  });

  it('snaps to frame boundaries and formats timecode', () => {
    expect(snapToFrame(1010, 30)).toBeCloseTo(1000, 0);
    expect(formatTimecode(65_300)).toBe('1:05.3');
  });
});

describe('scene cache keys', () => {
  it('change with content, canvas and asset hash but not unrelated edits', async () => {
    const p = createProject('C');
    const s = p.scenes[0]!;
    const k1 = await sceneCacheKey(p, s);
    expect(await sceneCacheKey({ ...p, name: 'renamed', exportSettings: { ...p.exportSettings, fileName: 'x' } }, s)).toBe(k1);
    expect(await sceneCacheKey(p, { ...s, durationMs: s.durationMs + 100 })).not.toBe(k1);
    expect(await sceneCacheKey({ ...p, canvas: { width: 640, height: 360 } }, s)).not.toBe(k1);
    const withImg = { ...s, background: { type: 'image' as const, assetId: 'ast_1', fit: 'cover' as const, tint: null } };
    const asset = (sha: string) => ({
      id: 'ast_1',
      kind: 'image' as const,
      name: 'a.png',
      mime: 'image/png',
      size: 1,
      sha256: sha.repeat(64),
    });
    const a = await sceneCacheKey({ ...p, assets: [asset('a')] }, withImg);
    const b = await sceneCacheKey({ ...p, assets: [asset('b')] }, withImg);
    expect(a).not.toBe(b);
  });
});
