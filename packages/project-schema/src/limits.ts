/** Hard limits applied to every project, import and cloud payload. */
export const LIMITS = {
  maxProjectJsonBytes: 5 * 1024 * 1024,
  maxScenes: 200,
  maxElementsPerScene: 100,
  maxAssets: 500,
  maxAudioTracks: 16,
  maxCaptions: 2000,
  maxTextLength: 5000,
  maxCustomHtmlChars: 100_000,
  minSceneMs: 100,
  maxSceneMs: 10 * 60 * 1000,
  maxTotalMs: 30 * 60 * 1000,
  minCanvas: 160,
  maxCanvas: 3840,
  maxFps: 60,
  maxAssetBytes: 512 * 1024 * 1024,
  maxArchiveBytes: 1024 * 1024 * 1024,
  maxArchiveEntries: 1200,
  maxNameLength: 120,
} as const;

export const SCHEMA_VERSION = 1 as const;
