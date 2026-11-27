/* Session versioning for credential changes.
 *
 * Every access and refresh token carries the account's tokenVersion. A password
 * replacement bumps that integer so previously issued tokens stop working at
 * once. Demo child and parent accounts share one password, so the bump is
 * applied to both sides of the family login and recorded on the demo request.
 */
const db = require('../db');

async function linkedAccountIds(userId) {
  const user = await Promise.resolve(db.findUserById(String(userId || '')));
  if (!user) return { user: null, ids: [], request: null };

  const ids = [];
  function add(id) {
    if (id && ids.indexOf(id) === -1) ids.push(id);
  }
  add(user.id);

  let request = null;
  if (user.demoId) {
    request = await Promise.resolve(db.findContactRequest(String(user.demoId)));
  }
  if (!request && user.role === 'student') {
    request = await Promise.resolve(db.findContactRequestForStudent(user.id));
  }
  if (!request && user.role === 'parent') {
    const rows = await Promise.resolve(db.listContactRequests(200));
    request = (Array.isArray(rows) ? rows : []).find(function (row) {
      return row.parentId === user.id;
    }) || null;
  }
  if (request) {
    add(request.studentId);
    add(request.parentId);
  }
  return { user: user, ids: ids, request: request };
}

async function versionFor(ids, request) {
  const users = await Promise.all((ids || []).map(function (id) {
    return Promise.resolve(db.findUserById(id));
  }));
  const values = users.filter(Boolean).map(function (user) {
    return Number(user.tokenVersion || 0);
  });
  if (request) values.push(Number(request.tokenVersion || 0));
  return values.reduce(function (max, value) {
    return value > max ? value : max;
  }, 0) + 1;
}

/* Demo preparation supplies the two account IDs itself, so it does not need a
   second database lookup before allocating the next version. */
async function nextVersion(ids, request) {
  return versionFor(Array.isArray(ids) ? ids : [ids], request);
}

/* Apply a credential patch to the signed-in account and, when present, the
   other half of the shared demo login. Returns the new version to the caller. */
async function bump(userId, patch, requestPatch) {
  const linked = await linkedAccountIds(userId);
  if (!linked.user) return null;
  const version = await versionFor(linked.ids, linked.request);
  const securedPatch = Object.assign({}, patch || {}, { tokenVersion: version });
  const updates = await Promise.all(linked.ids.map(function (id) {
    return Promise.resolve(db.updateUser(id, function (current) {
      return current ? Object.assign(current, securedPatch) : current;
    }));
  }));

  let request = linked.request;
  if (request) {
    request = await Promise.resolve(db.updateContactRequest(request.id, Object.assign({}, request,
      requestPatch || {}, { tokenVersion: version })));
  }
  const primaryIndex = linked.ids.indexOf(linked.user.id);
  return {
    version: version,
    user: updates[primaryIndex] || linked.user,
    request: request || linked.request
  };
}

module.exports = { linkedAccountIds, nextVersion, bump };
