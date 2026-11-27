require('dotenv').config({ path: require('path').join(__dirname, '.env') });

/*
 * Central env wiring. Values stay out of source control; .env.example lists
 * the names only. The secret key is server-side and must never be serialized
 * to a browser or included in API responses.
 */
const supabase = {
  url: process.env.SUPABASE_URL || '',
  publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
  secretKey: process.env.SUPABASE_SECRET_KEY || ''
};

const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

/* LiveKit is the only RTC provider. AI calls use one chain everywhere:
   freelm -> Gemini -> Groq -> Cloudflare Workers AI, so production requires
   the three upstream provider credentials that freelm also reads. Agora credentials
   are deliberately absent; the recording handoff secret is optional. */
const PRODUCTION_REQUIRED_ENV = [
  'AUTH_SECRET',
  'CORS_ORIGIN',
  'DATABASE_MODE',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'LIVEKIT_URL',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET'
];

/* Only the three approved AI chain providers are accepted. OpenRouter, Kilo,
   OVH and other freelm endpoints are not part of the Mathify contract. */
const FREELM_PROVIDER_KEYS = [
  'GEMINI_API_KEY', 'GROQ_API_KEY', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'
];
const DISALLOWED_FREELM_KEYS = [
  'FREELM_API_KEY', 'GOOGLE_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY',
  'MISTRAL_API_KEY', 'CEREBRAS_API_KEY', 'ZAI_API_KEY', 'COHERE_API_KEY',
  'KILO_API_KEY'
];

function requireEnv(name, minimumLength) {
  const value = String(process.env[name] || '').trim();
  if (!value || (minimumLength && value.length < minimumLength)) {
    throw new Error('Missing or weak required environment variable: ' + name);
  }
  return value;
}

function freelmConfigured() {
  return FREELM_PROVIDER_KEYS.every(function (name) {
    return Boolean(String(process.env[name] || '').trim());
  });
}

/* Called by server/index.js, never by tests that boot the Express app directly.
   Mock/local mode stays usable without credentials; live mode fails closed. */
function assertProductionConfig() {
  if (!isProduction) return;
  requireEnv('AUTH_SECRET', 32);

  const origin = String(process.env.CORS_ORIGIN || '').trim();
  if (!origin || origin === '*') {
    throw new Error('CORS_ORIGIN must be an explicit origin allowlist in production.');
  }
  if (String(process.env.DATABASE_MODE || '').trim() !== 'supabase') {
    throw new Error('DATABASE_MODE=supabase is required in production.');
  }
  requireEnv('SUPABASE_URL');
  requireEnv('SUPABASE_PUBLISHABLE_KEY');
  requireEnv('SUPABASE_SECRET_KEY');

  /* LiveKit is the only RTC provider in production. */
  requireEnv('LIVEKIT_URL');
  requireEnv('LIVEKIT_API_KEY');
  requireEnv('LIVEKIT_API_SECRET');

  /* The full freelm -> Gemini -> Groq -> Cloudflare chain must be configured.
     Keyless public endpoints are never allowed in production. */
  if (String(process.env.FREELM_KEYLESS || '').trim().toLowerCase() === '1' ||
      String(process.env.FREELM_KEYLESS || '').trim().toLowerCase() === 'true') {
    throw new Error('FREELM_KEYLESS is not allowed in production.');
  }
  if (!freelmConfigured()) {
    throw new Error('GEMINI_API_KEY, GROQ_API_KEY, CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required for the AI provider chain in production.');
  }
  const extraKey = DISALLOWED_FREELM_KEYS.find(function (name) {
    return Boolean(String(process.env[name] || '').trim());
  });
  if (extraKey) {
    throw new Error(extraKey + ' is not part of the approved AI provider chain and must be empty in production.');
  }

  /* Payments remain a separate external integration. Twilio/WhatsApp is
     discontinued and dormant: its webhook code stays for historical evidence,
     but missing Twilio credentials no longer block production boot. */
  requireEnv('RAZORPAY_KEY_ID');
  requireEnv('RAZORPAY_KEY_SECRET');
  requireEnv('RAZORPAY_WEBHOOK_SECRET');
}

function corsOrigins() {
  const value = String(process.env.CORS_ORIGIN || '').trim();
  if (isProduction && (!value || value === '*')) return [];
  if (!value || value === '*') return ['*'];
  return value.split(',').map(function (item) { return item.trim(); }).filter(Boolean);
}

/* A single absolute origin for links inside emails. CORS_ORIGIN is an
   allowlist, so its first valid entry is used; an explicit APP_ORIGIN wins.
   Production only accepts https. Plain http is limited to local development. */
function resetOrigin() {
  const candidates = [];
  const explicit = String(process.env.APP_ORIGIN || '').trim();
  if (explicit) candidates.push(explicit);
  corsOrigins().forEach(function (origin) {
    if (origin !== '*') candidates.push(origin);
  });
  for (let index = 0; index < candidates.length; index += 1) {
    let parsed;
    try { parsed = new URL(candidates[index]); } catch (error) { continue; }
    const local = ['localhost', '127.0.0.1', '[::1]'].indexOf(parsed.hostname) !== -1;
    if (parsed.protocol === 'https:' || (!isProduction && parsed.protocol === 'http:' && local)) {
      return parsed.origin;
    }
  }
  return '';
}

module.exports = {
  port: Number(process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  corsOrigins,
  resetOrigin,
  databaseMode: process.env.DATABASE_MODE || 'mock',
  isProduction,
  assertProductionConfig,
  PRODUCTION_REQUIRED_ENV,
  FREELM_PROVIDER_KEYS,
  DISALLOWED_FREELM_KEYS,
  freelmConfigured,
  supabase,
  supabaseConfigured: Boolean(supabase.url && supabase.publishableKey && supabase.secretKey)
};
