import { useEffect, useState } from 'react';
import type { Project } from '@frameforge/project-schema';
import { useDeviceProfile } from './platform';
import { useSettings } from './settings';
import { repo } from './storage/repo';
import { Dashboard } from './views/Dashboard';
import { Editor } from './views/Editor';
import { errorMessage } from './util';

type Route = { name: 'dashboard' } | { name: 'editor'; id: string };

function parseHash(): Route {
  const m = /^#\/p\/([A-Za-z0-9_-]{1,64})$/.exec(window.location.hash);
  return m ? { name: 'editor', id: m[1]! } : { name: 'dashboard' };
}

type Loaded =
  | { kind: 'loading' }
  | { kind: 'ready'; project: Project }
  | {
      kind: 'problem';
      message: string;
      recovered: Project | null;
      dropped: string[];
      backups: { key: string; savedAt: string }[];
      id: string;
    };

export function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [settings, updateSettings] = useSettings();
  const { profile, renderer } = useDeviceProfile(settings.lowResource);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (r: Route) => {
    window.location.hash = r.name === 'editor' ? `#/p/${r.id}` : '#/';
  };

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div id="main">
        {route.name === 'dashboard' ? (
          <Dashboard
            profile={profile}
            renderer={renderer}
            settings={settings}
            onSettings={updateSettings}
            onOpen={(id) => go({ name: 'editor', id })}
          />
        ) : (
          <EditorLoader key={route.id} id={route.id} profile={profile} onBack={() => go({ name: 'dashboard' })} />
        )}
      </div>
    </>
  );
}

function EditorLoader({ id, profile, onBack }: { id: string; profile: ReturnType<typeof useDeviceProfile>['profile']; onBack(): void }) {
  const [state, setState] = useState<Loaded>({ kind: 'loading' });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await repo.load(id);
        if (!alive) return;
        if (r.status === 'ok') setState({ kind: 'ready', project: r.project });
        else if (r.status === 'missing')
          setState({
            kind: 'problem',
            message: 'This project was not found on this device.',
            recovered: null,
            dropped: [],
            backups: [],
            id,
          });
        else
          setState({
            kind: 'problem',
            message: 'This project file is damaged.',
            recovered: r.recovered,
            dropped: r.dropped,
            backups: await repo.listBackups(id),
            id,
          });
      } catch (e) {
        if (alive) setState({ kind: 'problem', message: errorMessage(e), recovered: null, dropped: [], backups: [], id });
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (state.kind === 'loading') return <p className="center">Loading project…</p>;
  if (state.kind === 'ready') return <Editor initial={state.project} profile={profile} onBack={onBack} />;
  return (
    <div className="center problem" role="alert">
      <h1>{state.message}</h1>
      {state.recovered && (
        <>
          <p>FrameForge can open a repaired copy. {state.dropped.length ? `Removed: ${state.dropped.join('; ')}.` : ''}</p>
          <button type="button" className="btn primary" onClick={() => setState({ kind: 'ready', project: state.recovered! })}>
            Open repaired copy
          </button>
        </>
      )}
      {state.backups.length > 0 && (
        <div>
          <h2>Restore a backup</h2>
          <ul>
            {state.backups.map((b) => (
              <li key={b.key}>
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    const p = await repo.restoreBackup(b.key);
                    if (p) setState({ kind: 'ready', project: p });
                  }}
                >
                  {new Date(b.savedAt).toLocaleString()}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" className="btn" onClick={onBack}>
        Back to projects
      </button>
    </div>
  );
}
