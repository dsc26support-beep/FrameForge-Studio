import type { Project } from '@frameforge/project-schema';

export interface History {
  present: Project;
  past: Project[];
  future: Project[];
  /** Key of the last coalesced edit and when it happened. */
  lastKey: string | null;
  lastAt: number;
}

const LIMIT = 100;
const COALESCE_MS = 800;

export const createHistory = (project: Project): History => ({ present: project, past: [], future: [], lastKey: null, lastAt: 0 });

/** Records a new project state. Edits sharing a `coalesceKey` within a short window merge into one undo step. */
export function commit(h: History, next: Project, coalesceKey: string | null = null, now = Date.now()): History {
  if (next === h.present) return h;
  const merge = coalesceKey !== null && coalesceKey === h.lastKey && now - h.lastAt < COALESCE_MS;
  const past = merge ? h.past : [...h.past, h.present].slice(-LIMIT);
  return { present: next, past, future: [], lastKey: coalesceKey, lastAt: now };
}

export function undo(h: History): History {
  const prev = h.past.at(-1);
  if (!prev) return h;
  return { present: prev, past: h.past.slice(0, -1), future: [h.present, ...h.future], lastKey: null, lastAt: 0 };
}

export function redo(h: History): History {
  const [next, ...rest] = h.future;
  if (!next) return h;
  return { present: next, past: [...h.past, h.present], future: rest, lastKey: null, lastAt: 0 };
}

export const canUndo = (h: History): boolean => h.past.length > 0;
export const canRedo = (h: History): boolean => h.future.length > 0;
