/* Phase 1 mock store. Shape mirrors db/schema.sql so the swap to Supabase is mechanical. */
const password = require('../auth/password');

const demoPassword = process.env.DEMO_PASSWORD || 'mathify-demo';
const demoCredential = password.hashPassword(demoPassword);

function user(id, name, email, role, extra) {
  return Object.assign({
    id,
    name,
    email,
    role,
    passwordSalt: demoCredential.salt,
    passwordHash: demoCredential.hash,
    status: 'active',
    createdAt: '2026-01-12T08:00:00.000Z'
  }, extra || {});
}

const users = [
  user('usr_founder_001', 'Rohit Vishwakarma', 'founder@mathify.app', 'founder', {
    title: 'Founder, Mathify'
  }),
  user('usr_trainer_001', 'Ananya Rao', 'trainer@mathify.app', 'trainer', {
    title: 'Math trainer',
    payPerSession: 350,
    maxHoursPerDay: 6,
    maxSessionsPerDay: 6
  }),
  user('usr_student_001', 'Ishaan Verma', 'student@mathify.app', 'student', {
    grade: '7',
    mastery: 72,
    streak: 12,
    batch: 'Ratios · Chapter 4',
    sessionsRemaining: 9
  })
];

const pages = [
  {
    id: 'page_1',
    page: 1,
    title: 'Understand the bar',
    eyebrow: 'Explore · 8 min',
    prompt: 'A ribbon is split 3 : 5. The shorter part is 18 cm. Find the whole.',
    sketchLabel: 'Sketch space · 3 parts',
    trainerNotes: [
      {
        id: 'note_1_1',
        title: 'Opening prompt',
        body: 'Ask Ishaan to say what one part means before he splits the ribbon. If he writes 18 ÷ 3 = 6 straight away, pause him and point at the three coral parts.'
      },
      {
        id: 'note_1_2',
        title: 'Bar model',
        body: 'Let him shade the three known parts himself. Coral is the only accent — do not add a second colour here.'
      }
    ]
  },
  {
    id: 'page_2',
    page: 2,
    title: 'Scale both sides',
    eyebrow: 'Build · 10 min',
    prompt: 'Every column keeps the same ratio. Fill the two gaps, then show both scales on the double number line.',
    sketchLabel: 'Sketch space · number line',
    trainerNotes: [
      {
        id: 'note_2_1',
        title: 'Scale factor',
        body: 'The two gaps are ×3 on ribbon A and ×5 on ribbon B. Say the scale factor out loud before revealing either.'
      },
      {
        id: 'note_2_2',
        title: 'Double number line',
        body: 'Point at 9 on A and 15 on B together. The dashed coral line is the same ribbon measured two ways.'
      }
    ]
  },
  {
    id: 'page_3',
    page: 3,
    title: 'Design a bead mix',
    eyebrow: 'Your turn · 12 min',
    prompt: 'Red : blue beads are 4 : 7. There are 44 beads in all. How many are blue?',
    sketchLabel: 'Bar model workspace',
    trainerNotes: [
      {
        id: 'note_3_1',
        title: 'Quiet think time',
        body: 'Give him three quiet minutes before you speak. If he asks for a hint, ask what the whole represents.'
      }
    ]
  }
];

const questions = [
  {
    id: 'q_1',
    prompt: 'Which ratio is equivalent to 3 : 5?',
    options: ['6 : 10', '5 : 3', '9 : 12', '3 : 8'],
    answerIndex: 0,
    hint: 'Multiply both parts by the same number.',
    explanation: 'Both parts were multiplied by 2.'
  },
  {
    id: 'q_2',
    prompt: 'In a 3 : 5 ribbon, the shorter piece is 12 cm. How long is the longer piece?',
    options: ['15 cm', '20 cm', '24 cm', '30 cm'],
    answerIndex: 1,
    hint: 'One part is 12 ÷ 3 = 4 cm.',
    explanation: 'One part is 4 cm, so 5 parts are 20 cm.'
  },
  {
    id: 'q_3',
    prompt: 'Red : blue beads are 4 : 7. There are 44 beads in all. How many are blue?',
    options: ['16', '24', '28', '32'],
    answerIndex: 2,
    hint: 'There are 11 parts in the whole.',
    explanation: 'One part is 4 beads, so blue is 7 × 4 = 28.'
  }
];

