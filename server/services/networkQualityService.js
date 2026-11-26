/* Two-sided connection precondition for a 1:1 class.
 *
 * A browser measurement is a client-reported observation; the server cannot
 * rip a router out of the wall to verify it. What the server does own is the
 * gate: no RTC token is issued until both verified participants have submitted
 * a fresh result that clears the configured floor. A result expires after
 * maxAgeMinutes so a connection that degrades later cannot keep a class alive. */

const appPolicy = require('../config/policy.json');

const DEFAULTS = {
  minDownloadMbps: 15,
  minUploadMbps: 10,
  maxLatencyMs: 250,
  maxAgeMinutes: 15,
  probeBytes: 524288
};

function settings() {
  const configured = appPolicy.networkCheck && typeof appPolicy.networkCheck === 'object'
    ? appPolicy.networkCheck : {};
  return {
    minDownloadMbps: Number(configured.minDownloadMbps) || DEFAULTS.minDownloadMbps,
    minUploadMbps: Number(configured.minUploadMbps) || DEFAULTS.minUploadMbps,
    maxLatencyMs: Number(configured.maxLatencyMs) || DEFAULTS.maxLatencyMs,
    maxAgeMinutes: Number(configured.maxAgeMinutes) || DEFAULTS.maxAgeMinutes,
    probeBytes: Number(configured.probeBytes) || DEFAULTS.probeBytes
  };
}

function round(value, places) {
  const scale = Math.pow(10, places || 0);
  return Math.round(Number(value) * scale) / scale;
}

function validateMeasurement(input) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const keys = ['downloadMbps', 'uploadMbps', 'latencyMs'];
  const value = {};
  for (const key of keys) {
    const number = Number(body[key]);
    if (!Number.isFinite(number) || number < 0 || number > (key === 'latencyMs' ? 10000 : 2000)) {
      return { ok: false, error: key + ' must be a finite number in range.' };
    }
    value[key] = number;
  }
  return { ok: true, value: value };
}

function evaluate(input) {
  const validation = validateMeasurement(input);
  const config = settings();
  const at = new Date().toISOString();
  const thresholds = {
    minDownloadMbps: config.minDownloadMbps,
    minUploadMbps: config.minUploadMbps,
    maxLatencyMs: config.maxLatencyMs
  };
  if (!validation.ok) {
    return {
      ok: false,
      downloadMbps: null,
      uploadMbps: null,
      latencyMs: null,
      thresholds: thresholds,
      failures: [validation.error],
      checkedAt: at
    };
  }

  const measured = validation.value;
  const failures = [];
  if (measured.downloadMbps < config.minDownloadMbps) {
    failures.push('Download speed is below ' + config.minDownloadMbps + ' Mbps.');
  }
  if (measured.uploadMbps < config.minUploadMbps) {
    failures.push('Upload speed is below ' + config.minUploadMbps + ' Mbps.');
  }
  if (measured.latencyMs > config.maxLatencyMs) {
    failures.push('Latency is above ' + config.maxLatencyMs + ' ms.');
  }

  return {
    ok: failures.length === 0,
    downloadMbps: round(measured.downloadMbps, 2),
    uploadMbps: round(measured.uploadMbps, 2),
    latencyMs: Math.round(measured.latencyMs),
    thresholds: thresholds,
    failures: failures,
    checkedAt: at
  };
}

function roleFor(user) {
  return user && user.role === 'student' ? 'student' : 'trainer';
}

function isFresh(check) {
  if (!check || check.ok !== true || !check.checkedAt) return false;
  const age = Date.now() - new Date(check.checkedAt).getTime();
  const maxAgeMs = settings().maxAgeMinutes * 60 * 1000;
  return Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
}

function bothReady(session) {
  const checks = session && session.networkChecks && typeof session.networkChecks === 'object'
    ? session.networkChecks : {};
  return isFresh(checks.trainer) && isFresh(checks.student);
}

/* Peer roles only see pass/fail and a timestamp. The person who ran the test
   (and founders) can see their own measured numbers. */
function stateFor(session, user) {
  const config = settings();
  const checks = session && session.networkChecks && typeof session.networkChecks === 'object'
    ? session.networkChecks : {};
  const viewerRole = roleFor(user);

  function view(role) {
    const check = checks[role];
    if (!check) return { ok: false, status: 'not_checked', checkedAt: null, failures: [] };
    const fresh = isFresh(check);
    const result = {
      ok: fresh,
      status: fresh ? 'ready' : (check.ok ? 'expired' : 'below_minimum'),
      checkedAt: check.checkedAt || null,
      failures: Array.isArray(check.failures) && !fresh ? check.failures.slice() : []
    };
    if (viewerRole === role || viewerRole === 'founder') {
      result.downloadMbps = check.downloadMbps === undefined ? null : check.downloadMbps;
      result.uploadMbps = check.uploadMbps === undefined ? null : check.uploadMbps;
      result.latencyMs = check.latencyMs === undefined ? null : check.latencyMs;
    }
    return result;
  }

  return {
    required: {
      downloadMbps: config.minDownloadMbps,
      uploadMbps: config.minUploadMbps,
      maxLatencyMs: config.maxLatencyMs
    },
    maxAgeMinutes: config.maxAgeMinutes,
    probeBytes: config.probeBytes,
    canStartCall: bothReady(session),
    trainer: view('trainer'),
    student: view('student')
  };
}

function eventPayload(session, role, result) {
  return {
    role: role === 'student' ? 'student' : 'trainer',
    ok: Boolean(result && result.ok),
    canStartCall: bothReady(session),
    at: new Date().toISOString()
  };
}

module.exports = {
  settings,
  validateMeasurement,
  evaluate,
  roleFor,
  isFresh,
  bothReady,
  stateFor,
  eventPayload
};
