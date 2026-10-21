# Handoff: FrameForge Studio (live)
## Goal
HTML->MP4 video studio (web + Electron + CLI + optional Apps Script) for OTHER PEOPLE (user confirmed). Repo dsc26support-beep/FrameForge-Studio.
## Next steps
1. PR #3 (draft, "Add audio and captions editor", branch claude/frameforge-studio-build-b9fgz6, subscribed): watch CI; fix reds; user marks ready + merges.
2. Next feature agreed earlier: drag/resize/rotate elements on preview canvas. Then: real-device testing (user), signed installers + auto-update (needs user certs), cached scene segments, video clips in scenes, cloud sign-in UI.
## State
- main has PR #1 (v0.1) + PR #2 (dependency review blocking). Site deployed via Pages: https://dsc26support-beep.github.io/FrameForge-Studio/ (user confirmed it loads).
- PR #3 local: 113 vitest + 24 playwright e2e (browser x3 + Electron) all pass; npm run ci green.
- Audio panel, captions panel (+.srt), timeline caption row, renderer caption bg/line-break fix, autosave "Saving..." + beforeunload.
## Decisions (why)
- Own Playwright+FFmpeg renderer (not HyperFrames). CSS animations seeked via WAAPI => deterministic.
- Chromium sandbox on; CI sysctl apparmor_restrict_unprivileged_userns=0; FRAMEFORGE_NO_SANDBOX=1 opt-out.
- Autosave shows Saving immediately: e2e found quick reload could drop last edit.
- MIT license default; user may change.
## Gotchas
- Repo settings API blocked by sandbox proxy (user flips settings in UI). github.io unreachable from sandbox.
- Pushes cancel in-flight CI. Electron e2e needs build:desktop (default base) + xvfb-run; building with VITE_BASE breaks it.
- After a PR merges, reset work branch to origin/main and force-with-lease push.
- .handoff is Prettier-ignored.
## Open questions
- License, Pages terms for commercial use, installer signing certs.
