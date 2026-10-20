# Release report – FrameForge Studio v0.1.0

Repository: https://github.com/dsc26support-beep/FrameForge-Studio (branch `claude/frameforge-studio-build-b9fgz6`, draft PR #1 into `main`).
Everything below is based on commands actually run in the authoring environment (Linux x64, Node 22.22, FFmpeg 6.1.1, Chromium 1194/Electron 44). Anything not run is marked.

## Verified results

| Check                                                                                    | Result                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run ci` (format, lint, typecheck, secret scan, tests, build)                        | ✅ pass                                                                                                                                                                                                                                                                         |
| Vitest: 10 files, 105 tests (unit, security, integration, rendering)                     | ✅ 105 passed, 0 skipped on the authoring machine                                                                                                                                                                                                                               |
| Playwright e2e: editor at desktop 1280×800, phone 390×844 (touch), tablet 820×1180       | ✅ 12 passed (create/edit/save/reopen, preview seek, export panel + archive download, overflow/touch-target check, media import + rejection of a disguised executable, no console errors)                                                                                       |
| Playwright e2e: Electron app (xvfb)                                                      | ✅ 6 passed (private origin, no Node in page, bridge shape, secure webPreferences, navigation/window/network blocked, argument + token validation, untrusted-window IPC rejected, **real MP4 render through the separate render process**)                                      |
| Real MP4 rendered and verified                                                           | ✅ many: H.264 yuv420p, expected size/fps/frame count/duration, AAC audio mixed and trimmed/faded, full decode check, deterministic (two renders ⇒ identical decoded frames), all 8 templates render, CLI render from `.ffproj` with embedded image, `--scale 0.5` gives 160×90 |
| Cancel mid-render / missing assets / invalid project / existing output / corrupt archive | ✅ clean errors, no partial file left, saved project untouched                                                                                                                                                                                                                  |
| Apps Script `.gs` files (14 tests in a VM with fakes)                                    | ✅ pass; ❌ not run on the real Apps Script service                                                                                                                                                                                                                             |
| `npm audit --omit=dev`                                                                   | ✅ 0 vulnerabilities; 8 moderate in dev-only packaging chain (see SECURITY.md)                                                                                                                                                                                                  |
| Benchmark (4 cores, 16 GB VM): 270 frames, 1280×720                                      | 11.2 s total, ~26 frames/s captured; ~1 GB peak whole-system RSS (upper bound). Scale 0.5: 10.3 s (~28 frames/s). Low-power hardware not measured.                                                                                                                              |

## Definition-of-done status

1 frontend builds ✅ · 2 opens without fatal error ✅ (e2e, no console errors) · 3 schema validated ✅ · 4 create/edit/save/reopen ✅ · 5 animated HTML scene renders ✅ · 6 playable MP4 ✅ · 7 audio ✅ · 8 clear renderer errors ✅ · 9 failed render cannot corrupt project ✅ (renderer never writes project data) · 10 mobile + desktop viewports ✅ (emulated only) · 11 cloud optional ✅ · 12 Electron security verified ✅ (tests above) · 13 basic security tests ✅ · 14 CI configured ✅ (**observed green on GitHub for commit cc7dd4a: verify job incl. tests + browser e2e + Electron e2e on Ubuntu, Dependency security, and unsigned `electron-builder --dir` packaging on windows-latest and macos-latest**; the packaged apps were not launched on those OSes) · 15 install/troubleshooting docs ✅ · 16 limitations documented ✅ · 17 no committed secrets ✅ (scanner clean; also enable GitHub secret scanning) · 18 no knowingly nonfunctional essential button ✅ (see "Partial" for things that are absent rather than fake).

## Completed

Versioned schema + migration + recovery; scene compiler with deterministic seek; sanitizer; asset ingest with content sniffing and dedupe; `.ffproj` archives; render adapter, CLI (`--doctor`), render worker, job queue; editor (dashboard, scenes, elements, inspector, HTML mode with live warnings, timeline with pointer/touch/keyboard, undo/redo, media, export panel, settings, accessibility basics, reduced-motion separation); 8 templates; autosave with debounce + rolling backups + damaged-project recovery; Electron shell; Apps Script backend + validated client; CI and Pages workflows; docs.

## Partially completed

- **Scene render caching:** cache _keys_ (`sceneCacheKey`) with invalidation tests exist, but cached scene segments are not produced or reused yet.
- **Low-resource mode:** detection, lighter preview hint, one render at a time (queue + Electron guard), render-scale and CRF controls, and a heavy-export warning exist. Preview quality only changes image smoothing, not compute; no parallel capture workers exist to limit.
- **Desktop packaging:** configured for Windows (NSIS/zip) and macOS (dmg/zip); CI package-check jobs pass on windows-latest and macos-latest (unpacked, unsigned); no installer was launched on those OSes. Pages deployment not yet run (needs merge + Pages enabled).
- **Cloud:** backend + client done and tested with fakes; UI sign-in (Google Identity Services) not wired; not run against real Apps Script.
- **Compatibility:** only Chromium exercised; Firefox/Safari/real phones untested.
- **Dependency audit:** production clean; dev packaging chain has moderate advisories awaiting upstream fixes.

## Not completed

Drag/resize directly on the preview canvas; video clips inside scenes (importable only); AI storyboard/script features; batch generation and cloud sync UI; multi-track audio editing beyond add/trim/fade fields (no audio UI controls for fades yet: the schema and renderer support them); captions editor UI (schema + renderer support captions); HyperFrames adapter; FFmpeg bundling in installers; auto-update; Windows/macOS/mobile real-device testing; GitHub Pages deployment verification (requires enabling Pages in repository settings after merge).

## Blocked tests and how to run them

- Windows/macOS packaging and real-device mobile/Safari/Firefox: need those machines (CI covers package config on Windows/macOS runners).
- Real Apps Script: deploy per docs/APPS_SCRIPT.md and run the `curl` ping plus an authenticated call from your site.
- Electron e2e needs `npm run build:desktop` first and `xvfb-run` on headless Linux; rendering tests need FFmpeg + Chromium (they report as skipped, with the reason, otherwise).

## Exact commands

```bash
git clone https://github.com/dsc26support-beep/FrameForge-Studio.git && cd FrameForge-Studio
git checkout claude/frameforge-studio-build-b9fgz6
npm ci && npm run check
npm run ci                      # static checks, tests, build
npm run build:desktop && xvfb-run -a npm run test:e2e   # Linux; on Windows/macOS omit xvfb-run
npm run dev                     # web editor
```

## Next steps to publish

1. Review and merge PR #1. 2. Repo Settings → Pages → Source = GitHub Actions; re-run _Deploy web app to GitHub Pages_; open the URL it prints. 3. Enable secret scanning + push protection and branch protection requiring the CI checks. 4. Review GitHub Pages terms before any commercial use, or deploy `apps/web/dist` to another static host. 5. Build/sign desktop installers on Windows and macOS. 6. Deploy the Apps Script backend if you want cloud backups.
