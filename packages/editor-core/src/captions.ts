import { LIMITS, newId, type CaptionItem, type Project } from '@frameforge/project-schema';

const touch = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });
const sortItems = (items: CaptionItem[]): CaptionItem[] => [...items].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
const MAX_TEXT = 500;

export function setCaptionStyle(p: Project, patch: Partial<Omit<Project['captions'], 'items'>>): Project {
  return touch({ ...p, captions: { ...p.captions, ...patch } });
}

export function addCaption(p: Project, startMs: number, endMs: number, text = 'New caption'): Project {
  if (p.captions.items.length >= LIMITS.maxCaptions) return p;
  const start = Math.max(0, Math.round(startMs));
  const end = Math.max(start + 100, Math.round(endMs));
  const item: CaptionItem = { id: newId('cap'), startMs: start, endMs: end, text: text.slice(0, MAX_TEXT) };
  return touch({ ...p, captions: { ...p.captions, enabled: true, items: sortItems([...p.captions.items, item]) } });
}

/** Keeps every caption valid: start >= 0 and end > start. Re-sorts by start time. */
export function updateCaption(p: Project, id: string, patch: Partial<Omit<CaptionItem, 'id'>>): Project {
  const items = p.captions.items.map((c) => {
    if (c.id !== id) return c;
    const startMs = Math.max(0, Math.round(patch.startMs ?? c.startMs));
    const endMs = Math.max(startMs + 100, Math.round(patch.endMs ?? c.endMs));
    return { ...c, startMs, endMs, text: (patch.text ?? c.text).slice(0, MAX_TEXT) };
  });
  return touch({ ...p, captions: { ...p.captions, items: sortItems(items) } });
}

export function removeCaption(p: Project, id: string): Project {
  return touch({ ...p, captions: { ...p.captions, items: p.captions.items.filter((c) => c.id !== id) } });
}

export function replaceCaptions(p: Project, items: CaptionItem[]): Project {
  return touch({
    ...p,
    captions: {
      ...p.captions,
      enabled: items.length > 0 ? true : p.captions.enabled,
      items: sortItems(items.slice(0, LIMITS.maxCaptions)),
    },
  });
}

const TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;
const ms = (h: string, m: string, s: string, f: string): number =>
  ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(f.padEnd(3, '0'));

/** Parses SubRip (.srt) text. Invalid blocks are skipped and counted, never thrown on. */
export function parseSrt(text: string): { items: CaptionItem[]; skipped: number } {
  const stripped = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const blocks = stripped.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const items: CaptionItem[] = [];
  let skipped = 0;
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    if (lines.length === 0) continue;
    const idx = lines.findIndex((l) => TIME.test(l));
    const m = idx >= 0 ? TIME.exec(lines[idx]!) : null;
    if (!m) {
      skipped += 1;
      continue;
    }
    const startMs = ms(m[1]!, m[2]!, m[3]!, m[4]!);
    const endMs = ms(m[5]!, m[6]!, m[7]!, m[8]!);
    const body = lines
      .slice(idx + 1)
      .join('\n')
      .replace(/<[^>]*>/g, '')
      .trim()
      .slice(0, MAX_TEXT);
    if (!body || endMs <= startMs || startMs > LIMITS.maxTotalMs) {
      skipped += 1;
      continue;
    }
    if (items.length >= LIMITS.maxCaptions) {
      skipped += 1;
      continue;
    }
    items.push({ id: newId('cap'), startMs, endMs, text: body });
  }
  return { items: sortItems(items), skipped };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
function stamp(t: number): string {
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(Math.floor(t % 1000), 3)}`;
}

export function formatSrt(items: readonly CaptionItem[]): string {
  return `${sortItems([...items])
    .map((c, i) => `${i + 1}\n${stamp(c.startMs)} --> ${stamp(c.endMs)}\n${c.text}`)
    .join('\n\n')}\n`;
}

/** Messages about captions the viewer will not see as intended. */
export function captionWarnings(p: Project, totalMs: number): string[] {
  const out: string[] = [];
  const items = sortItems([...p.captions.items]);
  const beyond = items.filter((c) => c.startMs >= totalMs).length;
  if (beyond) out.push(`${beyond} caption${beyond > 1 ? 's start' : ' starts'} after the video ends and will not show.`);
  let overlaps = 0;
  for (let i = 1; i < items.length; i++) if (items[i]!.startMs < items[i - 1]!.endMs) overlaps += 1;
  if (overlaps)
    out.push(`${overlaps} caption${overlaps > 1 ? 's overlap' : ' overlaps'} another; only the earliest one is shown at a time.`);
  if (!p.captions.enabled && items.length) out.push('Captions are switched off, so they will not appear in the video.');
  return out;
}
