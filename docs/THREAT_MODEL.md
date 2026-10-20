# Threat model

Assets: user projects and media (privacy, integrity), the user's machine (filesystem, processes, credentials), the user's Google account data (only if cloud is enabled).
Attackers considered: a malicious `.ffproj`/project JSON/media file received from someone else; malicious HTML/CSS/SVG inside a scene; a compromised web page trying to reach the Electron bridge; a malicious or curious user of the cloud endpoint.
Not considered: a compromised OS, a malicious local user with the same account, supply-chain compromise of npm packages (mitigated only by lockfile, exact pins, audit and minimal dependencies).

| Threat                                     | Control                                                                                                                                              | Verified by                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Malformed/oversized project JSON           | zod schema, limits, 5 MB cap, migrations, recovery                                                                                                   | tests/unit/schema                                |
| CSS/HTML injection via fields              | hex-only colours, enums, numbers; text escaped                                                                                                       | tests/security/sanitize                          |
| Script execution in scene HTML             | allowlist sanitizer (no script/event handlers/forms/iframes/use/foreignObject), CSP `default-src 'none'`, script only by nonce, shadow DOM isolation | sanitize tests + renderer test (network blocked) |
| Network access / exfiltration from scenes  | CSP, Playwright route interception (only `ff-assets.invalid/a/<id>` served), no permissions, service workers blocked                                 | rendering test                                   |
| Active SVG / disguised executables         | content sniffing, SVG reject-list, `<img>`-only use                                                                                                  | tests/unit/assets, e2e import test               |
| Zip bombs, traversal, tampering            | entry/size limits before inflate, safe-path check, per-file SHA-256 + size + type check                                                              | tests/unit/assets                                |
| Path traversal / symlink escape            | `resolveInside` with realpath, ids (not archive paths) as file names, private 0700 temp dirs                                                         | tests/security/filesystem                        |
| Overwriting user files                     | refuse existing output unless explicitly allowed; native save dialog confirms; partial file + atomic rename                                          | rendering tests, desktop e2e                     |
| Command injection                          | FFmpeg via `spawn` argument array, values from validated enums/numbers                                                                               | `buildEncodeArgs` design, code review            |
| Untrusted page calls privileged APIs       | contextIsolation, sandbox, no Node, 10-method bridge, sender + frame + origin check, arg validation, opaque tokens                                   | tests/security/electron, tests/e2e/desktop       |
| Navigation / new windows to remote content | `will-navigate` + window-open handlers, request filter, custom protocol                                                                              | desktop e2e                                      |
| Cloud: forged identity / IDOR              | server-side ID token verification (audience, issuer, expiry, verified email); data folder derived from token subject; ids only resolved inside it    | tests/security/apps-script                       |
| Cloud: abuse / quota                       | payload and page limits, rate limit per user, lock, quota error mapping                                                                              | apps-script tests                                |
| Secrets in repo                            | placeholders only, CI secret scan                                                                                                                    | scan-secrets                                     |

## Residual risks and limitations

- **Sandbox off as root:** Chromium's sandbox cannot run as root (CI/containers); the renderer then warns. The remaining isolation is CSP, interception and sanitization. Run as a normal user on desktops.
- **Parser/Chromium vulnerabilities:** a browser exploit in the renderer is not prevented by our controls; keep Chrome/Edge/Electron updated. The render process is separate from the UI process but runs with the user's privileges.
- **Sanitizer is an allowlist, not a proof.** It is backed by CSP and interception; additions to the allowlist need review. JavaScript in scenes is deliberately unsupported.
- **Cloud:** the script owner's Drive stores everyone's data unencrypted; Apps Script cannot restrict CORS origins; `tokeninfo` verification is rate/quota limited. Cloud sync is off by default and has no UI sign-in in v0.1.
- **Browser storage** is not encrypted and can be cleared by the browser.
- **Unsigned installers** will trigger OS warnings; code signing is not configured.
- IPC archive size (≤ 1 GB) is held in memory in the main process during a render start.
