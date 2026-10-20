import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium as playwrightChromium } from 'playwright-core';

const execFileP = promisify(execFile);

export interface ToolPaths {
  ffmpegPath?: string;
  ffprobePath?: string;
  chromiumPath?: string;
}

export interface Capabilities {
  platform: NodeJS.Platform;
  cpus: number;
  totalMemMB: number;
  ffmpeg: { ok: boolean; path?: string; version?: string; h264: boolean; aac: boolean; problem?: string };
  ffprobe: { ok: boolean; path?: string };
  chromium: { ok: boolean; path?: string; problem?: string };
  canRender: boolean;
  recommendLowResource: boolean;
}

async function tryRun(bin: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileP(bin, args, { timeout: 15000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    return stdout;
  } catch {
    return null;
  }
}

function candidates(name: 'ffmpeg' | 'ffprobe', explicit?: string): string[] {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const bundled = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const list = [
    explicit,
    bundled ? path.join(bundled, 'bin', exe) : undefined,
    process.env[name === 'ffmpeg' ? 'FRAMEFORGE_FFMPEG' : 'FRAMEFORGE_FFPROBE'],
    exe,
  ];
  if (process.platform === 'darwin') list.push(`/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`);
  return list.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

export function findChromium(explicit?: string): string | null {
  const fromEnv = [explicit, process.env.FRAMEFORGE_CHROMIUM].filter((x): x is string => !!x);
  for (const p of fromEnv) if (existsSync(p)) return p;
  try {
    // Authoritative location of the browser installed by `npx playwright install chromium`.
    const managed = playwrightChromium.executablePath();
    if (managed && existsSync(managed)) return managed;
  } catch {
    /* not installed */
  }
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(os.homedir(), '.cache', 'ms-playwright'),
    path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright'),
    path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
  ].filter((x): x is string => !!x);
  for (const root of roots) {
    try {
      const dirs = readdirSync(root).sort().reverse();
      for (const d of dirs) {
        const options = [
          path.join(root, d, 'chrome-linux', 'chrome'),
          path.join(root, d, 'chrome-linux64', 'chrome'),
          path.join(root, d, 'chrome-linux', 'headless_shell'),
          path.join(root, d, 'chrome-win', 'chrome.exe'),
          path.join(root, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
          path.join(root, d, 'chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        ];
        if (d.startsWith('chromium') && d !== 'chromium') for (const o of options) if (existsSync(o)) return o;
      }
      const plain = path.join(root, 'chromium');
      if (existsSync(plain) && !readdirSync(plain, { withFileTypes: true }).some((e) => e.isDirectory())) return plain;
    } catch {
      /* directory missing */
    }
  }
  const system = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return system.find((p) => existsSync(p)) ?? null;
}

async function findBinary(name: 'ffmpeg' | 'ffprobe', explicit?: string): Promise<{ path: string; out: string } | null> {
  for (const c of candidates(name, explicit)) {
    const out = await tryRun(c, ['-version']);
    if (out) return { path: c, out };
  }
  return null;
}

export async function checkCapabilities(tools: ToolPaths = {}): Promise<Capabilities> {
  const ff = await findBinary('ffmpeg', tools.ffmpegPath);
  const fp = await findBinary('ffprobe', tools.ffprobePath);
  const chromium = findChromium(tools.chromiumPath);
  let h264 = false;
  let aac = false;
  if (ff) {
    const enc = (await tryRun(ff.path, ['-hide_banner', '-encoders'])) ?? '';
    h264 = /\blibx264\b/.test(enc);
    aac = /\baac\b/.test(enc);
  }
  const cpus = os.cpus().length;
  const totalMemMB = Math.round(os.totalmem() / 1024 / 1024);
  const caps: Capabilities = {
    platform: process.platform,
    cpus,
    totalMemMB,
    ffmpeg: ff
      ? {
          ok: h264 && aac,
          path: ff.path,
          version: /version\s+(\S+)/.exec(ff.out)?.[1] ?? 'unknown',
          h264,
          aac,
          ...(h264 && aac ? {} : { problem: 'This FFmpeg build lacks the libx264 and/or aac encoder.' }),
        }
      : { ok: false, h264: false, aac: false, problem: 'FFmpeg was not found. Install it (see README) or set FRAMEFORGE_FFMPEG.' },
    ffprobe: fp ? { ok: true, path: fp.path } : { ok: false },
    chromium: chromium
      ? { ok: true, path: chromium }
      : { ok: false, problem: 'No Chromium/Chrome/Edge found. Install one or set FRAMEFORGE_CHROMIUM.' },
    canRender: false,
    recommendLowResource: cpus <= 2 || totalMemMB < 4096,
  };
  caps.canRender = caps.ffmpeg.ok && caps.ffprobe.ok && caps.chromium.ok;
  return caps;
}

export async function resolveTools(
  tools: ToolPaths = {},
): Promise<{ ffmpeg: string; ffprobe: string; chromium: string } | { error: 'FFMPEG_MISSING' | 'CHROMIUM_MISSING'; message: string }> {
  const caps = await checkCapabilities(tools);
  if (!caps.ffmpeg.ok || !caps.ffmpeg.path || !caps.ffprobe.path)
    return { error: 'FFMPEG_MISSING', message: caps.ffmpeg.problem ?? 'FFmpeg/ffprobe not found.' };
  if (!caps.chromium.ok || !caps.chromium.path)
    return { error: 'CHROMIUM_MISSING', message: caps.chromium.problem ?? 'Chromium not found.' };
  return { ffmpeg: caps.ffmpeg.path, ffprobe: caps.ffprobe.path, chromium: caps.chromium.path };
}
