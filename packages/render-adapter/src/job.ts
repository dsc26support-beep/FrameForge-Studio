import { promises as fs } from 'node:fs';
import path from 'node:path';
import { assetFileName, readArchive } from '@frameforge/asset-manager';
import type { Project } from '@frameforge/project-schema';
import { RenderError } from './errors';
import { makeTempDir, removeDir, resolveInside } from './fs-safe';

export interface PreparedJob {
  project: Project;
  assetPaths: Map<string, string>;
  warnings: string[];
  cleanup(): Promise<void>;
}

/**
 * Validates an untrusted `.ffproj` archive and unpacks its assets into a private scratch directory.
 * File names inside the scratch dir are derived from validated asset ids, never from archive paths.
 */
export async function prepareJobFromArchive(bytes: Uint8Array): Promise<PreparedJob> {
  let parsed;
  try {
    parsed = await readArchive(bytes);
  } catch (e) {
    throw new RenderError('INVALID_PROJECT', (e as Error).message);
  }
  const dir = await makeTempDir('job');
  try {
    await fs.mkdir(path.join(dir, 'assets'));
    const assetPaths = new Map<string, string>();
    for (const asset of parsed.project.assets) {
      const data = parsed.assets.get(asset.id);
      if (!data) continue;
      const target = await resolveInside(dir, `assets/${assetFileName(asset)}`);
      await fs.writeFile(target, data, { mode: 0o600 });
      assetPaths.set(asset.id, target);
    }
    return { project: parsed.project, assetPaths, warnings: parsed.warnings, cleanup: () => removeDir(dir) };
  } catch (e) {
    await removeDir(dir);
    throw e;
  }
}
