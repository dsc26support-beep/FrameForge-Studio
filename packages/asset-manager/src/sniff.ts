export interface MediaInfo {
  kind: 'image' | 'audio' | 'video';
  mime: string;
  ext: string;
}

const ascii = (b: Uint8Array, start: number, len: number): string => String.fromCharCode(...b.subarray(start, start + len));

/** Detects media by content (magic bytes), never by file name or declared MIME type. */
export function sniffMedia(b: Uint8Array): MediaInfo | null {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return { kind: 'image', mime: 'image/png', ext: 'png' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: 'image', mime: 'image/jpeg', ext: 'jpg' };
  if (ascii(b, 0, 4) === 'GIF8') return { kind: 'image', mime: 'image/gif', ext: 'gif' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return { kind: 'image', mime: 'image/webp', ext: 'webp' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE') return { kind: 'audio', mime: 'audio/wav', ext: 'wav' };
  if (ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0 && ((b[1] ?? 0) & 0x06) !== 0)) {
    return { kind: 'audio', mime: 'audio/mpeg', ext: 'mp3' };
  }
  if (b[0] === 0xff && (b[1] === 0xf1 || b[1] === 0xf9)) return { kind: 'audio', mime: 'audio/aac', ext: 'aac' };
  if (ascii(b, 0, 4) === 'OggS') return { kind: 'audio', mime: 'audio/ogg', ext: 'ogg' };
  if (ascii(b, 0, 4) === 'fLaC') return { kind: 'audio', mime: 'audio/flac', ext: 'flac' };
  if (ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4);
    if (brand === 'M4A ' || brand === 'M4B ') return { kind: 'audio', mime: 'audio/mp4', ext: 'm4a' };
    return { kind: 'video', mime: 'video/mp4', ext: 'mp4' };
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { kind: 'video', mime: 'video/webm', ext: 'webm' };
  const head = new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(0, Math.min(b.length, 2048))).trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return { kind: 'image', mime: 'image/svg+xml', ext: 'svg' };
  return null;
}

/** SVG is active content: accept only files with no scripting, no external references and no entities. */
export function checkSvgSafe(bytes: Uint8Array): string | null {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const bad: [RegExp, string][] = [
    [/<script/i, 'contains <script>'],
    [/<foreignObject/i, 'contains <foreignObject>'],
    [/<iframe|<object|<embed/i, 'contains embedded content'],
    [/<!ENTITY|<!DOCTYPE[^>]*\[/i, 'contains entity declarations'],
    [/\son[a-z]+\s*=/i, 'contains event handler attributes'],
    [/javascript:/i, 'contains a javascript: URL'],
    [/(?:xlink:)?href\s*=\s*["'](?!#)/i, 'references external resources'],
    [/url\(\s*["']?(?!#)/i, 'references external resources'],
    [/@import/i, 'contains @import'],
    [/<(?:image|use)\b/i, 'contains <image> or <use>'],
  ];
  for (const [re, why] of bad) if (re.test(text)) return `SVG rejected: ${why}.`;
  return null;
}

export interface ImageSize {
  width: number;
  height: number;
}

/** Reads dimensions from the file header without decoding the pixels (memory-conscious). */
export function readImageSize(b: Uint8Array): ImageSize | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b[0] === 0x89 && b.length >= 24) return { width: dv.getUint32(16), height: dv.getUint32(20) };
  if (ascii(b, 0, 3) === 'GIF' && b.length >= 10) return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = b[i + 1] ?? 0;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7) };
      }
      i += 2 + dv.getUint16(i + 2);
    }
    return null;
  }
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' && b.length >= 30) {
    const chunk = ascii(b, 12, 4);
    if (chunk === 'VP8X')
      return { width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)) };
    if (chunk === 'VP8 ') return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
    if (chunk === 'VP8L') {
      const bits = dv.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}
