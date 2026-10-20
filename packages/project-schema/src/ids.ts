const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value);
}

/** Short random id such as `scn_k3j9a0x2q1ab`. Uses the platform CSPRNG. */
export function newId(prefix: string): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += b.toString(36).padStart(2, '0');
  return `${prefix}_${out}`;
}