const sessions = [
  {
    id: 'ses_math_001',
    code: 'MATH-1501',
    trainerId: 'usr_trainer_001',
    studentId: 'usr_student_001',
    title: 'Ratios · Lesson 15',
    status: 'live',
    startedAt: '2026-11-25T16:30:00+05:30',
    endsAt: null,
    elapsedSeconds: 2538,
    currentPage: 1,
    pages: pages.map(function (page) { return Object.assign({}, page, { trainerNotes: page.trainerNotes.slice() }); }),
    planner: [
      { id: 'plan_1', label: 'Warm-up · what is one part?', done: true },
      { id: 'plan_2', label: 'Bar model · 3 : 5', done: true },
      { id: 'plan_3', label: 'Double number line', done: false },
      { id: 'plan_4', label: 'Quiz · 3 checks', done: false }
    ],
    quiz: {
      status: 'ready',
      phase: 'draft',
      currentQuestionId: 'q_1',
      startedAt: null,
      questions: questions.map(function (question) {
        return Object.assign({}, question, { source: 'template', templateId: 'ratio_core', status: 'active' });
      }),
      attempts: [],
      reveals: [],
      drafts: [
        Object.assign({}, questions[0], {
          id: 'draft_001',
          source: 'ai_draft',
          templateId: 'ratio_equivalent_check',
          status: 'draft',
          note: 'AI draft awaiting trainer approval.'
        })
      ]
    },
    board: {
      version: 14,
      strokes: []
    },
    pack: {
      id: 'pack_001',
      label: 'Ratios booster',
      remaining: 8,
      expiresAt: '2026-12-31T23:59:59.000Z'
    },
    mastery: 72,
    recording: null,
    rtc: {
      provider: 'agora',
      channel: 'mathify-ses_math_001',
      status: 'waiting-for-token'
    }
  },
  {
    id: 'ses_math_000',
    code: 'MATH-1409',
    trainerId: 'usr_trainer_001',
    studentId: 'usr_student_001',
    title: 'Fractions · Lesson 14',
    status: 'ended',
    startedAt: '2026-11-22T16:30:00+05:30',
    endsAt: '2026-11-22T17:18:00.000Z',
    elapsedSeconds: 2880,
    currentPage: 3,
    pages: pages.map(function (page) { return Object.assign({}, page); }),
    planner: [],
    quiz: {
      status: 'ended',
      phase: 'complete',
      currentQuestionId: 'q_3',
      startedAt: null,
      questions: questions.map(function (question) {
        return Object.assign({}, question, { source: 'template', templateId: 'ratio_core', status: 'active' });
      }),
      reveals: [
        { id: 'reveal_0_1', questionId: 'q_1', revealedBy: 'usr_trainer_001', at: '2026-11-22T17:05:10.000Z' },
        { id: 'reveal_0_2', questionId: 'q_2', revealedBy: 'usr_trainer_001', at: '2026-11-22T17:06:10.000Z' },
        { id: 'reveal_0_3', questionId: 'q_3', revealedBy: 'usr_trainer_001', at: '2026-11-22T17:07:10.000Z' }
      ],
      drafts: [],
      attempts: [
        { id: 'attempt_0_1', questionId: 'q_1', optionIndex: 0, correct: true, at: '2026-11-22T17:05:00.000Z' },
        { id: 'attempt_0_2', questionId: 'q_2', optionIndex: 0, correct: false, at: '2026-11-22T17:06:00.000Z' },
        { id: 'attempt_0_3', questionId: 'q_3', optionIndex: 2, correct: true, at: '2026-11-22T17:07:00.000Z' }
      ]
    },
    board: { version: 48, strokes: [] },
    pack: {
      id: 'pack_001',
      label: 'Ratios booster',
      remaining: 9,
      expiresAt: '2026-12-31T23:59:59.000Z'
    },
    mastery: 68,
    recording: {
      url: 'https://recordings.mathify.local/ses_math_000',
      durationSeconds: 2880,
      readyAt: '2026-11-22T17:22:00.000Z',
      chapters: [
        { label: 'Warm-up', seconds: 0 },
        { label: 'Bar model walkthrough', seconds: 420 },
        { label: 'Quiz review', seconds: 930 }
      ]
    },
    rtc: {
      provider: 'agora',
      channel: 'mathify-ses_math_000',
      status: 'ended'
    }
  },
  {
    id: 'ses_math_002',
    code: 'MATH-1602',
    trainerId: 'usr_trainer_001',
    studentId: 'usr_student_001',
    title: 'Ratios · Lesson 16',
    status: 'scheduled',
    startsAt: '2026-11-30T12:30:00.000Z',
    scheduledAt: '2026-11-30T12:30:00.000Z',
    pages: [],
    planner: [],
    quiz: { status: 'ready', phase: 'draft', questions: [], drafts: [], attempts: [], reveals: [] },
    board: { version: 1, strokes: [] },
    pack: { id: 'pack_001', label: 'Ratios booster', remaining: 8, expiresAt: '2026-12-31T23:59:59.000Z' },
    mastery: 72,
    rtc: { provider: 'agora', channel: 'mathify-ses_math_002', status: 'waiting-for-token' }
  },
  {
    id: 'ses_math_003',
    code: 'MATH-1603',
    trainerId: 'usr_trainer_001',
    studentId: 'usr_student_001',
    title: 'Ratios · Lesson 17',
    status: 'scheduled',
    startsAt: '2026-12-03T12:30:00.000Z',
    scheduledAt: '2026-12-03T12:30:00.000Z',
    pages: [],
    planner: [],
    quiz: { status: 'ready', phase: 'draft', questions: [], drafts: [], attempts: [], reveals: [] },
    board: { version: 1, strokes: [] },
    pack: { id: 'pack_001', label: 'Ratios booster', remaining: 8, expiresAt: '2026-12-31T23:59:59.000Z' },
    mastery: 72,
    rtc: { provider: 'agora', channel: 'mathify-ses_math_003', status: 'waiting-for-token' }
  }
];

