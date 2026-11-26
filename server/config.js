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

/* LiveKit replaced Agora for 1:1 RTC and freelm replaced Cloudflare Workers AI.
   These are the exact names the production guard checks; Agora/Cloudflare keys
   are deliberately absent so a LiveKit-only deployment can boot. */
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
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WEBHOOK_URL'
];

/* freelm reads provider keys directly from the environment. Keyless public
   endpoints are off unless FREELM_KEYLESS is explicitly enabled. */
const FREELM_PROVIDER_KEYS = [
  'GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY',
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
  const keyless = String(process.env.FREELM_KEYLESS || '').trim().toLowerCase();
  if (keyless === '1' || keyless === 'true') return true;
  return FREELM_PROVIDER_KEYS.some(function (name) {
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

  /* freelm replaced Cloudflare Workers AI. At least one upstream key (or an
     explicit keyless opt-in) is required before feedback can be generated. */
  if (!freelmConfigured()) {
    throw new Error('One freelm provider key or FREELM_KEYLESS=1 is required in production.');
  }

  /* Payments and parent notifications remain separate external integrations. */
  requireEnv('RAZORPAY_KEY_ID');
  requireEnv('RAZORPAY_KEY_SECRET');
  requireEnv('RAZORPAY_WEBHOOK_SECRET');
  requireEnv('TWILIO_AUTH_TOKEN');
  requireEnv('TWILIO_WEBHOOK_URL');
}

function corsOrigins() {
  const value = String(process.env.CORS_ORIGIN || '').trim();
  if (isProduction && (!value || value === '*')) return [];
  if (!value || value === '*') return ['*'];
  return value.split(',').map(function (item) { return item.trim(); }).filter(Boolean);
}

module.exports = {
  port: Number(process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  corsOrigins,
  databaseMode: process.env.DATABASE_MODE || 'mock',
  isProduction,
  assertProductionConfig,
  PRODUCTION_REQUIRED_ENV,
  FREELM_PROVIDER_KEYS,
  freelmConfigured,
  supabase,
  supabaseConfigured: Boolean(supabase.url && supabase.publishableKey && supabase.secretKey)
};
