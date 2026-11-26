/* Trainer-owned permissions for the kid's engagement gestures.
 *
 * Both gestures default to enabled. A trainer can pause either one without
 * touching the other, and neither toggle touches camera, microphone, quiz
 * correctness or the celebration system. Only the JWT role can write this. */

const DEFAULT = {
  studentCanReact: true,
  studentCanApplaud: true,
  version: 0,
  updatedAt: null
};

function normalize(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    studentCanReact: source.studentCanReact !== false,
    studentCanApplaud: source.studentCanApplaud !== false,
    version: Math.max(0, Number(source.version) || 0),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null
  };
}

/* A patch may carry one or both booleans. Missing keys are left untouched so
   a stale client cannot accidentally re-enable a paused gesture. */
function setPermission(value, patch) {
  const current = normalize(value);
  const input = patch && typeof patch === 'object' ? patch : {};
  const next = normalize({
    studentCanReact: typeof input.studentCanReact === 'boolean'
      ? input.studentCanReact : current.studentCanReact,
    studentCanApplaud: typeof input.studentCanApplaud === 'boolean'
      ? input.studentCanApplaud : current.studentCanApplaud,
    version: current.version,
    updatedAt: current.updatedAt
  });
  if (next.studentCanReact === current.studentCanReact &&
      next.studentCanApplaud === current.studentCanApplaud) return current;
  next.version = current.version + 1;
  next.updatedAt = new Date().toISOString();
  return next;
}

/* Flat keys only: no user id, note or identity crosses the event channel. */
function eventPayload(value) {
  const current = normalize(value);
  return {
    studentCanReact: current.studentCanReact,
    studentCanApplaud: current.studentCanApplaud,
    version: current.version,
    at: current.updatedAt || new Date().toISOString()
  };
}

module.exports = { normalize, setPermission, eventPayload, DEFAULT };
