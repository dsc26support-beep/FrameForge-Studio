# FrameForge Studio

Local-first HTML-to-MP4 video studio. Edit scenes visually or in HTML/CSS, preview them in a sandbox, and render a verified H.264/AAC MP4 on your own computer. No account, no telemetry, no uploads.

> **Status: first release (v0.1).** The core pipeline (edit → save → render → verified MP4) works and is tested. See [Known limitations](#known-limitations) and [docs/RELEASE_REPORT.md](docs/RELEASE_REPORT.md) for exactly what is and is not done.

## What you get

| Piece                                    | What it does                                                                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web editor** (`apps/web`)              | React + Vite static app. Dashboard, scene editor, timeline, media library, 8 templates, project import/export, autosave + backups in IndexedDB. Works on phones, tablets and desktops. |
| **Desktop app** (`apps/desktop`)         | Electron shell (Windows/macOS) with native dialogs and a separate render process that produces MP4 files offline.                                                                      |
| **Renderer** (`packages/render-adapter`) | Chromium (Playwright) draws each frame at an exact timestamp and streams it into FFmpeg. Also available as a command-line tool.                                                        |
| **Cloud (optional)** (`apps-script`)     | Google Apps Script backend for metadata/backups. Disabled unless you deploy and configure it.                                                                                          |

```
 Browser / Electron UI (React)            Render process (Node, separate)
 ┌───────────────────────────┐            ┌──────────────────────────────────┐
 │ editor-core (pure edits)  │  .ffproj   │ validate → compile HTML → Chromium│
 │ project-schema (zod)      │──archive──▶│ seek(t) + screenshot → FFmpeg     │
 │ sandboxed <iframe> preview│  (IPC /    │ → ffprobe + decode verification   │
 │ IndexedDB projects+assets │   CLI)     │ → atomic rename to the .mp4       │
 └───────────────────────────┘            └──────────────────────────────────┘
          │ optional, off by default
          ▼
   Google Apps Script (ID-token auth, per-user Drive folder)
```

## Supported platforms (what was actually tested)

| Platform                 | Editing                              | MP4 export                                                          | Evidence                                                          |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Linux x64 (Chromium)     | ✅                                   | ✅ (CLI + Electron)                                                 | Automated tests in this repository                                |
| Windows 10/11, macOS 12+ | ✅ expected                          | ✅ expected                                                         | CI builds the package; **not run on real machines by the author** |
| Android / iOS browsers   | ✅ editing (emulated viewports only) | ❌ by design: export the `.ffproj` archive and render on a computer | Playwright device emulation; **not tested on real devices**       |
| Firefox / Safari         | Expected to work (standard APIs)     | n/a                                                                 | **Not tested** (only Chromium is available to the test suite)     |

Hardware guidance: editing runs on any modern phone. Rendering is CPU-only (no GPU needed). Minimum: 2 cores, 4 GB RAM, free disk for the output. Recommended: 4+ cores, 8 GB RAM. Measured on a 4-core/16 GB Linux VM: 270 frames at 1280×720 rendered in 11 s (~26 frames/s), whole-system peak RSS about 1 GB (an upper bound; it also counts unrelated node/chrome processes). Low-power machines were **not** measured; expect proportionally slower renders.

## Quick start

### 1. Prerequisites

Check what you have, any time: `npm run check` (after step 2) lists missing items and the command to fix each one.

**Windows (PowerShell):**

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install Gyan.FFmpeg
# Chrome or Edge is needed for rendering; Edge ships with Windows. Optional: winget install Google.Chrome
# Close and reopen PowerShell so PATH updates apply.
```

**macOS (Terminal):**

```bash
xcode-select --install            # Git
brew install node ffmpeg
brew install --cask google-chrome # or use Microsoft Edge / Chromium
```

**Linux (Debian/Ubuntu):**

```bash
sudo apt update && sudo apt install -y git ffmpeg chromium nodejs npm   # Node must be >= 22.18
```

### 2. Get the code and install

```bash
git clone https://github.com/dsc26support-beep/FrameForge-Studio.git
cd FrameForge-Studio
npm ci
npm run check
```

### 3. Run

```bash
npm run dev          # web editor at http://127.0.0.1:5173
npm run build:cli    # builds dist/cli/frameforge-render.cjs
```

Render a project archive from the command line (works on a computer with FFmpeg + Chrome/Edge):

```bash
node dist/cli/frameforge-render.cjs --doctor
node dist/cli/frameforge-render.cjs my-project.ffproj my-video.mp4
node dist/cli/frameforge-render.cjs my-project.ffproj my-video.mp4 --overwrite --scale 0.5
```

### 4. Desktop app

```bash
npm run build:desktop            # bundles main, preload, render worker and web UI
npx electron apps/desktop/dist/main.cjs
npm run package:desktop          # installers into apps/desktop/release (unsigned)
```

See [docs/DESKTOP.md](docs/DESKTOP.md) for packaging, bundling FFmpeg, signing and uninstalling.

## Commands

| Command                                                     | Purpose                                                                                                                           |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev` / `npm run build`                             | Web dev server / production build (`apps/web/dist`)                                                                               |
| `npm run format:check`, `npm run lint`, `npm run typecheck` | Static checks                                                                                                                     |
| `npm test`                                                  | Unit, security, integration and **real rendering** tests (render tests are reported as skipped if FFmpeg/Chromium are missing)    |
| `npm run test:e2e`                                          | Playwright: editor at phone/tablet/desktop viewports + Electron (needs `npm run build:desktop`, and `xvfb-run` on headless Linux) |
| `npm run scan:secrets`, `npm run audit`                     | Secret scan, dependency audit                                                                                                     |
| `npm run ci`                                                | Everything except e2e                                                                                                             |

## Using the editor

- **Dashboard:** start from a template, import a `.ffproj`, search, rename, duplicate, delete. Shows storage use and renderer availability.
- **Scenes / Edit panels:** add, duplicate, reorder scenes; add text, shapes and images; set position, scale, rotation, opacity; pick enter/exit animations, easing and transitions. Switch a scene to **Direct HTML/CSS** to write markup yourself (scripts are removed; animate with CSS `@keyframes`).
- **Timeline:** scrub, play/pause, drag a scene's right edge (or use arrow keys on the handle) to change its length, undo/redo (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z). Frame and time are shown live.
- **Media:** import images, SVG, audio and video files. Files are identified by content, de-duplicated by SHA-256, and stored in IndexedDB (never inside the project JSON).
- **Export:** 480p/720p/1080p, 16:9 / 9:16 / 1:1, 24–60 fps, quality (CRF), render scale. The default is 720p / 30 fps. On a desktop build you pick the file in a native dialog; in a browser you download the archive instead and the panel explains why.

### Browser storage warning

Browsers (and iOS especially) may evict site data under storage pressure or when the user clears it. FrameForge asks for persistent storage and keeps rolling backups, but **download a `.ffproj` archive regularly**.

## Animation and determinism

Scenes are compiled to one HTML document in which all motion is CSS animation. The renderer pauses every animation and sets its `currentTime` to the exact frame time (`frame × 1000 / fps`) before each screenshot, so output does not depend on wall-clock time, load order or machine speed. A test renders the same project twice and compares decoded frame hashes. Limits: custom JavaScript is not supported; text rendering depends on fonts installed on the rendering machine (system font stacks only; no web fonts) so output can differ between machines; video clips cannot yet be placed in scenes.

## HyperFrames evaluation

Reviewed https://github.com/heygen-com/hyperframes via its npm package (`hyperframes@0.8.181`, Apache-2.0, Node ≥ 22, FFmpeg required; depends on `puppeteer-core`, `sharp`, `hono`, `esbuild` and others). Its CLI renders a _project directory_ of HTML compositions (`hyperframes render -o out.mp4`) and runs a studio server for preview. **Decision:** not embedded in v0.1. Reasons: it brings a large dependency tree and its own composition format (GSAP/data-attribute based) that would sit beside our versioned JSON schema; embedding it would mean trusting and executing composition JavaScript, which conflicts with our "no script in scenes" security boundary; and its programmatic API was not verified stable. Instead FrameForge ships a small modular renderer (Playwright + FFmpeg) behind the `renderProject()` interface. A HyperFrames exporter/adapter remains a documented future option, not implemented. Nothing from HyperFrames' source was copied.

## Google Apps Script (optional)

Disabled by default. See [docs/APPS_SCRIPT.md](docs/APPS_SCRIPT.md) for deployment, the authentication model and its limitations. The web UI has **no** sign-in wiring in v0.1: the backend and a validated client library exist and are tested, but connecting them to Google Identity Services in the UI is not done.

## GitHub Pages

`.github/workflows/deploy-pages.yml` builds with `VITE_BASE=/<repo>/` and deploys on pushes to `main` after format, lint, type, secret-scan and test checks. Enable it once: _Settings → Pages → Source: GitHub Actions_. Pages cannot run FFmpeg or Node services, so the hosted site is the editor only (export = download archive). GitHub's terms restrict Pages for commercial transactions / SaaS use; **review the current terms before using it for a commercial product** (this could not be fetched in the authoring session). The build is static, so any static host (Cloudflare Pages, Netlify, S3) works by setting `VITE_BASE`.

## Troubleshooting

| Symptom                                        | Fix                                                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `FFmpeg was not found`                         | Install FFmpeg (commands above), reopen the terminal, or set `FRAMEFORGE_FFMPEG` to the full path. |
| `No Chromium/Chrome/Edge found`                | Install Chrome/Edge/Chromium or set `FRAMEFORGE_CHROMIUM`.                                         |
| `Chromium sandbox is disabled` warning         | You are running as root (containers). Render only projects you trust, or run as a normal user.     |
| Export says it cannot render locally (browser) | By design. Download the archive and open it in the desktop app / CLI.                              |
| Project is "damaged"                           | Open it: FrameForge offers a repaired copy or an automatic backup.                                 |
| Storage unavailable (private mode)             | Use a normal window; you can still import/export archives.                                         |
| `npm ci` fails on Electron download            | Set `ELECTRON_SKIP_BINARY_DOWNLOAD=1` for web/CLI-only work.                                       |

## Update / uninstall

Update: `git pull && npm ci && npm run build`. Uninstall: delete the folder; the desktop app via the OS uninstaller. Browser data: clear site data for the app's origin (this deletes local projects — export first). Temporary render folders are named `frameforge-*` in the OS temp directory and are removed after each job.

## Known limitations

See the full list in [docs/RELEASE_REPORT.md](docs/RELEASE_REPORT.md). Highlights: no drag-on-canvas editing (sliders/numbers instead); no video clips in scenes; no AI storyboard features; cloud sign-in not wired into the UI; desktop installers are unsigned and untested on Windows/macOS hardware; scene render caching is limited to cache-key logic (no cached segments yet); mobile/Safari/Firefox untested on real devices.

## Security

See [SECURITY.md](SECURITY.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md). No claim of complete security is made.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). License: [MIT](LICENSE) (default chosen by the author of this scaffold; change it if you prefer another).
