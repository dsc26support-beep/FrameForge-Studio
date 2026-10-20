/** Typed API exposed by the Electron preload script as `window.frameforge`. Nothing else crosses the boundary. */
export interface BridgeCapabilities {
  canRender: boolean;
  ffmpeg: boolean;
  chromium: boolean;
  cpus: number;
  totalMemMB: number;
  recommendLowResource: boolean;
  problems: string[];
}

export interface BridgeRenderProgress {
  phase: 'prepare' | 'capture' | 'finalize' | 'verify' | 'done';
  frame: number;
  totalFrames: number;
  fraction: number;
  elapsedMs: number;
  message?: string;
}

export type BridgeRenderEvent =
  | { jobId: string; type: 'progress'; progress: BridgeRenderProgress }
  | { jobId: string; type: 'done'; outputName: string; bytes: number; warnings: string[]; verified: boolean }
  | { jobId: string; type: 'error'; code: string; message: string; details?: string };

export interface FrameForgeBridge {
  version: 1;
  capabilities(): Promise<BridgeCapabilities>;
  /** Opens the native "save" dialog. Returns an opaque token, never a path. */
  chooseOutputFile(suggestedName: string): Promise<{ token: string; displayName: string } | null>;
  openProjectFile(): Promise<{ name: string; bytes: Uint8Array } | null>;
  saveProjectFile(suggestedName: string, bytes: Uint8Array): Promise<boolean>;
  startRender(args: { archive: Uint8Array; outputToken: string; scale?: number }): Promise<{ jobId: string }>;
  cancelRender(jobId: string): Promise<void>;
  onRenderEvent(cb: (e: BridgeRenderEvent) => void): () => void;
  revealOutput(outputToken: string): Promise<void>;
}
