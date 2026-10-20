import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cleanupStaleTemp, makeTempDir, removeDir, resolveInside, TEMP_PREFIX } from '@frameforge/render-adapter';

const root = mkdtempSync(path.join(os.tmpdir(), 'ff-fs-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('filesystem safety', () => {
  it('resolves normal relative paths inside the root', async () => {
    mkdirSync(path.join(root, 'assets'));
    writeFileSync(path.join(root, 'assets', 'a.png'), 'x');
    expect(await resolveInside(root, 'assets/a.png')).toContain('a.png');
    expect(await resolveInside(root, 'assets/new.png')).toContain('new.png');
  });
  it.each(['../outside', 'assets/../../outside', '/etc/passwd', 'a\0b', '..\\..\\x'.replace(/\\/g, '/')])(
    'rejects traversal %j',
    async (p) => {
      await expect(resolveInside(root, p)).rejects.toThrow();
    },
  );
  it('rejects symlinks that escape the root', async () => {
    const outside = mkdtempSync(path.join(os.tmpdir(), 'ff-out-'));
    writeFileSync(path.join(outside, 'secret.txt'), 's');
    symlinkSync(outside, path.join(root, 'link'));
    await expect(resolveInside(root, 'link/secret.txt')).rejects.toThrow(/escapes/);
    rmSync(outside, { recursive: true, force: true });
  });
  it('only deletes directories it created and cleans stale scratch dirs', async () => {
    const mine = await makeTempDir('test');
    expect(path.basename(mine).startsWith(TEMP_PREFIX)).toBe(true);
    const foreign = mkdtempSync(path.join(os.tmpdir(), 'not-ours-'));
    await removeDir(foreign);
    expect(existsSync(foreign)).toBe(true);
    rmSync(foreign, { recursive: true });
    const old = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    utimesSync(mine, old, old);
    expect(await cleanupStaleTemp(24 * 3600 * 1000)).toBeGreaterThanOrEqual(1);
    expect(existsSync(mine)).toBe(false);
  });
});
