/**
 * Config.gs - configuration for the OPTIONAL FrameForge cloud backend.
 *
 * Secrets and switches live in Script Properties (Project Settings > Script properties),
 * never in this file or in client code:
 *   GOOGLE_CLIENT_ID  OAuth client ID of your web app (Google Identity Services). Required.
 *   SYNC_ENABLED      Must be exactly "true" for any data action to work. Default: disabled.
 */
var CONFIG = {
  API_VERSION: 1,
  ROOT_FOLDER_NAME: 'FrameForge Cloud',
  MAX_BODY_BYTES: 600 * 1024, // whole request body
  MAX_PROJECT_JSON_BYTES: 500 * 1024, // one project (JSON only, no media)
  MAX_PREFS_BYTES: 8 * 1024,
  MAX_PROJECTS_PER_USER: 200,
  PAGE_SIZE_DEFAULT: 25,
  PAGE_SIZE_MAX: 100,
  RATE_LIMIT_PER_MINUTE: 60,
  TOKEN_CACHE_SECONDS: 300,
  ALLOWED_ACTIONS: ['ping', 'listProjects', 'getProject', 'putProject', 'deleteProject', 'getSyncStatus', 'getPreferences', 'setPreferences'],
  PUBLIC_ACTIONS: ['ping'],
};

function getSetting_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function isSyncEnabled_() {
  return getSetting_('SYNC_ENABLED') === 'true' && !!getSetting_('GOOGLE_CLIENT_ID');
}
