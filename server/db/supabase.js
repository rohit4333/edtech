const crypto = require('crypto');
const config = require('../config');

/*
 * Minimal Supabase REST adapter. The Express process uses the server-only
 * secret key; no key value is ever returned to a browser or logged.
 */
function assertConfigured() {
  if (!config.supabase.url || !config.supabase.publishableKey || !config.supabase.secretKey) {
    const error = new Error(
      'Supabase is not configured. Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY in server/.env.'
    );
    error.status = 503;
    error.code = 'SUPABASE_NOT_CONFIGURED';
    throw error;
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

async function request(path, options) {
  assertConfigured();
  const response = await fetch(config.supabase.url.replace(/\/$/, '') + path, {
    method: options.method,
    headers: {
      apikey: config.supabase.publishableKey,
      Authorization: 'Bearer ' + config.supabase.secretKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (parseError) {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const error = new Error(
      (payload && (payload.message || payload.hint || payload.details)) ||
        'Supabase request failed with status ' + response.status
    );
    error.status = 502;
    error.code = 'SUPABASE_REQUEST_FAILED';
    error.details = payload;
    throw error;
  }

  return payload;
}

async function insertSession(input) {
  if (!isUuid(input.trainerId) || !isUuid(input.studentId)) {
    const error = new Error('trainer_id and student_id must be real UUIDs from public.users.');
    error.status = 400;
    error.code = 'INVALID_PARTICIPANT_ID';
    throw error;
  }

  const rows = await request('/rest/v1/sessions', {
    method: 'POST',
    body: [{
      code: input.code || crypto.randomUUID(),
      trainer_id: input.trainerId,
      student_id: input.studentId,
      title: input.title || '1-on-1 maths session',
      status: input.status || 'scheduled'
    }]
  });

  return Array.isArray(rows) ? rows[0] : rows;
}

module.exports = { insertSession, isUuid };
