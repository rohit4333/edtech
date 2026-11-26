/* Structured JSON logger for server-side diagnostics.
   Metadata only: tokens, keys, secrets and request bodies are never logged. */

const SENSITIVE_KEY = /authorization|cookie|token|secret|password|passwd|credential|signature|api[-_ ]?key|access[-_ ]?key|private[-_ ]?key/i;
const BODY_KEY = /^(body|rawbody|requestbody|payload|req|res|request|response|headers)$/i;

function safeString(value, max) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/https?:\/\/\S+/gi, '[url-redacted]')
    .replace(/bearer\s+[^\s]+/gi, 'bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[token-redacted]')
    .slice(0, max || 300);
}

function sanitize(value, seen, depth) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return safeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    return { name: safeString(value.name, 80), message: safeString(value.message) };
  }
  if (depth > 4) return '[truncated]';
  if (typeof value !== 'object') return '[unsupported]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 20).map(function (item) { return sanitize(item, seen, depth + 1); });
  }

  const output = {};
  Object.keys(value).forEach(function (key) {
    if (BODY_KEY.test(key)) output[key] = '[omitted]';
    else if (SENSITIVE_KEY.test(key)) output[key] = '[redacted]';
    else output[key] = sanitize(value[key], seen, depth + 1);
  });
  return output;
}

function normalize(child, meta) {
  if (child && typeof child === 'object' && !Array.isArray(child) && !(child instanceof Error)) {
    return {
      child: safeString(child.child || child.component || child.module || '', 80),
      meta: Object.assign({}, child, meta || {})
    };
  }
  return { child: safeString(child || '', 80), meta: meta || {} };
}

function write(level, sink, child, meta) {
  const parts = normalize(child, meta);
  const entry = { ts: new Date().toISOString(), level: level };
  if (parts.child) entry.child = parts.child;

  const safeMeta = sanitize(parts.meta, new WeakSet(), 0);
  if (safeMeta && typeof safeMeta === 'object' && !Array.isArray(safeMeta)) {
    Object.assign(entry, safeMeta);
  } else {
    entry.meta = safeMeta;
  }

  sink(JSON.stringify(entry));
}

function info(child, meta) {
  write('info', function (line) { console.log(line); }, child, meta);
}

function warn(child, meta) {
  write('warn', function (line) { console.error(line); }, child, meta);
}

function error(child, meta) {
  write('error', function (line) { console.error(line); }, child, meta);
}

/* Fire-and-forget observability ping. Delivery problems never throw. */
async function alert(message, meta) {
  const url = String(process.env.OBSERVABILITY_WEBHOOK_URL || '').trim();
  if (!url) return { sent: false, reason: 'not_configured' };

  if (typeof fetch !== 'function') {
    warn('logger.alert', { event: 'fetch_unavailable' });
    return { sent: false, reason: 'fetch_unavailable' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(function () { controller.abort(); }, 3000);
  if (timeout.unref) timeout.unref();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: 'mathify',
        level: 'alert',
        ts: new Date().toISOString(),
        message: safeString(message, 500),
        meta: sanitize(meta || {}, new WeakSet(), 0)
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      warn('logger.alert', { event: 'delivery_failed', status: response.status });
      return { sent: false, status: response.status };
    }
    return { sent: true };
  } catch (caught) {
    warn('logger.alert', {
      event: 'delivery_failed',
      error: caught && caught.message ? safeString(caught.message, 200) : 'unknown'
    });
    return { sent: false, reason: 'delivery_failed' };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { info, warn, error, alert };
