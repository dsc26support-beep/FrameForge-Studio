import { app, BrowserWindow, dialog, ipcMain, protocol, session, shell, type IpcMainInvokeEvent } from 'electron';
import { fork, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { RUNTIME_SOURCE, type BridgeCapabilities } from '@frameforge/render-core';
import {
  APP_SCHEME,
  CSP,
  EVENT_CHANNEL,
  IpcValidationError,
  SECURE_WEB_PREFERENCES,
  isAllowedNavigation,
  isAllowedRequestUrl,
  isTrustedSender,
  requireBytes,
  requireObject,
  requireOptionalScale,
  requireToken,
  requireString,
  safeSuggestedName,
} from './security';

const runtimeHash = createHash('sha256').update(RUNTIME_SOURCE).digest('base64');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};
const WEB_ROOT = path.join(__dirname, 'web');
const WORKER = path.join(__dirname, 'render-worker.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

interface Settings {
  defaultOutputDir?: string;
}
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
async function loadSettings(): Promise<Settings> {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsFile(), 'utf8')) as Settings;
    return typeof parsed.defaultOutputDir === 'string' ? { defaultOutputDir: parsed.defaultOutputDir } : {};
  } catch {
    return {};
  }
}

/** Output locations the user explicitly chose in a native dialog. The web UI only ever sees opaque tokens. */
const outputs = new Map<string, string>();
const jobs = new Map<string, { child: ChildProcess; archivePath: string }>();
let mainWindow: BrowserWindow | null = null;

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const ok =
    mainWindow !== null &&
    isTrustedSender({
      senderIsMainWindow: event.sender === mainWindow.webContents,
      frameIsMainFrame: event.senderFrame === mainWindow.webContents.mainFrame,
      url: event.senderFrame?.url,
    });
  if (!ok) throw new IpcValidationError('Untrusted IPC sender');
}

function handle<T>(channel: string, fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> | T): void {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedSender(event);
    return fn(event, ...args);
  });
}

function sendEvent(payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(EVENT_CHANNEL, payload);
}

function runWorker<T>(
  message: Record<string, unknown>,
  onMessage?: (m: Record<string, unknown>) => void,
): { child: ChildProcess; done: Promise<T | null> } {
  const child = fork(WORKER, [], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    serialization: 'json',
  });
  const done = new Promise<T | null>((resolve) => {
    child.on('message', (m: Record<string, unknown>) => {
      if (m.type === 'ready') child.send(message);
      else onMessage?.(m);
      if (m.type === 'capabilities') resolve(m.value as T);
    });
    child.on('exit', () => resolve(null));
    child.on('error', () => resolve(null));
  });
  return { child, done };
}

async function capabilities(): Promise<BridgeCapabilities> {
  const { done, child } = runWorker<Record<string, never>>({ type: 'capabilities' });
  const raw = (await Promise.race([done, new Promise<null>((r) => setTimeout(() => r(null), 20000))])) as {
    canRender: boolean;
    ffmpeg: { ok: boolean; problem?: string };
    chromium: { ok: boolean; problem?: string };
    cpus: number;
    totalMemMB: number;
    recommendLowResource: boolean;
  } | null;
  child.kill();
  if (!raw)
    return {
      canRender: false,
      ffmpeg: false,
      chromium: false,
      cpus: 0,
      totalMemMB: 0,
      recommendLowResource: true,
      problems: ['The render service could not be started.'],
    };
  return {
    canRender: raw.canRender,
    ffmpeg: raw.ffmpeg.ok,
    chromium: raw.chromium.ok,
    cpus: raw.cpus,
    totalMemMB: raw.totalMemMB,
    recommendLowResource: raw.recommendLowResource,
    problems: [raw.ffmpeg.problem, raw.chromium.problem].filter((x): x is string => Boolean(x)),
  };
}

