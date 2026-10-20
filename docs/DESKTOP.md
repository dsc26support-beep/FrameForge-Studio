# Desktop app

Electron 44 shell. UI = the same web bundle served from the private `frameforge://app` protocol. Rendering runs in a **separate Node process** (`render-worker.cjs`, started with `ELECTRON_RUN_AS_NODE`) that talks to the main process over a JSON IPC channel with three messages (`start`, `cancel`, `capabilities`).

## Bridge (`window.frameforge`)

`capabilities`, `chooseOutputFile`, `openProjectFile`, `saveProjectFile`, `startRender`, `cancelRender`, `onRenderEvent`, `revealOutput`, `chooseDefaultFolder`. No path ever reaches the page: output locations are opaque tokens minted after a native save dialog. Every handler checks the sender (the one main window, its top frame, the app origin) and validates every argument.

## Build and run

```bash
npm ci
npm run build:desktop
npx electron apps/desktop/dist/main.cjs        # add --no-sandbox only inside containers/root
npm run package:desktop                        # apps/desktop/release (NSIS + zip on Windows, dmg + zip on macOS)
```

Packaging must run on the target OS (Windows installers on Windows, dmg on macOS); CI's `desktop-build` job runs `electron-builder --dir` on both to check the configuration. **Real installers were not produced or run on Windows/macOS in the authoring session.**

## Rendering dependencies

- **FFmpeg + ffprobe** with `libx264` and `aac`. Not bundled by default (licensing/size). Either install it system-wide (README) or drop `ffmpeg(.exe)` and `ffprobe(.exe)` into `apps/desktop/resources/bin/` before packaging; they are copied to `resources/bin` and found automatically. If you redistribute FFmpeg, comply with its licence (LGPL/GPL depending on the build).
- **Chrome, Edge or Chromium** (auto-detected, or `FRAMEFORGE_CHROMIUM`).
  The Dashboard shows "Video renderer: Ready / Not ready: …" using these checks.

## Signing and updates

Unsigned. Set `CSC_LINK`/`CSC_KEY_PASSWORD` (Windows) and Apple signing/notarization variables as CI secrets (never in the repo) when you are ready; auto-update is not implemented. Update by installing a newer build.

## Uninstall

Windows: Settings → Apps → FrameForge Studio → Uninstall. macOS: drag the app to the Trash. User data: `%APPDATA%/FrameForge Studio` or `~/Library/Application Support/FrameForge Studio` (contains only `settings.json` and browser storage for the app origin).
