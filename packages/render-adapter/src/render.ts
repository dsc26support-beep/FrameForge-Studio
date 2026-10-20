import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { chromium, type Browser, type Route } from 'playwright-core';
import { validateProject, type Project } from '@frameforge/project-schema';
import { compileProjectHtml, computeTimeline, frameCountFor, frameTimeMs } from '@frameforge/render-core';
import { RenderError } from './errors';
import { buildEncodeArgs, type ResolvedAudioInput } from './ffmpeg';
import { exists } from './fs-safe';
import { probe, verifyOutput, type Verification } from './probe';
import { resolveTools, type ToolPaths } from './tools';

export const ASSET_ORIGIN = 'https://ff-assets.invalid';

export type RenderPhase = 'prepare' | 'capture' | 'finalize' | 'verify' | 'done';

export interface RenderProgress {
  phase: RenderPhase;
  frame: number;
  totalFrames: number;
  /** 0..1 over the whole job. Reflects real work done, never a simulated value. */
  fraction: number;
  elapsedMs: number;
  message?: string;
}

export interface RenderOptions {
  project: Project;
  /** assetId -> absolute path on disk. Paths are produced by the application, not by project data. */
  assetPaths: ReadonlyMap<string, string>;
  /** Absolute path of the final `.mp4`. */
  outputPath: string;
  overwrite?: boolean;
  signal?: AbortSignal;
  onProgress?: (p: RenderProgress) => void;
  tools?: ToolPaths;
  /** Run the full decode check after encoding (default true). */
  deepVerify?: boolean;
  /** Disable the Chromium sandbox. Defaults to true only when running as root (containers). */
  noSandbox?: boolean;
  /** Render only the first N frames (testing / quick preview exports). */
  maxFrames?: number;
}

export interface RenderResult {
  outputPath: string;
  frames: number;
  durationMs: number;
  bytes: number;
  width: number;
  height: number;
  warnings: string[];
  verification: Verification;
  stats: { totalMs: number; captureMs: number; avgFps: number };
}

const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2);
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

export function plannedOutputSize(project: Project): { width: number; height: number; scale: number } {
  const scale = project.renderSettings.scale;
  return { width: even(project.canvas.width * scale), height: even(project.canvas.height * scale), scale };
}

export function planFrames(project: Project): { totalMs: number; frames: number } {
  const totalMs = computeTimeline(project).totalMs;
  return { totalMs, frames: frameCountFor(totalMs, project.fps) };
}