const attendance = [
  { id: 'att_001', sessionId: 'ses_math_000', trainerId: 'usr_trainer_001', studentId: 'usr_student_001', status: 'present' }
];

/* Payment + recording state. Same shape as the tables in db/schema.sql. */
const recordings = [];
const razorpayOrders = [];
const payments = [];
const packs = [];
const whatsappMessages = [];
const supportEscalations = [];
const leaveRequests = [];
const contactRequests = [];
const presenceEvents = [];
const presenceSnapshots = [];
/* Academic-only curriculum profile. Mirrors public.student_curriculum from
   migrations/0002_student_curriculum.sql; no contact or identity fields. */
const studentCurriculum = [
  {
    studentId: 'usr_student_001',
    curriculum: 'CBSE',
    grade: '7',
    language: 'English',
    schoolChapter: 'Ratios',
    updatedBy: 'usr_trainer_001',
    updatedAt: '2026-11-01T00:00:00.000Z'
  }
];
const trainerSlots = [
  {
    id: 'slot_001',
    trainerId: 'usr_trainer_001',
    dayOfWeek: 1,
    startMinuteUtc: 720,
    endMinuteUtc: 960,
    label: 'Monday commitment',
    createdAt: '2026-11-01T00:00:00.000Z'
  },
  {
    id: 'slot_002',
    trainerId: 'usr_trainer_001',
    dayOfWeek: 4,
    startMinuteUtc: 720,
    endMinuteUtc: 960,
    label: 'Thursday commitment',
    createdAt: '2026-11-01T00:00:00.000Z'
  }
];

module.exports = {
  users: users,
  sessions: sessions,
  attendance: attendance,
  recordings: recordings,
  razorpayOrders: razorpayOrders,
  payments: payments,
  packs: packs,
  whatsappMessages: whatsappMessages,
  supportEscalations: supportEscalations,
  leaveRequests: leaveRequests,
  contactRequests: contactRequests,
  presenceEvents: presenceEvents,
  presenceSnapshots: presenceSnapshots,
  studentCurriculum: studentCurriculum,
  trainerSlots: trainerSlots,
  demoPassword: demoPassword
};
