import {
  LIMITS,
  canvasFor,
  createScene,
  newId,
  type Asset,
  type AudioTrack,
  type ExportSettings,
  type Project,
  type Scene,
  type SceneElement,
} from '@frameforge/project-schema';

/** All project edits are pure functions: (project, args) => new project. */
const touch = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });
const mapScene = (p: Project, id: string, fn: (s: Scene) => Scene): Project =>
  touch({ ...p, scenes: p.scenes.map((s) => (s.id === id ? fn(s) : s)) });
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function renameProject(p: Project, name: string): Project {
  const n = name.trim().slice(0, LIMITS.maxNameLength);
  return n ? touch({ ...p, name: n }) : p;
}

export function addScene(p: Project, partial: Partial<Scene> = {}, index = p.scenes.length): Project {
  if (p.scenes.length >= LIMITS.maxScenes) return p;
  const scene = createScene({ name: `Scene ${p.scenes.length + 1}`, background: { type: 'color', color: p.brand.background }, ...partial });
  const scenes = [...p.scenes];
  scenes.splice(clamp(index, 0, scenes.length), 0, scene);
  return touch({ ...p, scenes });
}

export function duplicateScene(p: Project, id: string): Project {
  const i = p.scenes.findIndex((s) => s.id === id);
  const src = p.scenes[i];
  if (!src || p.scenes.length >= LIMITS.maxScenes) return p;
  const copy: Scene = {
    ...src,
    id: newId('scn'),
    name: `${src.name} copy`,
    elements: src.elements.map((e) => ({ ...e, id: newId('el') })),
  };
  const scenes = [...p.scenes];
  scenes.splice(i + 1, 0, copy);
  return touch({ ...p, scenes });
}

export function deleteScene(p: Project, id: string): Project {
  if (p.scenes.length <= 1) return p; // a project always keeps one scene
  return touch({ ...p, scenes: p.scenes.filter((s) => s.id !== id) });
}

export function moveScene(p: Project, from: number, to: number): Project {
  if (from === to || from < 0 || to < 0 || from >= p.scenes.length || to >= p.scenes.length) return p;
  const scenes = [...p.scenes];
  const [s] = scenes.splice(from, 1);
  scenes.splice(to, 0, s!);
  return touch({ ...p, scenes });
}

export function updateScene(p: Project, id: string, patch: Partial<Omit<Scene, 'id'>>): Project {
  return mapScene(p, id, (s) => ({ ...s, ...patch }));
}

export function setSceneDuration(p: Project, id: string, ms: number): Project {
  return updateScene(p, id, { durationMs: Math.round(clamp(ms, LIMITS.minSceneMs, LIMITS.maxSceneMs)) });
}

export function addElement(p: Project, sceneId: string, el: SceneElement): Project {
  return mapScene(p, sceneId, (s) => (s.elements.length >= LIMITS.maxElementsPerScene ? s : { ...s, elements: [...s.elements, el] }));
}

export function updateElement(p: Project, sceneId: string, elId: string, patch: Partial<SceneElement>): Project {
  return mapScene(p, sceneId, (s) => ({
    ...s,
    elements: s.elements.map((e) => (e.id === elId ? ({ ...e, ...patch } as SceneElement) : e)),
  }));
}

export function deleteElement(p: Project, sceneId: string, elId: string): Project {
  return mapScene(p, sceneId, (s) => ({ ...s, elements: s.elements.filter((e) => e.id !== elId) }));
}

export function duplicateElement(p: Project, sceneId: string, elId: string): Project {
  return mapScene(p, sceneId, (s) => {
    const e = s.elements.find((x) => x.id === elId);
    if (!e || s.elements.length >= LIMITS.maxElementsPerScene) return s;
    return { ...s, elements: [...s.elements, { ...e, id: newId('el'), x: clamp(e.x + 3, 0, 100), y: clamp(e.y + 3, 0, 100) }] };
  });
}

export function moveElement(p: Project, sceneId: string, elId: string, delta: -1 | 1): Project {
  return mapScene(p, sceneId, (s) => {
    const i = s.elements.findIndex((e) => e.id === elId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= s.elements.length) return s;
    const els = [...s.elements];
    [els[i], els[j]] = [els[j]!, els[i]!];
    return { ...s, elements: els };
  });
}

/** Applies an export preset/aspect/fps and resizes the canvas accordingly. */
export function applyExportSettings(p: Project, patch: Partial<ExportSettings> & { fps?: Project['fps'] }): Project {
  const { fps, ...rest } = patch;
  const exportSettings = { ...p.exportSettings, ...rest };
  const canvas = canvasFor(exportSettings.preset, exportSettings.aspect);
  return touch({ ...p, exportSettings, canvas, fps: fps ?? p.fps });
}

export function registerAsset(p: Project, asset: Asset): Project {
  if (p.assets.some((a) => a.id === asset.id)) return p;
  return touch({ ...p, assets: [...p.assets, asset] });
}

/** Removes an asset and everything that referenced it. */
export function removeAsset(p: Project, assetId: string): Project {
  return touch({
    ...p,
    assets: p.assets.filter((a) => a.id !== assetId),
    audioTracks: p.audioTracks.filter((t) => t.assetId !== assetId),
    scenes: p.scenes.map((s) => ({
      ...s,
      elements: s.elements.filter((e) => !(e.type === 'image' && e.assetId === assetId)),
      background:
        s.background.type === 'image' && s.background.assetId === assetId ? { type: 'color', color: p.brand.background } : s.background,
    })),
  });
}

export function addAudioTrack(p: Project, assetId: string, name: string): Project {
  if (p.audioTracks.length >= LIMITS.maxAudioTracks) return p;
  const t: AudioTrack = {
    id: newId('aud'),
    name: name.slice(0, LIMITS.maxNameLength),
    assetId,
    startMs: 0,
    trimStartMs: 0,
    durationMs: null,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    muted: false,
  };
  return touch({ ...p, audioTracks: [...p.audioTracks, t] });
}

export function updateAudioTrack(p: Project, id: string, patch: Partial<Omit<AudioTrack, 'id'>>): Project {
  return touch({ ...p, audioTracks: p.audioTracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
}

export function removeAudioTrack(p: Project, id: string): Project {
  return touch({ ...p, audioTracks: p.audioTracks.filter((t) => t.id !== id) });
}

export function duplicateProject(p: Project, newName?: string): Project {
  const now = new Date().toISOString();
  return { ...p, id: newId('prj'), name: (newName ?? `${p.name} copy`).slice(0, LIMITS.maxNameLength), createdAt: now, updatedAt: now };
}
