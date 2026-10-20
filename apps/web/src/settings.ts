import { useEffect, useState } from 'react';

export interface Settings {
  /** Editor UI motion only. Never affects exported video. */
  uiMotion: 'system' | 'reduce' | 'full';
  lowResource: 'auto' | 'on' | 'off';
  theme: 'system' | 'light' | 'dark';
}

const KEY = 'frameforge.settings.v1';
const DEFAULTS: Settings = { uiMotion: 'system', lowResource: 'auto', theme: 'system' };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Settings>;
      return {
        uiMotion: p.uiMotion === 'reduce' || p.uiMotion === 'full' ? p.uiMotion : 'system',
        lowResource: p.lowResource === 'on' || p.lowResource === 'off' ? p.lowResource : 'auto',
        theme: p.theme === 'light' || p.theme === 'dark' ? p.theme : 'system',
      };
    }
  } catch {
    /* storage unavailable: use defaults */
  }
  return DEFAULTS;
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(load);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.motion = settings.uiMotion;
    if (settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings]);
  const update = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  return [settings, update];
}
