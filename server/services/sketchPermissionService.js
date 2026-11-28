/* Trainer-owned permission for the kid's quiz-popup scratch tools.
 *
 * The scratch toolkit is available by default. A trainer revoke is sticky for
 * the whole session: quiz launch, next question, reload and Retest must all
 * keep the denied value until the trainer explicitly grants it again. Only a
 * JWT-verified trainer/founder can write this state. */

const DEFAULT = {
  studentCanSketch: true,
  version: 0,
  updatedAt: null
};

function normalize(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    studentCanSketch: source.studentCanSketch !== false,
    version: Math.max(0, Number(source.version) || 0),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null
  };
}

/* A patch is explicit: an omitted field never re-enables a revoked tool. */
function setPermission(value, patch) {
  const current = normalize(value);
  const input = patch && typeof patch === 'object' ? patch : {};
  const next = normalize({
    studentCanSketch: typeof input.studentCanSketch === 'boolean'
      ? input.studentCanSketch : current.studentCanSketch,
    version: current.version,
    updatedAt: current.updatedAt
  });
  if (next.studentCanSketch === current.studentCanSketch) return current;
  next.version = current.version + 1;
  next.updatedAt = new Date().toISOString();
  return next;
}

/* Flat allowlisted keys only. No answer, correctness or trainer note can ride
   on the shared browser event channel. */
function eventPayload(value) {
  const current = normalize(value);
  return {
    studentCanSketch: current.studentCanSketch,
    version: current.version,
    at: current.updatedAt || new Date().toISOString()
  };
}

module.exports = { DEFAULT, normalize, setPermission, eventPayload };
