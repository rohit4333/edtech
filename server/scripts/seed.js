/* Seed demo data into Supabase. The mock store already ships with demo records. */
const config = require('../config'); // Loads server/.env regardless of the working directory.

const SENSITIVE_KEY =
  /authorization|cookie|token|secret|password|passwd|credential|api[-_ ]?key|access[-_ ]?key|private[-_ ]?key/i;

function safeString(value, max) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/https?:\/\/\S+/gi, '[url-redacted]')
    .replace(/bearer\s+[^\s]+/gi, 'bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[token-redacted]')
    .slice(0, max || 500);
}

/* Results may contain created rows; never echo credentials back to the console. */
function redact(value, seen, depth) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return safeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error)
    return { name: safeString(value.name, 80), message: safeString(value.message) };
  if (depth > 5) return '[truncated]';
  if (typeof value !== 'object') return '[unsupported]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 25).map(function (item) {
      return redact(item, seen, depth + 1);
    });
  }

  const output = {};
  Object.keys(value).forEach(function (key) {
    output[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redact(value[key], seen, depth + 1);
  });
  return output;
}

async function main() {
  const mode = String(process.env.DATABASE_MODE || 'mock')
    .trim()
    .toLowerCase();

  /* Demo identities and their password are development-only. Production must
     opt in explicitly for an isolated walkthrough environment. */
  if (
    config.isProduction &&
    String(process.env.ENABLE_DEMO_LOGINS || '').toLowerCase() !== 'true'
  ) {
    console.error(
      'Refusing to seed demo identities in production. Set ENABLE_DEMO_LOGINS=true only for an isolated walkthrough environment.'
    );
    process.exitCode = 1;
    return;
  }

  if (mode !== 'supabase') {
    console.log(
      'Seed skipped: DATABASE_MODE=' +
        safeString(mode, 40) +
        '. The in-memory store already ships with demo users and sessions.'
    );
    return;
  }

  const db = require('../db/supabase');
  if (typeof db.seedDemo !== 'function') {
    throw new Error('server/db/supabase.js does not export seedDemo() yet.');
  }

  const result = await db.seedDemo();
  console.log('Supabase demo seed result:');
  console.log(JSON.stringify(redact(result, new WeakSet(), 0), null, 2));
}

main().catch(function (error) {
  const message = error && error.message ? safeString(error.message) : 'Unknown error';
  console.error('Supabase demo seed failed: ' + message);
  process.exitCode = 1;
});
