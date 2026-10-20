/* eslint-disable @typescript-eslint/no-explicit-any -- Apps Script responses are untyped JSON in this test harness */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
import { CloudClient, CloudError, isValidDeploymentUrl } from '../../apps/web/src/cloud/client';

/** Runs the real .gs files in a VM with in-memory fakes of the Apps Script services. */
function makeEnv() {
  const props: Record<string, string> = { GOOGLE_CLIENT_ID: 'client-123', SYNC_ENABLED: 'true' };
  const cacheStore = new Map<string, string>();
  const tokens: Record<string, Record<string, unknown>> = {};
  const fetchCalls: string[] = [];
  const mkFile = (name: string, content: string) => {
    const f = {
      name,
      content,
      trashed: false,
      getName: () => f.name,
      getBlob: () => ({ getDataAsString: () => f.content }),
      setContent: (c: string) => {
        f.content = c;
      },
      setTrashed: (t: boolean) => {
        f.trashed = t;
      },
    };
    return f;
  };
  interface FakeFolder {
    name: string;
    files: ReturnType<typeof mkFile>[];
    folders: Map<string, FakeFolder>;
    [k: string]: unknown;
  }
  const mkFolder = (name: string): FakeFolder => {
    const files: ReturnType<typeof mkFile>[] = [];
    const folders = new Map<string, FakeFolder>();
    const it = <T>(arr: T[]) => {
      let i = 0;
      return { hasNext: () => i < arr.length, next: () => arr[i++]! };
    };
    const folder: FakeFolder = {
      name,
      files,
      folders,
      getFoldersByName: (n: string) => it(folders.has(n) ? [folders.get(n)!] : []),
      createFolder: (n: string) => {
        const f = mkFolder(n);
        folders.set(n, f);
        return f;
      },
      getFilesByName: (n: string) => it(files.filter((f) => f.name === n && !f.trashed)),
      getFiles: () => it(files.filter((f) => !f.trashed)),
      createFile: (n: string, c: string) => {
        const f = mkFile(n, c);
        files.push(f);
        return f;
      },
    };
    return folder;
  };
  const root = mkFolder('root');
  const ctx: Record<string, unknown> = {
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
    CacheService: {
      getScriptCache: () => ({ get: (k: string) => cacheStore.get(k) ?? null, put: (k: string, v: string) => void cacheStore.set(k, v) }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
    DriveApp: { getRootFolder: () => root },
    UrlFetchApp: {
      fetch: (url: string) => {
        fetchCalls.push(url);
        const tok = decodeURIComponent(url.split('id_token=')[1] ?? '');
        const info = tokens[tok];
        return { getResponseCode: () => (info ? 200 : 400), getContentText: () => JSON.stringify(info ?? { error: 'invalid_token' }) };
      },
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (t: string) => ({
        text: t,
        setMimeType() {
          return this;
        },
      }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (_a: string, text: string) => [...createHash('sha256').update(text).digest()].map((b) => (b > 127 ? b - 256 : b)),
      newBlob: (s: string) => ({ getBytes: () => [...Buffer.from(s)] }),
    },
  };
  vm.createContext(ctx);
  for (const f of ['Config', 'Validation', 'Projects', 'Sync', 'Code'])
    vm.runInContext(readFileSync(path.resolve('apps-script', `${f}.gs`), 'utf8'), ctx, { filename: `${f}.gs` });
  const exp = Math.floor(Date.now() / 1000) + 3000;
  const addToken = (token: string, sub: string, over: Record<string, unknown> = {}) => {
    tokens[token] = { iss: 'https://accounts.google.com', aud: 'client-123', sub, email_verified: 'true', exp: String(exp), ...over };
  };
  const post = (body: unknown, raw?: string) => {
    const out = (ctx.doPost as (e: unknown) => { text: string })({ postData: { contents: raw ?? JSON.stringify(body) } });
    return JSON.parse(out.text) as { ok: boolean; data?: any; error?: { code: string; message: string } };
  };
  return { props, post, addToken, fetchCalls, ctx, root };
}

const tokA = 'A'.repeat(40);
const tokB = 'B'.repeat(40);
const project = (id: string, extra: object = {}) => JSON.stringify({ schemaVersion: 1, id, scenes: [], ...extra });
const put = (token: string, id: string, baseRevision: number, extra: Record<string, unknown> = {}) => ({
  action: 'putProject',
  idToken: token,
  params: { id, name: 'P', updatedAt: '2025-01-01T00:00:00.000Z', baseRevision, projectJson: project(id), ...extra },
});

describe('Apps Script backend (real .gs files in a VM with fakes)', () => {
  let env: ReturnType<typeof makeEnv>;
  beforeEach(() => {
    env = makeEnv();
    env.addToken(tokA, 'user-a');
    env.addToken(tokB, 'user-b');
  });

  it('health ping works without auth and exposes no data', () => {
    const r = env.post({ action: 'ping' });
    expect(r).toMatchObject({ ok: true, data: { pong: true } });
  });

  it('rejects unknown actions, malformed JSON, non-objects and oversized bodies', () => {
    expect(env.post({ action: 'dropEverything' }).error?.code).toBe('UNKNOWN_ACTION');
    expect(env.post(null, '{nope').error?.code).toBe('BAD_REQUEST');
    expect(env.post(null, '[1,2]').error?.code).toBe('BAD_REQUEST');
    expect(env.post({ action: 'ping', pad: 'x'.repeat(700 * 1024) }).error?.code).toBe('PAYLOAD_TOO_LARGE');
    expect(env.post({ action: '__proto__' }).error?.code).toBe('UNKNOWN_ACTION');
  });

  it('is disabled by default until SYNC_ENABLED=true and a client id exist', () => {
    delete env.props.SYNC_ENABLED;
    expect(env.post({ action: 'listProjects', idToken: tokA }).error?.code).toBe('DISABLED');
  });

  it('requires a valid Google ID token for the right audience', () => {
    expect(env.post({ action: 'listProjects' }).error?.code).toBe('UNAUTHENTICATED');
    expect(env.post({ action: 'listProjects', idToken: 'not a token!' }).error?.code).toBe('UNAUTHENTICATED');
    expect(env.post({ action: 'listProjects', idToken: 'C'.repeat(40) }).error?.code).toBe('UNAUTHENTICATED');
    env.addToken('D'.repeat(40), 'x', { aud: 'someone-elses-client' });
    expect(env.post({ action: 'listProjects', idToken: 'D'.repeat(40) }).error?.code).toBe('UNAUTHENTICATED');
    env.addToken('E'.repeat(40), 'x', { exp: '1' });
    expect(env.post({ action: 'listProjects', idToken: 'E'.repeat(40) }).error?.code).toBe('UNAUTHENTICATED');
    env.addToken('F'.repeat(40), 'x', { email_verified: 'false' });
    expect(env.post({ action: 'listProjects', idToken: 'F'.repeat(40) }).error?.code).toBe('UNAUTHENTICATED');
    env.addToken('G'.repeat(40), 'x', { iss: 'https://evil.example' });
    expect(env.post({ action: 'listProjects', idToken: 'G'.repeat(40) }).error?.code).toBe('UNAUTHENTICATED');
  });

  it('caches verified tokens to save UrlFetch quota', () => {
    env.post({ action: 'listProjects', idToken: tokA });
    env.post({ action: 'listProjects', idToken: tokA });
    expect(env.fetchCalls).toHaveLength(1);
  });

  it('stores, lists, reads and deletes a project with revisions', () => {
    expect(env.post(put(tokA, 'prj_1', 0)).data).toMatchObject({ revision: 1 });
    expect(env.post(put(tokA, 'prj_1', 1)).data).toMatchObject({ revision: 2 });
    const list = env.post({ action: 'listProjects', idToken: tokA, params: { limit: 10 } }).data;
    expect(list.items).toEqual([{ id: 'prj_1', name: 'P', updatedAt: '2025-01-01T00:00:00.000Z', revision: 2 }]);
    expect(JSON.parse(env.post({ action: 'getProject', idToken: tokA, params: { id: 'prj_1' } }).data.projectJson).id).toBe('prj_1');
    expect(env.post({ action: 'deleteProject', idToken: tokA, params: { id: 'prj_1' } }).data).toEqual({ deleted: true });
    expect(env.post({ action: 'getProject', idToken: tokA, params: { id: 'prj_1' } }).error?.code).toBe('NOT_FOUND');
  });

  it("never lets one user read, overwrite or delete another user's project, even with its id", () => {
    env.post(put(tokA, 'prj_secret', 0));
    expect(env.post({ action: 'getProject', idToken: tokB, params: { id: 'prj_secret' } }).error?.code).toBe('NOT_FOUND');
    expect(env.post({ action: 'deleteProject', idToken: tokB, params: { id: 'prj_secret' } }).error?.code).toBe('NOT_FOUND');
    expect(env.post(put(tokB, 'prj_secret', 1)).error?.code).toBe('CONFLICT');
    expect(env.post({ action: 'listProjects', idToken: tokB }).data.items).toEqual([]);
    expect(env.post({ action: 'getProject', idToken: tokA, params: { id: 'prj_secret' } }).ok).toBe(true);
  });

  it('reports sync conflicts instead of overwriting', () => {
    env.post(put(tokA, 'prj_c', 0));
    env.post(put(tokA, 'prj_c', 1));
    const r = env.post(put(tokA, 'prj_c', 1));
    expect(r.error?.code).toBe('CONFLICT');
    expect((r as unknown as { error: { details: { serverRevision: number } } }).error.details.serverRevision).toBe(2);
    expect(env.post(put(tokA, 'prj_new', 5)).error?.code).toBe('CONFLICT');
  });

  it('validates ids, payloads, pagination and preferences', () => {
    for (const id of ['../x', 'a/b', '', 'x'.repeat(65), 'a b']) {
      expect(env.post({ action: 'getProject', idToken: tokA, params: { id } }).error?.code).toBe('BAD_REQUEST');
    }
    expect(env.post(put(tokA, 'prj_1', 0, { projectJson: '{nope' })).error?.code).toBe('BAD_REQUEST');
    expect(env.post(put(tokA, 'prj_1', 0, { projectJson: project('other') })).error?.code).toBe('BAD_REQUEST');
    expect(env.post(put(tokA, 'prj_1', 0, { projectJson: project('prj_1', { pad: 'x'.repeat(520 * 1024) }) })).error?.code).toBe(
      'PAYLOAD_TOO_LARGE',
    );
    expect(env.post(put(tokA, 'prj_1', -1)).error?.code).toBe('BAD_REQUEST');
    expect(env.post(put(tokA, 'prj_1', 0, { updatedAt: 'yesterday' })).error?.code).toBe('BAD_REQUEST');
    expect(env.post({ action: 'listProjects', idToken: tokA, params: { limit: 1000 } }).error?.code).toBe('BAD_REQUEST');
    expect(env.post({ action: 'listProjects', idToken: tokA, params: { cursor: '../../' } }).error?.code).toBe('BAD_REQUEST');
    expect(env.post({ action: 'setPreferences', idToken: tokA, params: { preferences: { apiKey: 'x' } } }).error?.code).toBe('BAD_REQUEST');
    expect(env.post({ action: 'setPreferences', idToken: tokA, params: { preferences: { theme: 'dark' } } }).data).toEqual({
      theme: 'dark',
    });
    expect(env.post({ action: 'getPreferences', idToken: tokA }).data).toEqual({ theme: 'dark' });
  });

  it('paginates project lists', () => {
    for (const id of ['prj_a', 'prj_b', 'prj_c']) env.post(put(tokA, id, 0));
    const p1 = env.post({ action: 'listProjects', idToken: tokA, params: { limit: 2 } }).data;
    expect(p1.items.map((i: any) => i.id)).toEqual(['prj_a', 'prj_b']);
    const p2 = env.post({ action: 'listProjects', idToken: tokA, params: { limit: 2, cursor: p1.nextCursor } }).data;
    expect(p2.items.map((i: any) => i.id)).toEqual(['prj_c']);
    expect(p2.nextCursor).toBeNull();
  });

  it('rate limits per user', () => {
    let last: any;
    for (let i = 0; i < 62; i++) last = env.post({ action: 'getSyncStatus', idToken: tokA });
    expect(last.error?.code).toBe('RATE_LIMITED');
    expect(env.post({ action: 'getSyncStatus', idToken: tokB }).ok).toBe(true);
  });

  it('contains no hard-coded secrets', () => {
    for (const f of ['Config', 'Validation', 'Projects', 'Sync', 'Code']) {
      const src = readFileSync(path.resolve('apps-script', `${f}.gs`), 'utf8');
      expect(src).not.toMatch(/AIza[0-9A-Za-z_-]{20,}|[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com|-----BEGIN/);
    }
  });
});

describe('cloud client', () => {
  it('only accepts https Apps Script deployment URLs', () => {
    expect(isValidDeploymentUrl('https://script.google.com/macros/s/AKfycbxAAAAAAAAAAAAAAAA/exec')).toBe(true);
    for (const bad of [
      'http://script.google.com/macros/s/AKfycbxAAAAAAAAAAAAAAAA/exec',
      'https://evil.com/macros/s/AKfycbxAAAAAAAAAAAAAAAA/exec',
      'https://script.google.com.evil.com/macros/s/AKfycbxAAAAAAAAAAAAAAAA/exec',
      'file:///etc/passwd',
    ]) {
      expect(isValidDeploymentUrl(bad)).toBe(false);
    }
    expect(() => new CloudClient('http://x', async () => 't')).toThrow(CloudError);
  });

  it('sends text/plain POSTs without cookies and validates responses', async () => {
    const calls: RequestInit[] = [];
    const fake = (async (_u: string, init: RequestInit) => {
      calls.push(init);
      return new Response(JSON.stringify({ ok: true, data: { items: [], nextCursor: null } }), { status: 200 });
    }) as unknown as typeof fetch;
    const c = new CloudClient('https://script.google.com/macros/s/AKfycbxAAAAAAAAAAAAAAAA/exec', async () => 'tok', fake);
    expect(await c.list()).toEqual({ items: [], nextCursor: null });
    expect(calls[0]?.credentials).toBe('omit');
    expect((calls[0]?.headers as Record<string, string>)['Content-Type']).toMatch(/text\/plain/);
    const bad = new CloudClient(
      'https://script.google.com/macros/s/AKfycbxAAAAAAAAAAAAAAAA/exec',
      async () => 'tok',
      (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch,
    );
    await expect(bad.list()).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });
});
