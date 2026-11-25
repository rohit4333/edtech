require('dotenv').config();

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

module.exports = {
  port: Number(process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  databaseMode: process.env.DATABASE_MODE || 'mock',
  supabase,
  supabaseConfigured: Boolean(supabase.url && supabase.publishableKey && supabase.secretKey)
};
