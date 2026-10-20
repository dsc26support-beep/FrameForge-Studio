/** Validation.gs - strict validation of every request. Anything not explicitly allowed is rejected. */

var ID_PATTERN_ = /^[A-Za-z0-9_-]{1,64}$/;

function ApiError_(code, message, extra) {
  this.code = code;
  this.message = message;
  this.extra = extra || null;
}

function fail_(code, message, extra) {
  throw new ApiError_(code, message, extra);
}

function byteLength_(str) {
  return Utilities.newBlob(str).getBytes().length;
}

/** Parses the POST body: JSON text, bounded size, plain object. */
function parseBody_(e) {
  if (!e || !e.postData || typeof e.postData.contents !== 'string') fail_('BAD_REQUEST', 'Missing request body.');
  var text = e.postData.contents;
  if (byteLength_(text) > CONFIG.MAX_BODY_BYTES) fail_('PAYLOAD_TOO_LARGE', 'Request body is too large.');
  var body;
  try {
    body = JSON.parse(text);
  } catch (err) {
    fail_('BAD_REQUEST', 'Body is not valid JSON.');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) fail_('BAD_REQUEST', 'Body must be a JSON object.');
  return body;
}

function validateAction_(action) {
  if (typeof action !== 'string' || CONFIG.ALLOWED_ACTIONS.indexOf(action) === -1) fail_('UNKNOWN_ACTION', 'Unknown action.');
  return action;
}

function validateId_(id, label) {
  if (typeof id !== 'string' || !ID_PATTERN_.test(id)) fail_('BAD_REQUEST', 'Invalid ' + (label || 'id') + '.');
  return id;
}

function validateLimit_(limit) {
  if (limit === undefined || limit === null) return CONFIG.PAGE_SIZE_DEFAULT;
  if (typeof limit !== 'number' || limit % 1 !== 0 || limit < 1 || limit > CONFIG.PAGE_SIZE_MAX) fail_('BAD_REQUEST', 'limit must be an integer between 1 and ' + CONFIG.PAGE_SIZE_MAX + '.');
  return limit;
}

function validateCursor_(cursor) {
  if (cursor === undefined || cursor === null || cursor === '') return null;
  if (typeof cursor !== 'string' || cursor.length > 200 || !/^[A-Za-z0-9_-]+$/.test(cursor)) fail_('BAD_REQUEST', 'Invalid cursor.');
  return cursor;
}

function validateIsoDate_(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value) || isNaN(Date.parse(value))) fail_('BAD_REQUEST', 'Invalid ' + label + '.');
  return value;
}

/** Validates the envelope of a project upload. The client re-validates the full schema when reading it back. */
function validateProjectPut_(params) {
  var id = validateId_(params.id, 'project id');
  if (typeof params.name !== 'string' || params.name.length < 1 || params.name.length > 120) fail_('BAD_REQUEST', 'Invalid project name.');
  var updatedAt = validateIsoDate_(params.updatedAt, 'updatedAt');
  var base = params.baseRevision;
  if (typeof base !== 'number' || base % 1 !== 0 || base < 0) fail_('BAD_REQUEST', 'baseRevision must be a non-negative integer.');
  if (typeof params.projectJson !== 'string') fail_('BAD_REQUEST', 'projectJson must be a string.');
  if (byteLength_(params.projectJson) > CONFIG.MAX_PROJECT_JSON_BYTES) fail_('PAYLOAD_TOO_LARGE', 'Project is too large for cloud backup (media is never uploaded).');
  var project;
  try {
    project = JSON.parse(params.projectJson);
  } catch (err) {
    fail_('BAD_REQUEST', 'projectJson is not valid JSON.');
  }
  if (!project || typeof project !== 'object' || project.id !== id) fail_('BAD_REQUEST', 'Project id does not match.');
  if (typeof project.schemaVersion !== 'number' || project.schemaVersion < 1 || project.schemaVersion > 1000) fail_('BAD_REQUEST', 'Invalid schemaVersion.');
  if (!Array.isArray(project.scenes) || project.scenes.length > 200) fail_('BAD_REQUEST', 'Invalid scenes.');
  return { id: id, name: params.name, updatedAt: updatedAt, baseRevision: base, projectJson: params.projectJson };
}

function validatePrefs_(prefs) {
  if (prefs === null || typeof prefs !== 'object' || Array.isArray(prefs)) fail_('BAD_REQUEST', 'preferences must be an object.');
  var clean = {};
  var allowed = { theme: ['system', 'light', 'dark'], uiMotion: ['system', 'reduce', 'full'], lowResource: ['auto', 'on', 'off'] };
  Object.keys(prefs).forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(allowed, k)) fail_('BAD_REQUEST', 'Unknown preference: ' + k);
    if (allowed[k].indexOf(prefs[k]) === -1) fail_('BAD_REQUEST', 'Invalid value for ' + k + '.');
    clean[k] = prefs[k];
  });
  if (byteLength_(JSON.stringify(clean)) > CONFIG.MAX_PREFS_BYTES) fail_('PAYLOAD_TOO_LARGE', 'Preferences too large.');
  return clean;
}
