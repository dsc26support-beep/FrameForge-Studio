import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { createArchive } from '@frameforge/asset-manager';
import { createProject, createScene } from '@frameforge/project-schema';

const MAIN = path.resolve('apps/desktop/dist/main.cjs');
const electronBin = (() => {
  try {
    return readFileSync(path.resolve('node_modules/electron/path.txt'), 'utf8').trim();
  } catch {
    return null;
  }
})();
const ready = existsSync(MAIN) && electronBin !== null && existsSync(path.resolve('node_modules/electron/dist', electronBin));

test.describe('desktop shell (Electron)', () => {
  test.skip(!ready, 'Blocked: build the desktop bundle (npm run build:desktop) and install Electron to run these tests.');
  let app: ElectronApplication;
  let win: Page;
  let outDir: string;

  test.beforeAll(async () => {
    outDir = mkdtempSync(path.join(os.tmpdir(), 'ff-desktop-'));
    app = await electron.launch({
      executablePath: path.resolve('node_modules/electron/dist', electronBin!),
      args: [MAIN, ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])],
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
    });
    win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
  });
  test.afterAll(async () => {
    await app?.close();
    rmSync(outDir, { recursive: true, force: true });
  });

  test('loads the bundled app from the private app:// origin with no Node access', async () => {
    expect(win.url()).toMatch(/^frameforge:\/\/app\//);
    await expect(win.getByRole('heading', { name: /FrameForge Studio/ })).toBeVisible();
    const probe = await win.evaluate(() => ({
      require: typeof (window as unknown as { require?: unknown }).require,
      process: typeof (window as unknown as { process?: unknown }).process,
      keys: Object.keys(window.frameforge ?? {}).sort(),
    }));
    expect(probe.require).toBe('undefined');
    expect(probe.process).toBe('undefined');
    expect(probe.keys).toEqual([
      'cancelRender',
      'capabilities',
      'chooseDefaultFolder',
      'chooseOutputFile',
      'onRenderEvent',
      'openProjectFile',
      'revealOutput',
      'saveProjectFile',
      'startRender',
      'version',
    ]);
  });

  test('has the secure webPreferences set', async () => {
    const prefs = await app.evaluate(({ BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows()[0]!.webContents as unknown as { getLastWebPreferences(): Record<string, unknown> };
      return wc.getLastWebPreferences();
    });
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.sandbox).toBe(true);
    expect(prefs.webSecurity).not.toBe(false);
  });

  test('blocks navigation, new windows and network access to untrusted origins', async () => {
    await win.evaluate(() => {
      location.href = 'https://example.com/';
    });
    await win.waitForTimeout(500);
    expect(win.url()).toMatch(/^frameforge:\/\/app\//);
    expect(await win.evaluate(() => window.open('https://example.com/') === null)).toBe(true);
    expect(app.windows()).toHaveLength(1);
    const fetched = await win.evaluate(() =>
      fetch('https://example.com/').then(
        () => 'loaded',
        () => 'blocked',
      ),
    );
    expect(fetched).toBe('blocked');
  });

  test('rejects invalid IPC arguments and unknown output tokens', async () => {
    await expect(
      win.evaluate(() => window.frameforge!.startRender({ archive: new Uint8Array(10), outputToken: 'nope' })),
    ).rejects.toThrow();
    await expect(
      win.evaluate(() => window.frameforge!.startRender({ archive: new Uint8Array(10), outputToken: 'a'.repeat(32) })),
    ).rejects.toThrow(/Unknown output location/);
    await expect(
      win.evaluate(() => window.frameforge!.startRender({ archive: new Uint8Array(0), outputToken: 'a'.repeat(32) })),
    ).rejects.toThrow();
    await expect(win.evaluate(() => window.frameforge!.cancelRender('x'.repeat(500)))).rejects.toThrow();
    await expect(win.evaluate(() => window.frameforge!.revealOutput('../../etc/passwd'))).rejects.toThrow();
  });

  test('ignores IPC from a window that is not the trusted app window', async () => {
    const opened = app.waitForEvent('window');
    await app.evaluate(async ({ BrowserWindow }, preload) => {
      const evil = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: true, contextIsolation: true } });
      await evil.loadURL('about:blank');
    }, path.resolve('apps/desktop/dist/preload.cjs'));
    const other = await opened;
    await other.waitForLoadState('domcontentloaded');
    expect(other.url()).toBe('about:blank');
    await expect(other.evaluate(() => window.frameforge!.capabilities())).rejects.toThrow(/Untrusted IPC sender/);
  });

  test('renders a real MP4 through the separate render process', async () => {
    const caps = await win.evaluate(() => window.frameforge!.capabilities());
    test.skip(!caps.canRender, 'Blocked: FFmpeg and Chromium/Chrome/Edge are required for the render test (see README).');
    const target = path.join(outDir, 'desktop.mp4');
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: file })) as typeof dialog.showSaveDialog;
    }, target);
    const p = createProject('Desktop render');
    p.canvas = { width: 320, height: 180 };
    p.fps = 24;
    p.scenes = [createScene({ id: 'scn_1', durationMs: 800, elements: p.scenes[0]!.elements })];
    const archive = Array.from(await createArchive(p, new Map()));
    const result = await win.evaluate(async (bytes) => {
      const bridge = window.frameforge!;
      const picked = await bridge.chooseOutputFile('../../evil name');
      if (!picked) return { error: 'no token' };
      const events: string[] = [];
      const finished = new Promise<{ type: string; verified?: boolean; message?: string }>((resolve) => {
        const off = bridge.onRenderEvent((e) => {
          events.push(e.type);
          if (e.type === 'done') {
            off();
            resolve({ type: 'done', verified: e.verified });
          } else if (e.type === 'error') {
            off();
            resolve({ type: 'error', message: e.message });
          }
        });
      });
      await bridge.startRender({ archive: new Uint8Array(bytes), outputToken: picked.token });
      return { ...(await finished), events, name: picked.displayName };
    }, archive);
    expect(result).toMatchObject({ type: 'done', verified: true });
    expect(statSync(target).size).toBeGreaterThan(1000);
    const codec = execFileSync(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', target],
      { encoding: 'utf8' },
    ).trim();
    expect(codec).toBe('h264');
  });
});
