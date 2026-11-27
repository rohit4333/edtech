/* Study Buddy daily image allowance.
 *
 * Text questions are unlimited. Each student gets ten image questions per
 * calendar day. A slot is claimed with a strict insert into service-only
 * mathify_records, so simultaneous phone requests cannot both spend the last
 * slot. No image bytes, question text or contact detail is stored here.
 */

const db = require('../db');

const DAILY_IMAGE_LIMIT = 10;
const COLLECTION = 'student_doubt_image_quota';
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 1024 * 1024;

function problem(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function dayKey(now, timezone) {
  const date = now instanceof Date ? now : new Date(now || Date.now());
  const zone = String(timezone || '').trim();
  if (zone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(date);
      const values = {};
      parts.forEach(function (part) { values[part.type] = part.value; });
      if (values.year && values.month && values.day) {
        return values.year + '-' + values.month + '-' + values.day;
      }
    } catch (error) {
      /* An invalid display timezone falls back to UTC rather than blocking chat. */
    }
  }
  return date.toISOString().slice(0, 10);
}

function slotKey(studentId, date, sequence) {
  return String(studentId) + '|' + date + '|' + sequence;
}

/* Server-side pre-check so a malformed attachment never spends a slot. The AI
   Worker still performs the authoritative validation before any model call. */
function validateImage(image) {
  if (!image || typeof image !== 'object') {
    return { ok: false, code: 'INVALID_IMAGE', message: 'That photo could not be read. Please try again.' };
  }
  const mime = String(image.mime || '').trim().toLowerCase();
  if (ALLOWED_IMAGE_TYPES.indexOf(mime) === -1) {
    return { ok: false, code: 'INVALID_IMAGE_TYPE', message: 'I can read PNG, JPG, WEBP or GIF photos.' };
  }
  const data = String(image.data || '');
  const prefix = 'data:' + mime + ';base64,';
  if (data.slice(0, prefix.length).toLowerCase() !== prefix) {
    return { ok: false, code: 'INVALID_IMAGE_DATA', message: 'That photo could not be read. Please try again.' };
  }
  const payload = data.slice(prefix.length);
  if (!payload || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) {
    return { ok: false, code: 'INVALID_IMAGE_DATA', message: 'That photo could not be read. Please try again.' };
  }
  const padding = payload.slice(-2) === '==' ? 2 : payload.slice(-1) === '=' ? 1 : 0;
  const bytes = Math.floor((payload.length * 3) / 4) - padding;
  if (bytes > MAX_IMAGE_BYTES) {
    return { ok: false, code: 'IMAGE_TOO_LARGE', message: 'That photo is a bit large. Try one under 1 MB.' };
  }
  return { ok: true, mime: mime };
}

async function reserveImage(studentId, options) {
  const opts = options || {};
  if (!studentId) {
    throw problem('Sign in again before asking a photo question.', 'IMAGE_QUOTA_STUDENT_REQUIRED', 400);
  }
  const date = dayKey(opts.now || new Date(), opts.timezone);
  const claimedAt = new Date(opts.now || new Date()).toISOString();

  for (let sequence = 1; sequence <= DAILY_IMAGE_LIMIT; sequence += 1) {
    const key = slotKey(studentId, date, sequence);
    const result = await db.insertRecordOnce(COLLECTION, key, {
      studentId: String(studentId),
      date: date,
      sequence: sequence,
      claimedAt: claimedAt
    });
    if (result && result.claimed === true) {
      return {
        used: sequence,
        remaining: DAILY_IMAGE_LIMIT - sequence,
        limit: DAILY_IMAGE_LIMIT,
        date: date,
        slotKey: key
      };
    }
  }

  throw problem(
    "That's 10 photo questions for today. Come back tomorrow with a new one - text questions are always welcome!",
    'IMAGE_QUOTA_EXCEEDED',
    429
  );
}

/* A failed model call should not cost the child a photo question. */
async function releaseReservation(reservation) {
  if (!reservation || !reservation.slotKey) return false;
  return db.deleteRecord(COLLECTION, reservation.slotKey);
}

async function getUsage(studentId, options) {
  const opts = options || {};
  if (!studentId) return null;
  const date = dayKey(opts.now || new Date(), opts.timezone);
  const checks = [];
  for (let sequence = 1; sequence <= DAILY_IMAGE_LIMIT; sequence += 1) {
    checks.push(db.getRecord(COLLECTION, slotKey(studentId, date, sequence)));
  }
  const rows = await Promise.all(checks);
  const used = rows.filter(Boolean).length;
  return { used: used, remaining: DAILY_IMAGE_LIMIT - used, limit: DAILY_IMAGE_LIMIT, date: date };
}

module.exports = {
  DAILY_IMAGE_LIMIT: DAILY_IMAGE_LIMIT,
  COLLECTION: COLLECTION,
  dayKey: dayKey,
  slotKey: slotKey,
  validateImage: validateImage,
  reserveImage: reserveImage,
  releaseReservation: releaseReservation,
  getUsage: getUsage
};
