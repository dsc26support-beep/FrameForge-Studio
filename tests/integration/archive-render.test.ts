import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createArchive, ingestAsset } from '@frameforge/asset-manager';
import { addElement, registerAsset } from '@frameforge/editor-core';
import { createProject, type SceneElement } from '@frameforge/project-schema';
import { checkCapabilities } from '@frameforge/render-adapter';
import { main } from '../../packages/render-adapter/src/cli';
import { TEMPLATES } from '@frameforge/templates';

let dir: string;
let canRender = false;
beforeAll(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'ff-int-'));
  canRender = (await checkCapabilities()).canRender;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('archive -> command-line renderer', () => {
  it('renders a project with an embedded image from a .ffproj archive', async (ctx) => {
    if (!canRender) return ctx.skip();
    const png = path.join(dir, 'blue.png');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64', '-frames:v', '1', png]);
    const bytes = new Uint8Array((await import('node:fs')).readFileSync(png));
    const { asset } = await ingestAsset(bytes, 'blue.png', []);
    let p = registerAsset(createProject('Archive render'), asset);
    p.canvas = { width: 320, height: 180 };
    p.fps = 24;
    p.scenes[0]!.durationMs = 800;
    p = addElement(p, p.scenes[0]!.id, {
      ...(p.scenes[0]!.elements[0] as object),
      id: 'el_img',
      type: 'image',
      assetId: asset.id,
      fit: 'contain',
      radius: 0,
      w: 30,
      h: 30,
      y: 30,
    } as unknown as SceneElement);
    const archive = path.join(dir, 'p.ffproj');
    writeFileSync(archive, await createArchive(p, new Map([[asset.id, bytes]])));
    const out = path.join(dir, 'cli.mp4');
    expect(await main([archive, out])).toBe(0);
    expect(statSync(out).size).toBeGreaterThan(1000);
    // Second run refuses to overwrite; --overwrite allows it.
    expect(await main([archive, out])).toBe(1);
    expect(await main([archive, out, '--overwrite', '--scale', '0.5'])).toBe(0);
    const size = execFileSync(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out],
      { encoding: 'utf8' },
    ).trim();
    expect(size).toBe('160,90');
  });

  it('fails cleanly on a corrupt archive and leaves no output', async () => {
    const bad = path.join(dir, 'bad.ffproj');
    writeFileSync(bad, 'definitely not a zip');
    const out = path.join(dir, 'never.mp4');
    expect(await main([bad, out])).toBe(1);
    expect(existsSync(out)).toBe(false);
  });

  it('renders every template (first frames) without errors', async (ctx) => {
    if (!canRender) return ctx.skip();
    const { renderProject } = await import('@frameforge/render-adapter');
    for (const t of TEMPLATES) {
      const p = t.build();
      p.renderSettings.scale = 0.25;
      const res = await renderProject({
        project: p,
        assetPaths: new Map(),
        outputPath: path.join(dir, `${t.id}.mp4`),
        maxFrames: 12,
        deepVerify: false,
      });
      expect(res.verification.ok, t.id).toBe(true);
    }
  });
});
