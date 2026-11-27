/* Readable enrollment batch names.
 *
 * A demo batch keeps its short opaque code while the family is still in the
 * demo flow. Once a pack is credited and the child moves to regular classes,
 * the batch is renamed to:
 *
 *     <region>-<curriculum>-<digits>       e.g. AE-CBSE-4821
 *
 * The region is derived from the child's registered country/region or IANA
 * timezone (never from a browser-supplied value), the curriculum comes from the
 * booking record, and the trailing digits are checked against the batch store
 * so two batches never share a name. */
const crypto = require('crypto');
const db = require('../db');

const COUNTRY_CODES = {
  'india': 'IN',
  'united arab emirates': 'AE',
  'uae': 'AE',
  'dubai': 'AE',
  'saudi arabia': 'SA',
  'singapore': 'SG',
  'japan': 'JP',
  'china': 'CN',
  'united kingdom': 'UK',
  'uk': 'UK',
  'united states': 'US',
  'usa': 'US',
  'canada': 'CA',
  'australia': 'AU',
  'malaysia': 'MY',
  'south africa': 'ZA',
  'new zealand': 'NZ'
};

const ZONE_CODES = {
  'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN',
  'Asia/Dubai': 'AE',
  'Asia/Riyadh': 'SA',
  'Asia/Jeddah': 'SA',
  'Asia/Singapore': 'SG',
  'Asia/Kuala_Lumpur': 'MY',
  'Asia/Tokyo': 'JP',
  'Asia/Shanghai': 'CN',
  'Asia/Hong_Kong': 'CN',
  'Europe/London': 'UK',
  'America/New_York': 'US',
  'America/Los_Angeles': 'US',
  'America/Toronto': 'CA',
  'Australia/Sydney': 'AU'
};

const ZONE_PREFIXES = {
  asia: 'AS', europe: 'EU', america: 'AM', africa: 'AF',
  australia: 'AU', pacific: 'PA'
};

const CURRICULUM_CODES = {
  'cbse': 'CBSE',
  'icse': 'ICSE',
  'igcse': 'IGCSE',
  'uae': 'UAE',
  'us': 'US',
  'us-common-core': 'US',
  'uk': 'UK',
  'singapore': 'SG',
  'japan': 'JP',
  'china': 'CN',
  'saudi': 'SA',
  'other': 'LOC',
  'local': 'LOC'
};

function text(value, max) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[\r\n<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max || 80);
}

function regionCode(input) {
  const named = text(input.country || input.region, 80).toLowerCase();
  const keys = Object.keys(COUNTRY_CODES).sort(function (a, b) { return b.length - a.length; });
  for (let index = 0; index < keys.length; index += 1) {
    if (named.indexOf(keys[index]) !== -1) return COUNTRY_CODES[keys[index]];
  }

  const zone = text(input.timezone, 64);
  if (ZONE_CODES[zone]) return ZONE_CODES[zone];
  const slash = zone.indexOf('/');
  if (slash > 0) {
    const prefix = zone.slice(0, slash).toLowerCase();
    const base = ZONE_PREFIXES[prefix] || prefix.slice(0, 2).toUpperCase();
    const words = zone.slice(slash + 1).split(/[_\s]+/).filter(Boolean);
    const tail = words.map(function (word) { return word.charAt(0); })
      .join('').slice(0, 2).toUpperCase();
    return (base + tail).slice(0, 4) || 'GL';
  }
  return 'GL';
}

function curriculumCode(input) {
  const raw = text(input.curriculum || input.curriculumLabel || input.curriculumSlug, 80);
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (CURRICULUM_CODES[key]) return CURRICULUM_CODES[key];
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'GEN';
}

function available(code, batchId) {
  return Promise.resolve(db.findBatchByCode(code)).then(function (existing) {
    return !existing || existing.id === batchId;
  });
}

async function buildCode(input) {
  const data = input || {};
  const prefix = regionCode(data) + '-' + curriculumCode(data);
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const digits = String(1000 + crypto.randomInt(9000));
    const candidate = prefix + '-' + digits;
    if (await available(candidate, data.batchId)) return candidate;
  }

  /* Deterministic last resort if the random space is exhausted locally. The
     seed is the child's own id, so retries by the same child stay stable. */
  const seed = String(data.studentId || data.batchId || prefix);
  const digest = crypto.createHash('sha256').update(seed + '|' + prefix).digest();
  for (let offset = 0; offset < 9000; offset += 1) {
    const digits = String(1000 + (digest.readUInt16BE(offset % 16) + offset) % 9000);
    const candidate = prefix + '-' + digits;
    if (await available(candidate, data.batchId)) return candidate;
  }
  /* Astronomically unlikely, but a longer unique tail is still a valid name. */
  return prefix + '-' + digest.toString('hex').slice(0, 8).toUpperCase();
}

module.exports = {
  regionCode: regionCode,
  curriculumCode: curriculumCode,
  buildCode: buildCode
};
