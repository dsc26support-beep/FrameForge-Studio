import { newId } from './ids';
import { SCHEMA_VERSION } from './limits';
import { projectSchema, sceneSchema, type ExportSettings, type Project, type Scene, type SceneElement } from './schema';

export const PRESET_SHORT_SIDE = { '480p': 480, '720p': 720, '1080p': 1080 } as const;

/** Canvas size for an export preset and aspect ratio (always even numbers). */
export function canvasFor(preset: ExportSettings['preset'], aspect: ExportSettings['aspect']): { width: number; height: number } {
  const s = PRESET_SHORT_SIDE[preset];
  switch (aspect) {
    case '16:9':
      return { width: Math.round((s * 16) / 9 / 2) * 2, height: s };
    case '9:16':
      return { width: s, height: Math.round((s * 16) / 9 / 2) * 2 };
    case '1:1':
      return { width: s, height: s };
  }
}

export function createScene(partial: Partial<Scene> = {}): Scene {
  return sceneSchema.parse({ id: newId('scn'), name: 'Scene', ...partial });
}

export function createTextElement(partial: Partial<Extract<SceneElement, { type: 'text' }>> = {}): SceneElement {
  return { ...(sceneElementDefaults('text') as SceneElement), ...partial, id: partial.id ?? newId('el'), type: 'text' } as SceneElement;
}

function sceneElementDefaults(type: 'text' | 'shape'): unknown {
  const scene = sceneSchema.parse({
    id: 'tmp',
    elements: [type === 'text' ? { id: 'tmp', type: 'text' } : { id: 'tmp', type: 'shape' }],
  });
  return scene.elements[0];
}

export function createShapeElement(partial: Partial<Extract<SceneElement, { type: 'shape' }>> = {}): SceneElement {
  return { ...(sceneElementDefaults('shape') as SceneElement), ...partial, id: partial.id ?? newId('el'), type: 'shape' } as SceneElement;
}

export function createProject(name = 'Untitled project', overrides: Partial<Project> = {}): Project {
  const now = new Date().toISOString();
  const base = projectSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: newId('prj'),
    name,
    createdAt: now,
    updatedAt: now,
    scenes: [
      {
        id: newId('scn'),
        name: 'Title',
        durationMs: 3000,
        background: { type: 'gradient', from: '#101828', to: '#3b2a8c', angle: 135 },
        elements: [
          {
            id: newId('el'),
            type: 'text',
            name: 'Headline',
            text: 'Hello, FrameForge',
            y: 50,
            fontSize: 8,
            animation: { preset: 'slideUp', durationMs: 700, delayMs: 200 },
          },
        ],
      },
    ],
  });
  return { ...base, ...overrides };
}
