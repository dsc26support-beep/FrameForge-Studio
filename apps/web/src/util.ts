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

/** Reads an audio file's length from its metadata. Resolves undefined if the browser cannot decode it. */
export function probeAudioDurationMs(bytes: Uint8Array, mime: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    const audio = new Audio();
    const done = (v: number | undefined) => {
      clearTimeout(timer);
      audio.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const timer = setTimeout(() => done(undefined), 5000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined);
    audio.onerror = () => done(undefined);
    audio.src = url;
  });
}
