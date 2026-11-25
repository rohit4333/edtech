/* Phase 2 will replace publish() with Supabase Realtime channel sends.
   Phase 1 keeps a local log so routes can be tested without external services. */
const mode = process.env.REALTIME_MODE || 'mock';
const log = [];

function channelName(sessionId) {
  return 'mathify:session:' + sessionId;
}

function publish(sessionId, event, payload) {
  const message = {
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

module.exports = { mode, channelName, publish, recent };
