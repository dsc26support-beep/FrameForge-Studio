# Architecture and decisions

## Layout

```
apps/web            React 19 + Vite static app (editor UI, IndexedDB persistence, sandboxed preview)
apps/desktop        Electron main + preload + build/packaging config
packages/project-schema   zod schema, defaults, migrations, validation, recovery, limits
packages/render-core      timeline maths, scene compiler (HTML+CSS animations), sanitizer, hashing, device classification, bridge types
packages/asset-manager    content sniffing, SVG safety, de-duplicating ingest, .ffproj ZIP archive read/write, filename/path rules
packages/render-adapter   FFmpeg args, Chromium frame capture, probe/verify, queue, job prep, CLI, render worker
packages/editor-core      pure project edit operations and undo/redo history
templates           eight templates (same project format)
apps-script         optional Google Apps Script backend
tests/{unit,integration,rendering,security,e2e}
```

Deviations from the suggested layout: `shared-types` is folded into `project-schema` (types are inferred from the schema, one source of truth); `scene-components` is replaced by the scene compiler in `render-core`; `renderer/{chromium,encoder,render-worker}` live inside `render-adapter`; `templates/` is a workspace package. Fewer packages, same boundaries.

## Key decisions

| Decision                                                                          | Why                                                                                                                  | Trade-off                                                                                |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Own renderer (Playwright + FFmpeg) instead of embedding HyperFrames               | Small dependency set, one project schema, no script execution in scenes, deterministic seek model we control         | Fewer authoring features than HyperFrames (no GSAP); HyperFrames export is future work   |
| Motion = CSS animations seeked with the Web Animations API                        | Pure function of time ⇒ deterministic, same code for preview and render, no JS needed in scenes                      | Only CSS-expressible motion; no scripted/physics animation                               |
| One compiled document for the whole project                                       | One page, one screenshot per frame; transitions are just opacity/transform on stacked sections                       | Very large projects keep all scenes in DOM (limits: 200 scenes × 100 elements)           |
| Frames streamed to FFmpeg stdin with backpressure                                 | Never holds more than ~1 frame in RAM (9,000-frame videos are fine)                                                  | Capture speed bound by screenshot cost; no parallel capture yet                          |
| Output written to a hidden `.partial.mp4`, verified, then renamed                 | A failed or cancelled render can never corrupt or half-replace a file; saved projects are never touched by rendering | Needs free disk space for one extra file                                                 |
| Shadow DOM (declarative) for custom HTML scenes                                   | Scene CSS cannot leak into other scenes or the stage                                                                 | Needs browsers with declarative shadow DOM (Chrome 111+, Safari 16.4+, Firefox 123+)     |
| Preview in `<iframe sandbox="allow-scripts">` srcdoc, runtime allowed by CSP hash | Opaque origin: scene content cannot touch the app, storage or network                                                | srcdoc inherits the page CSP, so the page needs `'unsafe-inline'` for styles             |
| Project archive (`.ffproj`) as the only transport to the renderer                 | Same validated path for UI→Electron, UI→CLI and mobile→desktop                                                       | Archive is built in memory (≤ 1 GB limit)                                                |
| Electron uses a custom `frameforge://app` protocol                                | Strict origin for IPC sender checks; no `file://`                                                                    | Needs registration code (small)                                                          |
| System Chrome/Edge/Chromium for rendering (not bundled)                           | Avoids shipping ~150 MB and tracking Chromium CVEs twice                                                             | User needs a Chromium-based browser; FFmpeg also not bundled by default (see DESKTOP.md) |
| Cloud auth = Google ID token verified via `tokeninfo`                             | Works cross-origin without cookies or secrets in the client                                                          | One UrlFetch per uncached token; script owner can read data (see APPS_SCRIPT.md)         |
| MIT license                                                                       | Permissive default                                                                                                   | Change if desired                                                                        |

## Dependencies (runtime)

`react`, `react-dom`, `zod`, `fflate` (ZIP), `parse5` (HTML parser for the sanitizer), `playwright-core` (Chromium automation). Dev: TypeScript, Vite, Vitest, ESLint (+typescript-eslint, react-hooks, jsx-a11y), Prettier, Playwright test, esbuild, Electron, electron-builder. Versions are exact-pinned (`.npmrc save-exact`) with `package-lock.json`.

## Data flow of an export

1. UI builds an archive (`project.json`, `manifest.json`, `assets/<id>.<ext>`).
2. Electron main validates the IPC call and the output token, writes the archive to a private temp file and forks the worker (`ELECTRON_RUN_AS_NODE`).
3. Worker: `readArchive` (all checks) → files written to a 0700 temp dir with ids as names → `renderProject`.
4. `renderProject`: schema+integrity validation → asset existence → tool discovery → compile document → launch Chromium (no permissions, service workers blocked, all requests intercepted) → per frame `seek(t)` + screenshot → FFmpeg → ffprobe + full decode check → atomic rename.
5. Progress events carry real frame counts; ETA is derived from measured speed and labelled as an estimate.

## Capability model

`classifyDevice()` (render-core) uses measured signals (cores, `deviceMemory`, pointer type, width, renderer presence) to choose preview scale, low-resource mode and whether local export is possible. Phones/tablets/browsers without the desktop bridge never attempt to render; the Export panel explains and offers the archive.
