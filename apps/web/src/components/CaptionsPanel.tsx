import { useRef, useState } from 'react';
import { captionWarnings, formatSrt, parseSrt } from '@frameforge/editor-core';
import type { CaptionItem, Project } from '@frameforge/project-schema';
import { ColorField, NumberField, SelectField, TextField } from './fields';
import { downloadBytes, errorMessage } from '../util';

interface Props {
  project: Project;
  timeMs: number;
  totalMs: number;
  onStyle(patch: Partial<Omit<Project['captions'], 'items'>>, coalesce?: string): void;
  onAdd(startMs: number, endMs: number): void;
  onUpdate(id: string, patch: Partial<Omit<CaptionItem, 'id'>>, coalesce?: string): void;
  onRemove(id: string): void;
  onReplace(items: CaptionItem[]): void;
  onSeek(ms: number): void;
}

const sec = (ms: number) => Math.round(ms / 10) / 100;
const MAX_SRT_BYTES = 1024 * 1024;

export function CaptionsPanel({ project, timeMs, totalMs, onStyle, onAdd, onUpdate, onRemove, onReplace, onSeek }: Props) {
  const c = project.captions;
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const warnings = captionWarnings(project, totalMs);

  const importSrt = async (file: File | null) => {
    if (!file) return;
    try {
      if (file.size > MAX_SRT_BYTES) throw new Error('That subtitle file is larger than 1 MB.');
      const { items, skipped } = parseSrt(await file.text());
      if (items.length === 0) throw new Error('No captions were found. Use a SubRip (.srt) file.');
      if (c.items.length > 0 && !window.confirm(`Replace your ${c.items.length} existing caption(s) with ${items.length} from the file?`))
        return;
      onReplace(items);
      setMsg({
        kind: 'ok',
        text: `Imported ${items.length} caption${items.length === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} invalid block${skipped === 1 ? '' : 's'}` : ''}.`,
      });
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="captions-panel">
      <label className="check">
        <input type="checkbox" checked={c.enabled} onChange={(e) => onStyle({ enabled: e.target.checked })} />
        Show captions in the video
      </label>
      <SelectField
        label="Position"
        value={c.position}
        options={['top', 'center', 'bottom'] as const}
        onChange={(position) => onStyle({ position })}
      />
      <NumberField
        label="Text size"
        unit="% of height"
        value={c.fontSize}
        min={1.5}
        max={12}
        step={0.5}
        onChange={(fontSize) => onStyle({ fontSize }, 'cfs')}
      />
      <ColorField label="Text colour" value={c.color} onChange={(color) => onStyle({ color }, 'cc')} />
      <ColorField label="Background" value={c.background} onChange={(background) => onStyle({ background }, 'cb')} />

      <div className="btn-row">
        <button
          type="button"
          className="btn primary"
          onClick={() => onAdd(Math.round(timeMs), Math.min(Math.round(timeMs) + 2000, Math.max(Math.round(timeMs) + 500, totalMs)))}
        >
          + Caption at playhead
        </button>
        <label className="btn file-btn">
          Import .srt
          <input
            ref={fileRef}
            type="file"
            accept=".srt,text/plain,application/x-subrip"
            onChange={(e) => void importSrt(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          className="btn"
          disabled={c.items.length === 0}
          onClick={() =>
            downloadBytes(
              new TextEncoder().encode(formatSrt(c.items)),
              `${project.name.replace(/[^\w.-]+/g, '_') || 'captions'}.srt`,
              'application/x-subrip',
            )
          }
        >
          Export .srt
        </button>
      </div>
      {msg && (
        <p role={msg.kind === 'error' ? 'alert' : 'status'} className={msg.kind}>
          {msg.text}
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="warnings" aria-live="polite">
          {warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}

      <h3>Captions ({c.items.length})</h3>
      {c.items.length === 0 && (
        <p className="hint">
          No captions yet. Move the playhead to a moment in the video and press “+ Caption at playhead”, or import an .srt file.
        </p>
      )}
      <ol className="caption-list">
        {c.items.map((item, i) => (
          <li key={item.id} className="caption-row">
            <div className="caption-head">
              <button type="button" className="btn" onClick={() => onSeek(item.startMs)} aria-label={`Jump to caption ${i + 1}`}>
                Go to
              </button>
              <button type="button" className="btn danger" onClick={() => onRemove(item.id)} aria-label={`Delete caption ${i + 1}`}>
                Delete
              </button>
            </div>
            <TextField
              label={`Caption ${i + 1} text`}
              value={item.text}
              multiline
              maxLength={500}
              onChange={(text) => onUpdate(item.id, { text }, `ct:${item.id}`)}
            />
            <div className="field-row">
              <NumberField
                label="Start"
                unit="s"
                value={sec(item.startMs)}
                min={0}
                max={Math.max(1, totalMs / 1000)}
                step={0.1}
                onChange={(v) => onUpdate(item.id, { startMs: Math.round(v * 1000) }, `cs:${item.id}`)}
              />
              <NumberField
                label="End"
                unit="s"
                value={sec(item.endMs)}
                min={0.1}
                max={Math.max(1, totalMs / 1000 + 5)}
                step={0.1}
                onChange={(v) => onUpdate(item.id, { endMs: Math.round(v * 1000) }, `ce:${item.id}`)}
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
