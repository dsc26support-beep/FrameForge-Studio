# Handoff: FrameForge Studio (live)
## Goal
Build HTML->MP4 video studio (web + Electron + CLI + optional Apps Script). Repo dsc26support-beep/FrameForge-Studio, branch claude/frameforge-studio-build-b9fgz6, draft PR #1 (subscribed).
## Next steps
1. Read CI result for head f6eacf4 (PR #1); fix any red job (first real run of Playwright+Electron e2e on GitHub).
2. If green: tell user; they must enable Pages (Settings>Pages>Actions), Dependency graph, secret scanning; merge PR.
3. Remaining gaps (see docs/RELEASE_REPORT.md): canvas drag editing, audio-fade/caption UI, video clips in scenes, cached scene segments, cloud sign-in UI, real Win/mac/mobile testing.
## State
- Local `npm run ci` green: 105 vitest, 12 browser e2e, 6 Electron e2e (xvfb), real MP4 renders verified.
- Packages: project-schema, render-core, asset-manager, render-adapter, editor-core, templates; apps/web, apps/desktop; apps-script/*.gs.
- Docs written: README, SECURITY, CONTRIBUTING, docs/{ARCHITECTURE,THREAT_MODEL,APPS_SCRIPT,DESKTOP,IMPLEMENTATION_PLAN,RELEASE_REPORT}.md
## Decisions (why)
- Own Playwright+FFmpeg renderer, not HyperFrames: smaller deps, no scene JS, one schema.
- Motion = CSS animations seeked via Web Animations API => deterministic.
- Chromium sandbox ON by default; opt-out only FRAMEFORGE_NO_SANDBOX=1 or root. CI uses sysctl apparmor_restrict_unprivileged_userns=0 (Ubuntu 24 runners).
- dependency-review step continue-on-error (repo Dependency graph off; not fixable from code).
- MIT license is a default choice; user may change.
## Gotchas
- RELEASE_REPORT says CI "not yet observed"; update once green.
- npm audit: 8 moderate dev-only (electron-builder chain); prod 0.
- Electron needs xvfb-run headless; build:desktop before e2e.
- GitHub Pages terms not fetched (no network to docs.github.com).
## Open questions
- User choice of license, hosting target (Pages vs other), signing for installers.
