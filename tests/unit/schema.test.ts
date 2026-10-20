import { describe, expect, it } from 'vitest';
import {
  createProject,
  createScene,
  migrateProject,
  parseProjectJson,
  recoverProject,
  validateProject,
  LIMITS,
  canvasFor,
} from '@frameforge/project-schema';

describe('project schema', () => {
  it('accepts a freshly created project and round-trips through JSON', () => {
    const p = createProject('A');
    const r = parseProjectJson(JSON.stringify(p));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project).toEqual(p);
  });

  it('fills safe defaults and strips unknown fields', () => {
    const p = createProject('A');
    const raw = { ...p, evil: 1, scenes: [{ id: 'scn_1', unknown: true }] } as unknown;
    const r = validateProject(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project).not.toHaveProperty('evil');
      expect(r.project.scenes[0]?.durationMs).toBe(3000);
    }
  });

  it('rejects malformed JSON, wrong types and non-hex colours (CSS injection)', () => {
    expect(parseProjectJson('{nope').ok).toBe(false);
    const p = createProject('A');
    p.scenes[0]!.background = { type: 'color', color: 'red;background:url(//evil)' };
    expect(validateProject(p).ok).toBe(false);
  });

  it('rejects oversized input', () => {
    expect(parseProjectJson('x'.repeat(100), 10).ok).toBe(false);
  });

  it('rejects missing and wrongly-typed asset references', () => {
    const p = createProject('A');
    p.scenes[0]!.elements.push({
      ...(p.scenes[0]!.elements[0] as object),
      id: 'el_i',
      type: 'image',
      assetId: 'ast_nope',
      fit: 'cover',
      radius: 0,
    } as never);
    const r = validateProject(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.message).toContain('Missing asset');
  });

  it('rejects out-of-range values', () => {
    const p = createProject('A');
    p.scenes[0]!.durationMs = LIMITS.maxSceneMs + 1;
    expect(validateProject(p).ok).toBe(false);
    expect(validateProject({ ...createProject('A'), fps: 31 }).ok).toBe(false);
  });

  it('migrates legacy v0 projects', () => {
    const m = migrateProject({ version: 0, title: 'Old', scenes: [{ duration: 2, text: 'Hi', bg: '#ff0000' }] });
    expect(m.migratedFrom).toBe(0);
    const r = validateProject({ version: 0, title: 'Old', scenes: [{ duration: 2, text: 'Hi', bg: '#ff0000' }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project.name).toBe('Old');
      expect(r.project.scenes[0]?.durationMs).toBe(2000);
    }
  });

  it('warns about projects from a newer schema', () => {
    expect(migrateProject({ schemaVersion: 99 }).warnings[0]).toMatch(/newer/);
  });

  it('recovers a damaged project by dropping invalid scenes', () => {
    const p = createProject('Damaged');
    const raw = { ...p, scenes: [p.scenes[0], { id: '../bad', durationMs: -5 }, createScene({ id: 'scn_ok' })] };
    expect(validateProject(raw).ok).toBe(false);
    const rec = recoverProject(raw);
    expect(rec?.project.scenes.map((s) => s.id)).toContain('scn_ok');
    expect(rec?.project.scenes).toHaveLength(2);
    expect(rec?.dropped.length).toBeGreaterThan(0);
  });

  it('computes even canvas sizes for presets and aspect ratios', () => {
    expect(canvasFor('720p', '16:9')).toEqual({ width: 1280, height: 720 });
    expect(canvasFor('1080p', '9:16')).toEqual({ width: 1080, height: 1920 });
    expect(canvasFor('720p', '1:1')).toEqual({ width: 720, height: 720 });
  });
});
