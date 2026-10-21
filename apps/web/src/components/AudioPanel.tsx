import type { Asset, AudioTrack, Project } from '@frameforge/project-schema';
import { NumberField, TextField } from './fields';
import { trackLengthMs } from '../useAudioPreview';

interface Props {
  project: Project;
  totalMs: number;
  onAdd(asset: Asset): void;
  onUpdate(id: string, patch: Partial<Omit<AudioTrack, 'id'>>, coalesce?: string): void;
  onRemove(id: string): void;
  onGoToMedia(): void;
}

const sec = (ms: number) => Math.round(ms / 10) / 100;

export function AudioPanel({ project, totalMs, onAdd, onUpdate, onRemove, onGoToMedia }: Props) {
  const audioAssets = project.assets.filter((a) => a.kind === 'audio');
  const maxStart = Math.max(1, totalMs / 1000);
  return (
    <div className="audio-panel">
      <p className="hint">
        Press Play to hear the mix while you edit. The preview plays each track at up to 100% volume; the exported video applies the exact
        volume, fades and trim shown here.
      </p>

      <h3>Tracks in this video</h3>
      {project.audioTracks.length === 0 && <p className="hint">No audio yet. Add a track from your library below.</p>}
      {project.audioTracks.map((t) => {
        const asset = project.assets.find((a) => a.id === t.assetId);
        const len = trackLengthMs(project, t.id, totalMs);
        const clipMs = asset?.durationMs;
        return (
          <section key={t.id} className="track" aria-label={`Audio track ${t.name}`}>
            <TextField
              label="Track name"
              value={t.name}
              maxLength={120}
              onChange={(name) => onUpdate(t.id, { name: name || 'Audio' }, `an:${t.id}`)}
            />
            <p className="hint">
              {asset ? asset.name : 'Missing file'}
              {clipMs !== undefined ? ` · clip is ${sec(clipMs)} s` : ''} · plays {sec(len)} s in the video
              {t.startMs >= totalMs ? ' (starts after the video ends, so it is silent)' : ''}
            </p>
            <label className="check">
              <input type="checkbox" checked={t.muted} onChange={(e) => onUpdate(t.id, { muted: e.target.checked })} />
              Mute this track
            </label>
            <NumberField
              label="Volume"
              unit="%"
              value={Math.round(t.volume * 100)}
              min={0}
              max={200}
              step={5}
              onChange={(v) => onUpdate(t.id, { volume: v / 100 }, `av:${t.id}`)}
            />
            <NumberField
              label="Starts at"
              unit="seconds"
              value={sec(t.startMs)}
              min={0}
              max={maxStart}
              step={0.1}
              onChange={(v) => onUpdate(t.id, { startMs: Math.round(v * 1000) }, `as:${t.id}`)}
            />
            <NumberField
              label="Skip the first"
              unit="seconds of the clip"
              value={sec(t.trimStartMs)}
              min={0}
              max={Math.max(0, sec((clipMs ?? 600000) - 100))}
              step={0.1}
              onChange={(v) => onUpdate(t.id, { trimStartMs: Math.round(v * 1000) }, `at:${t.id}`)}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={t.durationMs === null}
                onChange={(e) => onUpdate(t.id, { durationMs: e.target.checked ? null : Math.max(100, len || 1000) })}
              />
              Play to the end of the clip (or the video)
            </label>
            {t.durationMs !== null && (
              <NumberField
                label="Play for"
                unit="seconds"
                value={sec(t.durationMs)}
                min={0.1}
                max={Math.max(0.2, maxStart)}
                step={0.1}
                onChange={(v) => onUpdate(t.id, { durationMs: Math.max(100, Math.round(v * 1000)) }, `ad:${t.id}`)}
              />
            )}
            <NumberField
              label="Fade in"
              unit="seconds"
              value={sec(t.fadeInMs)}
              min={0}
              max={30}
              step={0.1}
              onChange={(v) => onUpdate(t.id, { fadeInMs: Math.round(v * 1000) }, `afi:${t.id}`)}
            />
            <NumberField
              label="Fade out"
              unit="seconds"
              value={sec(t.fadeOutMs)}
              min={0}
              max={30}
              step={0.1}
              onChange={(v) => onUpdate(t.id, { fadeOutMs: Math.round(v * 1000) }, `afo:${t.id}`)}
            />
            <button type="button" className="btn danger" onClick={() => onRemove(t.id)}>
              Remove track
            </button>
          </section>
        );
      })}

      <h3>Your audio library</h3>
      {audioAssets.length === 0 && <p className="hint">No audio files imported yet.</p>}
      <ul className="asset-list">
        {audioAssets.map((a) => (
          <li key={a.id} className="audio-lib">
            <span title={a.name}>{a.name}</span>
            <button type="button" className="btn" onClick={() => onAdd(a)}>
              Add as track
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn" onClick={onGoToMedia}>
        Import audio files…
      </button>
    </div>
  );
}
