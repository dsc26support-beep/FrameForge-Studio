import { useEffect, useMemo, useRef, useState } from 'react';
import { createArchive, sanitizeOutputName } from '@frameforge/asset-manager';
import { ASPECTS, EXPORT_PRESETS, FPS_VALUES, type Project } from '@frameforge/project-schema';
import { computeTimeline, frameCountFor, type BridgeRenderEvent, type DeviceProfile } from '@frameforge/render-core';
import { NumberField, SelectField, TextField } from './fields';
import { assetStore } from '../storage/repo';
import { downloadBytes, errorMessage, formatBytes } from '../util';
import { getBridge } from '../platform';

interface Props {
  project: Project;
  profile: DeviceProfile;
  apply(fn: (p: Project) => Project, coalesce?: string | null): void;
  applyExport(patch: Record<string, unknown>): void;
}

type Job = {
  etaMs?: number | null;
  id: string;
  state: 'running' | 'done' | 'error' | 'cancelled';
  fraction: number;
  message: string;
  frame: number;
  total: number;
  startedAt: number;
  detail?: string;
  token: string;
  outputName?: string;
};

export async function buildArchive(project: Project): Promise<Uint8Array> {
  const bytes = new Map<string, Uint8Array>();
  for (const a of project.assets) {
    const b = await assetStore.get(project.id, a.id);
    if (b) bytes.set(a.id, b);
  }
  return createArchive(project, bytes);
}

