/* Mathify chat assistants.
 *
 * The student tutor and trainer copilot are real Cloudflare Workers AI calls.
 * They deliberately receive academic context only: no name, email, phone,
 * social handle, payment detail, answer key or trainer-only note is ever put
 * in a prompt. When Workers AI is unavailable the service returns an honest
 * offline reply marked source: 'fallback' — it never pretends to be the model.
 */

const db = require('../db');
const curriculumRepository = require('../db/curriculum');
const cloudflareAiService = require('./cloudflareAiService');
const curriculumContext = require('./curriculumContext');

const MAX_QUESTION_CHARS = 600;
const MAX_REPLY_CHARS = 900;
const ACADEMIC_KEYS = ['curriculum', 'board', 'grade', 'language', 'schoolChapter', 'school_chapter'];

const STUDENT_SYSTEM = [
  "You are Mathify's study tutor for a strictly 1-on-1 maths session.",
  'Reply in at most three short sentences. Give one next step or one guiding question, never a full worked solution unless the student explicitly asks for it.',
  'Use the school curriculum, notation and illustration context supplied below.',
  'Never mention a name, email, phone number, social link, other student, group class, answer key, hint or trainer-only note.',
  'Return ONLY a JSON object with one string field: {"reply":"..."}'
].join('\n');

const TRAINER_SYSTEM = [
  "You are Mathify's copilot for a solo trainer preparing a strictly 1-on-1 maths session.",
  'Help with planner design, differentiation, parent-note drafts, recap wording and teaching-score explanations.',
  'Use only the academic context supplied by the server. Do not invent student names, contact details or session data.',
  'Never suggest group classes or a multi-student roster.',
  'Return ONLY a JSON object with one string field: {"reply":"..."}'
].join('\n');

function boundText(value, limit) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

async function academicStudent(student, studentId) {
  let source = student && typeof student === 'object' ? student : null;
  if (!source && studentId) {
    const found = db.findUserById(studentId);
    if (found && found.role === 'student') source = found;
  }
  const profile = {};
  if (source) {
    ACADEMIC_KEYS.forEach(function (key) {
      if (source[key] !== undefined && source[key] !== null) profile[key] = source[key];
    });
  }

  /* Persisted academic profile wins over the in-memory session object. It is
     the only source that carries board / language / school chapter. */
  if (studentId) {
    try {
      const persisted = await curriculumRepository.get(studentId);
      if (persisted) {
        if (persisted.curriculum) profile.curriculum = persisted.curriculum;
        if (persisted.grade) profile.grade = persisted.grade;
        if (persisted.language) profile.language = persisted.language;
        if (persisted.schoolChapter) profile.schoolChapter = persisted.schoolChapter;
      }
    } catch (error) {
      /* A failed profile read must not break the AI reply. */
    }
  }
  return profile;
}

function fallbackReply(role) {
  if (role === 'student') {
    return 'The AI tutor is offline right now. Your question is saved — please try again in a moment.';
  }
  return 'The copilot is offline right now. Please retry in a moment; no draft was saved.';
}

/**
 * @param {'student'|'trainer'} role
 * @param {string} question raw question from the browser
 * @param {{student?:object, studentId?:string, sessionId?:string}} options
 */
async function reply(role, question, options) {
  const settings = options || {};
  const text = boundText(question, MAX_QUESTION_CHARS);
  if (!text) {
    return { reply: 'Type a short question first.', source: 'validation' };
  }

  const trainer = role === 'trainer';
  const profile = await academicStudent(settings.student, settings.studentId);
  const curriculum = curriculumContext.getCurriculumContext(profile);
  const system = trainer ? TRAINER_SYSTEM : STUDENT_SYSTEM + '\n' + curriculum.promptInjection;
  const userPrompt = JSON.stringify({
    question: text,
    curriculum: curriculum.curriculum,
    grade: curriculum.grade || null,
    chapter: curriculum.currentTopic,
    language: curriculum.language,
    scope: trainer ? 'trainer planning' : '1-on-1 student session',
    sessionId: settings.sessionId || null
  });

  let raw = null;
  try {
    raw = await cloudflareAiService.generateAIResponse(system, userPrompt, { jsonOnly: true });
  } catch (error) {
    return { reply: fallbackReply(role), source: 'fallback', reason: error.code || 'AI_ERROR' };
  }

  const parsed = cloudflareAiService.safeParseJSON(raw);
  if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim()) {
    return { reply: boundText(parsed.reply, MAX_REPLY_CHARS), source: 'ai' };
  }
  return { reply: fallbackReply(role), source: 'fallback', reason: 'INVALID_AI_JSON' };
}

module.exports = {
  reply: reply,
  fallbackReply: fallbackReply,
  academicStudent: academicStudent,
  MAX_QUESTION_CHARS: MAX_QUESTION_CHARS
};
