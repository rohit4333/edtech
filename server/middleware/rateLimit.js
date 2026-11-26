/* Small in-process rate limiter for public write endpoints. It complements
   HMAC signature checks and replay guards; it never replaces them. A shared
   Redis store can be added later for multi-instance deployments. */

const buckets = new Map();

function createLimiter(options) {
  const settings = options || {};
  const windowMs = Math.max(1000, Number(settings.windowMs) || 60000);
  const max = Math.max(1, Number(settings.max) || 60);
  const name = String(settings.name || 'limit');

  return function limiter(req, res, next) {
    /* Never key on a client-supplied forwarding header: it is trivially
       spoofed. Express resolves req.ip from the socket unless the operator
       explicitly configures `trust proxy` for a known reverse proxy. */
    const client = req.ip || req.socket.remoteAddress || 'unknown';
    const key = name + '|' + client;
    const now = Date.now();
    const entry = buckets.get(key);
    if (!entry || now - entry.startedAt >= windowMs) {
      buckets.set(key, { startedAt: now, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((windowMs - (now - entry.startedAt)) / 1000)));
      return res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.' });
    }
    return next();
  };
}

module.exports = { createLimiter };
