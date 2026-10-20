import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addAudioTrack,
  addElement,
  addScene,
  applyExportSettings,
  deleteElement,
  deleteScene,
  duplicateElement,
  duplicateScene,
  moveElement,
  moveScene,
  registerAsset,
  removeAsset,
  renameProject,
  setSceneDuration,
  updateElement,
  updateScene,
} from '@frameforge/editor-core';
import { createShapeElement, createTextElement, newId, type Asset, type Project, type SceneElement } from '@frameforge/project-schema';
import { computeTimeline, type DeviceProfile } from '@frameforge/render-core';
import { ExportPanel } from '../components/ExportPanel';
import { Inspector } from '../components/Inspector';
import { MediaLibrary } from '../components/MediaLibrary';
import { Preview } from '../components/Preview';
import { Timeline } from '../components/Timeline';
import { assetStore } from '../storage/repo';
import { useEditor } from '../useEditor';

type Tab = 'scenes' | 'edit' | 'media' | 'export';

interface Props {
  initial: Project;
  profile: DeviceProfile;
  onBack(): void;
}

export function Editor({ initial, profile, onBack }: Props) {
  const ed = useEditor(initial);
  const { project, apply } = ed;
  const [sceneId, setSceneId] = useState<string>(project.scenes[0]?.id ?? '');
  const [elementId, setElementId] = useState<string | null>(null);
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<Tab>('scenes');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [assetUrls, setAssetUrls] = useState<Map<string, string>>(new Map());
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const urlsRef = useRef(assetUrls);
  useEffect(() => {
    urlsRef.current = assetUrls;
  });

  const timeline = useMemo(() => computeTimeline(project), [project]);
  const scene = project.scenes.find((s) => s.id === sceneId) ?? project.scenes[0]!;
  const element = scene.elements.find((e) => e.id === elementId) ?? null;

  // Load asset blobs lazily as object URLs; revoke on unmount to keep memory bounded.
  useEffect(() => {
    let alive = true;
    (async () => {
      const next = new Map(urlsRef.current);
      const miss = new Set<string>();
      for (const a of project.assets) {
        if (next.has(a.id)) continue;
        const bytes = await assetStore.get(project.id, a.id).catch(() => null);
        if (!bytes) miss.add(a.id);
        else next.set(a.id, URL.createObjectURL(new Blob([bytes as BlobPart], { type: a.mime })));
      }
      for (const a of project.assets) if (!next.has(a.id)) miss.add(a.id);
      if (alive) {
        setAssetUrls(next);
        setMissing(miss);
      }
    })();
    return () => {
      alive = false;
    };
  }, [project.assets, project.id]);
  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Playback loop driven by rAF; the preview is seeked, never free-running, so it matches the renderer.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setTimeMs((t) => {
        const n = t + dt;
        if (n >= timeline.totalMs) {
          setPlaying(false);
          return timeline.totalMs;
        }
        return n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, timeline.totalMs]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p && timeMs >= timeline.totalMs) setTimeMs(0);
      return !p;
    });
  }, [timeMs, timeline.totalMs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) ed.redo();
        else ed.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        ed.redo();
      } else if (e.key === ' ' && t?.tagName !== 'BUTTON') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ed, togglePlay]);

  const selectScene = (id: string) => {
    setSceneId(id);
    setElementId(null);
    const t = timeline.scenes.find((s) => s.sceneId === id);
    if (t) setTimeMs(t.startMs);
  };

  const addText = () => {
    const el = createTextElement({
      text: 'New text',
      y: 50,
      animation: { preset: 'fadeIn', delayMs: 0, durationMs: 500, easing: 'easeOut', exit: 'none', exitMs: 400 },
    } as never);
    apply((p) => addElement(p, scene.id, el));
    setElementId(el.id);
    setTab('edit');
  };
  const addShape = () => {
    const el = createShapeElement({ fill: project.brand.primary, w: 25, h: 25 });
    apply((p) => addElement(p, scene.id, el));
    setElementId(el.id);
    setTab('edit');
  };

  const importImageElement = (a: Asset) => {
    const base = createShapeElement();
    const el = {
      ...base,
      id: newId('el'),
      type: 'image',
      assetId: a.id,
      fit: 'contain',
      radius: 0,
      name: a.name,
      w: 40,
      h: 40,
    } as unknown as SceneElement;
    apply((p) => addElement(p, scene.id, el));
    setElementId(el.id);
    setTab('edit');
  };

  const onDuration = (id: string, ms: number, final: boolean) => apply((p) => setSceneDuration(p, id, ms), final ? null : `dur:${id}`);

  const panelScenes = (
    <div className="panel-body">
      <div className="btn-row">
        <button
          type="button"
          className="btn"
          onClick={() => {
            apply((p) => addScene(p));
          }}
        >
          + Scene
        </button>
        <button type="button" className="btn" onClick={() => apply((p) => duplicateScene(p, scene.id))}>
          Duplicate
        </button>
        <button
          type="button"
          className="btn danger"
          disabled={project.scenes.length <= 1}
          onClick={() => {
            if (window.confirm(`Delete "${scene.name}"?`)) apply((p) => deleteScene(p, scene.id));
          }}
        >
          Delete
        </button>
      </div>
      <ol className="scene-list" aria-label="Scenes">
        {project.scenes.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className={`scene-item${s.id === scene.id ? ' selected' : ''}`}
              aria-current={s.id === scene.id}
              onClick={() => selectScene(s.id)}
            >
              <span className="num">{i + 1}</span>
              <span className="nm">{s.name}</span>
              <span className="du">{(s.durationMs / 1000).toFixed(1)}s</span>
            </button>
            <span className="reorder">
              <button
                type="button"
                aria-label={`Move ${s.name} up`}
                disabled={i === 0}
                onClick={() => apply((p) => moveScene(p, i, i - 1))}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${s.name} down`}
                disabled={i === project.scenes.length - 1}
                onClick={() => apply((p) => moveScene(p, i, i + 1))}
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
      {scene.mode === 'structured' && (
        <>
          <h3>Elements in “{scene.name}”</h3>
          <div className="btn-row">
            <button type="button" className="btn" onClick={addText}>
              + Text
            </button>
            <button type="button" className="btn" onClick={addShape}>
              + Shape
            </button>
            <button type="button" className="btn" onClick={() => setTab('media')}>
              + Image
            </button>
          </div>
          <ul className="element-list">
            {scene.elements.length === 0 && <li className="hint">No elements yet.</li>}
            {scene.elements.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className={`element-item${e.id === elementId ? ' selected' : ''}`}
                  aria-pressed={e.id === elementId}
                  onClick={() => {
                    setElementId(e.id);
                    setTab('edit');
                  }}
                >
                  {e.type === 'text'
                    ? `T  ${e.text.slice(0, 24) || '(empty)'}`
                    : e.type === 'shape'
                      ? `◼ ${e.name || e.shape}`
                      : `🖼 ${e.name || 'Image'}`}
                </button>
                <span className="reorder">
                  <button type="button" aria-label="Move element backward" onClick={() => apply((p) => moveElement(p, scene.id, e.id, -1))}>
                    ↓
                  </button>
                  <button type="button" aria-label="Move element forward" onClick={() => apply((p) => moveElement(p, scene.id, e.id, 1))}>
                    ↑
                  </button>
                  <button type="button" aria-label="Duplicate element" onClick={() => apply((p) => duplicateElement(p, scene.id, e.id))}>
                    ⧉
                  </button>
                  <button
                    type="button"
                    aria-label="Delete element"
                    onClick={() => {
                      apply((p) => deleteElement(p, scene.id, e.id));
                      if (e.id === elementId) setElementId(null);
                    }}
                  >
                    🗑
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );

  const panelEdit = (
    <div className="panel-body">
      <Inspector project={project} scene={scene} element={element} apply={apply} ops={{ updateScene, updateElement }} />
    </div>
  );
  const panelMedia = (
    <div className="panel-body">
      <MediaLibrary
        project={project}
        assetUrls={assetUrls}
        missing={missing}
        onImported={(a) => apply((p) => registerAsset(p, a))}
        onUseImage={importImageElement}
        onUseBackground={(a) =>
          apply((p) => updateScene(p, scene.id, { background: { type: 'image', assetId: a.id, fit: 'cover', tint: null } }))
        }
        onUseAudio={(a) => apply((p) => addAudioTrack(p, a.id, a.name))}
        onRemove={(a) => {
          if (window.confirm(`Remove "${a.name}" and everything that uses it?`)) {
            apply((p) => removeAsset(p, a.id));
            void assetStore.delete(project.id, a.id);
          }
        }}
      />
    </div>
  );
  const panelExport = (
    <div className="panel-body">
      <ExportPanel
        project={project}
        profile={profile}
        apply={apply}
        applyExport={(patch) => apply((p) => applyExportSettings(p, patch as never))}
      />
    </div>
  );

  const tabs: [Tab, string][] = [
    ['scenes', 'Scenes'],
    ['edit', 'Edit'],
    ['media', 'Media'],
    ['export', 'Export'],
  ];

  return (
    <div className="editor" data-tab={tab}>
      <header className="topbar">
        <button
          type="button"
          className="btn"
          onClick={() => {
            void ed.flush().then(onBack);
          }}
        >
          ← Projects
        </button>
        <label className="title-edit">
          <span className="sr-only">Project name</span>
          <input
            type="text"
            value={project.name}
            maxLength={120}
            onChange={(e) => apply((p) => renameProject(p, e.target.value || p.name), 'name')}
            onBlur={(e) => {
              if (!e.target.value.trim()) apply((p) => p);
            }}
          />
        </label>
        <div className="topbar-actions">
          <button type="button" className="btn" onClick={ed.undo} disabled={!ed.canUndo} aria-label="Undo">
            ↶
          </button>
          <button type="button" className="btn" onClick={ed.redo} disabled={!ed.canRedo} aria-label="Redo">
            ↷
          </button>
          <span className={`save-state ${ed.save.kind}`} role="status">
            {ed.save.kind === 'saved' ? 'Saved on this device' : ed.save.kind === 'saving' ? 'Saving…' : `Not saved: ${ed.save.message}`}
          </span>
        </div>
      </header>
      <main className="workspace">
        <nav className="tabs" aria-label="Panels">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'active' : ''}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <aside className="side" aria-label={`${tab} panel`}>
          {tab === 'scenes' && panelScenes}
          {tab === 'edit' && panelEdit}
          {tab === 'media' && panelMedia}
          {tab === 'export' && panelExport}
        </aside>
        <section className="stage" aria-label="Preview">
          <Preview project={project} assetUrls={assetUrls} timeMs={timeMs} quality={profile.previewScale} onWarnings={setWarnings} />
          {warnings.length > 0 && (
            <details className="preview-warnings">
              <summary>
                ⚠ {warnings.length} warning{warnings.length > 1 ? 's' : ''}
              </summary>
              <ul>
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          <Timeline
            project={project}
            selectedSceneId={scene.id}
            timeMs={timeMs}
            playing={playing}
            onSelectScene={selectScene}
            onSeek={(ms) => {
              setPlaying(false);
              setTimeMs(ms);
              const t = computeTimeline(project).scenes.findLast((s) => ms >= s.startMs);
              if (t && t.sceneId !== sceneId) {
                setSceneId(t.sceneId);
                setElementId(null);
              }
            }}
            onTogglePlay={togglePlay}
            onDuration={onDuration}
            onMoveScene={(f, t) => apply((p) => moveScene(p, f, t))}
          />
        </section>
      </main>
    </div>
  );
}
