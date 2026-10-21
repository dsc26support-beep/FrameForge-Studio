import { useCallback, useEffect, useRef, useState } from 'react';
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from '@frameforge/editor-core';
import type { Project } from '@frameforge/project-schema';
import { repo } from './storage/repo';
import { errorMessage } from './util';

export type SaveState = { kind: 'saved' } | { kind: 'saving' } | { kind: 'error'; message: string };

/** Project state with undo/redo and debounced autosave to IndexedDB. */
export function useEditor(initial: Project) {
  const [history, setHistory] = useState<History>(() => createHistory(initial));
  const [save, setSave] = useState<SaveState>({ kind: 'saved' });
  const dirty = useRef(false);
  const latest = useRef(history.present);
  useEffect(() => {
    latest.current = history.present;
  });

  const apply = useCallback((fn: (p: Project) => Project, coalesceKey: string | null = null) => {
    setHistory((h) => {
      const next = fn(h.present);
      if (next === h.present) return h;
      dirty.current = true;
      return commit(h, next, coalesceKey);
    });
    // Show the truth immediately: the edit is not on disk until the debounced save finishes.
    setSave((s) => (s.kind === 'error' ? s : { kind: 'saving' }));
  }, []);

  const doUndo = useCallback(() => {
    dirty.current = true;
    setSave({ kind: 'saving' });
    setHistory(undo);
  }, []);
  const doRedo = useCallback(() => {
    dirty.current = true;
    setSave({ kind: 'saving' });
    setHistory(redo);
  }, []);
  const replace = useCallback((p: Project) => {
    dirty.current = true;
    setHistory(createHistory(p));
  }, []);

  const flush = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    setSave({ kind: 'saving' });
    try {
      await repo.save(latest.current);
      setSave({ kind: 'saved' });
    } catch (e) {
      dirty.current = true;
      setSave({ kind: 'error', message: errorMessage(e) });
    }
  }, []);

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => void flush(), 600);
    return () => clearTimeout(t);
  }, [history.present, flush]);

  useEffect(() => {
    const onHide = () => void flush();
    // Ask before leaving while an edit has not been written to storage yet.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      void flush();
    };
  }, [flush]);

  return {
    project: history.present,
    apply,
    undo: doUndo,
    redo: doRedo,
    replace,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    save,
    flush,
  };
}