export async function renderProject(opts: RenderOptions): Promise<RenderResult> {
  const started = Date.now();
  const warnings: string[] = [];
  const signal = opts.signal;
  const throwIfCancelled = () => {
    if (signal?.aborted) throw new RenderError('CANCELLED', 'Render cancelled.');
  };
  const report = (p: Omit<RenderProgress, 'elapsedMs'>) => opts.onProgress?.({ ...p, elapsedMs: Date.now() - started });

  // ---- 1. Validate -------------------------------------------------------------------------
  report({ phase: 'prepare', frame: 0, totalFrames: 0, fraction: 0, message: 'Validating project' });
  const validated = validateProject(opts.project);
  if (!validated.ok) {
    throw new RenderError(
      'INVALID_PROJECT',
      'The project is not valid.',
      validated.errors
        .slice(0, 5)
        .map((e) => `${e.path}: ${e.message}`)
        .join('\n'),
    );
  }
  const project = validated.project;
  if (project.scenes.length === 0) throw new RenderError('INVALID_PROJECT', 'The project has no scenes to render.');

  const { totalMs, frames: fullFrames } = planFrames(project);
  const totalFrames = opts.maxFrames ? Math.min(opts.maxFrames, fullFrames) : fullFrames;
  const renderMs = opts.maxFrames ? Math.min(totalMs, (totalFrames * 1000) / project.fps) : totalMs;
  const size = plannedOutputSize(project);

  // ---- 2. Assets, output path, tools ---------------------------------------------------------
  const referenced = new Set<string>();
  for (const s of project.scenes) {
    if (s.mode === 'structured') for (const el of s.elements) if (el.type === 'image') referenced.add(el.assetId);
    if (s.background.type === 'image') referenced.add(s.background.assetId);
    if (s.mode === 'html') for (const m of s.html.matchAll(/asset:([A-Za-z0-9_-]{1,64})/g)) referenced.add(m[1]!);
  }
  for (const t of project.audioTracks) if (!t.muted) referenced.add(t.assetId);
  const missing: string[] = [];
  for (const id of referenced) {
    const p = opts.assetPaths.get(id);
    if (!p || !(await exists(p))) missing.push(project.assets.find((a) => a.id === id)?.name ?? id);
  }
  if (missing.length)
    throw new RenderError('MISSING_ASSETS', `Missing media files: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);

  const outAbs = path.resolve(opts.outputPath);
  if (path.extname(outAbs).toLowerCase() !== '.mp4') throw new RenderError('OUTPUT_INVALID', 'The output file must end in .mp4.');
  const outDir = path.dirname(outAbs);
  try {
    if (!(await fs.stat(outDir)).isDirectory()) throw new Error('not a directory');
  } catch {
    throw new RenderError('OUTPUT_INVALID', 'The output folder does not exist.');
  }
  if (!opts.overwrite && (await exists(outAbs)))
    throw new RenderError('OUTPUT_EXISTS', 'The output file already exists. Choose another name or allow overwriting.');

  const tools = await resolveTools(opts.tools);
  if ('error' in tools) throw new RenderError(tools.error, tools.message);

  throwIfCancelled();

  // Audio inputs: resolve real durations with ffprobe so fades and trims are exact.
  const audio: ResolvedAudioInput[] = [];
  for (const t of project.audioTracks) {
    if (t.muted) continue;
    const p = opts.assetPaths.get(t.assetId)!;
    if (t.startMs >= renderMs) {
      warnings.push(`Audio track "${t.name}" starts after the end of the video and was skipped.`);
      continue;
    }
    let sourceMs: number;
    try {
      sourceMs = (await probe(tools.ffprobe, p)).durationSec * 1000;
    } catch {
      throw new RenderError('INVALID_PROJECT', `Audio file for "${t.name}" could not be read.`);
    }
    const available = sourceMs - t.trimStartMs;
    const durationMs = Math.floor(Math.min(t.durationMs ?? available, available, renderMs - t.startMs));
    if (durationMs <= 0) {
      warnings.push(`Audio track "${t.name}" has no audible length and was skipped.`);
      continue;
    }
    audio.push({
      path: p,
      startMs: t.startMs,
      trimStartMs: t.trimStartMs,
      durationMs,
      volume: t.volume,
      fadeInMs: t.fadeInMs,
      fadeOutMs: t.fadeOutMs,
    });
  }

  // ---- 3. Compile the scene document ---------------------------------------------------------
  const assetFiles = new Map<string, { path: string; mime: string }>();
  for (const id of referenced) {
    const p = opts.assetPaths.get(id)!;
    const asset = project.assets.find((a) => a.id === id);
    const ext = path.extname(p).slice(1).toLowerCase();
    assetFiles.set(id, { path: p, mime: asset?.mime ?? MIME_BY_EXT[ext] ?? 'application/octet-stream' });
  }
  const compiled = compileProjectHtml(project, {
    assetUrl: (id) => (assetFiles.has(id) ? `${ASSET_ORIGIN}/a/${id}` : null),
    imgSrc: ASSET_ORIGIN,
  });
  warnings.push(...compiled.warnings);

  // ---- 4. Launch encoder and browser ---------------------------------------------------------
  const partial = path.join(outDir, `.${path.basename(outAbs, '.mp4')}.${Date.now().toString(36)}.partial.mp4`);
  const captureJpeg = project.renderSettings.captureFormat === 'jpeg';
  const args = buildEncodeArgs({
    fps: project.fps,
    outWidth: size.width,
    outHeight: size.height,
    totalMs: renderMs,
    captureCodec: captureJpeg ? 'mjpeg' : 'png',
    settings: project.exportSettings,
    audio,
    outputPath: partial,
    lowResource: project.renderSettings.lowResourceMode,
  });

  let ff: ChildProcessByStdio<Writable, null, Readable> | null = null;
  let browser: Browser | null = null;
  let ffStderr = '';
  let ffExit: Promise<number | null> | null = null;
  let ffExited = false;
  let success = false;
  const onAbort = () => {
    ff?.kill('SIGKILL');
  };
  signal?.addEventListener('abort', onAbort);

  try {
    report({ phase: 'prepare', frame: 0, totalFrames, fraction: 0.01, message: 'Starting encoder' });
    ff = spawn(tools.ffmpeg, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
    ff.stderr.on('data', (d: Buffer) => {
      if (ffStderr.length < 4000) ffStderr += d.toString();
    });
    ffExit = new Promise((resolve) => {
      ff!.on('close', (code) => {
        ffExited = true;
        resolve(code);
      });
      ff!.on('error', (e) => {
        ffStderr += e.message;
        ffExited = true;
        resolve(-1);
      });
    });
    let stdinError: Error | null = null;
    ff.stdin.on('error', (e) => {
      stdinError = e;
    });

    const noSandbox = opts.noSandbox ?? (typeof process.getuid === 'function' && process.getuid() === 0);
    if (noSandbox)
      warnings.push('Chromium sandbox is disabled because the renderer runs as root. Only render projects you trust in this environment.');
    browser = await chromium.launch({
      executablePath: tools.chromium,
      headless: true,
      chromiumSandbox: !noSandbox,
      args: [
        '--hide-scrollbars',
        '--force-color-profile=srgb',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--no-first-run',
        '--mute-audio',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none',
      ],
    });
    throwIfCancelled();
    const context = await browser.newContext({
      viewport: { width: project.canvas.width, height: project.canvas.height },
      deviceScaleFactor: size.width / project.canvas.width,
      serviceWorkers: 'block',
      acceptDownloads: false,
      permissions: [],
      locale: 'en-US',
      timezoneId: 'UTC',
      colorScheme: 'light',
      reducedMotion: 'no-preference', // exported video never follows the OS reduced-motion setting
    });
    let blocked = 0;
    await context.route('**/*', async (route: Route) => {
      const url = route.request().url();
      if (url.startsWith(`${ASSET_ORIGIN}/a/`)) {
        const file = assetFiles.get(url.slice(`${ASSET_ORIGIN}/a/`.length));
        if (file) {
          await route.fulfill({ status: 200, contentType: file.mime, body: await fs.readFile(file.path) });
          return;
        }
      }
      blocked += 1;
      await route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    await page.setContent(compiled.html, { waitUntil: 'load' });
    await page.evaluate(() => (window as unknown as { __ff: { ready(): Promise<boolean> } }).__ff.ready());

    // ---- 5. Capture frames at deterministic timestamps ------------------------------------
    const captureStart = Date.now();
    let lastReport = 0;
    for (let frame = 0; frame < totalFrames; frame++) {
      throwIfCancelled();
      if (ffExited || stdinError) throw new RenderError('ENCODE_FAILED', 'The encoder stopped unexpectedly.', ffStderr.slice(-800));
      const t = frameTimeMs(frame, project.fps);
      await page.evaluate((ms) => (window as unknown as { __ff: { seek(t: number): void } }).__ff.seek(ms), t);
      let shot: Buffer;
      try {
        shot = await page.screenshot(
          captureJpeg
            ? {
                type: 'jpeg',
                quality: project.renderSettings.jpegQuality,
                animations: 'allow',
                caret: 'initial',
                clip: { x: 0, y: 0, width: project.canvas.width, height: project.canvas.height },
              }
            : {
                type: 'png',
                animations: 'allow',
                caret: 'initial',
                clip: { x: 0, y: 0, width: project.canvas.width, height: project.canvas.height },
              },
        );
      } catch (e) {
        throwIfCancelled();
        throw new RenderError('CAPTURE_FAILED', `Frame ${frame} could not be captured.`, (e as Error).message);
      }
      // Bounded memory: one frame in flight, wait for the encoder when its pipe is full.
      if (!ff.stdin.write(shot)) {
        await new Promise<void>((resolve) => {
          const done = () => {
            ff!.stdin.off('drain', done);
            ff!.off('close', done);
            resolve();
          };
          ff!.stdin.once('drain', done);
          ff!.once('close', done);
        });
      }
      const now = Date.now();
      if (now - lastReport > 120 || frame === totalFrames - 1) {
        lastReport = now;
        report({
          phase: 'capture',
          frame: frame + 1,
          totalFrames,
          fraction: 0.02 + 0.9 * ((frame + 1) / totalFrames),
          message: `Rendering frame ${frame + 1} of ${totalFrames}`,
        });
      }
    }
    const captureMs = Date.now() - captureStart;
    if (blocked > 0) warnings.push(`${blocked} network request(s) from scene content were blocked.`);
    await context.close();
    await browser.close();
    browser = null;

    // ---- 6. Finish encoding -----------------------------------------------------------------
    report({ phase: 'finalize', frame: totalFrames, totalFrames, fraction: 0.93, message: 'Finishing encode' });
    ff.stdin.end();
    const code = await ffExit;
    throwIfCancelled();
    if (code !== 0) throw new RenderError('ENCODE_FAILED', 'FFmpeg could not encode the video.', ffStderr.slice(-800));

    // ---- 7. Verify, then atomically publish -------------------------------------------------
    report({ phase: 'verify', frame: totalFrames, totalFrames, fraction: 0.96, message: 'Verifying output' });
    const verification = await verifyOutput(
      tools.ffmpeg,
      tools.ffprobe,
      partial,
      { width: size.width, height: size.height, fps: project.fps, frames: totalFrames, durationMs: renderMs, hasAudio: audio.length > 0 },
      opts.deepVerify ?? true,
    );
    if (!verification.ok) throw new RenderError('VERIFY_FAILED', 'The rendered file failed verification.', verification.issues.join('\n'));
    if (!opts.overwrite && (await exists(outAbs)))
      throw new RenderError('OUTPUT_EXISTS', 'The output file appeared while rendering; refusing to overwrite it.');
    await fs.rename(partial, outAbs);
    success = true;
    const bytes = (await fs.stat(outAbs)).size;
    report({ phase: 'done', frame: totalFrames, totalFrames, fraction: 1, message: 'Done' });
    return {
      outputPath: outAbs,
      frames: totalFrames,
      durationMs: renderMs,
      bytes,
      width: size.width,
      height: size.height,
      warnings,
      verification,
      stats: { totalMs: Date.now() - started, captureMs, avgFps: captureMs > 0 ? (totalFrames * 1000) / captureMs : 0 },
    };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    if (ff && !ffExited) {
      ff.stdin.destroy();
      ff.kill('SIGKILL');
    }
    if (browser) await browser.close().catch(() => undefined);
    if (!success) await fs.rm(partial, { force: true }).catch(() => undefined);
  }
}
