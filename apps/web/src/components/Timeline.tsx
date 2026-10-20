import { useCallback, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { snapDuration } from '@frameforge/editor-core';
import type { Project } from '@frameforge/project-schema';
import { computeTimeline, formatTimecode, msToFrame } from '@frameforge/render-core';

interface Props {
  project: Project;
  selectedSceneId: string | null;
  timeMs: number;
  playing: boolean;
  onSelectScene(id: string): void;
  onSeek(ms: number): void;
  onTogglePlay(): void;
  onDuration(id: string, ms: number, final: boolean): void;
  onMoveScene(from: number, to: number): void;
  onSelectAudio?(id: string): void;
}

const BASE_PX_PER_SEC = 70;

export function Timeline({
  project,
  selectedSceneId,
  timeMs,
  playing,
  onSelectScene,
  onSeek,
  onTogglePlay,
  onDuration,
  onMoveScene,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const trackRef = useRef<HTMLDivElement>(null);
  const timeline = useMemo(() => computeTimeline(project), [project]);
  const pxPerMs = (BASE_PX_PER_SEC * zoom) / 1000;
  const width = Math.max(300, timeline.totalMs * pxPerMs + 40);

  const seekFromPointer = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      onSeek(Math.max(0, Math.min(timeline.totalMs, x / pxPerMs)));
    },
    [onSeek, pxPerMs, timeline.totalMs],
  );

  const onRulerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromPointer(e);
  };
  const onRulerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromPointer(e);
  };

  const startResize = (e: PointerEvent<HTMLDivElement>, id: string, startDuration: number) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const el = e.currentTarget;
    const move = (ev: globalThis.PointerEvent) =>
      onDuration(id, snapDuration(startDuration + (ev.clientX - startX) / pxPerMs, project.fps), false);
    const up = (ev: globalThis.PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      onDuration(id, snapDuration(startDuration + (ev.clientX - startX) / pxPerMs, project.fps), true);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const onHandleKey = (e: KeyboardEvent<HTMLDivElement>, id: string, d: number) => {
    const step = e.shiftKey ? 1000 : 100;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onDuration(id, d + step, true);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onDuration(id, d - step, true);
    }
  };

  const onTrackKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const frameMs = 1000 / project.fps;
    if (e.key === 'ArrowRight') onSeek(Math.min(timeline.totalMs, timeMs + (e.shiftKey ? 1000 : frameMs)));
    else if (e.key === 'ArrowLeft') onSeek(Math.max(0, timeMs - (e.shiftKey ? 1000 : frameMs)));
    else if (e.key === 'Home') onSeek(0);
    else if (e.key === 'End') onSeek(timeline.totalMs);
    else return;
    e.preventDefault();
  };

  return (
    <section className="timeline" aria-label="Timeline">
      <div className="timeline-bar">
        <button type="button" className="btn" onClick={() => onSeek(0)} aria-label="Go to start">
          ⏮
        </button>
        <button type="button" className="btn primary" onClick={onTogglePlay} aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing}>
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <output className="timecode" aria-live="off">
          {formatTimecode(timeMs)} / {formatTimecode(timeline.totalMs)} · frame {msToFrame(timeMs, project.fps)}
        </output>
        <label className="zoom">
          Zoom
          <input type="range" min={0.4} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        </label>
      </div>
      <div className="timeline-scroll">
        <div
          className="timeline-track"
          style={{ width }}
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Playhead"
          aria-valuemin={0}
          aria-valuemax={Math.round(timeline.totalMs)}
          aria-valuenow={Math.round(timeMs)}
          aria-valuetext={`${formatTimecode(timeMs)}, frame ${msToFrame(timeMs, project.fps)}`}
          onKeyDown={onTrackKey}
        >
          <div className="ruler" onPointerDown={onRulerDown} onPointerMove={onRulerMove}>
            {Array.from({ length: Math.floor(timeline.totalMs / 1000) + 1 }, (_, s) => (
              <span key={s} className="tick" style={{ left: s * 1000 * pxPerMs }}>
                {s}s
              </span>
            ))}
          </div>
          <div className="scene-row">
            {project.scenes.map((scene, i) => {
              const t = timeline.scenes[i]!;
              return (
                <div
                  key={scene.id}
                  className={`scene-block${scene.id === selectedSceneId ? ' selected' : ''}`}
                  style={{ left: t.startMs * pxPerMs, width: Math.max(28, scene.durationMs * pxPerMs) }}
                >
                  <button
                    type="button"
                    className="scene-hit"
                    onClick={() => onSelectScene(scene.id)}
                    aria-pressed={scene.id === selectedSceneId}
                  >
                    <span className="scene-name">{scene.name}</span>
                    <span className="scene-dur">{(scene.durationMs / 1000).toFixed(1)}s</span>
                  </button>
                  <div className="scene-actions">
                    <button
                      type="button"
                      aria-label={`Move ${scene.name} earlier`}
                      disabled={i === 0}
                      onClick={() => onMoveScene(i, i - 1)}
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${scene.name} later`}
                      disabled={i === project.scenes.length - 1}
                      onClick={() => onMoveScene(i, i + 1)}
                    >
                      ▶
                    </button>
                  </div>
                  <div
                    className="resize-handle"
                    role="slider"
                    tabIndex={0}
                    aria-label={`Duration of ${scene.name}`}
                    aria-valuemin={100}
                    aria-valuemax={600000}
                    aria-valuenow={scene.durationMs}
                    aria-valuetext={`${(scene.durationMs / 1000).toFixed(1)} seconds`}
                    onPointerDown={(e) => startResize(e, scene.id, scene.durationMs)}
                    onKeyDown={(e) => onHandleKey(e, scene.id, scene.durationMs)}
                  />
                </div>
              );
            })}
          </div>
          {project.audioTracks.map((a) => {
            const asset = project.assets.find((x) => x.id === a.assetId);
            const len = a.durationMs ?? asset?.durationMs ?? Math.max(0, timeline.totalMs - a.startMs);
            return (
              <div key={a.id} className="audio-row">
                <div
                  className={`audio-block${a.muted ? ' muted' : ''}`}
                  style={{ left: a.startMs * pxPerMs, width: Math.max(24, Math.min(len, timeline.totalMs - a.startMs) * pxPerMs) }}
                  title={a.name}
                >
                  ♪ {a.name}
                </div>
              </div>
            );
          })}
          <div className="playhead" style={{ left: timeMs * pxPerMs }} aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
