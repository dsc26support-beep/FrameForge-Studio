# Security policy

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository (Security → Report a vulnerability) instead of a public issue. Include steps to reproduce and the affected version.

## Scope and promises

FrameForge Studio treats imported projects, HTML scenes, SVGs, file names, media metadata and cloud responses as **untrusted**. It makes **no claim of being completely secure**; see [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for what is defended, how it is tested, and the residual risks.

Key controls: strict zod schema validation with size/complexity limits; hex-only colour fields (no CSS injection); allowlist HTML/CSS sanitizer with no script support; sandboxed preview iframe and a restricted render page (CSP + request interception, no network); media identified by content, SVG rejected if active; ZIP import guards (entry count, expanded size, path traversal, hash/size checks); Electron with `contextIsolation`, `sandbox`, no Node integration, a narrow preload bridge, validated IPC with sender checks, navigation/window blocking and opaque output tokens instead of paths; FFmpeg invoked with an argument array, never a shell; no telemetry; no automatic uploads; no secrets in the repository.

## Secrets

- Never commit credentials. `.env` is git-ignored; `.env.example` contains placeholders only.
- `npm run scan:secrets` runs in CI. Also enable GitHub **secret scanning** and **push protection** (Settings → Code security), and consider running `gitleaks detect` locally before publishing.
- The Apps Script OAuth client ID is stored as a Script Property, not in code.

## Dependencies

CI runs `npm audit --omit=dev --audit-level=high` (blocking) and a full audit (informational). Status at authoring time: **0 advisories in production dependencies; 8 moderate advisories in the dev-only packaging chain** (`electron-builder` → `app-builder-lib` → `@electron/get` → `global-agent` → `roarr` → `sprintf-js`, a denial-of-service in a format-string helper used while _building_ installers on a developer/CI machine, never shipped). Remediation: upgrade `electron-builder` when a fixed release is published; do not run packaging on untrusted input. Keep Electron current (the version is pinned in the lockfile; update it regularly).

## Supported versions

Only the latest release receives fixes.