function registerIpc(): void {
  handle('ff:capabilities', () => capabilities());

  handle('ff:choose-output-file', async (_e, suggested) => {
    const name = safeSuggestedName(suggested, '.mp4');
    const settings = await loadSettings();
    const defaultPath = path.join(settings.defaultOutputDir ?? app.getPath('videos'), name);
    const r = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export video',
      defaultPath,
      filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (r.canceled || !r.filePath) return null;
    const file = r.filePath.toLowerCase().endsWith('.mp4') ? r.filePath : `${r.filePath}.mp4`;
    const token = randomBytes(16).toString('hex');
    outputs.set(token, file);
    return { token, displayName: path.basename(file) };
  });

  handle('ff:choose-default-folder', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      title: 'Default output folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    await fs.writeFile(settingsFile(), JSON.stringify({ defaultOutputDir: r.filePaths[0] }), { mode: 0o600 });
    return { displayName: path.basename(r.filePaths[0]) };
  });

  handle('ff:open-project-file', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      title: 'Open project',
      properties: ['openFile'],
      filters: [{ name: 'FrameForge project', extensions: ['ffproj', 'zip', 'json'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const file = r.filePaths[0];
    const stat = await fs.stat(file);
    if (stat.size > 1024 * 1024 * 1024) throw new IpcValidationError('File is too large');
    return { name: path.basename(file), bytes: new Uint8Array(await fs.readFile(file)) };
  });

  handle('ff:save-project-file', async (_e, suggested, bytes) => {
    const name = safeSuggestedName(suggested, '.ffproj');
    const data = requireBytes(bytes, 'archive');
    const r = await dialog.showSaveDialog(mainWindow!, {
      title: 'Save project archive',
      defaultPath: path.join(app.getPath('documents'), name),
      filters: [{ name: 'FrameForge project', extensions: ['ffproj'] }],
      properties: ['showOverwriteConfirmation'],
    });
    if (r.canceled || !r.filePath) return false;
    await fs.writeFile(r.filePath, data);
    return true;
  });

  handle('ff:start-render', async (_e, rawArgs) => {
    const args = requireObject(rawArgs);
    const archive = requireBytes(args.archive, 'archive');
    const token = requireToken(args.outputToken, 'outputToken');
    const scale = requireOptionalScale(args.scale);
    const outputPath = outputs.get(token);
    if (!outputPath) throw new IpcValidationError('Unknown output location. Choose where to save the video first.');
    if (jobs.size >= 1) throw new IpcValidationError('Another export is already running. Wait for it to finish or cancel it.');
    const dir = await fs.mkdtemp(path.join(app.getPath('temp'), 'frameforge-job-'));
    const archivePath = path.join(dir, 'project.ffproj');
    await fs.writeFile(archivePath, archive, { mode: 0o600 });
    const jobId = randomBytes(8).toString('hex');
    const { child } = runWorker(
      { type: 'start', archivePath, outputPath, overwrite: true, ...(scale !== undefined ? { scale } : {}) },
      (m) => {
        if (m.type === 'progress') sendEvent({ jobId, type: 'progress', progress: m.value });
        else if (m.type === 'done') {
          const v = m.value as { bytes: number; warnings: string[]; verification: { ok: boolean } };
          sendEvent({
            jobId,
            type: 'done',
            outputName: path.basename(outputPath),
            bytes: v.bytes,
            warnings: v.warnings,
            verified: v.verification.ok,
          });
        } else if (m.type === 'error')
          sendEvent({
            jobId,
            type: 'error',
            code: String(m.code),
            message: String(m.message),
            details: m.details ? String(m.details) : undefined,
          });
      },
    );
    jobs.set(jobId, { child, archivePath });
    child.on('exit', (code) => {
      jobs.delete(jobId);
      void fs.rm(dir, { recursive: true, force: true });
      if (code !== 0 && code !== null)
        sendEvent({ jobId, type: 'error', code: 'ENCODE_FAILED', message: 'The render service stopped unexpectedly.' });
    });
    return { jobId };
  });

  handle('ff:cancel-render', (_e, jobId) => {
    const job = jobs.get(requireString(jobId, 'jobId', 32));
    if (!job) return;
    job.child.send({ type: 'cancel' });
    // The worker cleans up on cancel; make sure it cannot linger.
    setTimeout(() => job.child.kill('SIGKILL'), 8000).unref();
  });

  handle('ff:reveal-output', (_e, token) => {
    const file = outputs.get(requireToken(token));
    if (file) shell.showItemInFolder(file);
  });
}

function registerProtocol(): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'app') return new Response('Forbidden', { status: 403 });
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.resolve(WEB_ROOT, `.${rel}`);
    if (!file.startsWith(WEB_ROOT + path.sep)) return new Response('Forbidden', { status: 403 });
    const body = await fs.readFile(file).catch(() => null);
    if (!body) return new Response('Not found', { status: 404 });
    const headers = new Headers({
      'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': CSP.replace('__RUNTIME_HASH__', runtimeHash),
    });
    return new Response(body, { status: 200, headers });
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 360,
    minHeight: 480,
    show: false,
    title: 'FrameForge Studio',
    webPreferences: { ...SECURE_WEB_PREFERENCES, preload: path.join(__dirname, 'preload.cjs') },
  });
  const wc = mainWindow.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e, url) => {
    if (!isAllowedNavigation(url)) e.preventDefault();
  });
  wc.on('will-attach-webview', (e) => e.preventDefault());
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
    for (const j of jobs.values()) j.child.kill('SIGKILL');
  });
  void mainWindow.loadURL(`${APP_SCHEME}://app/index.html`);
}

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  void app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !isAllowedRequestUrl(details.url) }));
    registerProtocol();
    registerIpc();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on('window-all-closed', () => app.quit());
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (e, url) => {
      if (!isAllowedNavigation(url)) e.preventDefault();
    });
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}
