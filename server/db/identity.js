/* Stable UUIDs for normalized live tables.
 *
 * The app's own identities use readable keys such as usr_student_001, while
 * public.student_curriculum and the other normalized relations use uuid keys.
 * Deriving the UUID from the app key keeps both stores in step without ever
 * storing a credential or contact detail in the derived value. Real UUID
 * identities pass through unchanged.
 */
const crypto = require('crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/* A live database may already own a UUID for the same email. Once resolved,
   every normalized relation must reuse it rather than a derived substitute. */
const mappings = new Map();

function stableUuid(value) {
  const text = String(value || '');
  if (UUID.test(text)) return text;
  const hash = crypto.createHash('sha256').update('mathify:' + text).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '5' + hash.slice(13, 16),
    'a' + hash.slice(17, 20),
    hash.slice(20, 32)
  ].join('-');
}

function setMapping(appId, uuid) {
  if (appId && uuid) mappings.set(String(appId), String(uuid));
}

function mappedUuid(appId) {
  return mappings.get(String(appId)) || null;
}

module.exports = { stableUuid, setMapping, mappedUuid };
