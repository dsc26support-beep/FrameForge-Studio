/**
 * Code.gs - web app entry points, authentication and routing for the OPTIONAL cloud backend.
 *
 * Deploy as a web app (see docs/APPS_SCRIPT.md). The browser sends a Google ID token obtained via
 * Google Identity Services; we verify it server-side on every request. A secret URL, CORS settings or
 * a client-supplied key are NOT treated as authentication.
 *
 * Known limitations: tokeninfo verification costs one UrlFetch per uncached token (quota applies);
 * the script owner can read stored files; Apps Script cannot set CORS headers or restrict origins.
 */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ok_(data) {
  return json_({ ok: true, data: data });
}

function err_(code, message, extra) {
  var e = { code: code, message: message };
  if (extra) e.details = extra;
  return json_({ ok: false, error: e });
}

/** GET is a health check only. It never returns user data. */
function doGet() {
  return ok_({ service: 'frameforge-cloud', apiVersion: CONFIG.API_VERSION, syncEnabled: isSyncEnabled_() });
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    var action = validateAction_(body.action);
    if (CONFIG.PUBLIC_ACTIONS.indexOf(action) !== -1) {
      return ok_({ pong: true, apiVersion: CONFIG.API_VERSION, syncEnabled: isSyncEnabled_() });
    }
    if (!isSyncEnabled_()) fail_('DISABLED', 'Cloud sync is disabled on this deployment.');
    var user = authenticate_(body.idToken);
    enforceRateLimit_(user.ownerKey);
    var params = body.params && typeof body.params === 'object' && !Array.isArray(body.params) ? body.params : {};
    return ok_(route_(action, user.ownerKey, params));
  } catch (error) {
    if (error instanceof ApiError_) return err_(error.code, error.message, error.extra);
    var msg = String(error && error.message ? error.message : error);
    if (/too many times|quota|rate limit/i.test(msg)) return err_('QUOTA', 'Apps Script quota reached. Try again later.', { retryAfterSeconds: 60 });
    console.error(msg);
    return err_('INTERNAL', 'Unexpected server error.');
  }
}

function route_(action, ownerKey, params) {
  switch (action) {
    case 'listProjects':
      return listProjects_(ownerKey, params);
    case 'getProject':
      return getProject_(ownerKey, params);
    case 'putProject':
      return putProject_(ownerKey, params);
    case 'deleteProject':
      return deleteProject_(ownerKey, params);
    case 'getSyncStatus':
      return getSyncStatus_(ownerKey);
    case 'getPreferences':
      return getPreferences_(ownerKey);
    case 'setPreferences':
      return setPreferences_(ownerKey, params);
    default:
      fail_('UNKNOWN_ACTION', 'Unknown action.');
  }
}

/** Verifies a Google ID token and returns the stable owner key (hash of the token subject). */
function authenticate_(idToken) {
  if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 4096 || !/^[A-Za-z0-9._-]+$/.test(idToken)) fail_('UNAUTHENTICATED', 'Sign in required.');
  var cache = CacheService.getScriptCache();
  var cacheKey = 'tok_' + sha256Hex_(idToken);
  var cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) fail_('UNAUTHENTICATED', 'Invalid or expired sign-in.');
  var info;
  try {
    info = JSON.parse(res.getContentText());
  } catch (x) {
    fail_('UNAUTHENTICATED', 'Invalid sign-in response.');
  }
  var now = Math.floor(Date.now() / 1000);
  var issuerOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  if (info.aud !== getSetting_('GOOGLE_CLIENT_ID') || !issuerOk || Number(info.exp) <= now || !info.sub || String(info.email_verified) !== 'true') {
    fail_('UNAUTHENTICATED', 'Sign-in was not accepted for this application.');
  }
  var user = { ownerKey: sha256Hex_('sub:' + info.sub) };
  var ttl = Math.max(1, Math.min(CONFIG.TOKEN_CACHE_SECONDS, Number(info.exp) - now));
  cache.put(cacheKey, JSON.stringify(user), ttl);
  return user;
}

function enforceRateLimit_(ownerKey) {
  var cache = CacheService.getScriptCache();
  var key = 'rl_' + ownerKey + '_' + Math.floor(Date.now() / 60000);
  var n = Number(cache.get(key) || 0) + 1;
  if (n > CONFIG.RATE_LIMIT_PER_MINUTE) fail_('RATE_LIMITED', 'Too many requests. Slow down.', { retryAfterSeconds: 30 });
  cache.put(key, String(n), 120);
}
