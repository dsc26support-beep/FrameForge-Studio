/**
 * Pure security helpers for the Electron shell. Kept free of Electron imports so they can be unit tested.
 */
export const APP_SCHEME = 'frameforge';
export const APP_ORIGIN = `${APP_SCHEME}://app`;
export const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;

/** Web preferences for every window. Tests assert these values and scan the source for regressions. */
export const SECURE_WEB_PREFERENCES = {
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  webviewTag: false,
  spellcheck: false,
} as const;

export function isTrustedUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === `${APP_SCHEME}:` && u.host === 'app';
  } catch {
    return false;
  }
}

/** Only app pages, in-memory blobs, data URIs and about: pages may be loaded; everything else is cancelled. */
export function isAllowedRequestUrl(url: string): boolean {
  return isTrustedUrl(url) || url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('about:');
}

/** Decides whether an IPC message comes from our one trusted window and its top-level app page. */
export function isTrustedSender(s: { senderIsMainWindow: boolean; frameIsMainFrame: boolean; url: string | undefined | null }): boolean {
  return s.senderIsMainWindow && s.frameIsMainFrame && isTrustedUrl(s.url);
}

export function isAllowedNavigation(url: string): boolean {
  return isTrustedUrl(url) || url === 'about:blank';
}

export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'sha256-__RUNTIME_HASH__'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'self' about:",
].join('; ');

export class IpcValidationError extends Error {}

export function requireString(v: unknown, name: string, max = 200): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) throw new IpcValidationError(`Invalid ${name}`);
  return v;
}

export function requireToken(v: unknown, name = 'token'): string {
  if (typeof v !== 'string' || !/^[a-f0-9]{32}$/.test(v)) throw new IpcValidationError(`Invalid ${name}`);
  return v;
}

export function requireBytes(v: unknown, name: string, max = MAX_ARCHIVE_BYTES): Uint8Array {
  if (!(v instanceof Uint8Array)) throw new IpcValidationError(`Invalid ${name}`);
  if (v.byteLength === 0 || v.byteLength > max) throw new IpcValidationError(`${name} has an invalid size`);
  return v;
}

export function requireOptionalScale(v: unknown): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !(v >= 0.25 && v <= 1)) throw new IpcValidationError('Invalid scale');
  return v;
}

export function requireObject(v: unknown, name = 'arguments'): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new IpcValidationError(`Invalid ${name}`);
  return v as Record<string, unknown>;
}

/** Strips path separators from a suggested file name coming from the UI before it reaches a dialog. */
export function safeSuggestedName(v: unknown, ext: '.mp4' | '.ffproj'): string {
  const raw = requireString(v, 'file name', 150);
  const cleaned =
    raw
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
      .replace(/^\.+/, '')
      .trim() || 'video';
  return cleaned.toLowerCase().endsWith(ext) ? cleaned : `${cleaned}${ext}`;
}

export const IPC_CHANNELS = [
  'ff:capabilities',
  'ff:choose-output-file',
  'ff:open-project-file',
  'ff:save-project-file',
  'ff:start-render',
  'ff:cancel-render',
  'ff:reveal-output',
  'ff:choose-default-folder',
] as const;
export type IpcChannel = (typeof IPC_CHANNELS)[number];
export const EVENT_CHANNEL = 'ff:render-event';
