import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { LIMITS, parseProjectJson, validateProject, type Asset, type Project } from '@frameforge/project-schema';
import { sha256Hex } from '@frameforge/render-core';
import { assetFileName, AssetError } from './ingest';
import { isSafeRelativePath } from './filename';
import { checkSvgSafe, sniffMedia } from './sniff';

export const ARCHIVE_FORMAT = 'frameforge-archive';
export const ARCHIVE_VERSION = 1;

export interface ArchiveManifest {
  format: typeof ARCHIVE_FORMAT;
  formatVersion: number;
  createdAt: string;
  projectId: string;
  files: { path: string; size: number; sha256: string }[];
}

export interface ReadArchiveResult {
  project: Project;
  assets: Map<string, Uint8Array>;
  warnings: string[];
}

/** Builds a portable `.ffproj` ZIP: manifest.json, project.json and assets/. Assets are stored, not recompressed. */
export async function createArchive(project: Project, assetBytes: ReadonlyMap<string, Uint8Array>): Promise<Uint8Array> {
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  const manifestFiles: ArchiveManifest['files'] = [];
  const projectBytes = strToU8(JSON.stringify(project, null, 2));
  files['project.json'] = projectBytes;
  manifestFiles.push({ path: 'project.json', size: projectBytes.length, sha256: await sha256Hex(projectBytes) });
  for (const asset of project.assets) {
    const bytes = assetBytes.get(asset.id);
    if (!bytes) continue; // missing assets are reported by the caller; the archive stays valid
    const path = `assets/${assetFileName(asset)}`;
    files[path] = [bytes, { level: 0 }];
    manifestFiles.push({ path, size: bytes.length, sha256: asset.sha256 });
  }
  const manifest: ArchiveManifest = {
    format: ARCHIVE_FORMAT,
    formatVersion: ARCHIVE_VERSION,
    createdAt: new Date().toISOString(),
    projectId: project.id,
    files: manifestFiles,
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return zipSync(files as Parameters<typeof zipSync>[0]);
}

/** Reads and fully validates an untrusted archive. Throws {@link AssetError} with a user-readable message. */
export async function readArchive(data: Uint8Array): Promise<ReadArchiveResult> {
  if (data.byteLength > LIMITS.maxArchiveBytes) throw new AssetError('The archive is too large.');
  let entries = 0;
  let declaredTotal = 0;
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(data, {
      filter(file) {
        entries += 1;
        declaredTotal += file.originalSize;
        if (entries > LIMITS.maxArchiveEntries) throw new AssetError('The archive contains too many files.');
        if (declaredTotal > LIMITS.maxArchiveBytes) throw new AssetError('The archive expands to more than the allowed size.');
        if (file.name.endsWith('/')) return false; // directory entries carry no data
        if (!isSafeRelativePath(file.name)) throw new AssetError(`Unsafe path in archive: ${file.name.slice(0, 80)}`);
        return true;
      },
    });
  } catch (e) {
    if (e instanceof AssetError) throw e;
    throw new AssetError('The file is not a valid FrameForge archive (corrupt ZIP).');
  }
  const manifestBytes = unzipped['manifest.json'];
  const projectBytes = unzipped['project.json'];
  if (!manifestBytes || !projectBytes) throw new AssetError('Archive is missing manifest.json or project.json.');
  let manifest: ArchiveManifest;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes)) as ArchiveManifest;
  } catch {
    throw new AssetError('manifest.json is not valid JSON.');
  }
  if (manifest?.format !== ARCHIVE_FORMAT || typeof manifest.formatVersion !== 'number' || manifest.formatVersion > ARCHIVE_VERSION) {
    throw new AssetError('Unsupported archive format or version.');
  }
  if (!Array.isArray(manifest.files)) throw new AssetError('manifest.json is malformed.');
  const expected = new Map(manifest.files.filter((f) => typeof f?.path === 'string').map((f) => [f.path, f]));

  const parsed = parseProjectJson(strFromU8(projectBytes));
  if (!parsed.ok) {
    throw new AssetError(
      `Invalid project: ${parsed.errors
        .slice(0, 3)
        .map((e) => `${e.path}: ${e.message}`)
        .join('; ')}`,
    );
  }
  const { project, warnings } = parsed;
  const projectEntry = expected.get('project.json');
  if (projectEntry && projectEntry.sha256 !== (await sha256Hex(projectBytes)))
    warnings.push('project.json hash differs from manifest (the project was edited after export).');

  const assets = new Map<string, Uint8Array>();
  for (const asset of project.assets) {
    const path = `assets/${assetFileName(asset)}`;
    const bytes = unzipped[path];
    if (!bytes) {
      warnings.push(`Missing asset file: ${asset.name}`);
      continue;
    }
    const problem = await verifyAsset(asset, bytes);
    if (problem) throw new AssetError(`Asset "${asset.name}" rejected: ${problem}`);
    assets.set(asset.id, bytes);
  }
  // Re-validate to make sure defaults and integrity rules hold for the final object.
  const final = validateProject(project);
  if (!final.ok) throw new AssetError('Project failed integrity validation.');
  return { project: final.project, assets, warnings };
}

async function verifyAsset(asset: Asset, bytes: Uint8Array): Promise<string | null> {
  if (bytes.byteLength !== asset.size) return 'size does not match the project record';
  if ((await sha256Hex(bytes)) !== asset.sha256) return 'content hash does not match';
  const info = sniffMedia(bytes);
  if (!info || info.kind !== asset.kind) return 'content type does not match the declared type';
  if (info.mime === 'image/svg+xml') return checkSvgSafe(bytes);
  return null;
}
