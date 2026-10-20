/**
 * Sync.gs - optimistic-concurrency sync with explicit conflict reporting.
 *
 * Every stored project has an integer `revision`. A client may only overwrite revision N by sending
 * baseRevision = N. If another device saved in between, the server answers CONFLICT with the current
 * revision and metadata; the CLIENT decides (keep mine / keep theirs / duplicate). The server never
 * merges silently and never overwrites data it was not asked to.
 */

function putProject_(ownerKey, params) {
  var p = validateProjectPut_(params);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) fail_('BUSY', 'The server is busy, please retry.', { retryAfterSeconds: 5 });
  try {
    var folder = getOwnerFolder_(ownerKey, true);
    var existing = findFile_(folder, p.id + '.json');
    var current = existing ? JSON.parse(existing.getBlob().getDataAsString()) : null;
    if (!current) {
      if (p.baseRevision !== 0) fail_('CONFLICT', 'Project does not exist on the server.', { serverRevision: 0 });
      var count = 0;
      var it = folder.getFiles();
      while (it.hasNext()) {
        it.next();
        count++;
      }
      if (count >= CONFIG.MAX_PROJECTS_PER_USER) fail_('LIMIT_REACHED', 'Cloud project limit reached (' + CONFIG.MAX_PROJECTS_PER_USER + ').');
    } else if (current.revision !== p.baseRevision) {
      fail_('CONFLICT', 'The project changed on another device.', { serverRevision: current.revision, serverUpdatedAt: current.updatedAt, serverName: current.name });
    }
    var record = { id: p.id, name: p.name, updatedAt: p.updatedAt, revision: (current ? current.revision : 0) + 1, projectJson: p.projectJson };
    var json = JSON.stringify(record);
    if (existing) existing.setContent(json);
    else folder.createFile(p.id + '.json', json, 'application/json');
    return { id: p.id, revision: record.revision, updatedAt: record.updatedAt };
  } finally {
    lock.releaseLock();
  }
}

function getSyncStatus_(ownerKey) {
  var folder = getOwnerFolder_(ownerKey, false);
  var count = 0;
  if (folder) {
    var it = folder.getFiles();
    while (it.hasNext()) {
      var n = it.next().getName();
      if (/\.json$/.test(n)) count++;
    }
  }
  return { enabled: true, apiVersion: CONFIG.API_VERSION, projectCount: count, projectLimit: CONFIG.MAX_PROJECTS_PER_USER };
}

function getPreferences_(ownerKey) {
  var folder = getOwnerFolder_(ownerKey, false);
  var f = folder ? findFile_(folder, 'preferences.cfg') : null;
  return f ? JSON.parse(f.getBlob().getDataAsString()) : {};
}

function setPreferences_(ownerKey, params) {
  var prefs = validatePrefs_(params.preferences);
  var folder = getOwnerFolder_(ownerKey, true);
  var f = findFile_(folder, 'preferences.cfg');
  if (f) f.setContent(JSON.stringify(prefs));
  else folder.createFile('preferences.cfg', JSON.stringify(prefs), 'application/json');
  return prefs;
}
