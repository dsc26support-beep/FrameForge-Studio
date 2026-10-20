import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RenderError } from './errors';

/** Resolves `relative` below `root` and refuses anything that escapes it, including via symlinks. */
export async function resolveInside(root: string, relative: string): Promise<string> {
  if (relative.includes('\0') || path.isAbsolute(relative)) throw new RenderError('OUTPUT_INVALID', 'Unsafe path.');
  const realRoot = await fs.realpath(root);
  const candidate = path.resolve(realRoot, relative);
  if (candidate !== realRoot && !candidate.startsWith(realRoot + path.sep))
    throw new RenderError('OUTPUT_INVALID', 'Path escapes its root directory.');
  try {
    const real = await fs.realpath(candidate);
    if (real !== realRoot && !real.startsWith(realRoot + path.sep))
      throw new RenderError('OUTPUT_INVALID', 'Path escapes its root directory via a link.');
    return real;
  } catch (e) {
    if (e instanceof RenderError) throw e;
    return candidate; // does not exist yet
  }
}

export const TEMP_PREFIX = 'frameforge-';

/** Creates a private (0700) scratch directory. */
export async function makeTempDir(label = 'job'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `${TEMP_PREFIX}${label}-`));
}

export async function removeDir(dir: string): Promise<void> {
  if (!path.basename(dir).startsWith(TEMP_PREFIX)) return; // never recursively delete anything we did not create
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 3 });
}

/** Deletes abandoned scratch directories older than `maxAgeMs`. Returns the number removed. */
export async function cleanupStaleTemp(maxAgeMs = 24 * 3600 * 1000): Promise<number> {
  let removed = 0;
  const tmp = os.tmpdir();
  for (const name of await fs.readdir(tmp)) {
    if (!name.startsWith(TEMP_PREFIX)) continue;
    const full = path.join(tmp, name);
    try {
      const st = await fs.stat(full);
      if (st.isDirectory() && Date.now() - st.mtimeMs > maxAgeMs) {
        await fs.rm(full, { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      /* raced with another process */
    }
  }
  return removed;
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
