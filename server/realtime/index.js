/* Session event transport.
 *
 * In mock mode events live in a bounded local outbox. In live mode the same
 * API writes to the Supabase-backed event table from 0003_live_persistence.sql,
 * so events survive restarts and every API instance reads the same stream.
 * The browser bridge polls the scrubbed /api/sessions/:id/events endpoint and
 * never receives answer keys, hints or trainer-only fields.
 */
const db = require('../db');

const mode = process.env.DATABASE_MODE === 'supabase' ? 'supabase' : 'mock';

function channelName(sessionId) {
  return 'mathify:session:' + sessionId;
}

function publish(sessionId, event, payload) {
  return Promise.resolve(db.appendSessionEvent(sessionId, event, payload || {}))
    .then(function (message) {
      console.log('[realtime:' + mode + ']', message.channel, message.event);
      return message;
    });
}

function recent(limit) {
  return db.recentSessionEvents(limit);
}

/* Session-scoped view used by the browser bridge. `since` is an exclusive
   cursor; callers persist the last seq they handled. */
function forSession(sessionId, since, limit) {
  return db.listSessionEvents(sessionId, since, limit);
}

module.exports = { mode, channelName, publish, recent, forSession };
