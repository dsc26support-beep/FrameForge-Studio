import { describe, expect, it } from 'vitest';
import {
  addElement,
  addScene,
  applyExportSettings,
  canRedo,
  canUndo,
  commit,
  createHistory,
  deleteScene,
  duplicateProject,
  duplicateScene,
  moveScene,
  redo,
  removeAsset,
  setSceneDuration,
  undo,
  updateElement,
  registerAsset,
} from '@frameforge/editor-core';
import { createProject, createShapeElement, LIMITS, validateProject } from '@frameforge/project-schema';
import { TEMPLATES, getTemplate } from '@frameforge/templates';
import { classifyDevice } from '@frameforge/render-core';
import { JobQueue } from '@frameforge/render-adapter';

describe('editor operations', () => {
  it('adds, duplicates, reorders and deletes scenes while staying valid', () => {
    let p = createProject('E');
    p = addScene(p);
    p = duplicateScene(p, p.scenes[0]!.id);
    expect(p.scenes).toHaveLength(3);
    p = moveScene(p, 0, 2);
    expect(validateProject(p).ok).toBe(true);
    const ids = new Set(p.scenes.map((s) => s.id));
    expect(ids.size).toBe(3);
    p = deleteScene(p, p.scenes[0]!.id);
    expect(p.scenes).toHaveLength(2);
    expect(deleteScene(deleteScene(p, p.scenes[0]!.id), p.scenes[0]!.id).scenes.length).toBeGreaterThanOrEqual(1);
  });

  it('clamps durations and applies export presets to the canvas', () => {
    let p = createProject('E');
    p = setSceneDuration(p, p.scenes[0]!.id, 5);
    expect(p.scenes[0]!.durationMs).toBe(LIMITS.minSceneMs);
    p = applyExportSettings(p, { preset: '1080p', aspect: '9:16', fps: 60 });
    expect(p.canvas).toEqual({ width: 1080, height: 1920 });
    expect(p.fps).toBe(60);
  });

  it('edits elements and removes assets with their references', () => {
    let p = createProject('E');
    const sid = p.scenes[0]!.id;
    const shape = createShapeElement();
    p = addElement(p, sid, shape);
    p = updateElement(p, sid, shape.id, { opacity: 0.5 });
    expect(p.scenes[0]!.elements.find((e) => e.id === shape.id)?.opacity).toBe(0.5);
    p = registerAsset(p, { id: 'ast_1', kind: 'image', name: 'a.png', mime: 'image/png', size: 1, sha256: 'a'.repeat(64) });
    p = addElement(p, sid, { ...shape, id: 'el_img', type: 'image', assetId: 'ast_1', fit: 'cover', radius: 0 } as never);
    expect(validateProject(p).ok).toBe(true);
    p = removeAsset(p, 'ast_1');
    expect(validateProject(p).ok).toBe(true);
  });

  it('duplicates a project with a new id', () => {
    const p = createProject('E');
    expect(duplicateProject(p).id).not.toBe(p.id);
  });

  it('supports undo/redo with coalescing', () => {
    const p0 = createProject('H');
    let h = createHistory(p0);
    h = commit(h, { ...p0, name: 'a' }, 'rename', 1000);
    h = commit(h, { ...p0, name: 'ab' }, 'rename', 1100);
    expect(h.past).toHaveLength(1);
    h = commit(h, { ...p0, name: 'other' }, null, 5000);
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect(h.present.name).toBe('ab');
    h = undo(h);
    expect(h.present.name).toBe(p0.name);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present.name).toBe('ab');
    h = commit(h, { ...p0, name: 'new' }, null, 9000);
    expect(canRedo(h)).toBe(false);
  });
});

describe('templates', () => {
  it('ships eight valid templates using the shared project format', () => {
    expect(TEMPLATES).toHaveLength(8);
    for (const t of TEMPLATES) {
      const r = validateProject(t.build());
      expect(r.ok, t.id).toBe(true);
    }
    expect(getTemplate('social-vertical')?.build().canvas).toEqual({ width: 720, height: 1280 });
  });
});

describe('device classification', () => {
  it('uses measured capabilities and blocks local render without a renderer', () => {
    const phone = classifyDevice({ cores: 6, memoryGB: 4, coarsePointer: true, screenWidth: 390, hasDesktopRenderer: false });
    expect(phone.class).toBe('phone');
    expect(phone.canRenderLocally).toBe(false);
    expect(phone.renderBlockedReason).toMatch(/desktop app/);
    const desktop = classifyDevice({ cores: 8, memoryGB: 16, coarsePointer: false, screenWidth: 1600, hasDesktopRenderer: true });
    expect(desktop.class).toBe('desktop');
    expect(desktop.canRenderLocally).toBe(true);
    expect(
      classifyDevice({ cores: 2, memoryGB: 2, coarsePointer: false, screenWidth: 1600, hasDesktopRenderer: true }).lowResourceMode,
    ).toBe(true);
  });
});

describe('render queue', () => {
  it('limits concurrency and supports cancelling queued jobs', async () => {
    const q = new JobQueue<number>(1);
    let active = 0;
    let maxActive = 0;
    const work = (n: number) => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return n;
    };
    const a = q.enqueue(work(1));
    const b = q.enqueue(work(2));
    const c = q.enqueue(work(3));
    b.cancel();
    expect(await a.promise).toBe(1);
    await expect(b.promise).rejects.toThrow();
    expect(await c.promise).toBe(3);
    expect(maxActive).toBe(1);
    expect(b.status).toBe('cancelled');
  });
});
