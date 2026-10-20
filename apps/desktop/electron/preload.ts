import { contextBridge, ipcRenderer } from 'electron';
import type { BridgeRenderEvent, FrameForgeBridge } from '@frameforge/render-core';

/** The entire surface exposed to web content. No generic invoke/send, no paths, no Node APIs. */
const api: FrameForgeBridge & { chooseDefaultFolder(): Promise<{ displayName: string } | null> } = {
  version: 1,
  capabilities: () => ipcRenderer.invoke('ff:capabilities'),
  chooseOutputFile: (suggestedName) => ipcRenderer.invoke('ff:choose-output-file', suggestedName),
  openProjectFile: () => ipcRenderer.invoke('ff:open-project-file'),
  saveProjectFile: (suggestedName, bytes) => ipcRenderer.invoke('ff:save-project-file', suggestedName, bytes),
  startRender: (args) => ipcRenderer.invoke('ff:start-render', args),
  cancelRender: (jobId) => ipcRenderer.invoke('ff:cancel-render', jobId),
  revealOutput: (token) => ipcRenderer.invoke('ff:reveal-output', token),
  chooseDefaultFolder: () => ipcRenderer.invoke('ff:choose-default-folder'),
  onRenderEvent: (cb) => {
    const handler = (_e: unknown, payload: BridgeRenderEvent) => cb(payload);
    ipcRenderer.on('ff:render-event', handler);
    return () => ipcRenderer.removeListener('ff:render-event', handler);
  },
};

contextBridge.exposeInMainWorld('frameforge', api);
