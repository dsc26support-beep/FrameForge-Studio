import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readArchive } from '@frameforge/asset-manager';
import { duplicateProject, renameProject } from '@frameforge/editor-core';
import { LIMITS, createProject, newId, parseProjectJson, type Project } from '@frameforge/project-schema';
import type { BridgeCapabilities, DeviceProfile } from '@frameforge/render-core';
import { TEMPLATES } from '@frameforge/templates';
import { assetStore, repo, type ProjectMeta } from '../storage/repo';
import { requestPersistence, storageEstimate } from '../storage/db';
import { formatDuration, errorMessage, readFileBytes } from '../util';
import { getBridge } from '../platform';
import type { Settings } from '../settings';

interface Props {
  profile: DeviceProfile;
  renderer: BridgeCapabilities | null;
  settings: Settings;
  onSettings(patch: Partial<Settings>): void;
  onOpen(id: string): void;
}

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b;

export function Dashboard({ profile, renderer, settings, onSettings, onOpen }: Props) {
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [storage, setStorage] = useState<{ usedMB: number; quotaMB: number; persisted: boolean | null } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await repo.list();
        const est = await storageEstimate();
        if (alive) {
          setProjects(list);
          setStorage(est);
        }
      } catch (e) {
        if (alive) {
          setProjects([]);
          setError(
            `Local storage is unavailable: ${errorMessage(e)} You can still import and export project archives, but work will not be saved.`,
          );
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const create = async (project: Project) => {
    try {
      await repo.save(project);
      void requestPersistence();
      onOpen(project.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const importProject = async (file: File | null, native?: Uint8Array, nativeName?: string) => {
    setError(null);
    setInfo(null);
    try {
      const bytes = native ?? (file ? await readFileBytes(file, LIMITS.maxArchiveBytes) : null);
      if (!bytes) return;
      let project: Project;
      const assets = new Map<string, Uint8Array>();
      const warnings: string[] = [];
      if (isZip(bytes)) {
        const r = await readArchive(bytes);
        project = r.project;
        r.assets.forEach((v, k) => assets.set(k, v));
        warnings.push(...r.warnings);
      } else {
        const r = parseProjectJson(new TextDecoder().decode(bytes));
        if (!r.ok) throw new Error(`Not a valid project: ${r.errors[0]?.path}: ${r.errors[0]?.message}`);
        project = r.project;
        if (project.assets.length) warnings.push('This is a bare project file; media was not included and will show as missing.');
      }
      const copy = { ...project, id: newId('prj'), name: project.name.slice(0, LIMITS.maxNameLength) };
      await repo.save(copy);
      for (const [id, data] of assets) await assetStore.put(copy.id, id, data);
      setInfo(`Imported "${copy.name}".${warnings.length ? ` ${warnings.join(' ')}` : ''}`);
      refresh();
      void (file ?? nativeName);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const duplicate = async (meta: ProjectMeta) => {
    try {
      const r = await repo.load(meta.id);
      if (r.status !== 'ok') throw new Error('Open the project and recover it before duplicating.');
      const copy = duplicateProject(r.project);
      await repo.save(copy);
      for (const a of r.project.assets) {
        const data = await assetStore.get(meta.id, a.id);
        if (data) await assetStore.put(copy.id, a.id, data);
      }
      refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const rename = async (meta: ProjectMeta) => {
    const name = window.prompt('Rename project', meta.name);
    if (!name?.trim()) return;
    const r = await repo.load(meta.id);
    if (r.status !== 'ok') return setError('Open the project and recover it before renaming.');
    await repo.save(renameProject(r.project, name));
    refresh();
  };

  const remove = async (meta: ProjectMeta) => {
    if (!window.confirm(`Delete "${meta.name}" from this device? This cannot be undone. Export an archive first if you want a copy.`))
      return;
    await repo.delete(meta.id);
    refresh();
  };

  const filtered = useMemo(
    () => (projects ?? []).filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())),
    [projects, query],
  );
  const bridge = getBridge();

  return (
    <div className="dashboard">
      <header className="dash-head">
        <h1>
          <span className="logo" aria-hidden="true">
            F
          </span>{' '}
          FrameForge Studio
        </h1>
        <button type="button" className="btn" onClick={() => setShowSettings(true)}>
          Settings
        </button>
      </header>

      <section className="status-cards" aria-label="System status">
        <div className="card">
          <h2>Local storage</h2>
          <p>{storage ? `${storage.usedMB} MB used of about ${storage.quotaMB} MB` : 'Usage unknown'}</p>
          <p className="hint">
            Projects are stored in this browser only. Browsers or the OS may clear site data
            {storage?.persisted === false ? ' (persistent storage not granted)' : ''}. Download project archives as backups.
          </p>
        </div>
        <div className="card">
          <h2>Video renderer</h2>
          {renderer ? (
            <p>{renderer.canRender ? '✅ Ready (desktop renderer)' : `⚠ Not ready: ${renderer.problems.join(' ')}`}</p>
          ) : (
            <p>ℹ Not available in the browser. Export a project archive and render it with the desktop app.</p>
          )}
          <p className="hint">
            Device: {profile.class}
            {profile.lowResourceMode ? ' · low-resource mode on' : ''}. {profile.notes.join(' ')}
          </p>
        </div>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {info && (
        <p className="ok" role="status">
          {info}
        </p>
      )}

      <section aria-labelledby="new-h">
        <h2 id="new-h">Start a project</h2>
        <div className="template-grid">
          <button type="button" className="template-card" onClick={() => void create(createProject('Untitled project'))}>
            <strong>Blank project</strong>
            <span>One animated title scene</span>
          </button>
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" className="template-card" onClick={() => void create(t.build())}>
              <strong>{t.name}</strong>
              <span>{t.description}</span>
              <em>{t.aspect}</em>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="proj-h">
        <div className="proj-head">
          <h2 id="proj-h">Your projects</h2>
          <label className="search">
            <span className="sr-only">Search projects</span>
            <input type="search" placeholder="Search projects" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              if (bridge) {
                const f = await bridge.openProjectFile();
                if (f) await importProject(null, f.bytes, f.name);
              } else fileInput.current?.click();
            }}
          >
            Import project…
          </button>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept=".ffproj,.zip,.json,application/zip,application/json"
            onChange={(e) => {
              void importProject(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
        </div>
        {projects === null ? (
          <p>Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="hint">{projects.length ? 'No projects match your search.' : 'No projects yet. Pick a template above to begin.'}</p>
        ) : (
          <ul className="project-list">
            {filtered.map((p) => (
              <li key={p.id} className="project">
                <button type="button" className="project-open" onClick={() => onOpen(p.id)}>
                  <strong>{p.name}</strong>
                  <span>
                    {p.sceneCount} scene{p.sceneCount === 1 ? '' : 's'} · {formatDuration(p.durationMs)} · edited{' '}
                    {new Date(p.updatedAt).toLocaleString()}
                  </span>
                </button>
                <div className="project-actions">
                  <button type="button" className="btn" onClick={() => void rename(p)} aria-label={`Rename ${p.name}`}>
                    Rename
                  </button>
                  <button type="button" className="btn" onClick={() => void duplicate(p)} aria-label={`Duplicate ${p.name}`}>
                    Duplicate
                  </button>
                  <button type="button" className="btn danger" onClick={() => void remove(p)} aria-label={`Delete ${p.name}`}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <dialog className="modal" open={showSettings} aria-labelledby="set-h">
        <h2 id="set-h">Settings</h2>
        <label className="field">
          Interface motion
          <select value={settings.uiMotion} onChange={(e) => onSettings({ uiMotion: e.target.value as Settings['uiMotion'] })}>
            <option value="system">Follow system setting</option>
            <option value="reduce">Reduce motion</option>
            <option value="full">Full motion</option>
          </select>
        </label>
        <p className="hint">Applies to the editor interface only. Exported videos always keep their animations.</p>
        <label className="field">
          Low-resource mode
          <select value={settings.lowResource} onChange={(e) => onSettings({ lowResource: e.target.value as Settings['lowResource'] })}>
            <option value="auto">Automatic (detected)</option>
            <option value="on">Always on</option>
            <option value="off">Always off</option>
          </select>
        </label>
        <label className="field">
          Theme
          <select value={settings.theme} onChange={(e) => onSettings({ theme: e.target.value as Settings['theme'] })}>
            <option value="system">Follow system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        {bridge && 'chooseDefaultFolder' in bridge && (
          <>
            <h3>Desktop</h3>
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const r = await (
                    bridge as unknown as { chooseDefaultFolder(): Promise<{ displayName: string } | null> }
                  ).chooseDefaultFolder();
                  if (r) setInfo(`Default export folder set to "${r.displayName}".`);
                }}
              >
                Choose default export folder…
              </button>
            </div>
          </>
        )}
        <h3>Cloud sync</h3>
        <p className="hint">
          Off. FrameForge never uploads projects or media unless you set up the optional Google Apps Script backend (see
          docs/APPS_SCRIPT.md). No telemetry is collected.
        </p>
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={() => setShowSettings(false)}>
            Close
          </button>
        </div>
      </dialog>
    </div>
  );
}
