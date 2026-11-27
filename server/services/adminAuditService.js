/* ==========================================================================
   MATHIFY — append-only people administration audit

   Every founder or relationship-manager action is written as one JSON line to
   server/logs/admin-actions.jsonl and returned to the founder dashboard. Only
   safe, named fields are accepted: passwords, hashes, salts and tokens are
   never written here. The file is service-side only and is not served as a
   static browser asset.
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'admin-actions.jsonl');
const PUBLIC_PATH = 'server/logs/admin-actions.jsonl';
const DETAIL_KEYS = [
  'subject', 'status', 'role', 'rate', 'amount', 'reason', 'batchId', 'trainerId',
  'studentId', 'generated', 'generatedPasswordIssued', 'temporaryPasswordIssued',
  'locked', 'note'
];

function brief(value) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  return text.slice(0, 500);
}

function safeDetail(input) {
  const source = input && typeof input === 'object' ? input : {};
  const result = {};
  DETAIL_KEYS.forEach(function (key) {
    if (source[key] === undefined || source[key] === null) return;
    if (typeof source[key] === 'object') return;
    result[key] = brief(source[key]);
  });
  return result;
}

function record(input) {
  const body = input || {};
  const entry = {
    at: brief(body.at) || new Date().toISOString(),
    actorRole: brief(body.actorRole) || 'unknown',
    actorId: brief(body.actorId) || null,
    actorName: brief(body.actorName) || null,
    action: brief(body.action) || 'admin.action',
    targetType: brief(body.targetType) || null,
    targetId: brief(body.targetId) || null,
    targetName: brief(body.targetName) || null,
    detail: safeDetail(body.detail)
  };
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
  return entry;
}

function list(options) {
  const settings = options || {};
  let rows = [];
  try {
    if (!fs.existsSync(LOG_FILE)) return { entries: [], logFile: PUBLIC_PATH };
    rows = fs.readFileSync(LOG_FILE, 'utf8').split(/\r?\n/)
      .filter(Boolean)
      .map(function (line) {
        try { return JSON.parse(line); } catch (error) { return null; }
      })
      .filter(Boolean);
  } catch (error) {
    return { entries: [], logFile: PUBLIC_PATH };
  }
  const role = settings.role ? String(settings.role) : null;
  if (role) rows = rows.filter(function (row) { return row.actorRole === role; });
  const limit = Math.max(1, Math.min(500, Number(settings.limit || 100)));
  return { entries: rows.slice(-limit).reverse(), logFile: PUBLIC_PATH };
}

module.exports = {
  LOG_FILE: LOG_FILE,
  PUBLIC_PATH: PUBLIC_PATH,
  record: record,
  list: list
};
