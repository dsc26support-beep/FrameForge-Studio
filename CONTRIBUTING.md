# Contributing

1. Install prerequisites (see README) and run `npm ci` then `npm run check`.
2. Create a branch, make focused changes, and keep documentation in sync with behaviour.
3. Before pushing: `npm run ci` (format, lint, types, secret scan, tests, build). For UI/desktop changes also run `xvfb-run -a npm run test:e2e` (Linux headless) or `npm run test:e2e`.
4. Rules of the house:
   - Security first: never execute project data, never add a generic filesystem/shell/IPC bridge, validate every input.
   - No new dependency without a reason (see docs/ARCHITECTURE.md for the current list).
   - Do not skip tests silently. If a test needs hardware or a service that is missing, mark it as blocked with a message and document how to run it.
   - Do not claim a property (speed, memory, compatibility, security) that you did not measure or test.
5. Open a pull request using the template; CI must pass.

Code layout: `packages/*` are libraries consumed as TypeScript source; `apps/web` is the UI; `apps/desktop/electron` is the shell; `apps-script` is plain `.gs`; `templates` are project builders; `tests/*` by kind.
