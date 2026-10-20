export interface DeviceSignals {
  cores?: number | undefined;
  /** navigator.deviceMemory (GB), when available. */
  memoryGB?: number | undefined;
  coarsePointer: boolean;
  screenWidth: number;
  hasDesktopRenderer: boolean;
  saveData?: boolean | undefined;
}

export type DeviceClass = 'phone' | 'tablet' | 'low-power' | 'desktop';

export interface DeviceProfile {
  class: DeviceClass;
  canRenderLocally: boolean;
  /** Why local rendering is unavailable (shown to the user), or null. */
  renderBlockedReason: string | null;
  lowResourceMode: boolean;
  previewScale: number;
  maxExportPreset: '480p' | '720p' | '1080p';
  notes: string[];
}

/**
 * Chooses behaviour from measured capabilities rather than user-agent strings.
 * Missing signals (Safari/Firefox hide deviceMemory) fall back to conservative defaults.
 */
export function classifyDevice(s: DeviceSignals): DeviceProfile {
  const cores = s.cores ?? 2;
  const mem = s.memoryGB ?? (s.coarsePointer ? 2 : 4);
  const small = s.screenWidth < 700;
  const mobile = s.coarsePointer && !s.hasDesktopRenderer;
  const cls: DeviceClass = mobile ? (small ? 'phone' : 'tablet') : cores <= 2 || mem <= 2 || s.saveData ? 'low-power' : 'desktop';
  const notes: string[] = [];
  const lowResourceMode = cls === 'phone' || cls === 'low-power' || cls === 'tablet';
  if (lowResourceMode) notes.push('Low-resource mode: smaller previews, one export at a time, simpler effects.');
  const renderBlockedReason = s.hasDesktopRenderer
    ? null
    : 'This browser cannot encode video locally. Use the FrameForge desktop app (or the command-line renderer) on a computer: save the project archive here and open it there.';
  if (cls === 'phone')
    notes.push('Phones are best for editing text, scenes and media. Export the project archive to render on a computer.');
  return {
    class: cls,
    canRenderLocally: s.hasDesktopRenderer,
    renderBlockedReason,
    lowResourceMode,
    previewScale: cls === 'phone' ? 0.5 : cls === 'tablet' || cls === 'low-power' ? 0.75 : 1,
    maxExportPreset: cls === 'desktop' ? '1080p' : '720p',
    notes,
  };
}
