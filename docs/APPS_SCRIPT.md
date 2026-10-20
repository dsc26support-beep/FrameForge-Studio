# Optional Google Apps Script backend

The editor works fully without this. Nothing is uploaded unless **you** deploy the script and enable sync. Media files are **never** uploaded; only project JSON (≤ 500 KB each), names, timestamps and three UI preferences.

## What it does

Actions (explicit allowlist): `ping` (public health check), `listProjects` (paginated), `getProject`, `putProject`, `deleteProject`, `getSyncStatus`, `getPreferences`, `setPreferences`. Responses always look like `{ok:true,data}` or `{ok:false,error:{code,message,details?}}`. Files: `Code.gs` (entry points, auth, routing, rate limit), `Validation.gs`, `Projects.gs` (storage), `Sync.gs` (revisions and conflicts), `Config.gs`.

## Authentication model and its limits

1. The web page obtains a **Google ID token** with Google Identity Services (OAuth client ID of your own web app).
2. It POSTs `text/plain` JSON (no CORS preflight needed) with `{action, params, idToken}`.
3. The script verifies the token with `https://oauth2.googleapis.com/tokeninfo`: audience must equal `GOOGLE_CLIENT_ID`, issuer Google, not expired, verified email. The owner key is `sha256("sub:" + sub)`. Verified tokens are cached up to 5 min.
4. Every read/write is resolved **inside the owner's folder** (`FrameForge Cloud/<ownerKey>/`). A project id from the browser is never proof of ownership.

Limitations (be honest with your users): the deployment runs as _you_, so **you can read all stored files**, and they are not end-to-end encrypted; the web app URL is public (anyone can send requests, but every data action needs a valid token); Apps Script cannot set CORS headers or allow-list origins; `tokeninfo` is documented for debugging and counts against UrlFetch quota; Apps Script has daily quotas (the script maps quota errors to `QUOTA` with a retry hint); no passwords are ever stored. The browser UI does not yet include the sign-in flow (the validated client library `apps/web/src/cloud/client.ts` exists and is tested).

## Deploy

1. Go to https://script.google.com → New project → name it _FrameForge Cloud_.
2. Create files `Code.gs`, `Config.gs`, `Projects.gs`, `Sync.gs`, `Validation.gs` and paste the contents from `apps-script/`. Enable _Project Settings → Show appsscript.json_ and paste `apps-script/appsscript.json` (or use [clasp](https://github.com/google/clasp): `npm i -g @google/clasp && clasp login && clasp create --type webapp && clasp push`).
3. In Google Cloud Console create an **OAuth client ID (Web application)** for your site origin(s). Copy the client ID.
4. Apps Script → _Project Settings → Script properties_: add `GOOGLE_CLIENT_ID` = your client ID and `SYNC_ENABLED` = `true`. (Leave `SYNC_ENABLED` unset to keep sync disabled.)
5. _Deploy → New deployment → Web app_: **Execute as: Me**, **Who has access: Anyone**. Authorise the Drive and external-request scopes when asked. Copy the `/exec` URL.
6. Test: `curl -s -X POST -H "Content-Type: text/plain" -d '{"action":"ping"}' -L "<exec URL>"` should return `{"ok":true,"data":{"pong":true,...}}`. A data action without a token must return `UNAUTHENTICATED`.
7. After editing code, create a **new deployment version** (the URL stays the same when you edit the existing deployment).

## Tests

`tests/security/apps-script.test.ts` runs the real `.gs` files in a Node VM against in-memory fakes of PropertiesService, CacheService, LockService, DriveApp and UrlFetchApp. **Not tested against the real Apps Script runtime or real Google tokens** (needs your account); do step 6 after deploying.

## Conflict handling

Each project has a `revision`. `putProject` must send `baseRevision` equal to the stored revision (0 for new). Otherwise the server answers `CONFLICT` with `serverRevision`, `serverUpdatedAt`; the client must ask the user to keep theirs, keep the cloud copy, or save as a copy. The server never merges or overwrites silently.
