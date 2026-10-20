import { LIMITS, newId, type Asset } from '@frameforge/project-schema';
import { sha256Hex } from '@frameforge/render-core';
import { sanitizeFileName } from './filename';
import { checkSvgSafe, readImageSize, sniffMedia } from './sniff';

export class AssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetError';
  }
}

export interface IngestResult {
  asset: Asset;
  duplicate: boolean;
}

/**
 * Validates untrusted bytes and produces a managed asset record. Identical content (same SHA-256)
 * returns the existing asset instead of creating a duplicate, keeping references stable.
 */
export async function ingestAsset(bytes: Uint8Array, originalName: string, existing: readonly Asset[]): Promise<IngestResult> {
  if (bytes.byteLength === 0) throw new AssetError('The file is empty.');
  if (bytes.byteLength > LIMITS.maxAssetBytes) throw new AssetError(`The file is larger than ${LIMITS.maxAssetBytes / 1024 / 1024} MB.`);
  if (existing.length >= LIMITS.maxAssets) throw new AssetError(`A project can contain at most ${LIMITS.maxAssets} assets.`);
  const info = sniffMedia(bytes);
  if (!info)
    throw new AssetError(
      'Unsupported or unrecognised file type. Use PNG, JPEG, GIF, WebP, SVG, MP3, WAV, AAC, M4A, OGG, FLAC, MP4 or WebM.',
    );
  if (info.mime === 'image/svg+xml') {
    const problem = checkSvgSafe(bytes);
    if (problem) throw new AssetError(problem);
  }
  const sha256 = await sha256Hex(bytes);
  const dup = existing.find((a) => a.sha256 === sha256);
  if (dup) return { asset: dup, duplicate: true };
  const size = info.kind === 'image' && info.mime !== 'image/svg+xml' ? readImageSize(bytes) : null;
  if (size && (size.width > 20000 || size.height > 20000 || size.width * size.height > 100_000_000)) {
    throw new AssetError('Image dimensions are too large.');
  }
  const base = sanitizeFileName(originalName, `asset.${info.ext}`);
  const asset: Asset = {
    id: newId('ast'),
    kind: info.kind,
    name: base,
    mime: info.mime,
    size: bytes.byteLength,
    sha256,
    ...(size && size.width > 0 && size.height > 0 ? { width: size.width, height: size.height } : {}),
  };
  return { asset, duplicate: false };
}

export function assetFileName(asset: Asset): string {
  const ext = asset.mime === 'image/jpeg' ? 'jpg' : (asset.mime.split('/')[1] ?? 'bin').replace('svg+xml', 'svg').replace('mpeg', 'mp3');
  return `${asset.id}.${ext.replace(/[^a-z0-9]/gi, '')}`;
}

/** Interface implemented by the IndexedDB (browser) and filesystem (desktop) stores. */
export interface AssetStore {
  put(projectId: string, assetId: string, bytes: Uint8Array): Promise<void>;
  get(projectId: string, assetId: string): Promise<Uint8Array | null>;
  delete(projectId: string, assetId: string): Promise<void>;
  has(projectId: string, assetId: string): Promise<boolean>;
}

export class MemoryAssetStore implements AssetStore {
  private map = new Map<string, Uint8Array>();
  async put(p: string, a: string, bytes: Uint8Array) {
    this.map.set(`${p}/${a}`, bytes);
  }
  async get(p: string, a: string) {
    return this.map.get(`${p}/${a}`) ?? null;
  }
  async delete(p: string, a: string) {
    this.map.delete(`${p}/${a}`);
  }
  async has(p: string, a: string) {
    return this.map.has(`${p}/${a}`);
  }
}

/** Returns ids of assets referenced by the project but missing from the store. */
export async function findMissingAssets(projectId: string, assets: readonly Asset[], store: AssetStore): Promise<string[]> {
  const missing: string[] = [];
  for (const a of assets) if (!(await store.has(projectId, a.id))) missing.push(a.id);
  return missing;
}
