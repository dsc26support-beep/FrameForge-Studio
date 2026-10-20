import type { z } from 'zod';
import { LIMITS } from './limits';
import { migrateProject } from './migrate';
import { assetSchema, audioTrackSchema, projectSchema, sceneSchema, type Project, type Scene } from './schema';
import { newId } from './ids';

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ParseResult = { ok: true; project: Project; warnings: string[] } | { ok: false; errors: ValidationIssue[] };

function toIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.slice(0, 50).map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }));
}

/** Cross-field checks that a structural schema cannot express. */
export function checkProjectIntegrity(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const assetsById = new Map(project.assets.map((a) => [a.id, a]));
  if (assetsById.size !== project.assets.length) issues.push({ path: 'assets', message: 'Duplicate asset ids.' });

  const seen = new Set<string>();
  for (const [si, scene] of project.scenes.entries()) {
    if (seen.has(scene.id)) issues.push({ path: `scenes.${si}.id`, message: `Duplicate scene id ${scene.id}.` });
    seen.add(scene.id);
    const elIds = new Set<string>();
    for (const [ei, el] of scene.elements.entries()) {
      if (elIds.has(el.id)) issues.push({ path: `scenes.${si}.elements.${ei}.id`, message: 'Duplicate element id.' });
      elIds.add(el.id);
      if (el.type === 'image') {
        const a = assetsById.get(el.assetId);
        if (!a) issues.push({ path: `scenes.${si}.elements.${ei}.assetId`, message: `Missing asset ${el.assetId}.` });
        else if (a.kind !== 'image') issues.push({ path: `scenes.${si}.elements.${ei}.assetId`, message: 'Asset is not an image.' });
      }
    }
    if (scene.background.type === 'image' && !assetsById.has(scene.background.assetId)) {
      issues.push({ path: `scenes.${si}.background.assetId`, message: `Missing asset ${scene.background.assetId}.` });
    }
  }
  for (const [ti, t] of project.audioTracks.entries()) {
    const a = assetsById.get(t.assetId);
    if (!a) issues.push({ path: `audioTracks.${ti}.assetId`, message: `Missing asset ${t.assetId}.` });
    else if (a.kind !== 'audio') issues.push({ path: `audioTracks.${ti}.assetId`, message: 'Asset is not audio.' });
  }
  for (const [ci, c] of project.captions.items.entries()) {
    if (c.endMs <= c.startMs) issues.push({ path: `captions.items.${ci}`, message: 'Caption must end after it starts.' });
  }
  const total = project.scenes.reduce((n, s) => n + s.durationMs, 0);
  if (total > LIMITS.maxTotalMs) issues.push({ path: 'scenes', message: `Total duration exceeds ${LIMITS.maxTotalMs / 60000} minutes.` });
  return issues;
}

/** Validates data that is already a JS value (migrates first). */
export function validateProject(raw: unknown): ParseResult {
  const { data, warnings } = migrateProject(raw);
  const parsed = projectSchema.safeParse(data);
  if (!parsed.success) return { ok: false, errors: toIssues(parsed.error) };
  const integrity = checkProjectIntegrity(parsed.data);
  if (integrity.length) return { ok: false, errors: integrity };
  return { ok: true, project: parsed.data, warnings };
}

/** Parses untrusted JSON text with a size limit. */
export function parseProjectJson(text: string, maxBytes: number = LIMITS.maxProjectJsonBytes): ParseResult {
  if (typeof text !== 'string') return { ok: false, errors: [{ path: '(root)', message: 'Expected JSON text.' }] };
  if (new TextEncoder().encode(text).length > maxBytes) {
    return { ok: false, errors: [{ path: '(root)', message: `Project file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.` }] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ path: '(root)', message: `Malformed JSON: ${(e as Error).message}` }] };
  }
  return validateProject(raw);
}

export interface RecoveryResult {
  project: Project;
  dropped: string[];
}

/**
 * Best-effort recovery of a damaged project: keeps every scene that validates, drops
 * the rest and repairs dangling references. Returns null if not even the envelope is usable.
 */
export function recoverProject(raw: unknown): RecoveryResult | null {
  const { data } = migrateProject(raw);
  if (typeof data !== 'object' || data === null) return null;
  const rec = data as Record<string, unknown>;
  const dropped: string[] = [];
  const rawScenes = Array.isArray(rec.scenes) ? rec.scenes : [];
  const scenes: Scene[] = [];
  for (const [i, s] of rawScenes.slice(0, LIMITS.maxScenes).entries()) {
    const r = sceneSchema.safeParse(s);
    if (r.success) scenes.push(r.data);
    else dropped.push(`scene ${i + 1}: ${r.error.issues[0]?.message ?? 'invalid'}`);
  }
  const now = new Date().toISOString();
  const candidate = projectSchema.safeParse({
    ...rec,
    schemaVersion: 1,
    scenes: [],
    assets: [],
    audioTracks: [],
    captions: undefined,
    id: typeof rec.id === 'string' ? rec.id : newId('prj'),
    name: typeof rec.name === 'string' && rec.name.trim() ? rec.name.slice(0, LIMITS.maxNameLength) : 'Recovered project',
    createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : now,
    updatedAt: now,
  });
  if (!candidate.success) {
    const fallback = projectSchema.safeParse({
      schemaVersion: 1,
      id: newId('prj'),
      name: 'Recovered project',
      createdAt: now,
      updatedAt: now,
    });
    if (!fallback.success) return null;
    dropped.push('project settings were reset to defaults');
    return finishRecovery(fallback.data, scenes, rec, dropped);
  }
  return finishRecovery(candidate.data, scenes, rec, dropped);
}

function finishRecovery(base: Project, scenes: Scene[], rec: Record<string, unknown>, dropped: string[]): RecoveryResult {
  const assets = keepValid(assetSchema, rec.assets, 'asset', dropped);
  const tracks = keepValid(audioTrackSchema, rec.audioTracks, 'audio track', dropped);
  const project: Project = { ...base, scenes, assets, audioTracks: tracks };
  // Repair dangling references instead of failing the whole project.
  const ids = new Set(project.assets.map((a) => a.id));
  for (const scene of project.scenes) {
    scene.elements = scene.elements.filter((e) => {
      const ok = e.type !== 'image' || ids.has(e.assetId);
      if (!ok) dropped.push(`element ${e.id}: missing asset`);
      return ok;
    });
    if (scene.background.type === 'image' && !ids.has(scene.background.assetId)) {
      scene.background = { type: 'color', color: '#101828' };
      dropped.push(`scene ${scene.name}: background asset missing`);
    }
  }
  project.audioTracks = project.audioTracks.filter((t) => ids.has(t.assetId));
  return { project, dropped };
}

function keepValid<T>(schema: z.ZodType<T>, list: unknown, label: string, dropped: string[]): T[] {
  if (!Array.isArray(list)) return [];
  const out: T[] = [];
  for (const [i, item] of list.entries()) {
    const r = schema.safeParse(item);
    if (r.success) out.push(r.data);
    else dropped.push(`${label} ${i + 1}: ${r.error.issues[0]?.message ?? 'invalid'}`);
  }
  return out;
}
