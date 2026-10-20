import { MemoryAssetStore, type AssetStore } from '@frameforge/asset-manager';
import { LIMITS, recoverProject, validateProject, type Project } from '@frameforge/project-schema';
import { STORES, openDb, tx } from './db';

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
  sceneCount: number;
  durationMs: number;
  damaged: boolean;
}

interface StoredProject {
  id: string;
  meta: ProjectMeta;
  data: unknown;
}

interface BackupRecord {
  key: string;
  projectId: string;
  savedAt: string;
  data: unknown;
}

const MAX_BACKUPS = 5;
const BACKUP_INTERVAL_MS = 2 * 60 * 1000;

export type LoadResult =
  | { status: 'ok'; project: Project; warnings: string[] }
  | { status: 'damaged'; recovered: Project | null; dropped: string[] }
  | { status: 'missing' };

const metaOf = (p: Project, damaged = false): ProjectMeta => ({
  id: p.id,
  name: p.name,
  updatedAt: p.updatedAt,
  createdAt: p.createdAt,
  sceneCount: p.scenes.length,
  durationMs: p.scenes.reduce((n, s) => n + s.durationMs, 0),
  damaged,
});

/** Local-first project storage in IndexedDB. Writes keep rolling backups so one bad save is never fatal. */
export class ProjectRepository {
  private lastBackup = new Map<string, number>();

  async list(): Promise<ProjectMeta[]> {
    const all = await tx<StoredProject[]>(STORES.projects, 'readonly', (s) => s.getAll());
    return all.map((r) => r.meta).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(id: string): Promise<LoadResult> {
    const rec = await tx<StoredProject | undefined>(STORES.projects, 'readonly', (s) => s.get(id));
    if (!rec) return { status: 'missing' };
    const r = validateProject(rec.data);
    if (r.ok) return { status: 'ok', project: r.project, warnings: r.warnings };
    const rec2 = recoverProject(rec.data);
    return { status: 'damaged', recovered: rec2?.project ?? null, dropped: rec2?.dropped ?? [] };
  }

  async save(project: Project): Promise<void> {
    const check = validateProject(project);
    if (!check.ok) throw new Error(`Refusing to save an invalid project: ${check.errors[0]?.message}`);
    const previous = await tx<StoredProject | undefined>(STORES.projects, 'readonly', (s) => s.get(project.id));
    const record: StoredProject = { id: project.id, meta: metaOf(project), data: project };
    await tx(STORES.projects, 'readwrite', (s) => s.put(record));
    const now = Date.now();
    if (previous && now - (this.lastBackup.get(project.id) ?? 0) > BACKUP_INTERVAL_MS) {
      this.lastBackup.set(project.id, now);
      await this.writeBackup(project.id, previous.data);
    }
  }

  private async writeBackup(projectId: string, data: unknown): Promise<void> {
    const savedAt = new Date().toISOString();
    await tx(STORES.backups, 'readwrite', (s) =>
      s.put({ key: `${projectId}:${savedAt}`, projectId, savedAt, data } satisfies BackupRecord),
    );
    const all = await tx<BackupRecord[]>(STORES.backups, 'readonly', (s) => s.index('byProject').getAll(projectId));
    const old = all.sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(MAX_BACKUPS);
    for (const b of old) await tx(STORES.backups, 'readwrite', (s) => s.delete(b.key));
  }

  async listBackups(projectId: string): Promise<{ key: string; savedAt: string }[]> {
    const all = await tx<BackupRecord[]>(STORES.backups, 'readonly', (s) => s.index('byProject').getAll(projectId));
    return all.map((b) => ({ key: b.key, savedAt: b.savedAt })).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  async restoreBackup(key: string): Promise<Project | null> {
    const b = await tx<BackupRecord | undefined>(STORES.backups, 'readonly', (s) => s.get(key));
    if (!b) return null;
    const r = validateProject(b.data);
    return r.ok ? r.project : (recoverProject(b.data)?.project ?? null);
  }

  async delete(id: string): Promise<void> {
    await tx(STORES.projects, 'readwrite', (s) => s.delete(id));
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORES.assets, 'readwrite');
      const store = t.objectStore(STORES.assets);
      const range = IDBKeyRange.bound(`${id}/`, `${id}/￿`);
      store.delete(range);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    const backups = await this.listBackups(id);
    for (const b of backups) await tx(STORES.backups, 'readwrite', (s) => s.delete(b.key));
  }

  async totalProjects(): Promise<number> {
    return tx<number>(STORES.projects, 'readonly', (s) => s.count());
  }
}

/** Asset blobs live in a separate IndexedDB store, keyed `<projectId>/<assetId>`, never inside project JSON. */
export class IdbAssetStore implements AssetStore {
  async put(projectId: string, assetId: string, bytes: Uint8Array): Promise<void> {
    await tx(STORES.assets, 'readwrite', (s) => s.put(bytes, `${projectId}/${assetId}`));
  }
  async get(projectId: string, assetId: string): Promise<Uint8Array | null> {
    const v = await tx<Uint8Array | undefined>(STORES.assets, 'readonly', (s) => s.get(`${projectId}/${assetId}`));
    return v ?? null;
  }
  async delete(projectId: string, assetId: string): Promise<void> {
    await tx(STORES.assets, 'readwrite', (s) => s.delete(`${projectId}/${assetId}`));
  }
  async has(projectId: string, assetId: string): Promise<boolean> {
    return (await tx<number>(STORES.assets, 'readonly', (s) => s.count(`${projectId}/${assetId}`))) > 0;
  }
}

export const repo = new ProjectRepository();
export const assetStore: AssetStore = new IdbAssetStore();
export { MemoryAssetStore, LIMITS };
