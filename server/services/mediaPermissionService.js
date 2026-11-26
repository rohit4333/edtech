/* Trainer-owned permission for the student's local mute/camera buttons.
 *
 * The browser can only enforce this while its tab is live, so the server keeps
 * the authoritative state. Revoking always marks the media as forced on; the
 * classroom applies the force-on transition before it locks the controls. */

const DEFAULT = {
  studentCanToggleMedia: true,
  forceMicOn: false,
  forceCameraOn: false,
  version: 0,
  updatedAt: null
};

function normalize(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    studentCanToggleMedia: source.studentCanToggleMedia !== false,
    forceMicOn: source.forceMicOn === true,
    forceCameraOn: source.forceCameraOn === true,
    version: Math.max(0, Number(source.version) || 0),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null
  };
}

function setPermission(value, allow) {
  const current = normalize(value);
  const enabled = Boolean(allow);
  return {
    studentCanToggleMedia: enabled,
    forceMicOn: !enabled,
    forceCameraOn: !enabled,
    version: current.version + 1,
    updatedAt: new Date().toISOString()
  };
}

/* Flat, allowlisted keys. Names containing answer/correct/hint/trainer/key are
   never published on the browser event stream. */
function eventPayload(value) {
  const next = normalize(value);
  return {
    studentCanToggleMedia: next.studentCanToggleMedia,
    forceMicOn: next.forceMicOn,
    forceCameraOn: next.forceCameraOn,
    version: next.version,
    at: next.updatedAt || new Date().toISOString()
  };
}

module.exports = { DEFAULT, normalize, setPermission, eventPayload };
