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

function requireEnv(name, minimumLength) {
  const value = String(process.env[name] || '').trim();
  if (!value || (minimumLength && value.length < minimumLength)) {
    throw new Error('Missing or weak required environment variable: ' + name);
  }
  return value;
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
  requireEnv('CLOUDFLARE_ACCOUNT_ID');
  requireEnv('CLOUDFLARE_API_TOKEN');
  requireEnv('RAZORPAY_KEY_ID');
  requireEnv('RAZORPAY_KEY_SECRET');
  requireEnv('RAZORPAY_WEBHOOK_SECRET');
  requireEnv('AGORA_APP_ID');
  requireEnv('AGORA_APP_CERTIFICATE');
  requireEnv('AGORA_WEBHOOK_SECRET');
  requireEnv('RECORDING_WEBHOOK_SECRET');
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
  supabase,
  supabaseConfigured: Boolean(supabase.url && supabase.publishableKey && supabase.secretKey)
};
