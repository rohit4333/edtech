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
  /* Separate planner desk credential. Same LMS planner powers as the founder,
     no people/payment/policy powers, and never an overwrite of founder work. */
  user('usr_planner_001', 'Planner Agent', 'planner@mathify.app', 'planner_agent', {
    title: 'LMS Planner Agent'
  }),
  user('usr_rm_001', 'Meera Nair', 'rm@mathify.app', 'relationship_manager', {
    title: 'Relationship manager',
    monthlySalary: 35000,
    /* Seeded demo account: founder validation and access grant are complete. */
    accessGrantedAt: '2026-01-14T09:00:00.000Z',
    accessGrantedBy: 'usr_founder_001',
    accessGrantedByRole: 'founder'
  }),
  user('usr_trainer_001', 'Ananya Rao', 'trainer@mathify.app', 'trainer', {
    title: 'Math trainer',
    payPerSession: 350,
    maxHoursPerDay: 6,
    maxSessionsPerDay: 6,
    /* Seeded demo account: KYC and founder approval are already complete. */
    accessGrantedAt: '2026-01-13T09:00:00.000Z',
    accessGrantedBy: 'usr_founder_001',
    accessGrantedByRole: 'founder',
    /* Founder-set and locked: a manager has nothing left to configure here. */
    rateLockedAt: '2026-01-13T09:00:00.000Z',
    rateSetBy: 'usr_founder_001',
    rateSetByRole: 'founder'
  }),
  user('usr_student_001', 'Ishaan Verma', 'student@mathify.app', 'student', {
    loginAliases: ['parent@mathify.app'],
    grade: '7',
    mastery: 72,
    streak: 12,
    batch: 'Ratios · Chapter 4',
    sessionsRemaining: 9,
    badges: [
      {
        id: 'badge_seed_focus',
        badgeId: 'focus_star',
        label: 'Focus Star',
        points: 10,
        icon: 'star',
        sessionId: 'ses_math_000',
        awardedAt: '2026-11-22T17:20:00.000Z'
      },
      {
        id: 'badge_seed_progress',
        badgeId: 'steady_progress',
        label: 'Steady Progress',
        points: 15,
        icon: 'step',
        sessionId: 'ses_math_000',
        awardedAt: '2026-11-22T17:21:00.000Z'
      }
    ],
    trophyPoints: 25
  }),
  /* Demo parent for the 1-on-1 parent↔trainer thread. Only a child link is
     stored: no phone, social or other contact field exists on this account. */
  user('usr_parent_001', 'Priya Verma', 'parent@mathify.app', 'parent', {
    loginAliases: ['student@mathify.app'],
    childId: 'usr_student_001'
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
/* Demo lifecycle notices are service-only parent inbox rows. They carry safe
   display copy only: no password, no contact detail, no other child's data. */
const parentNotifications = [];
/* Cron delivery claims stay in-memory in mock mode; live mode uses the
   service-only reminder_claim records from db/supabase.js. */
const reminderClaims = new Map();
/* Service-only records for subject workspaces, coding challenges and shared
   IDE state. Live mode stores the same JSON in mathify_records. */
const genericRecords = new Map();
const presenceEvents = [];
const presenceSnapshots = [];
/* Engagement gestures stay separate from celebrations. Only code, role,
   session and minute are stored — never a note or personal detail. */
const reactions = [];
/* Strictly service-only parent chat. Messages are safe delivery text only;
   blocked content lives exclusively in founder-visible flags, never here. */
const parentChatMessages = [];
const parentChatFlags = [];
const parentChatReads = [];
/* Immutable early-years planner generations and their version pointers. The
   pointer is the only mutable record; generated JSON is never overwritten. */
const weeklyPlannerCache = [];
const weeklyPlannerArchive = [];
const weeklyPlannerPointers = [];
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
/* Enrollment batches and locked trainer onboarding records mirror the
   service-only record collections in migration 0006. No private document
   bytes are stored here — only object references and audit metadata. */
const batches = [];
const trainerOnboarding = [{
  trainerId: 'usr_trainer_001',
  status: 'submitted',
  fullName: 'Ananya Rao',
  dateOfBirth: '1994-06-12',
  personal: {
    contactNumber: '9876543210',
    alternateContactNumber: '9876543211',
    emailId: 'trainer@mathify.app',
    address: 'Bengaluru',
    fatherName: 'Rao Father',
    motherName: 'Rao Mother',
    spouseName: ''
  },
  bank: {
    accountHolderName: 'Ananya Rao',
    accountNumber: '1234567890',
    ifscCode: 'HDFC0001234',
    bankName: 'HDFC',
    branch: 'Indiranagar'
  },
  aadhaar: {
    number: '123456789012',
    front: { id: 'demo_aadhaar_front', ref: 'onboarding/demo/aadhaar-front.png', fileName: 'aadhaar-front.png', mimeType: 'image/png' },
    rear: { id: 'demo_aadhaar_rear', ref: 'onboarding/demo/aadhaar-rear.png', fileName: 'aadhaar-rear.png', mimeType: 'image/png' }
  },
  pan: {
    number: 'ABCDE1234F',
    front: { id: 'demo_pan_front', ref: 'onboarding/demo/pan-front.png', fileName: 'pan-front.png', mimeType: 'image/png' },
    rear: { id: 'demo_pan_rear', ref: 'onboarding/demo/pan-rear.png', fileName: 'pan-rear.png', mimeType: 'image/png' }
  },
  signature: { image: { id: 'demo_signature', ref: 'onboarding/demo/signature.png', mimeType: 'image/png' } },
  bankProof: { image: { id: 'demo_bank_proof', ref: 'onboarding/demo/bank-proof.png', mimeType: 'image/png' } },
  additionalDocuments: [],
  createdAt: '2026-01-12T09:00:00.000Z',
  updatedAt: '2026-01-12T09:00:00.000Z'
}];
const trainerOnboardingCorrections = [];
const trainerDocuments = [];
const announcements = [];
const announcementReads = [];
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

function cloneRecord(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function recordKey(collection, key) {
  return String(collection || '') + ':' + String(key || '');
}

function getRecord(collection, key) {
  const found = genericRecords.get(recordKey(collection, key));
  return found === undefined ? null : cloneRecord(found);
}

function putRecord(collection, key, value) {
  const stored = cloneRecord(value);
  genericRecords.set(recordKey(collection, key), stored);
  return cloneRecord(stored);
}

function deleteRecord(collection, key) {
  return genericRecords.delete(recordKey(collection, key));
}

function listRecords(collection) {
  const prefix = String(collection || '') + ':';
  const rows = [];
  genericRecords.forEach(function (value, key) {
    if (key.indexOf(prefix) === 0) rows.push(cloneRecord(value));
  });
  return rows;
}

module.exports = {
  getRecord: getRecord,
  putRecord: putRecord,
  deleteRecord: deleteRecord,
  listRecords: listRecords,
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
  parentNotifications: parentNotifications,
  reminderClaims: reminderClaims,
  presenceEvents: presenceEvents,
  presenceSnapshots: presenceSnapshots,
  reactions: reactions,
  parentChatMessages: parentChatMessages,
  parentChatFlags: parentChatFlags,
  parentChatReads: parentChatReads,
  weeklyPlannerCache: weeklyPlannerCache,
  weeklyPlannerArchive: weeklyPlannerArchive,
  weeklyPlannerPointers: weeklyPlannerPointers,
  studentCurriculum: studentCurriculum,
  trainerSlots: trainerSlots,
  batches: batches,
  trainerOnboarding: trainerOnboarding,
  trainerOnboardingCorrections: trainerOnboardingCorrections,
  trainerDocuments: trainerDocuments,
  announcements: announcements,
  announcementReads: announcementReads,
  practiceBatches: [],
  founderPenaltyDecisions: [],
  passwordResets: [],
  demoPassword: demoPassword

};
