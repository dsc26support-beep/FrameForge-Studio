import { SCHEMA_VERSION } from './limits';
import { newId } from './ids';

export interface MigrationResult {
  data: unknown;
  migratedFrom: number | null;
  warnings: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Step migrations. Each function upgrades from version N to N + 1.
 * Version 0 is the legacy prototype shape: `{ version: 0, title, scenes: [{ duration (seconds), text, bg }] }`.
 */
const steps: Record<number, (input: Record<string, unknown>, warnings: string[]) => Record<string, unknown>> = {
  0: (input, warnings) => {
    const now = new Date().toISOString();
    const scenes = Array.isArray(input.scenes) ? input.scenes : [];
    warnings.push('Migrated project from legacy version 0.');
    return {
      schemaVersion: 1,
      id: typeof input.id === 'string' ? input.id : newId('prj'),
      name: typeof input.title === 'string' && input.title.trim() ? input.title : 'Imported project',
      createdAt: now,
      updatedAt: now,
      scenes: scenes.filter(isRecord).map((s) => ({
        id: newId('scn'),
        name: typeof s.name === 'string' ? s.name : 'Scene',
        durationMs: Math.round((typeof s.duration === 'number' ? s.duration : 3) * 1000),
        background: { type: 'color', color: typeof s.bg === 'string' ? s.bg : '#101828' },
        elements: typeof s.text === 'string' ? [{ id: newId('el'), type: 'text', text: s.text, animation: { preset: 'fadeIn' } }] : [],
      })),
    };
  },
};

/** Upgrades arbitrary parsed JSON to the current schema version. Never mutates the input. */
export function migrateProject(raw: unknown): MigrationResult {
  const warnings: string[] = [];
  if (!isRecord(raw)) return { data: raw, migratedFrom: null, warnings };
  let current: Record<string, unknown> = { ...raw };
  const declared = current.schemaVersion ?? current.version ?? 0;
  const startVersion = typeof declared === 'number' && Number.isInteger(declared) ? declared : -1;
  if (startVersion > SCHEMA_VERSION) {
    warnings.push(`Project was created by a newer version (schema ${startVersion}); some data may be ignored.`);
    return { data: current, migratedFrom: null, warnings };
  }
  if (startVersion < 0) return { data: current, migratedFrom: null, warnings };
  let v = startVersion;
  while (v < SCHEMA_VERSION) {
    const step = steps[v];
    if (!step) break;
    current = step(current, warnings);
    v += 1;
  }
  return { data: current, migratedFrom: startVersion < SCHEMA_VERSION ? startVersion : null, warnings };
}
