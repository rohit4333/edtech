/* Mathify parent-support AI service.
   Phase 1 uses a mock Supabase adapter; Phase 2 swaps mockSupabase for @supabase/supabase-js.
   DeepSeek never talks to parents directly: the route decides what is safe to send. */
const OpenAI = require('openai');

const HANDOFF_REPLY =
  'Thank you for reaching out. A senior Mathify coordinator has been notified and will personally assist you shortly.';
const RESCHEDULE_REPLY =
  'I can help with that. Please provide the new date and time, ensuring it is at least 24-48 hours in advance.';
const UNKNOWN_PARENT_REPLY =
  'Hello! I could not find a student linked to this number. Please contact Mathify support at founder@mathify.app.';
const UNAVAILABLE_REPLY =
  'I am having a brief technical issue. A Mathify coordinator will reply to you shortly. Thank you for your patience.';

const SYSTEM_PROMPT = [
  'You are the Mathify Learning OS Support Assistant. You communicate with parents via WhatsApp.',
  'STRICT MATHIFY BUSINESS RULES (MUST ENFORCE):',
  '1. Rescheduling: Students must reschedule at least 24-48 hours in advance. A no-show without notice is marked as used.',
  '2. Expiry: All sessions in a monthly pack must be used within 38 days of purchase. This prevents schedule disruption.',
  '3. Refunds: Once purchased, a pack is STRICTLY NON-REFUNDABLE. Sessions can only be rescheduled with proper notice.',
  '4. Payments: Razorpay prices are all-inclusive with no hidden fees. Strongly encourage Online International Bank Transfer',
  '   instead of cards so parents avoid the extra 3% charge plus GST. Never argue about money.',
  '5. Curriculum: Mathify is strictly 1-on-1 and follows the student’s specific school curriculum.',
  '6. Progression: The trainer sets the readiness threshold for each objective. If a student is not ready, the trainer reteaches the topic and uses a fresh check. Do not quote a fixed percentage.',
  '7. Be polite, professional, encouraging and concise (WhatsApp friendly). Never use emoji.',
  '8. Never invent dates, times, refunds, trainer notes or internal details.',
  '',
  'OUTPUT RULES — return ONLY one of these three formats:',
  'A) Plain reply text, max 300 characters, when you can answer from the context.',
  'B) Exactly "ACTION: RESCHEDULE_REQUEST" when the parent asks to move a class.',
  'C) Exactly "HUMAN_HANDOFF_REQUIRED: <one-sentence summary>" when the parent is angry, complains about a trainer,',
  '   mentions misconduct, asks for a refund, disputes attendance, or presents a complex edge case.',
  'When in doubt, choose C. Do not make promises or argue in format C.'
].join('\n');

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? '+' + digits : '';
}

function client() {
  if (!process.env.DEEPSEEK_API_KEY) {
    const error = new Error('DEEPSEEK_API_KEY is not configured.');
    error.code = 'DEEPSEEK_NOT_CONFIGURED';
    throw error;
  }

  return new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com'
  });
}

/* Phase 1 mock Supabase adapter. The method names mirror the Phase 2 queries. */
const DEMO_PARENT_PHONE = normalizePhone(
  process.env.WHATSAPP_DEMO_PARENT_PHONE || 'whatsapp:+15005550006'
);

const MOCK_STUDENTS = [
  {
    id: 'stu_aarav_001',
    name: 'Aarav Menon',
    parentPhone: DEMO_PARENT_PHONE,
    sessionsRemaining: 6,
    packExpiry: '2026-12-30',
    recentQuizScores: [72, 80, 76, 84],
    attendancePresent: 8,
    attendanceTotal: 13,
    lastTopic: 'Fractions'
  }
];

const mockSupabase = {
  /* Production: supabase.from('students').select('*').eq('parent_phone', phone).single() */
  getStudentByParentPhone: async function (phone) {
    const normalized = normalizePhone(phone);
    return MOCK_STUDENTS.find(function (student) {
      return student.parentPhone === normalized;
    }) || null;
  },

  /* Production: supabase.from('quiz_attempts').select('score').eq('student_id', id).order('at', { ascending: false }).limit(5) */
  getRecentQuizScores: async function (studentId) {
    const student = MOCK_STUDENTS.find(function (item) { return item.id === studentId; });
    return student ? student.recentQuizScores.slice() : [];
  },

  /* Production: supabase.from('attendance').select('status').eq('student_id', id) */
  getAttendance: async function (studentId) {
    const student = MOCK_STUDENTS.find(function (item) { return item.id === studentId; });
    if (!student) return null;
    return {
      present: student.attendancePresent,
      total: student.attendanceTotal,
      rate: Math.round((student.attendancePresent / student.attendanceTotal) * 100)
    };
  },

  /* Production: supabase.from('student_profiles').select('sessions_remaining').eq('user_id', id).single() */
  getSessionBalance: async function (studentId) {
    const student = MOCK_STUDENTS.find(function (item) { return item.id === studentId; });
    if (!student) return null;
    return {
      sessionsRemaining: student.sessionsRemaining,
      packExpiry: student.packExpiry,
      refundable: false
    };
  }
};

