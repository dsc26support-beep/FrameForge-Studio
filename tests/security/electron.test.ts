import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IPC_CHANNELS,
  IpcValidationError,
  SECURE_WEB_PREFERENCES,
  isAllowedNavigation,
  isAllowedRequestUrl,
  isTrustedSender,
  isTrustedUrl,
  requireBytes,
  requireOptionalScale,
  requireToken,
  safeSuggestedName,
} from '../../apps/desktop/electron/security';

const src = (f: string) => readFileSync(path.resolve('apps/desktop/electron', f), 'utf8');

describe('Electron hardening (static + unit)', () => {
  it('uses secure webPreferences', () => {
    expect(SECURE_WEB_PREFERENCES).toMatchObject({
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    });
    expect(src('main.ts')).toContain('...SECURE_WEB_PREFERENCES');
  });

  it('never contains known-dangerous settings or APIs', () => {
    const all = ['main.ts', 'preload.ts', 'security.ts'].map(src).join('\n');
    for (const bad of [
      /nodeIntegration:\s*true/,
      /contextIsolation:\s*false/,
      /sandbox:\s*false/,
      /webSecurity:\s*false/,
      /enableRemoteModule/,
      /allowRunningInsecureContent:\s*true/,
      /shell\.openExternal/,
      /\beval\(/,
      /new Function/,
      /openExternal/,
    ]) {
      expect(all).not.toMatch(bad);
    }
  });

  it('exposes only a narrow, named bridge from the preload', () => {
    const pre = src('preload.ts');
    expect(pre).not.toMatch(/exposeInMainWorld\(['"]\w+['"],\s*ipcRenderer/);
    expect(pre).not.toMatch(/require\(['"](fs|child_process|path|os)['"]\)/);
    const used = [...pre.matchAll(/invoke\('([^']+)'/g)].map((m) => m[1]);
    for (const ch of used) expect(IPC_CHANNELS as readonly string[]).toContain(ch);
  });

  it('validates the sender of every IPC handler', () => {
    const main = src('main.ts');
    expect(main).toContain('assertTrustedSender(event)');
    // The only direct ipcMain registration is the wrapper that performs the sender check.
    expect(main.match(/ipcMain\.(?:handle|on)\(/g)).toHaveLength(1);
    expect(isTrustedSender({ senderIsMainWindow: true, frameIsMainFrame: true, url: 'frameforge://app/index.html' })).toBe(true);
    expect(isTrustedSender({ senderIsMainWindow: false, frameIsMainFrame: true, url: 'frameforge://app/index.html' })).toBe(false);
    expect(isTrustedSender({ senderIsMainWindow: true, frameIsMainFrame: false, url: 'frameforge://app/index.html' })).toBe(false);
    expect(isTrustedSender({ senderIsMainWindow: true, frameIsMainFrame: true, url: 'https://evil.example/' })).toBe(false);
    expect(isTrustedSender({ senderIsMainWindow: true, frameIsMainFrame: true, url: undefined })).toBe(false);
  });

  it('only trusts the private app origin and refuses navigation elsewhere', () => {
    expect(isTrustedUrl('frameforge://app/index.html#/p/x')).toBe(true);
    for (const u of [
      'https://example.com',
      'frameforge://evil/index.html',
      'file:///etc/passwd',
      'http://frameforge.app',
      'javascript:alert(1)',
      '',
      'frameforge://app.evil.com/',
    ]) {
      expect(isTrustedUrl(u)).toBe(false);
      expect(isAllowedNavigation(u)).toBe(false);
    }
    expect(isAllowedRequestUrl('https://example.com/x.js')).toBe(false);
    expect(isAllowedRequestUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedRequestUrl('blob:frameforge://app/uuid')).toBe(true);
  });

  it('validates IPC arguments', () => {
    expect(() => requireToken('../../x')).toThrow(IpcValidationError);
    expect(requireToken('a'.repeat(32))).toHaveLength(32);
    expect(() => requireBytes('string', 'x')).toThrow(IpcValidationError);
    expect(() => requireBytes(new Uint8Array(0), 'x')).toThrow(IpcValidationError);
    expect(() => requireBytes(new Uint8Array(20), 'x', 10)).toThrow(IpcValidationError);
    expect(() => requireOptionalScale(5)).toThrow(IpcValidationError);
    expect(requireOptionalScale(undefined)).toBeUndefined();
    expect(() => safeSuggestedName(42, '.mp4')).toThrow(IpcValidationError);
  });

  it('sanitises suggested file names so dialogs cannot be pointed elsewhere', () => {
    for (const n of ['../../evil', '..\\..\\evil', 'a/b/c', 'C:\\x', '.hidden', 'x\0y']) {
      const out = safeSuggestedName(n, '.mp4');
      expect(out).not.toMatch(/[/\\:\0]/);
      expect(out.startsWith('.')).toBe(false);
      expect(out.endsWith('.mp4')).toBe(true);
    }
  });
});