export function ExportPanel({ project, profile, apply, applyExport }: Props) {
  const bridge = getBridge();
  const [job, setJob] = useState<Job | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const jobRef = useRef<Job | null>(null);
  useEffect(() => {
    jobRef.current = job;
  });

  const totalMs = useMemo(() => computeTimeline(project).totalMs, [project]);
  const frames = frameCountFor(totalMs, project.fps);
  const heavy = frames > 9000 || (project.canvas.height >= 1080 && frames > 3600);

  useEffect(() => {
    if (!bridge) return;
    return bridge.onRenderEvent((e: BridgeRenderEvent) => {
      const cur = jobRef.current;
      if (!cur || cur.id !== e.jobId) return;
      if (e.type === 'progress')
        setJob({
          ...cur,
          etaMs: e.progress.frame > 30 ? (e.progress.elapsedMs / e.progress.frame) * (e.progress.totalFrames - e.progress.frame) : null,
          fraction: e.progress.fraction,
          message: e.progress.message ?? e.progress.phase,
          frame: e.progress.frame,
          total: e.progress.totalFrames,
        });
      else if (e.type === 'done')
        setJob({
          ...cur,
          state: 'done',
          fraction: 1,
          message: `Saved ${e.outputName} (${formatBytes(e.bytes)}). ${e.verified ? 'Verified playable MP4.' : ''}`,
          detail: e.warnings.join('\n'),
          outputName: e.outputName,
        });
      else setJob({ ...cur, state: e.code === 'CANCELLED' ? 'cancelled' : 'error', message: e.message, detail: e.details });
    });
  }, [bridge]);

  const saveArchive = async () => {
    setNote(null);
    try {
      const bytes = await buildArchive(project);
      const name = `${sanitizeOutputName(project.name).replace(/\.mp4$/, '')}.ffproj`;
      if (bridge) await bridge.saveProjectFile(name, bytes);
      else downloadBytes(bytes, name, 'application/zip');
      setNote(`Project archive saved (${formatBytes(bytes.byteLength)}). Keep it as your backup, or open it in the desktop app to render.`);
    } catch (e) {
      setNote(`Could not create the archive: ${errorMessage(e)}`);
    }
  };

  const startRender = async () => {
    if (!bridge) return;
    setNote(null);
    try {
      const picked = await bridge.chooseOutputFile(sanitizeOutputName(project.exportSettings.fileName || project.name));
      if (!picked) return;
      const archive = await buildArchive(project);
      const { jobId } = await bridge.startRender({ archive, outputToken: picked.token });
      setJob({
        id: jobId,
        state: 'running',
        fraction: 0,
        message: 'Starting…',
        frame: 0,
        total: frames,
        startedAt: 0,
        token: picked.token,
      });
    } catch (e) {
      setNote(errorMessage(e));
    }
  };

  const eta = job && job.state === 'running' ? (job.etaMs ?? null) : null;

  return (
    <div className="export">
      <h3>Format</h3>
      <SelectField
        label="Resolution preset"
        value={project.exportSettings.preset}
        options={EXPORT_PRESETS}
        onChange={(preset) => applyExport({ preset })}
      />
      <SelectField
        label="Aspect ratio"
        value={project.exportSettings.aspect}
        options={ASPECTS}
        onChange={(aspect) => applyExport({ aspect })}
      />
      <SelectField
        label="Frame rate"
        value={String(project.fps) as '30'}
        options={FPS_VALUES.map(String) as ['30']}
        onChange={(fps) => applyExport({ fps: Number(fps) })}
      />
      <NumberField
        label="Quality (lower CRF = better)"
        value={project.exportSettings.crf}
        min={14}
        max={35}
        onChange={(crf) => apply((p) => ({ ...p, exportSettings: { ...p.exportSettings, crf } }), 'crf')}
      />
      <NumberField
        label="Render scale (adaptive quality)"
        value={project.renderSettings.scale}
        min={0.25}
        max={1}
        step={0.05}
        onChange={(scale) => apply((p) => ({ ...p, renderSettings: { ...p.renderSettings, scale } }), 'scale')}
      />
      <TextField
        label="Output file name"
        value={project.exportSettings.fileName}
        maxLength={100}
        onChange={(fileName) => apply((p) => ({ ...p, exportSettings: { ...p.exportSettings, fileName: fileName || 'video' } }), 'fname')}
      />
      <p className="summary" aria-live="polite">
        {project.canvas.width}×{project.canvas.height} · {project.fps} fps · H.264 + AAC · {(totalMs / 1000).toFixed(1)} s ·{' '}
        <strong>{frames.toLocaleString()} frames</strong>
      </p>
      {heavy && (
        <p className="warn" role="status">
          ⚠ This is a long or high-resolution export. It will use a lot of CPU and take a while; consider a lower resolution or render scale
          first.
        </p>
      )}
      {profile.lowResourceMode && (
        <p className="hint">Low-resource mode is on for this device: previews are lighter and only one export runs at a time.</p>
      )}

      <h3>Render</h3>
      {bridge && profile.canRenderLocally ? (
        <>
          <div className="export-actions">
            <button type="button" className="btn primary" onClick={() => void startRender()} disabled={job?.state === 'running'}>
              Export MP4…
            </button>
            {job?.state === 'running' && (
              <button type="button" className="btn danger" onClick={() => void bridge.cancelRender(job.id)}>
                Cancel
              </button>
            )}
            {job?.state === 'done' && (
              <button type="button" className="btn" onClick={() => void bridge.revealOutput(job.token)}>
                Show in folder
              </button>
            )}
          </div>
          {job && (
            <div className="job" role="status" aria-live="polite">
              <progress max={1} value={job.fraction} aria-label="Export progress" />
              <span>
                {Math.round(job.fraction * 100)}% · {job.message}
                {eta !== null && ` · about ${Math.ceil(eta / 1000)} s left (estimated from current speed)`}
              </span>
              {job.state === 'error' && (
                <p className="error">
                  {job.message}
                  {job.detail ? ` — ${job.detail}` : ''}
                </p>
              )}
              {job.state === 'cancelled' && <p className="hint">Export cancelled. Your project was not changed.</p>}
              {job.state === 'done' && job.detail && <pre className="detail">{job.detail}</pre>}
            </div>
          )}
        </>
      ) : (
        <div className="notice" role="note">
          <strong>Local rendering is not available in this browser.</strong>
          <p>{profile.renderBlockedReason ?? 'The renderer was not detected.'}</p>
          <ol>
            <li>Save the project archive below.</li>
            <li>
              Open it in the FrameForge desktop app (File → Open) or run <code>frameforge-render project.ffproj out.mp4</code>.
            </li>
          </ol>
        </div>
      )}
      <div className="export-actions">
        <button type="button" className="btn" onClick={() => void saveArchive()}>
          Download project archive (.ffproj)
        </button>
      </div>
      {note && <p role="status">{note}</p>}
    </div>
  );
}
