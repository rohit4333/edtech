/* Curriculum persistence contract: two adapters behind one interface, no PII
   in the profile, ordered reviewable SQL, and no implicit live migration. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const curriculumRepository = require('../db/curriculum');
const migrate = require('../migrate');

let checks = 0;
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}

async function main() {
  curriculumRepository.reset('mock');
  equal(curriculumRepository.adapterName(), 'memory', 'missing Supabase env selects memory adapter');

  const seeded = await curriculumRepository.get('usr_student_001');
  equal(seeded.curriculum, 'CBSE', 'demo student has a persisted board');
  equal(seeded.schoolChapter, 'Ratios', 'demo student has a persisted school chapter');

  const saved = await curriculumRepository.upsert(
    'usr_student_001',
    { curriculum: 'Ontario', grade: '8', language: 'English', schoolChapter: 'Fractions' },
    'usr_trainer_001'
  );
  equal(saved.curriculum, 'Ontario', 'upsert persists the school board');
  equal(saved.updatedBy, 'usr_trainer_001', 'upsert records the actor id');
  const reread = await curriculumRepository.get('usr_student_001');
  equal(reread.schoolChapter, 'Fractions', 'upsert is durable in the adapter');

  let rejected = false;
  try {
    await curriculumRepository.upsert('usr_student_001', { email: 'leak@example.com' }, null);
  } catch (error) {
    rejected = error.code === 'PII_REJECTED';
  }
  ok(rejected, 'personal fields are rejected before persistence');

  const normalized = await curriculumRepository.upsert(
    'usr_student_001', { curriculum: 'common core' }, null
  );
  equal(normalized.curriculum, 'Common Core', 'board names normalize to the approved seven');

  /* Supabase adapter is explicit and never used by default without env. */
  const originalFetch = global.fetch;
  const originalSupabase = Object.assign({}, config.supabase);
  try {
    let requestUrl = '';
    global.fetch = async function (url, options) {
      requestUrl = String(url);
      equal(options.method, 'GET', 'Supabase adapter reads with GET');
      return {
        ok: true,
        status: 200,
        text: async function () {
          return JSON.stringify([{
            student_id: 'usr_student_001', curriculum: 'ICSE', grade: '6',
            language: 'English', school_chapter: 'Ratio and proportion',
            updated_by: null, updated_at: '2026-11-01T00:00:00Z'
          }]);
        }
      };
    };
    Object.assign(config.supabase, {
      url: 'https://example.supabase.co',
      publishableKey: 'publishable-test',
      secretKey: 'secret-test'
    });
    const adapter = curriculumRepository.selectAdapter('supabase');
    equal(adapter.name, 'supabase', 'explicit selection activates the Supabase adapter');
    const row = await adapter.get('usr_student_001');
    equal(row.curriculum, 'ICSE', 'Supabase row is mapped to the repository shape');
    equal(row.schoolChapter, 'Ratio and proportion', 'snake_case column is mapped back');
    ok(requestUrl.indexOf('/rest/v1/student_curriculum') !== -1, 'adapter calls the curriculum table');
  } finally {
    global.fetch = originalFetch;
    Object.assign(config.supabase, originalSupabase);
    curriculumRepository.reset('mock');
  }

  /* Migration files are reviewable, ordered and safe to dry run. */
  const migrations = migrate.discover();
  ok(migrations.length >= 2, 'baseline and curriculum migrations are discoverable');
  equal(migrations[0].name, '0001_baseline.sql', 'baseline migration sorts first');
  ok(migrations.some(function (m) { return m.name === '0002_student_curriculum.sql'; }),
    'curriculum migration is present');

  const curriculumSql = fs.readFileSync(
    path.join(migrate.MIGRATIONS_DIR, '0002_student_curriculum.sql'), 'utf8'
  );
  ok(curriculumSql.indexOf("->'app_metadata'->>'role'") !== -1 &&
     curriculumSql.indexOf('auth.jwt()') !== -1,
  'RLS reads the role from app_metadata');
  ok(curriculumSql.indexOf("->'user_metadata'") === -1, 'RLS never reads user_metadata');
  ok(curriculumSql.indexOf('enable row level security') !== -1, 'table has RLS enabled');
  ok(!/create table[\s\S]*?\b(email|phone|mobile|social)\b/i.test(curriculumSql),
    'curriculum table has no contact columns');
  ok(curriculumSql.indexOf('grant select (student_id, curriculum, grade, language, school_chapter, updated_at)') !== -1,
    'Data API role gets academic columns only');

  const built = migrate.buildSql(migrations.slice(0, 1));
  ok(built.indexOf('begin;') !== -1 && built.indexOf('commit;') !== -1,
    'apply is wrapped in one transaction');
  ok(built.indexOf(migrate.MARKER_TABLE) !== -1, 'applied files are checksummed');

  const dryPlan = [];
  const originalLog = console.log;
  console.log = function (line) { dryPlan.push(String(line)); };
  try {
    migrate.plan(migrations);
  } finally {
    console.log = originalLog;
  }
  ok(dryPlan.join('\n').indexOf('dry run') !== -1, 'default migrate is a dry run');
  ok(dryPlan.join('\n').indexOf('no database was contacted') !== -1, 'dry run makes no DB claim');

  console.log('curriculumPersistence: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
