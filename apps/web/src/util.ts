export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function downloadBytes(bytes: Uint8Array, fileName: string, mime = 'application/octet-stream'): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function readFileBytes(file: File, maxBytes: number): Promise<Uint8Array> {
  if (file.size > maxBytes) throw new Error(`"${file.name}" is larger than ${formatBytes(maxBytes)}.`);
  return new Uint8Array(await file.arrayBuffer());
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
