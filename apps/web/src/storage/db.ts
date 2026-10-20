/** Minimal promise wrapper over IndexedDB. Every call is guarded: storage can be unavailable or cleared. */
const DB_NAME = 'frameforge';
const DB_VERSION = 1;
export const STORES = { projects: 'projects', assets: 'assets', backups: 'backups', settings: 'settings' } as const;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser or mode (private browsing?).'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore(STORES.projects, { keyPath: 'id' });
      db.createObjectStore(STORES.assets);
      const backups = db.createObjectStore(STORES.backups, { keyPath: 'key' });
      backups.createIndex('byProject', 'projectId');
      db.createObjectStore(STORES.settings);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open storage.'));
    req.onblocked = () => reject(new Error('Storage is blocked by another tab.'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

export async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error ?? new Error('Storage error'));
    t.onabort = () => reject(t.error ?? new Error('Storage write was aborted (quota exceeded?)'));
  });
}

export async function storageEstimate(): Promise<{ usedMB: number; quotaMB: number; persisted: boolean | null } | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    const persisted = (await navigator.storage?.persisted?.()) ?? null;
    if (!est) return null;
    return { usedMB: Math.round((est.usage ?? 0) / 1048576), quotaMB: Math.round((est.quota ?? 0) / 1048576), persisted };
  } catch {
    return null;
  }
}

export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
