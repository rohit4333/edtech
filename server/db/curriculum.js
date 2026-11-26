/* Curriculum repository: one interface, two adapters.
 *
 *   - in-memory adapter backs the Phase 1 demo store (no env required)
 *   - Supabase adapter talks to public.student_curriculum through the server
 *     secret key; the browser never calls either adapter directly.
 *
 * Selection is explicit: DATABASE_MODE=supabase AND all three Supabase env
 * values present. Any missing value warns once and falls back to memory. The
 * process never crashes because of absent configuration.
 */

const config = require('../config');
const store = require('./mock');
const curriculumContext = require('../services/curriculumContext');

const ALLOWED_KEYS = ['curriculum', 'grade', 'language', 'schoolChapter'];
const PII_KEYS = ['name', 'email', 'phone', 'mobile', 'social', 'avatar', 'address', 'parent'];
let warned = false;

function warn(message) {
  if (warned) return;
  warned = true;
  console.warn('[curriculum-repository] ' + message);
}

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function validStudentId(id) {
  /* Demo ids are non-UUID; Supabase ids are UUIDs. Validate shape per mode. */
  return Boolean(id) && typeof id === 'string' && id.length <= 64;
}

function cleanPatch(patch) {
  const source = patch && typeof patch === 'object' ? patch : {};
  Object.keys(source).forEach(function (key) {
    if (PII_KEYS.some(function (pii) { return key.toLowerCase().indexOf(pii) !== -1; })) {
      throw Object.assign(new Error('Curriculum profiles accept academic fields only.'), {
        code: 'PII_REJECTED', status: 400
      });
    }
  });

  const next = {};
  ALLOWED_KEYS.forEach(function (key) {
    if (source[key] !== undefined) next[key] = source[key];
  });

  if (next.curriculum !== undefined) {
    next.curriculum = curriculumContext.normalizeCurriculum(next.curriculum);
  }
  ['grade', 'language', 'schoolChapter'].forEach(function (key) {
    if (next[key] !== undefined && next[key] !== null) {
      next[key] = String(next[key]).replace(/\s+/g, ' ').trim().slice(0, key === 'schoolChapter' ? 200 : 40);
    }
  });
  return next;
}

/* --------------------------------------------------------- in-memory adapter */
const memory = {
  name: 'memory',
  available: function () { return true; },
  get: async function (studentId) {
    const found = store.studentCurriculum.find(function (row) { return row.studentId === studentId; });
    return found ? copy(found) : null;
  },
  upsert: async function (studentId, patch, actorId) {
    const clean = cleanPatch(patch);
    const existing = await memory.get(studentId);
    const record = Object.assign({}, existing || {}, clean, {
      studentId: studentId,
      updatedBy: actorId || null,
      updatedAt: new Date().toISOString()
    });
    const index = store.studentCurriculum.findIndex(function (row) { return row.studentId === studentId; });
    if (index === -1) store.studentCurriculum.push(copy(record));
    else store.studentCurriculum[index] = copy(record);
    return copy(record);
  }
};

/* ----------------------------------------------------------- Supabase adapter */
function toRow(record) {
  return {
    student_id: record.studentId,
    curriculum: record.curriculum,
    grade: record.grade,
    language: record.language,
    school_chapter: record.schoolChapter || null,
    updated_by: record.updatedBy || null,
    updated_at: record.updatedAt
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    studentId: row.student_id,
    curriculum: row.curriculum,
    grade: row.grade,
    language: row.language,
    schoolChapter: row.school_chapter || null,
    updatedBy: row.updated_by || null,
    updatedAt: row.updated_at || null
  };
}

async function rest(pathname, options) {
  const response = await fetch(
    String(config.supabase.url).replace(/\/$/, '') + '/rest/v1/' + pathname,
    {
      method: options.method,
      headers: {
        apikey: config.supabase.publishableKey,
        Authorization: 'Bearer ' + config.supabase.secretKey,
        'Content-Type': 'application/json',
        Prefer: 'return=representation,resolution=merge-duplicates'
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    }
  );
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch (error) { payload = { message: text }; }
  }
  if (!response.ok) {
    throw Object.assign(new Error(
      (payload && (payload.message || payload.details)) || 'Supabase curriculum request failed'
    ), { status: 502, code: 'CURRICULUM_REQUEST_FAILED' });
  }
  return payload;
}

const supabase = {
  name: 'supabase',
  available: function () {
    return Boolean(config.supabase.url && config.supabase.publishableKey && config.supabase.secretKey);
  },
  get: async function (studentId) {
    const rows = await rest('student_curriculum?student_id=eq.' + encodeURIComponent(studentId), {
      method: 'GET'
    });
    return fromRow(Array.isArray(rows) ? rows[0] : null);
  },
  upsert: async function (studentId, patch, actorId) {
    const clean = cleanPatch(patch);
    const existing = await supabase.get(studentId);
    const record = Object.assign({}, existing || {}, clean, {
      studentId: studentId,
      updatedBy: actorId || null,
      updatedAt: new Date().toISOString()
    });
    const rows = await rest('student_curriculum', { method: 'POST', body: [toRow(record)] });
    return fromRow(Array.isArray(rows) ? rows[0] : record);
  }
};

function selectAdapter(override) {
  const wantsSupabase = (override || config.databaseMode) === 'supabase';
  if (wantsSupabase && supabase.available()) return supabase;
  if (wantsSupabase) {
    if (config.isProduction) {
      throw new Error('Supabase credentials are required when DATABASE_MODE=supabase in production.');
    }
    warn('Supabase credentials missing; using the in-memory curriculum adapter.');
  }
  return memory;
}

let active = selectAdapter();

module.exports = {
  memory: memory,
  supabase: supabase,
  selectAdapter: function (override) { return selectAdapter(override); },
  get: function (studentId) {
    if (!validStudentId(studentId)) return Promise.resolve(null);
    return active.get(studentId);
  },
  upsert: function (studentId, patch, actorId) {
    if (!validStudentId(studentId)) {
      return Promise.reject(Object.assign(new Error('Invalid student id.'), {
        code: 'INVALID_STUDENT', status: 400
      }));
    }
    return active.upsert(studentId, patch, actorId);
  },
  adapterName: function () { return active.name; },
  reset: function (override) { active = selectAdapter(override); }
};
