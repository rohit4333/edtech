/* Ephemeral pointer relay for the verified 1-on-1 classroom.
 *
 * Ink and board content stay in the durable session event stream. A pointer
 * position is different: it must never fill that outbox (five moves a second
 * would push the minute-40 warning out of a child's polling window), and it is
 * meaningless after the moment has passed. The relay therefore keeps only the
 * newest position per session, with a monotonic cursor so either peer can ask
 * "anything newer than seq N?" without replaying a trail of stale positions.
 *
 * No text, answer key, trainer note or identity is accepted here. The surface
 * is an allowlisted label and the coordinates are normalised 0-1.
 */

const SURFACES = new Set(['board', 'sketch']);
const MIN_INTERVAL_MS = 45;
const MAX_SESSIONS = 500;
const MAX_AGE_MS = 60 * 60 * 1000;

const latestBySession = new Map();
let seq = 0;

function clamp(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(1, Math.max(0, number));
}

/* Returns null for a malformed move, otherwise the stored (sanitised) point. */
function publish(sessionId, input) {
  if (!sessionId) return null;
  const body = input || {};
  const surface = String(body.surface || '');
  const x = clamp(body.x);
  const y = clamp(body.y);
  if (!SURFACES.has(surface) || x === null || y === null) return null;

  const now = Date.now();
  const previous = latestBySession.get(String(sessionId));
  const active = body.active !== false;
  if (previous && now - previous.clock < MIN_INTERVAL_MS &&
      previous.active === active && previous.surface === surface) {
    return publicRecord(previous);
  }

  /* Bound memory even if a demo server runs for days without a restart. */
  if (!previous && latestBySession.size >= MAX_SESSIONS) {
    let oldestKey = null;
    let oldestAt = Infinity;
    for (const [key, value] of latestBySession) {
      if (value.clock < oldestAt) { oldestAt = value.clock; oldestKey = key; }
    }
    if (oldestKey !== null) latestBySession.delete(oldestKey);
  }
  for (const [key, value] of latestBySession) {
    if (now - value.clock > MAX_AGE_MS) latestBySession.delete(key);
  }

  seq += 1;
  const record = {
    seq: seq,
    at: new Date(now).toISOString(),
    clock: now,
    surface: surface,
    x: Math.round(x * 10000) / 10000,
    y: Math.round(y * 10000) / 10000,
    active: active
  };
  latestBySession.set(String(sessionId), record);
  return publicRecord(record);
}

function publicRecord(record) {
  if (!record) return null;
  return {
    seq: record.seq,
    at: record.at,
    surface: record.surface,
    x: record.x,
    y: record.y,
    active: record.active
  };
}

function latest(sessionId, since) {
  const record = latestBySession.get(String(sessionId));
  if (!record) return null;
  const cursor = Number(since) || 0;
  return record.seq > cursor ? publicRecord(record) : null;
}

function clear(sessionId) {
  return latestBySession.delete(String(sessionId));
}

module.exports = { publish, latest, clear, SURFACES };
