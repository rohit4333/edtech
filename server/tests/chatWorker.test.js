/* AI chat contract: Worker core prompts, privacy fencing, model selection and
   the founder-only SQL audit plan. Network calls are stubbed; no credentials
   are required and no Cloudflare/Supabase request is made. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const policy = require('../config/policy.json');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

const workerSource = read('worker.js');
const workerServiceSource = read('server/services/chatWorkerService.js');

let checks = 0;
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}

function envelope(content) {
  return JSON.stringify({ reply: content });
}

async function main() {
  const core = await import('../../worker-core.mjs');

  equal(core.TEXT_MODEL, '@cf/meta/llama-3.1-8b-instruct', 'text model is Llama 3.1 8B');
  equal(core.VISION_MODEL, '@cf/llava-hf/llava-v1.6b-34b', 'primary vision model is the requested LLaVA model');
  equal(core.VISION_FALLBACK_MODEL, '@cf/meta/llama-3.2-11b-vision-instruct',
    'documented vision fallback keeps live image calls working');
  ok(core.TEXT_MODEL === '@cf/meta/llama-3.1-8b-instruct' &&
    core.VISION_MODEL === '@cf/llava-hf/llava-v1.6b-34b' &&
    core.VISION_FALLBACK_MODEL === '@cf/meta/llama-3.2-11b-vision-instruct' &&
    core.JSON_ONLY_INSTRUCTION === 'CRITICAL: Return ONLY valid JSON. No markdown, no explanations.' &&
    core.TRAINER_SYSTEM.endsWith(core.JSON_ONLY_INSTRUCTION) &&
    core.STUDENT_SYSTEM.endsWith(core.JSON_ONLY_INSTRUCTION),
  'pinned models and the exact JSON-only suffix are unchanged');
  equal(core.TRAINER_CLOSING_LINE,
    'Is there anything else I can help you with, or would you like me to connect you with the admin?',
  'trainer closing line matches the brief exactly');
  equal(core.UNSAFE_STUDENT_REPLY,
    "I'm just an AI study buddy, but please tell your parents or your Mathify trainer about this right away!",
  'student unsafe response matches the brief exactly');
  ok(core.isModelNotFoundError(new Error('No route for that URI.')) === true,
    'a Cloudflare route error is recognised as a missing model');
  ok(core.isModelNotFoundError({ detail: 'No route for that URI' }) === true,
    'a REST error detail also triggers missing-model detection');
  ok(core.isModelNotFoundError(new Error('network timeout')) === false,
    'unrelated runner errors do not trigger the model fallback');
  equal(JSON.stringify(core.safeParseJSON('Here: {"reply":"hi"}')), '{"reply":"hi"}',
    'a wrapped model reply is parsed from its first balanced JSON object');
  const sanitized = core.sanitizeQuestion(
    'My name is Aarav Sharma, hint: divide first, answer key is 42, sessionId: ses_secret_1'
  );
  ok(sanitized.indexOf('Aarav') === -1 && sanitized.indexOf('divide first') === -1 &&
    sanitized.indexOf('42') === -1 && sanitized.indexOf('ses_secret_1') === -1,
  'names, free-text hints, answer keys and session ids are redacted before the model sees them');
  ok(workerServiceSource.indexOf('process.env.CLOUDFLARE_MODEL') === -1 &&
    workerSource.indexOf('env.TEXT_MODEL') === -1,
  'the chat text model is pinned and cannot be overridden by environment variables');
  ok(core.TRAINER_SYSTEM.endsWith('CRITICAL: Return ONLY valid JSON. No markdown, no explanations.'),
    'trainer prompt ends with the exact JSON-only instruction');
  ok(core.STUDENT_SYSTEM.endsWith('CRITICAL: Return ONLY valid JSON. No markdown, no explanations.'),
    'student prompt ends with the exact JSON-only instruction');

  ok(core.TRAINER_SYSTEM.indexOf('Mathify Trainer Desk') !== -1 &&
    core.TRAINER_SYSTEM.indexOf('professional') !== -1 &&
    core.TRAINER_SYSTEM.indexOf('empathetic') !== -1 &&
    core.TRAINER_SYSTEM.indexOf('policy-aligned') !== -1,
  'trainer persona is professional, empathetic and policy-aligned');
  ['₹300–₹400', '6 hours', '48 hours', '₹2,000', '₹500', 'no cap',
    'Rohit Vishwakarma', core.FOUNDER_EMAIL, 'complex payroll'].forEach(function (fact) {
    ok(core.TRAINER_SYSTEM.indexOf(fact) !== -1, 'trainer system prompt includes ' + fact);
  });
  ok(core.TRAINER_SYSTEM.indexOf(core.TRAINER_CLOSING_LINE) !== -1,
    'trainer system prompt contains the exact closing line');
  ok(core.STUDENT_SYSTEM.indexOf('stories') !== -1 &&
    core.STUDENT_SYSTEM.indexOf('visual analogies') !== -1 &&
    core.STUDENT_SYSTEM.indexOf('Socratic') !== -1,
  'student system prompt teaches Socratically with stories and visual analogies');
  ok(core.STUDENT_SYSTEM.indexOf('acknowledge') !== -1 &&
    core.STUDENT_SYSTEM.indexOf('hint step 1') !== -1 &&
    core.STUDENT_SYSTEM.indexOf('never give the final answer') !== -1,
  'student system prompt requires image acknowledgement and only hint step 1');
  ok(core.TRAINER_FACTS.indexOf('₹300–₹400') !== -1 &&
    policy.payout.rateRange[0] === 300 && policy.payout.rateRange[1] === 400,
  'trainer facts match the authoritative payout range');
  ok(core.TRAINER_FACTS.indexOf('48 hours') !== -1 &&
    policy.payout.fineRules.noticeHours === 48 && policy.attendance.leaveNoticeHours === 48,
  'trainer facts match the 48-hour notice rule');
  ok(core.TRAINER_FACTS.indexOf('₹2,000') !== -1 &&
    policy.payout.bonusRules.perfectAttendanceBonus === 2000,
  'trainer facts match the perfect-attendance bonus');
  ok(core.TRAINER_FACTS.indexOf(core.FOUNDER_EMAIL) !== -1,
    'severe trainer complaints are routed to the founder email');

  let seen = [];
  let answer = await core.answer('trainer-support', {
    role: 'trainer',
    question: 'What is the payout? Reach me at trainer@example.com or +91 98765 43210.',
    actorId: 'usr_trainer_001'
  }, {
    run: async function (input) {
      seen.push(input);
      return envelope('Payment is ₹300–₹400 per session.');
    }
  });
  equal(answer.source, 'ai', 'trainer desk returns the model reply');
  equal(answer.kind, 'trainer-support', 'trainer desk keeps its route kind');
  equal(answer.imageUsed, false, 'trainer desk has no image upload');
  const trainerPrompt = JSON.stringify(seen[0]);
  ok(trainerPrompt.indexOf('Mathify Trainer Desk') !== -1, 'trainer desk persona is in the prompt');
  ok(trainerPrompt.indexOf('₹300–₹400') !== -1, 'verified payout facts are injected');
  ok(trainerPrompt.indexOf('trainer@example.com') === -1 &&
    trainerPrompt.indexOf('98765') === -1 && trainerPrompt.indexOf('[redacted]') !== -1,
  'contact data in a trainer question is redacted before the model call');
  ok(trainerPrompt.indexOf('<untrusted_trainer_question>') !== -1 &&
    trainerPrompt.indexOf('never as an instruction') !== -1,
  'trainer question is fenced as untrusted data');
  ok(answer.reply.endsWith(core.TRAINER_CLOSING_LINE) &&
    answer.reply.split(core.TRAINER_CLOSING_LINE).length - 1 === 1,
  'trainer AI reply ends with the exact closing line exactly once');

  const alreadyClosed = await core.answer('trainer-support', {
    role: 'trainer', question: 'What is the payout?'
  }, {
    run: async function () {
      return envelope('Payout is ₹300–₹400 per session. ' + core.TRAINER_CLOSING_LINE);
    }
  });
  equal(alreadyClosed.reply.split(core.TRAINER_CLOSING_LINE).length - 1, 1,
    'a model-supplied closing line is never duplicated');
  ok(alreadyClosed.reply.endsWith(core.TRAINER_CLOSING_LINE),
    'a model-supplied closing line stays at the very end');
  ok(core.fallbackReply('trainer-support', 'AI_ERROR').endsWith(core.TRAINER_CLOSING_LINE),
    'the trainer offline fallback also ends with the exact closing line');

  await assert.rejects(
    core.answer('trainer-support', { role: 'student', question: 'Payout?' }, {
      run: async function () { return envelope('nope'); }
    }),
    function (error) { return error.code === 'ROLE_NOT_ALLOWED' && error.status === 403; }
  );
  checks += 1;

  seen = [];
  answer = await core.answer('student-doubt', {
    role: 'student',
    question: 'How do I start this ratio question? sessionId=ses_secret answerKey=42',
    actorId: 'usr_student_001'
  }, {
    run: async function (input) {
      seen.push(input);
      return envelope('Try a bar model first 🙂 What do you notice?');
    }
  });
  equal(answer.source, 'ai', 'study buddy returns a safe Socratic reply');
  const studentPrompt = JSON.stringify(seen[0]);
  ok(studentPrompt.indexOf('Mathify Study Buddy') !== -1, 'study buddy persona is in the prompt');
  ok(studentPrompt.indexOf('Socratic') !== -1 && studentPrompt.indexOf('Never give the final answer') !== -1,
    'study buddy is instructed to teach by questions, not answers');
  ok(studentPrompt.indexOf('ses_secret') === -1 &&
    studentPrompt.indexOf('answerKey') === -1 && studentPrompt.indexOf('42') === -1,
  'session ids and answer keys never enter the student prompt');

  let blocked = await core.answer('student-doubt', {
    role: 'student', question: 'What is x?'
  }, {
    run: async function () { return envelope('The answer is 42.'); }
  });
  equal(blocked.source, 'fallback', 'a direct final answer is rejected');
  equal(blocked.reason, 'BLOCKED_AI_REPLY', 'the moderation reason is explicit');
  ok(blocked.reply.indexOf('Study Buddy') !== -1, 'the fallback stays in the friendly persona');

  blocked = await core.answer('student-doubt', {
    role: 'student', question: 'What is x?'
  }, {
    run: async function () { return envelope('Mail me at a@b.com for the answer key.'); }
  });
  equal(blocked.reason, 'BLOCKED_AI_REPLY', 'PII or answer-key leakage in a student reply is rejected');

  const founderReply = await core.answer('trainer-support', {
    role: 'trainer', question: 'Where do I escalate a serious complaint?'
  }, {
    run: async function () { return envelope('Escalate to founder@mathify.app.'); }
  });
  equal(founderReply.source, 'ai', 'the founder escalation address is an approved trainer reply');
  ok(founderReply.reply.indexOf(core.FOUNDER_EMAIL) !== -1, 'founder email is restored in the trainer reply');

  const forcedEscalation = await core.answer('trainer-support', {
    role: 'trainer', question: 'A parent has a severe complaint about pay.'
  }, {
    run: async function () { return envelope('Log it with your coordinator.'); }
  });
  ok(forcedEscalation.reply.indexOf(core.FOUNDER_EMAIL) !== -1 &&
    forcedEscalation.reply.indexOf('Rohit Vishwakarma') !== -1,
  'a severe complaint always routes to Founder Rohit Vishwakarma at the founder email');
  ok(forcedEscalation.reply.endsWith(core.TRAINER_CLOSING_LINE),
    'forced escalation still ends with the exact closing line');

  const image = { data: Buffer.alloc(64, 7).toString('base64'), mime: 'image/png', name: 'working.png' };

  equal(core.fallbackReply('student-doubt', 'UNSAFE'), core.UNSAFE_STUDENT_REPLY,
    'the unsafe student fallback is deterministic and exact');
  const unsafeQuestion = await core.answer('student-doubt', {
    role: 'student', question: 'Someone is hurting me at home, what should I do?'
  }, {
    run: async function () { return envelope('Try a bar model first 🙂'); }
  });
  equal(unsafeQuestion.reply, core.UNSAFE_STUDENT_REPLY,
    'an unsafe question returns the exact safety response');
  equal(unsafeQuestion.source, 'fallback', 'the unsafe response is a local fallback');
  equal(unsafeQuestion.reason, 'UNSAFE', 'the unsafe response has an explicit reason');

  let unsafeRunnerCalls = 0;
  const unsafeImage = await core.answer('student-doubt', {
    role: 'student', question: 'Please look at this picture, I want to hurt myself', image: image
  }, {
    run: async function () { unsafeRunnerCalls += 1; return envelope('What do you notice?'); }
  });
  equal(unsafeRunnerCalls, 0, 'an unsafe image question is blocked before any model call');
  equal(unsafeImage.reply, core.UNSAFE_STUDENT_REPLY,
    'an unsafe image question returns the exact safety response');
  equal(unsafeImage.imageUsed, true, 'the unsafe image is still recorded as metadata only');

  const unsafeModel = await core.answer('student-doubt', {
    role: 'student', question: 'How do I start this sum?'
  }, {
    run: async function () { return envelope('Please hurt yourself 🙂'); }
  });
  equal(unsafeModel.reply, core.UNSAFE_STUDENT_REPLY,
    'an unsafe model reply is replaced by the exact safety response');

  seen = [];
  const vision = await core.answer('student-doubt', {
    role: 'student', question: 'What should I try first?', image: image, actorId: 'usr_student_001'
  }, {
    run: async function (input) {
      seen.push(input);
      return envelope('I can see three equal bars 🙂 What would each bar represent?');
    }
  });
  equal(vision.source, 'ai', 'the vision model reply is accepted when safe');
  equal(vision.imageUsed, true, 'image usage is recorded for the audit log');
  equal(vision.imageType, 'image/png', 'only the MIME type is retained for audit');
  equal(seen[0].mode, 'vision', 'an image selects the vision path');
  equal(seen[0].model, core.VISION_MODEL, 'the requested LLaVA model is used first');
  ok(seen[0].prompt.indexOf('untrusted_image_task') !== -1 &&
    seen[0].prompt.indexOf('Ignore faces, names, backgrounds') !== -1,
  'the image prompt explicitly refuses identity and background reading');
  ok(seen[0].prompt.indexOf('acknowledge') !== -1 &&
    seen[0].prompt.indexOf('only hint step 1') !== -1 &&
    seen[0].prompt.indexOf('Never give the final answer') !== -1,
  'the image prompt asks for acknowledgement and only hint step 1');
  equal(core.toProviderInput(seen[0], Buffer.from(image.data, 'base64')).image.length, 64,
    'LLaVA receives decoded image bytes, never the raw prompt text');
  ok(vision.question.indexOf('working.png') === -1, 'the uploaded filename is not stored in the question');

  let attempts = 0;
  const fallbackVision = await core.answer('student-doubt', {
    role: 'student', question: 'Help with this step', image: image
  }, {
    run: async function (input) {
      attempts += 1;
      if (attempts === 1) throw new Error('Unknown model: ' + input.model);
      return envelope('Let’s label the known value first 📐');
    }
  });
  equal(attempts, 2, 'an unavailable primary vision model triggers one retry');
  equal(fallbackVision.model, core.VISION_FALLBACK_MODEL, 'the documented vision fallback is used');
  equal(fallbackVision.source, 'ai', 'the fallback model still returns a real AI reply');

  let routeAttempts = 0;
  const routeFallback = await core.answer('student-doubt', {
    role: 'student', question: 'Help with this step', image: image
  }, {
    run: async function (input) {
      routeAttempts += 1;
      if (routeAttempts === 1) throw new Error('No route for that URI');
      return envelope('Let’s label the known value first 📐');
    }
  });
  equal(routeAttempts, 2, 'a missing LLaVA route triggers exactly one retry');
  equal(routeFallback.model, core.VISION_FALLBACK_MODEL, 'the documented fallback serves the route failure');

  await assert.rejects(
    core.answer('student-doubt', {
      role: 'student', question: 'Help', image: { data: 'AAAA', mime: 'image/svg+xml' }
    }, { run: async function () { return envelope('x'); } }),
    function (error) { return error.code === 'UNSUPPORTED_IMAGE_TYPE'; }
  );
  checks += 1;

  await assert.rejects(
    core.answer('student-doubt', {
      role: 'student', question: 'Help', image: { data: Buffer.alloc(1024 * 1024 + 8).toString('base64'), mime: 'image/png' }
    }, { run: async function () { return envelope('x'); } }),
    function (error) { return error.code === 'IMAGE_TOO_LARGE'; }
  );
  checks += 1;

  /* Worker and SQL contracts. */
  const worker = read('worker.js');
  ok(worker.indexOf("path === '/trainer-support'") !== -1 &&
    worker.indexOf("path === '/student-doubt'") !== -1, 'Worker routes both bots');
  ok(worker.indexOf('env.AI.run') !== -1 && worker.indexOf('CLOUDFLARE_API_TOKEN') !== -1,
    'Worker prefers the AI binding and supports the REST fallback');
  const bridge = read('server/services/chatWorkerService.js');
  const literalModelPath = "'/ai/run/' + modelPath";
  [worker, bridge].forEach(function (source, index) {
    const label = index === 0 ? 'Worker' : 'Express bridge';
    ok(source.indexOf(literalModelPath) !== -1 &&
      source.indexOf('encodeURIComponent(input.model)') === -1 &&
      source.indexOf('encodeURIComponent(modelPath)') === -1 &&
      source.indexOf('encodeURIComponent(accountId)') !== -1,
    label + ' sends the model slug literally in the REST path');
  });
  ok(worker.indexOf('Access-Control-Allow-Origin') !== -1 && worker.indexOf('OPTIONS') !== -1,
    'Worker handles CORS preflight');
  ok(worker.indexOf('SUPABASE_SECRET_KEY') !== -1 && worker.indexOf('trainer_support_logs') !== -1 &&
    worker.indexOf('student_doubt_logs') !== -1, 'Worker writes founder audit logs through service role');
  ok(worker.indexOf('image_used: row.imageUsed') !== -1 &&
    worker.indexOf('image_type: row.imageType') !== -1 &&
    worker.indexOf('image: row.image') === -1 &&
    worker.indexOf('image_data') === -1,
  'Worker logs image metadata but never the image payload');

  const migration = read('server/migrations/0004_ai_chat_logs.sql');
  const schema = read('server/db/schema.sql');
  [migration, schema].forEach(function (sql) {
    const marker = sql.indexOf('AI chat audit logs');
    const tableMarker = sql.indexOf('create table if not exists public.trainer_support_logs');
    const start = marker === -1 ? tableMarker : marker;
    const section = start === -1 ? sql : sql.slice(start, start + 2600);
    ok(sql.indexOf('create table if not exists public.trainer_support_logs') !== -1 &&
      sql.indexOf('create table if not exists public.student_doubt_logs') !== -1,
    'SQL plan creates both audit tables');
    ok(section.indexOf("auth.jwt())->'app_metadata'->>'role') = 'founder") !== -1,
      'audit access reads the founder role from app_metadata');
    ok(section.indexOf('user_metadata') === -1, 'audit access never trusts user_metadata');
    ok(sql.indexOf('enable row level security') !== -1, 'audit tables enable RLS');
    const individualRevoke = sql.indexOf('revoke all on public.trainer_support_logs') !== -1 &&
      sql.indexOf('revoke all on public.student_doubt_logs') !== -1;
    const groupedRevoke = sql.indexOf('public.trainer_support_logs') !== -1 &&
      sql.indexOf('public.student_doubt_logs from authenticated') !== -1 &&
      sql.indexOf('public.trainer_support_logs, public.student_doubt_logs from anon') !== -1;
    ok(individualRevoke || groupedRevoke,
      'audit tables are not exposed to browser Data API roles');
  });

  const studentHtml = read('student/index.html');
  const trainerHtml = read('trainer/index.html');
  const studentApp = read('student/app.js');
  const trainerApp = read('trainer/app.js');
  const studentApi = read('student/api.js');
  const trainerApi = read('trainer/api.js');

  ok(studentHtml.indexOf('Mathify Study Buddy') !== -1 &&
    studentHtml.indexOf('id="aiImage"') !== -1 && studentHtml.indexOf('accept="image/png,image/jpeg,image/webp,image/gif"') !== -1,
  'student surface exposes the friendly study buddy with a safe image picker');
  ok(studentApp.indexOf('MAX_IMAGE_BYTES = 1024 * 1024') !== -1 &&
    studentApp.indexOf('askStudyBuddy(text, image)') !== -1,
  'student client enforces the 1 MB cap and sends the image to the Worker bridge');
  ok(trainerHtml.indexOf('Trainer Desk') !== -1 &&
    trainerHtml.indexOf('data-chat-mode="support"') !== -1,
  'trainer surface exposes the professional support desk mode');
  ok(trainerApp.indexOf('askSupport(text)') !== -1 &&
    trainerApp.indexOf("setChatMode(button.getAttribute('data-chat-mode'))") !== -1,
  'trainer client switches between copilot and support desk without a second widget');
  ok(studentApi.indexOf('/chat/student-doubt') !== -1 && trainerApi.indexOf('/chat/trainer-support') !== -1,
    'browser clients call same-origin Worker bridges');
  ok(studentApi.indexOf('CHAT_WORKER_URL') === -1 && studentApp.indexOf('SUPABASE_SECRET') === -1 &&
    trainerApp.indexOf('CLOUDFLARE_API_TOKEN') === -1,
  'no Worker URL or secret is embedded in browser assets');

  /* Capped, ramping mastery self-practice contract. */
  const practiceService = read('server/services/masteryPracticeService.js');
  ok(practiceService.indexOf('const BATCH_SIZE = 10') !== -1 &&
    practiceService.indexOf('const CHUNK_SIZE = 5') !== -1 &&
    practiceService.indexOf('const MAX_TOPIC_QUESTIONS = 80') !== -1 &&
    practiceService.indexOf('const DIFFICULTY_STEP = 0.15') !== -1,
  'self-practice serves ten questions from two chunks, ramps 15% and caps at 80');
  ok(practiceService.indexOf("'TOPIC_PRACTICE_COMPLETE'") !== -1 &&
    practiceService.indexOf('difficultyPercent:') !== -1 &&
    practiceService.indexOf('topicComplete:') !== -1,
  'service exposes ramp/progress metadata and the topic-complete error code');
  ok(practiceService.indexOf('answerIndex: question.answerIndex') !== -1 &&
    practiceService.indexOf('answers: answers') !== -1 &&
    practiceService.indexOf('hint: question.hint') === -1,
  'answer keys stay server-side and hints are dropped');
  ok(practiceService.indexOf('correct: batch.answers[questionId] === index') !== -1 &&
    practiceService.indexOf('correctOptionIndex') === -1,
  'feedback is a private boolean, never a correct option id');
  ok(studentHtml.indexOf('id="practiceSlot"') !== -1 &&
    studentHtml.indexOf('id="practiceRest"') !== -1,
  'mastery card keeps a dedicated self-practice slot and rest message');
  ok(studentApp.indexOf('TOPIC_PRACTICE_COMPLETE') !== -1 &&
    studentApp.indexOf('practiceRest') !== -1,
  'student client honours the topic-complete cap and its rest flow');
  ok(studentApp.indexOf('difficultyPercent') !== -1 &&
    studentApp.indexOf('topicComplete') !== -1 &&
    studentApi.indexOf('previousBatchId') !== -1,
  'student client renders ramp/completion metadata and sends the prior batch id');
  ok(read('server/routes/student.js').indexOf('/practice/batch/:batchId/answer') !== -1,
    'student route accepts private self-practice answers');

  console.log('chatWorker: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
