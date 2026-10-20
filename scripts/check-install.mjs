// Installation check: reports missing dependencies with actionable instructions. Exit code 1 if rendering is not possible.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';

const win = process.platform === 'win32';
const mac = process.platform === 'darwin';
let failed = false;
const line = (ok, label, detail, fix) => {
  console.log(`${ok ? '[ OK ]' : '[FAIL]'} ${label}${detail ? `: ${detail}` : ''}`);
  if (!ok && fix) console.log(`       -> ${fix}`);
  if (!ok) failed = true;
};
const run = (bin, args) => {
  try {
    return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 });
  } catch {
    return null;
  }
};

const major = Number(process.versions.node.split('.')[0]);
line(
  major >= 22,
  'Node.js >= 22.18',
  process.version,
  win ? 'winget install OpenJS.NodeJS.LTS' : mac ? 'brew install node' : 'Install Node 22 LTS from https://nodejs.org',
);
line(
  run('git', ['--version']) !== null,
  'Git',
  (run('git', ['--version']) ?? '').trim(),
  win ? 'winget install Git.Git' : mac ? 'xcode-select --install' : 'sudo apt install git',
);
const ffmpeg = process.env.FRAMEFORGE_FFMPEG || 'ffmpeg';
const ffv = run(ffmpeg, ['-version']);
line(
  ffv !== null,
  'FFmpeg',
  ffv ? ffv.split('\n')[0] : '',
  win ? 'winget install Gyan.FFmpeg   (then reopen PowerShell)' : mac ? 'brew install ffmpeg' : 'sudo apt install ffmpeg',
);
if (ffv) {
  const enc = run(ffmpeg, ['-hide_banner', '-encoders']) ?? '';
  line(
    /libx264/.test(enc) && /\baac\b/.test(enc),
    'FFmpeg has libx264 + aac encoders',
    '',
    'Install a full FFmpeg build (the Gyan.FFmpeg / Homebrew builds include both).',
  );
}
line(
  run(process.env.FRAMEFORGE_FFPROBE || 'ffprobe', ['-version']) !== null,
  'ffprobe',
  '',
  'It ships with FFmpeg; make sure it is on PATH.',
);

const candidates = [
  process.env.FRAMEFORGE_CHROMIUM,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
let chrome = candidates.find((p) => existsSync(p));
if (!chrome) {
  // Playwright-managed browsers (PLAYWRIGHT_BROWSERS_PATH or the default cache folders).
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    `${os.homedir()}/.cache/ms-playwright`,
    `${os.homedir()}/AppData/Local/ms-playwright`,
    `${os.homedir()}/Library/Caches/ms-playwright`,
  ].filter(Boolean);
  const rels = [
    'chrome-linux/chrome',
    'chrome-linux64/chrome',
    'chrome-linux/headless_shell',
    'chrome-win/chrome.exe',
    'chrome-win64/chrome.exe',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
  ];
  for (const root of roots) {
    try {
      for (const d of readdirSync(root)) {
        if (!d.startsWith('chromium')) continue;
        for (const rel of rels) if (!chrome && existsSync(`${root}/${d}/${rel}`)) chrome = `${root}/${d}/${rel}`;
      }
    } catch {
      /* folder missing */
    }
  }
}
line(
  Boolean(chrome),
  'Chromium / Chrome / Edge',
  chrome ?? '',
  win
    ? 'Edge is preinstalled on Windows 10/11; or: winget install Google.Chrome'
    : mac
      ? 'brew install --cask google-chrome   (or set FRAMEFORGE_CHROMIUM)'
      : 'sudo apt install chromium   (or: npx playwright install chromium)',
);
line(existsSync('node_modules'), 'Dependencies installed', '', 'npm ci');
console.log(`\nSystem: ${os.platform()} ${os.arch()}, ${os.cpus().length} cores, ${Math.round(os.totalmem() / 1048576)} MB RAM`);
if (os.cpus().length <= 2 || os.totalmem() < 4 * 1024 ** 3)
  console.log('Tip: this is a modest machine. Use 720p, 30 fps, render scale 0.5-0.75, and low-resource mode.');
console.log(
  failed
    ? '\nSome requirements are missing. Fix the items marked [FAIL] and run `npm run check` again.'
    : '\nEverything needed for local rendering is available.',
);
process.exit(failed ? 1 : 0);
