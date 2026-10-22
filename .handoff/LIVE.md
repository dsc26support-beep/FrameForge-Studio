# Handoff: FrameForge Studio (live)
## Goal
HTML->MP4 video studio (web + Electron + CLI + optional Apps Script) for OTHER PEOPLE (user confirmed). Repo dsc26support-beep/FrameForge-Studio.
## Next steps
1. PR #4 (draft, "Add direct manipulation on the preview", branch claude/frameforge-studio-build-b9fgz6, subscribed): watch CI; fix reds; user says merge -> mark ready + squash merge with expectedHeadSha; then reset branch to origin/main.
2. Then: real-device testing (user; touch drag only emulated), signed installers + auto-update (needs user certs), video clips in scenes, cached scene segments, cloud sign-in UI, edge-resize handles, in-app Guidelines page.
## State
- main = PR #1-#3 merged (v0.1, dependency review blocking, audio+captions+GUIDELINES). Site live: https://dsc26support-beep.github.io/FrameForge-Studio/ (Pages deploy green).
- PR #4 local: 119 vitest + 39 playwright e2e pass; npm run ci green. Adds CanvasOverlay (move/scale/rotate/nudge, snapping), geometry helpers in editor-core, runtime ff-measure/ff-rects, double-buffered Preview, end-of-timeline blank-frame fix.
## Decisions (why)
- Own Playwright+FFmpeg renderer (not HyperFrames). CSS animations seeked via WAAPI => deterministic.
- Overlay never touches the sandboxed iframe; sizes come via validated postMessage (text height unknown from model).
- Preview double-buffered: reloading iframe per edit flashed black while dragging.
- Corner handles scale uniformly (no edge-resize yet).
- Chromium sandbox on; CI sysctl apparmor_restrict_unprivileged_userns=0; FRAMEFORGE_NO_SANDBOX=1 opt-out.
- MIT license default; GUIDELINES.md policy part needs lawyer review.
## Gotchas
- Repo settings API blocked by sandbox proxy; github.io unreachable from sandbox.
- Pushes cancel in-flight CI. Electron e2e needs build:desktop (default base) + xvfb-run.
- After a PR merges: reset work branch to origin/main, push --force-with-lease.
- .handoff is Prettier-ignored. Overlay CSS must use --accent (no --b var in app).
## Open questions
- License, Pages terms for commercial use, installer signing certs.
