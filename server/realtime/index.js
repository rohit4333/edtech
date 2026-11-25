/* Phase 2 will replace publish() with Supabase Realtime channel sends.
   Phase 1 keeps a local log so routes can be tested without external services.
   Every message carries a monotonic seq so browsers can resume without missing
   or replaying events. */
const mode = process.env.REALTIME_MODE || 'mock';
const log = [];
let sequence = 0;

function channelName(sessionId) {
  return 'mathify:session:' + sessionId;
}

function publish(sessionId, event, payload) {
  sequence += 1;
  const message = {
    seq: sequence,
    at: new Date().toISOString(),
    channel: channelName(sessionId),
    event,
    payload: payload || {}
  };
  log.push(message);
  if (log.length > 200) log.shift();
  console.log('[realtime:' + mode + ']', message.channel, message.event);
  return Promise.resolve(message);
}

function recent(limit) {
  return log.slice(-Math.max(1, Number(limit || 20)));
}

/* Session-scoped view used by the browser bridge. `since` is an exclusive
   cursor; callers persist the last seq they handled. */
function forSession(sessionId, since, limit) {
  const channel = channelName(sessionId);
  const cursor = Number(since) || 0;
  const max = Math.max(1, Math.min(Number(limit) || 50, 200));
  return log.filter(function (message) {
    return message.channel === channel && message.seq > cursor;
  }).slice(-max);
}

module.exports = { mode, channelName, publish, recent, forSession };
