import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProject, createScene, newId, type Project } from '@frameforge/project-schema';
import { checkCapabilities, renderProject, RenderError } from '@frameforge/render-adapter';

let dir: string;
let canRender = false;
let wav = '';

beforeAll(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'ff-test-'));
  const caps = await checkCapabilities();
  canRender = caps.canRender;
  if (canRender) {
    wav = path.join(dir, 'tone.wav');
    execFileSync(caps.ffmpeg.path!, [
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=3',
      '-ar',
      '44100',
      '-ac',
      '2',
      wav,
    ]);
  }
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function smallProject(): Project {
  const p = createProject('Render test');
  p.canvas = { width: 320, height: 180 };
  p.fps = 24;
  p.scenes = [
    createScene({ id: 'scn_a', durationMs: 1000, elements: p.scenes[0]!.elements }),
    createScene({
      id: 'scn_b',
      durationMs: 1000,
      background: { type: 'color', color: '#aa2244' },
      transition: { type: 'fade', durationMs: 400 },
      elements: [
        {
          id: 'el_b',
          type: 'shape',
          shape: 'ellipse',
          fill: '#ffffff',
          x: 50,
          y: 50,
          w: 30,
          h: 50,
          animation: { preset: 'zoomIn', delayMs: 0, durationMs: 500, easing: 'easeOut', exit: 'none', exitMs: 400 },
          name: '',
          scale: 1,
          rotation: 0,
          opacity: 1,
          stroke: null,
          strokeWidth: 0,
          radius: 0,
        },
      ],
    }),
  ];
  return p;
}

const run = (name: string, fn: () => Promise<void>) =>
  it(name, async (ctx) => {
    if (!canRender) return ctx.skip();
    await fn();
  });

function frameHashes(file: string): string {
  const out = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-f', 'framemd5', '-'], { encoding: 'utf8' });
  return createHash('sha256')
    .update(
      out
        .split('\n')
        .filter((l) => l && !l.startsWith('#'))
        .map((l) => l.split(',').pop())
        .join(''),
    )
    .digest('hex');
}

