import type { Project, Scene } from '@frameforge/project-schema';

/** JSON with sorted keys so equal content always yields an identical string. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Cache key for one scene. It covers everything that influences its pixels: the scene content,
 * the canvas, frame rate, brand, render scale and the content hashes of referenced assets.
 * Changing any of them invalidates the key; unrelated edits (other scenes, export file name) do not.
 */
export async function sceneCacheKey(project: Project, scene: Scene): Promise<string> {
  const assetIds = new Set<string>();
  if (scene.background.type === 'image') assetIds.add(scene.background.assetId);
  for (const el of scene.elements) if (el.type === 'image') assetIds.add(el.assetId);
  const assets = [...assetIds].sort().map((id) => [id, project.assets.find((a) => a.id === id)?.sha256 ?? 'missing']);
  return sha256Hex(
    stableStringify({
      v: 1,
      scene,
      canvas: project.canvas,
      fps: project.fps,
      brand: project.brand,
      scale: project.renderSettings.scale,
      assets,
    }),
  );
}