function buildContext(student, scores, attendance, balance) {
  const average = scores.length
    ? Math.round(scores.reduce(function (sum, score) { return sum + score; }, 0) / scores.length)
    : null;

  return [
    'Student: ' + student.name,
    'Recent quiz scores: ' + (scores.length ? scores.map(function (s) { return s + '%'; }).join(', ') : 'not yet recorded'),
    'Average recent quiz score: ' + (average === null ? 'not yet available' : average + '%'),
    'Attendance: ' + attendance.rate + '% (' + attendance.present + ' of ' + attendance.total + ' sessions)',
    'Session balance: ' + balance.sessionsRemaining + ' sessions remaining',
    'Pack expiry: ' + balance.packExpiry,
    'Pack refundable: no',
    'Last topic: ' + student.lastTopic
  ].join('\n');
}

function sanitizeReply(text) {
  return String(text || '')
    .replace(/^```(?:text)?\s*/i, '')
    .replace(/```$/, '')
    .replace(/^["']|["']$/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

function result(reply, action, student, handoff) {
  return {
    reply: reply,
    action: action || null,
    student: student ? { id: student.id, name: student.name } : null,
    handoff: handoff || null
  };
}

/* Deterministic safety net: these topics never rely on the model to choose a handoff. */
const HANDOFF_RULES = [
  {
    pattern: /\b(refund|refundable|money back|chargeback|dispute the payment|cancel my pack)\b/i,
    summary: 'Parent asked about a refund or disputed a payment.'
  },
  {
    pattern: /\b(angry|furious|upset|complain|complaint|worst|rude|misconduct|harass|abuse|inappropriate|unprofessional)\b/i,
    summary: 'Parent raised a complaint or conduct concern.'
  },
  {
    pattern: /\b(attendance|absent|no[- ]show|marked as used)\b/i,
    summary: 'Parent disputed attendance or session usage.'
  },
  {
    pattern: /\b(legal|lawyer|sue|police|court|fraud)\b/i,
    summary: 'Parent raised a complex legal or safety concern.'
  }
];

function requiredHandoff(message) {
  const match = HANDOFF_RULES.find(function (rule) { return rule.pattern.test(message); });
  return match ? match.summary : null;
}

/**
 * Generate a parent-safe WhatsApp reply.
 * @returns {Promise<{reply:string, action:string|null, student:object|null, handoff:object|null}>}
 */
async function generateAiResponse(parentPhone, userMessage) {
  const student = await mockSupabase.getStudentByParentPhone(parentPhone);
  if (!student) {
    return result(UNKNOWN_PARENT_REPLY, 'UNKNOWN_PARENT', null, null);
  }

  const message = String(userMessage || '').trim().slice(0, 1000);
  if (!message) {
    return result('Please send your question again so I can help.', 'EMPTY_MESSAGE', student, null);
  }

  const deterministicHandoff = requiredHandoff(message);
  if (deterministicHandoff) {
    return result(HANDOFF_REPLY, 'HUMAN_HANDOFF_REQUIRED', student, {
      required: true,
      summary: deterministicHandoff
    });
  }

  try {
    const scores = await mockSupabase.getRecentQuizScores(student.id);
    const attendance = await mockSupabase.getAttendance(student.id);
    const balance = await mockSupabase.getSessionBalance(student.id);
    const context = buildContext(student, scores, attendance, balance);

    const response = await client().chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0.4,
      max_tokens: 300,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: 'Parent context:\n' + context + '\n\nParent message: "' + message + '"'
        }
      ]
    });

    const raw = response && response.choices && response.choices[0] &&
      response.choices[0].message && response.choices[0].message.content;
    const content = String(raw || '').trim();

    if (!content) {
      throw new Error('DeepSeek returned an empty response.');
    }

    const handoffMatch = content.match(/^HUMAN_HANDOFF_REQUIRED\s*:\s*(.+)$/i);
    if (handoffMatch) {
      return result(HANDOFF_REPLY, 'HUMAN_HANDOFF_REQUIRED', student, {
        required: true,
        summary: sanitizeReply(handoffMatch[1]) || 'Parent requested human support.'
      });
    }

    if (/^ACTION\s*:\s*RESCHEDULE_REQUEST$/i.test(content)) {
      return result(RESCHEDULE_REPLY, 'RESCHEDULE_REQUEST', student, null);
    }

    return result(sanitizeReply(content) || UNKNOWN_PARENT_REPLY, 'REPLY', student, null);
  } catch (error) {
    console.error('DeepSeek WhatsApp AI error:', error.message);
    return result(UNAVAILABLE_REPLY, 'AI_UNAVAILABLE', student, {
      required: true,
      summary: 'AI unavailable for parent message: ' + sanitizeReply(message).slice(0, 200)
    });
  }
}

module.exports = {
  generateAiResponse,
  normalizePhone,
  mockSupabase,
  SYSTEM_PROMPT,
  HANDOFF_REPLY,
  RESCHEDULE_REPLY
};
