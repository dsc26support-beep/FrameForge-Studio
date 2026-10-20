const RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Makes an arbitrary user-supplied file name safe to display and to use as a single path segment. */
export function sanitizeFileName(input: string, fallback = 'file', maxLength = 100): string {
  let name = String(input ?? '')
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*‪-‮⁦-⁩]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  name = name.replace(/^\.+/, '').replace(/[. ]+$/, '');
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  let ext =
    dot > 0
      ? name
          .slice(dot + 1)
          .replace(/[^A-Za-z0-9]/g, '')
          .slice(0, 8)
      : '';
  let stem = base.slice(0, Math.max(1, maxLength - (ext ? ext.length + 1 : 0)));
  if (!stem || RESERVED.test(stem)) stem = stem ? `_${stem}` : fallback;
  if (ext.length === 0) ext = '';
  return ext ? `${stem}.${ext.toLowerCase()}` : stem;
}

/** Output file names always end in `.mp4` and never contain separators. */
export function sanitizeOutputName(input: string): string {
  const cleaned = sanitizeFileName(input, 'video').replace(/\.mp4$/i, '');
  return `${sanitizeFileName(cleaned, 'video', 96).replace(/\.[A-Za-z0-9]{1,8}$/, '') || 'video'}.mp4`;
}

/** True for a relative, forward-slash path that cannot escape its root. */
export function isSafeRelativePath(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0 || p.length > 300) return false;
  if (p.includes('\0') || p.includes('\\')) return false;
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return false;
  return p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}
