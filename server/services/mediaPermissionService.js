/* Trainer-owned control of the student's camera and microphone.
 *
 * Two distinct powers live here:
 *  1. Access: whether the student may toggle their own mic/camera. Revoking
 *     always marks tracks as forced on; the classroom applies that force-on
 *     transition before locking the controls.
 *  2. Explicit remote state: the trainer may intentionally mute the student or
 *     switch their camera off. This overrides the force-on default and is
 *     reported honestly by the browser when a track cannot actually change.
 *
 * The browser can only enforce this while its tab is live, so the server keeps
 * the authoritative state. */

const DEFAULT = {
  studentCanToggleMedia: true,
  forceMicOn: false,
  forceCameraOn: false,
  studentMuted: false,
  studentCameraOff: false,
  version: 0,
  updatedAt: null
};

function normalize(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    studentCanToggleMedia: source.studentCanToggleMedia !== false,
    forceMicOn: source.forceMicOn === true,
    forceCameraOn: source.forceCameraOn === true,
    studentMuted: source.studentMuted === true,
    studentCameraOff: source.studentCameraOff === true,
    version: Math.max(0, Number(source.version) || 0),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null
  };
}

function setPermission(value, allow) {
  const current = normalize(value);
  const enabled = Boolean(allow);
  return Object.assign({}, current, {
    studentCanToggleMedia: enabled,
    forceMicOn: !enabled,
    forceCameraOn: !enabled,
    version: current.version + 1,
    updatedAt: new Date().toISOString()
  });
}

/* A patch may change mic, camera or both. Missing keys stay untouched so an
   old client cannot accidentally restore a track the trainer turned off. */
function setRemoteState(value, patch) {
  const current = normalize(value);
  const input = patch && typeof patch === 'object' ? patch : {};
  const next = Object.assign({}, current, {
    studentMuted: typeof input.micOn === 'boolean' ? !input.micOn : current.studentMuted,
    studentCameraOff: typeof input.cameraOn === 'boolean' ? !input.cameraOn : current.studentCameraOff
  });
  if (next.studentMuted === current.studentMuted &&
      next.studentCameraOff === current.studentCameraOff) return current;
  next.version = current.version + 1;
  next.updatedAt = new Date().toISOString();
  return next;
}

/* Flat, allowlisted keys. Names containing answer/correct/hint/trainer/key are
   never published on the browser event stream. */
function eventPayload(value) {
  const next = normalize(value);
  return {
    studentCanToggleMedia: next.studentCanToggleMedia,
    forceMicOn: next.forceMicOn,
    forceCameraOn: next.forceCameraOn,
    studentMuted: next.studentMuted,
    studentCameraOff: next.studentCameraOff,
    version: next.version,
    at: next.updatedAt || new Date().toISOString()
  };
}

module.exports = { DEFAULT, normalize, setPermission, setRemoteState, eventPayload };
