import { promises as fs } from 'node:fs';
import path from 'node:path';
import { checkCapabilities } from './tools';
import { prepareJobFromArchive } from './job';
import { RenderError } from './errors';
import { renderProject } from './render';

const HELP = `FrameForge command-line renderer

Usage:
  frameforge-render <project.ffproj> <output.mp4> [--overwrite] [--scale 0.5] [--no-deep-verify]
  frameforge-render --doctor

Exit codes: 0 ok, 1 render error, 2 usage error.`;

async function doctor(): Promise<number> {
  const c = await checkCapabilities();
  const line = (ok: boolean, label: string, detail: string) =>
    console.log(`${ok ? 'OK     ' : 'MISSING'} ${label}${detail ? ` - ${detail}` : ''}`);
  line(c.ffmpeg.ok, 'FFmpeg (libx264 + aac)', c.ffmpeg.ok ? `${c.ffmpeg.path} (${c.ffmpeg.version})` : (c.ffmpeg.problem ?? ''));
  line(c.ffprobe.ok, 'ffprobe', c.ffprobe.path ?? 'Install FFmpeg (ffprobe ships with it).');
  line(c.chromium.ok, 'Chromium/Chrome/Edge', c.chromium.ok ? (c.chromium.path ?? '') : (c.chromium.problem ?? ''));
  console.log(
    `System: ${c.platform}, ${c.cpus} CPU cores, ${c.totalMemMB} MB RAM${c.recommendLowResource ? ' (low-resource mode recommended)' : ''}`,
  );
  console.log(c.canRender ? 'Ready to render.' : 'Not ready: install the missing items above (see README, "Local rendering setup").');
  return c.canRender ? 0 : 1;
}

export async function main(argv: string[]): Promise<number> {
  const args = argv.filter((a) => !a.startsWith('--'));
  const flags = new Set(argv.filter((a) => a.startsWith('--') && a !== '--scale'));
  if (flags.has('--help') || flags.has('-h')) {
    console.log(HELP);
    return 0;
  }
  if (flags.has('--doctor')) return doctor();
  const scaleIdx = argv.indexOf('--scale');
  const scale = scaleIdx >= 0 ? Number(argv[scaleIdx + 1]) : undefined;
  const positional = args.filter((a) => a !== argv[scaleIdx + 1] || scaleIdx < 0);
  const [input, output] = positional;
  if (!input || !output) {
    console.error(HELP);
    return 2;
  }
  let job;
  try {
    job = await prepareJobFromArchive(new Uint8Array(await fs.readFile(input)));
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    return 1;
  }
  try {
    if (scale !== undefined) {
      if (!(scale >= 0.25 && scale <= 1)) throw new RenderError('INVALID_PROJECT', '--scale must be between 0.25 and 1.');
      job.project.renderSettings.scale = scale;
    }
    const ctl = new AbortController();
    process.once('SIGINT', () => ctl.abort());
    let last = -1;
    const res = await renderProject({
      project: job.project,
      assetPaths: job.assetPaths,
      outputPath: path.resolve(output),
      overwrite: flags.has('--overwrite'),
      deepVerify: !flags.has('--no-deep-verify'),
      signal: ctl.signal,
      onProgress: (p) => {
        const pct = Math.floor(p.fraction * 100);
        if (pct !== last && process.stderr.isTTY) process.stderr.write(`\r${p.message ?? p.phase} ${pct}%   `);
        last = pct;
      },
    });
    if (process.stderr.isTTY) process.stderr.write('\n');
    for (const w of [...job.warnings, ...res.warnings]) console.error(`Warning: ${w}`);
    console.log(
      `Wrote ${res.outputPath} (${res.frames} frames, ${res.width}x${res.height}, ${(res.bytes / 1024).toFixed(0)} KB, ${(res.stats.totalMs / 1000).toFixed(1)}s, ${res.stats.avgFps.toFixed(1)} frames/s captured). Verified: ${res.verification.ok}`,
    );
    return 0;
  } catch (e) {
    if (e instanceof RenderError) console.error(`Error [${e.code}]: ${e.message}${e.details ? `\n${e.details}` : ''}`);
    else console.error(`Error: ${(e as Error).message}`);
    return 1;
  } finally {
    await job.cleanup();
  }
}
