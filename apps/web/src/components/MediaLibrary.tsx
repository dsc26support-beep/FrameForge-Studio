import { useRef, useState } from 'react';
import { ingestAsset } from '@frameforge/asset-manager';
import { LIMITS, type Asset, type Project } from '@frameforge/project-schema';
import { formatBytes, errorMessage, readFileBytes } from '../util';
import { assetStore } from '../storage/repo';

interface Props {
  project: Project;
  assetUrls: ReadonlyMap<string, string>;
  missing: ReadonlySet<string>;
  onImported(asset: Asset, bytes: Uint8Array): void;
  onUseImage(asset: Asset): void;
  onUseBackground(asset: Asset): void;
  onUseAudio(asset: Asset): void;
  onRemove(asset: Asset): void;
}

export function MediaLibrary({ project, assetUrls, missing, onImported, onUseImage, onUseBackground, onUseAudio, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setMessage(null);
    let current = project.assets;
    const notes: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const bytes = await readFileBytes(file, LIMITS.maxAssetBytes);
        const { asset, duplicate } = await ingestAsset(bytes, file.name, current);
        if (duplicate) {
          notes.push(`"${file.name}" is already in the library.`);
          continue;
        }
        await assetStore.put(project.id, asset.id, bytes);
        current = [...current, asset];
        onImported(asset, bytes);
        notes.push(`Imported "${asset.name}".`);
      } catch (e) {
        setMessage({ kind: 'error', text: errorMessage(e) });
      }
    }
    if (notes.length) setMessage((m) => m ?? { kind: 'ok', text: notes.join(' ') });
    setBusy(false);
    if (input.current) input.current.value = '';
  };

  return (
    <div className="media">
      <div className="media-actions">
        <label className="btn primary file-btn">
          {busy ? 'Importing…' : 'Import media'}
          <input
            ref={input}
            type="file"
            multiple
            accept="image/*,audio/*,video/mp4,video/webm,.svg"
            disabled={busy}
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </label>
      </div>
      <p className="hint">
        Images, SVG, audio (MP3, WAV, AAC, M4A, OGG, FLAC) and video files are checked by content, not by name. Files stay on this device.
      </p>
      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'error' : 'ok'}>
          {message.text}
        </p>
      )}
      <ul className="asset-list">
        {project.assets.length === 0 && <li className="hint">No media yet.</li>}
        {project.assets.map((a) => (
          <li key={a.id} className="asset">
            <div className="asset-preview">
              {a.kind === 'image' && assetUrls.get(a.id) ? (
                <img src={assetUrls.get(a.id)} alt={`Preview of ${a.name}`} loading="lazy" decoding="async" />
              ) : (
                <span aria-hidden="true">{a.kind === 'audio' ? '♪' : '🎞'}</span>
              )}
            </div>
            <div className="asset-info">
              <strong title={a.name}>{a.name}</strong>
              <span>
                {a.mime} · {formatBytes(a.size)}
                {a.width ? ` · ${a.width}×${a.height}` : ''}
              </span>
              {missing.has(a.id) && <span className="error">File missing from this device. Re-import it.</span>}
              {a.kind === 'video' && <span className="hint">Stored in the library; video clips cannot be placed in scenes yet.</span>}
              {a.kind === 'audio' && assetUrls.get(a.id) && (
                // eslint-disable-next-line jsx-a11y/media-has-caption -- user audio clips have no transcript to caption
                <audio controls preload="none" src={assetUrls.get(a.id)} aria-label={`Play ${a.name}`} />
              )}
            </div>
            <div className="asset-buttons">
              {a.kind === 'image' && (
                <>
                  <button type="button" className="btn" onClick={() => onUseImage(a)}>
                    Add to scene
                  </button>
                  <button type="button" className="btn" onClick={() => onUseBackground(a)}>
                    Use as background
                  </button>
                </>
              )}
              {a.kind === 'audio' && (
                <button type="button" className="btn" onClick={() => onUseAudio(a)}>
                  Add audio track
                </button>
              )}
              <button type="button" className="btn danger" onClick={() => onRemove(a)}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