describe('local MP4 rendering (requires ffmpeg + chromium)', () => {
  run('renders a real, verified MP4 with measured progress', async () => {
    const out = path.join(dir, 'a.mp4');
    const progress: number[] = [];
    const res = await renderProject({
      project: smallProject(),
      assetPaths: new Map(),
      outputPath: out,
      onProgress: (p) => progress.push(p.fraction),
    });
    expect(res.verification.ok).toBe(true);
    expect(res.verification.info.video?.codec).toBe('h264');
    expect(res.width).toBe(320);
    expect(res.frames).toBe(Math.round(((2000 - 400) * 24) / 1000));
    expect(statSync(out).size).toBeGreaterThan(1000);
    expect(progress.at(-1)).toBe(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(readdirSync(dir).filter((f) => f.includes('partial'))).toEqual([]);
  });

  run('is deterministic: two renders decode to identical frames', async () => {
    const a = path.join(dir, 'd1.mp4');
    const b = path.join(dir, 'd2.mp4');
    await renderProject({ project: smallProject(), assetPaths: new Map(), outputPath: a });
    await renderProject({ project: smallProject(), assetPaths: new Map(), outputPath: b });
    expect(frameHashes(a)).toBe(frameHashes(b));
  });

  run('mixes audio and keeps it in sync with the video length', async () => {
    const p = smallProject();
    const audioId = 'ast_tone';
    p.assets = [{ id: audioId, kind: 'audio', name: 'tone.wav', mime: 'audio/wav', size: statSync(wav).size, sha256: '0'.repeat(64) }];
    p.audioTracks = [
      {
        id: newId('aud'),
        name: 'Tone',
        assetId: audioId,
        startMs: 200,
        trimStartMs: 0,
        durationMs: null,
        volume: 0.8,
        fadeInMs: 100,
        fadeOutMs: 300,
        muted: false,
      },
    ];
    const out = path.join(dir, 'audio.mp4');
    const res = await renderProject({ project: p, assetPaths: new Map([[audioId, wav]]), outputPath: out });
    expect(res.verification.info.audio?.codec).toBe('aac');
    expect(Math.abs(res.verification.info.durationSec - 1.6)).toBeLessThan(0.2);
  });

  run('rejects invalid projects without touching the disk', async () => {
    const bad = { ...smallProject(), fps: 31 } as unknown as Project;
    const out = path.join(dir, 'bad.mp4');
    await expect(renderProject({ project: bad, assetPaths: new Map(), outputPath: out })).rejects.toMatchObject({
      code: 'INVALID_PROJECT',
    });
    expect(existsSync(out)).toBe(false);
  });

  run('reports missing assets clearly', async () => {
    const p = smallProject();
    p.assets = [{ id: 'ast_x', kind: 'image', name: 'logo.png', mime: 'image/png', size: 10, sha256: '1'.repeat(64) }];
    p.scenes[0]!.elements.push({
      id: 'el_img',
      type: 'image',
      assetId: 'ast_x',
      fit: 'contain',
      radius: 0,
      name: '',
      x: 50,
      y: 50,
      w: 20,
      h: 20,
      scale: 1,
      rotation: 0,
      opacity: 1,
      animation: p.scenes[0]!.elements[0]!.animation,
    });
    const err = await renderProject({ project: p, assetPaths: new Map(), outputPath: path.join(dir, 'm.mp4') }).catch((e) => e);
    expect(err).toBeInstanceOf(RenderError);
    expect(err.code).toBe('MISSING_ASSETS');
    expect(err.message).toContain('logo.png');
  });

  run('refuses to overwrite an existing file unless asked', async () => {
    const out = path.join(dir, 'exists.mp4');
    writeFileSync(out, 'precious');
    await expect(renderProject({ project: smallProject(), assetPaths: new Map(), outputPath: out })).rejects.toMatchObject({
      code: 'OUTPUT_EXISTS',
    });
    expect(statSync(out).size).toBe(8);
  });

  run('cancels mid-render and cleans up partial output', async () => {
    const p = smallProject();
    p.scenes[0]!.durationMs = 20000;
    const ctl = new AbortController();
    const out = path.join(dir, 'cancel.mp4');
    const t = setTimeout(() => ctl.abort(), 2500);
    const err = await renderProject({
      project: p,
      assetPaths: new Map(),
      outputPath: out,
      signal: ctl.signal,
      onProgress: (pr) => {
        if (pr.frame > 5 && !ctl.signal.aborted) {
          clearTimeout(t);
          ctl.abort();
        }
      },
    }).catch((e) => e);
    expect(err.code).toBe('CANCELLED');
    expect(existsSync(out)).toBe(false);
    expect(readdirSync(dir).filter((f) => f.includes('partial'))).toEqual([]);
  });

  run('blocks network requests from scene HTML and strips scripts', async () => {
    const p = smallProject();
    p.scenes[0]!.mode = 'html';
    p.scenes[0]!.html =
      '<img src="https://example.com/x.png"><script>document.title="pwned"</script><div onclick="1" style="background:url(https://evil.test/a)">x</div>';
    const res = await renderProject({ project: p, assetPaths: new Map(), outputPath: path.join(dir, 'html.mp4'), maxFrames: 5 });
    expect(res.warnings.join('\n')).toMatch(/not supported|removed/);
  });
});

describe('captions in rendered video', () => {
  run('burns visible captions into the frames (and not when disabled)', async () => {
    const withCaps = smallProject();
    withCaps.canvas = { width: 320, height: 180 };
    withCaps.captions = {
      enabled: true,
      position: 'bottom',
      fontSize: 8,
      color: '#ffffff',
      background: '#000000cc',
      items: [{ id: 'cap_1', startMs: 0, endMs: 1500, text: 'HELLO CAPTION' }],
    };
    const off = structuredClone(withCaps);
    off.captions.enabled = false;
    const a = path.join(dir, 'cap-on.mp4');
    const b = path.join(dir, 'cap-off.mp4');
    await renderProject({ project: withCaps, assetPaths: new Map(), outputPath: a, maxFrames: 12 });
    await renderProject({ project: off, assetPaths: new Map(), outputPath: b, maxFrames: 12 });
    const frame = (f: string) =>
      execFileSync('ffmpeg', ['-loglevel', 'error', '-ss', '0.3', '-i', f, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
        maxBuffer: 10_000_000,
      });
    const fa = frame(a);
    const fb = frame(b);
    expect(fa.length).toBe(fb.length);
    // The bottom strip (where captions sit) must differ between the two renders.
    const rowBytes = 320 * 3;
    const bottom = (buf: Buffer) => buf.subarray(buf.length - rowBytes * 60);
    expect(Buffer.compare(bottom(fa), bottom(fb))).not.toBe(0);
    // The top strip must be identical (captions did not disturb the rest of the frame).
    expect(Buffer.compare(fa.subarray(0, rowBytes * 40), fb.subarray(0, rowBytes * 40))).toBe(0);
  });
});
