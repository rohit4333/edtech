/* Public, cache-busted payload endpoints used by the classroom's connection
   preflight. They carry no identity and expose no secrets. The measurement is
   timed in the browser; the authoritative pass/fail decision is made only when
   the authenticated session route records it. */
const express = require('express');
const networkQuality = require('../services/networkQualityService');

const router = express.Router();

function probeBytes(value) {
  const config = networkQuality.settings();
  const requested = Number(value) || config.probeBytes;
  return Math.max(1024, Math.min(config.probeBytes, Math.floor(requested)));
}

function noStore(res) {
  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('Pragma', 'no-cache');
}

router.get('/probe', function (req, res) {
  const size = probeBytes(req.query.bytes);
  noStore(res);
  return res.json({ ok: true, bytes: size, data: 'x'.repeat(size) });
});

router.post('/probe', function (req, res) {
  const size = probeBytes((req.body || {}).bytes);
  noStore(res);
  return res.json({ ok: true, bytes: size });
});

module.exports = router;
