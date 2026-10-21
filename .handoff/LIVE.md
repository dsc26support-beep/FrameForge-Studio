# Handoff: FrameForge Studio (live)
## Goal
HTML->MP4 video studio (web + Electron + CLI + optional Apps Script). Repo dsc26support-beep/FrameForge-Studio.
## Next steps
1. Check Pages deploy run (workflow_dispatch run 39586117877 on main): if green, get site URL from run/Settings>Pages, load-check it, tell user. If red, read logs and fix.
2. PR #2 (draft, CI: dependency review now blocking; branch claude/frameforge-studio-build-b9fgz6, subscribed): confirm CI green incl. dependency-review step; user marks ready + merges.
3. Optional gaps (docs/RELEASE_REPORT.md): canvas drag edit, audio-fade/caption UI, video clips in scenes, cached scene segments, cloud sign-in UI, real Win/mac/mobile tests.
## State
- PR #1 merged (squash d2f30d4); main CI green. User enabled Pages, Dependency graph, Secret scanning in GitHub UI.
- First Pages deploy (before enabling) failed as expected; re-dispatched after.
- Work branch was force-reset to origin/main (force-with-lease; only dropped handoff-note commits).
- Picture guide artifact (private) made for user: https://claude.ai/artifact/TXEpTRsJhz4VfQ7NqL7Df1
## Decisions (why)
- Own Playwright+FFmpeg renderer (not HyperFrames): small deps, no scene JS, one schema.
- Chromium sandbox on by default; CI sysctl apparmor_restrict_unprivileged_userns=0; FRAMEFORGE_NO_SANDBOX=1 opt-out.
- .handoff excluded from Prettier (hook file broke format check).
- MIT license default; user may change.
## Gotchas
- Repo settings API blocked by sandbox proxy; user flips settings in UI. Do not bypass.
- Pushes cancel in-flight CI (concurrency group).
- Electron e2e needs build:desktop + xvfb-run.
## Open questions
- License, hosting target (Pages terms for commercial use unchecked), installer signing.
