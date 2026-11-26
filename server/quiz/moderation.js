/* Lightweight content gate for Cloudflare-generated quiz drafts.
   The trainer still approves every draft; this only stops clearly unsafe or
   privacy-breaking content from entering the review queue. */

const PERSONAL_DATA = /(?:https?:\/\/|www\.)|(?:whatsapp|instagram|facebook|twitter|tiktok)|\+?\d[\d\s-]{7,}\d|[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
const TRAINER_ONLY = /trainerInstructions|misconception_watch|answerKey|correctOptionId|explanation|hints/i;

function textFrom(value, seen, depth) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (depth > 4 || (seen && seen.has(value))) return '';
  if (seen) seen.add(value);
  if (Array.isArray(value)) return value.map(function (item) { return textFrom(item, seen, depth + 1); }).join(' ');
  if (typeof value === 'object') {
    return Object.keys(value).map(function (key) {
      return key + ' ' + textFrom(value[key], seen, depth + 1);
    }).join(' ');
  }
  return '';
}

function moderateDraft(draft) {
  const reasons = [];
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    return { ok: false, reasons: ['draft is not an object'] };
  }

  const keys = Object.keys(draft);
  const forbiddenKey = keys.find(function (key) { return TRAINER_ONLY.test(key); });
  if (forbiddenKey) reasons.push('trainer-only field: ' + forbiddenKey);

  const text = textFrom(draft, new WeakSet(), 0);
  if (!text.trim()) reasons.push('draft has no content');
  if (text.length > 8000) reasons.push('draft exceeds content limit');
  if (PERSONAL_DATA.test(text)) reasons.push('personal contact details or social links');

  return { ok: reasons.length === 0, reasons: reasons };
}

module.exports = { moderateDraft, PERSONAL_DATA, TRAINER_ONLY };
