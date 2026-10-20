import { z } from 'zod';

/**
 * Optional client for the Google Apps Script backend. It is NOT used unless the user configures a
 * deployment URL and signs in; nothing is sent anywhere by default.
 *
 * Requests are POSTed as text/plain so the browser does not need a CORS preflight (Apps Script
 * cannot answer one). Authentication is a Google ID token verified server-side on every call.
 */
const envelope = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: z.string(), message: z.string(), details: z.record(z.string(), z.unknown()).optional() }),
  }),
]);

export class CloudError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{10,200}\/exec$/;

export function isValidDeploymentUrl(url: string): boolean {
  return URL_RE.test(url);
}

export interface CloudProjectMeta {
  id: string;
  name: string;
  updatedAt: string;
  revision: number;
}

export class CloudClient {
  constructor(
    private readonly url: string,
    private readonly getIdToken: () => Promise<string>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!isValidDeploymentUrl(url))
      throw new CloudError('BAD_URL', 'The cloud URL must be an https://script.google.com/macros/s/<id>/exec address.');
  }

  private async call(action: string, params: Record<string, unknown> = {}, auth = true): Promise<unknown> {
    const body = JSON.stringify({ action, params, ...(auth ? { idToken: await this.getIdToken() } : {}) });
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      credentials: 'omit',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) throw new CloudError('HTTP', `Cloud service returned HTTP ${res.status}.`);
    const parsed = envelope.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new CloudError('BAD_RESPONSE', 'Unexpected response from the cloud service.');
    if (!parsed.data.ok) throw new CloudError(parsed.data.error.code, parsed.data.error.message, parsed.data.error.details);
    return parsed.data.data;
  }

  ping() {
    return this.call('ping', {}, false);
  }
  async list(cursor?: string, limit = 25): Promise<{ items: CloudProjectMeta[]; nextCursor: string | null }> {
    const schema = z.object({
      items: z.array(z.object({ id: z.string(), name: z.string(), updatedAt: z.string(), revision: z.number() })),
      nextCursor: z.string().nullable(),
    });
    return schema.parse(await this.call('listProjects', { cursor, limit }));
  }
  async get(id: string): Promise<{ revision: number; projectJson: string }> {
    return z.object({ revision: z.number(), projectJson: z.string() }).parse(await this.call('getProject', { id }));
  }
  async put(args: {
    id: string;
    name: string;
    updatedAt: string;
    baseRevision: number;
    projectJson: string;
  }): Promise<{ revision: number }> {
    return z.object({ revision: z.number() }).parse(await this.call('putProject', args));
  }
  remove(id: string) {
    return this.call('deleteProject', { id });
  }
}

/** Decision helper for the UI when `put` fails with CONFLICT. Never merges automatically. */
export function describeConflict(e: CloudError): string {
  if (e.code !== 'CONFLICT') return e.message;
  const when = typeof e.details?.serverUpdatedAt === 'string' ? ` (cloud copy saved ${e.details.serverUpdatedAt})` : '';
  return `This project changed on another device${when}. Keep your version, keep the cloud version, or save yours as a copy.`;
}
