/**
 * Projects.gs - per-user project storage in Drive.
 *
 * Isolation: every lookup starts from the folder derived from the VERIFIED token subject
 * (ownerKey). A project id sent by the browser is only ever resolved inside that folder, so it
 * can never address another user's data.
 *
 * Privacy note: files live in the Drive of the account that deployed the script. Anyone with
 * access to that account can read them. Do not store sensitive projects unless you accept this.
 */

function sha256Hex_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes
    .map(function (b) {
      return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
    })
    .join('');
}

function getFolder_(parent, name, create) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return create ? parent.createFolder(name) : null;
}

function getOwnerFolder_(ownerKey, create) {
  var root = getFolder_(DriveApp.getRootFolder(), CONFIG.ROOT_FOLDER_NAME, create);
  return root ? getFolder_(root, ownerKey, create) : null;
}

function findFile_(folder, name) {
  var it = folder.getFilesByName(name);
  return it.hasNext() ? it.next() : null;
}

function readRecord_(folder, id) {
  var f = folder ? findFile_(folder, id + '.json') : null;
  return f ? JSON.parse(f.getBlob().getDataAsString()) : null;
}

function listProjects_(ownerKey, params) {
  var limit = validateLimit_(params.limit);
  var cursor = validateCursor_(params.cursor);
  var folder = getOwnerFolder_(ownerKey, false);
  if (!folder) return { items: [], nextCursor: null };
  var items = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var m = /^([A-Za-z0-9_-]{1,64})\.json$/.exec(f.getName());
    if (!m) continue;
    var rec = JSON.parse(f.getBlob().getDataAsString());
    items.push({ id: m[1], name: rec.name, updatedAt: rec.updatedAt, revision: rec.revision });
  }
  items.sort(function (a, b) {
    return a.id < b.id ? -1 : 1;
  });
  var start = 0;
  if (cursor) {
    while (start < items.length && items[start].id <= cursor) start++;
  }
  var page = items.slice(start, start + limit);
  return { items: page, nextCursor: start + limit < items.length ? page[page.length - 1].id : null };
}

function getProject_(ownerKey, params) {
  var id = validateId_(params.id, 'project id');
  var rec = readRecord_(getOwnerFolder_(ownerKey, false), id);
  if (!rec) fail_('NOT_FOUND', 'Project not found.');
  return rec;
}

function deleteProject_(ownerKey, params) {
  var id = validateId_(params.id, 'project id');
  var folder = getOwnerFolder_(ownerKey, false);
  var f = folder ? findFile_(folder, id + '.json') : null;
  if (!f) fail_('NOT_FOUND', 'Project not found.');
  f.setTrashed(true);
  return { deleted: true };
}
