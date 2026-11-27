/* Role-aware response builders. Student serializers never touch trainer_instructions. */
const db = require('./db');
const payoutService = require('./services/payoutService');
const attendancePolicy = require('./services/attendancePolicy');
const mediaPermission = require('./services/mediaPermissionService');
const reactionPermission = require('./services/reactionPermissionService');
const networkQuality = require('./services/networkQualityService');
const presenceService = require('./services/presenceService');
const sessionAccess = require('./services/sessionAccessService');
const sessionTiming = require('./services/sessionTimingService');
const badgeService = require('./services/badgeService');
const subjectCatalog = require('./services/subjectCatalog');
const subjectService = require('./services/subjectService');
const appPolicy = require('./config/policy.json');

/* Explicit student boundary: hidden trainer guidance is never serialized. */
const TRAINER_ONLY_KEYS = [
  'trainer_instructions',
  'trainerInstructions',
  'trainerNotes',
  'misconception_watch',
  'prompt_for_trainer'
];

/* Keys that must never reach a student payload. */
const STUDENT_FORBIDDEN_KEYS = [
  'trainer_instructions',
  'trainerInstructions',
  'trainerNotes',
  'misconception_watch',
  'prompt_for_trainer',
  'answerKey',
  'correctOptionId',
  'answerIndex',
  'answer_index',
  'correctAnswer',
  'correct',
  'explanation',
  'distractor_rationale',
  'why'
];

/* A warning is emitted only for the business-critical trainer/answer keys. */
const STUDENT_SECURITY_KEYS = [
  'trainerInstructions',
  'misconception_watch',
  'answerKey',
  'correctOptionId',
  'explanation'
];

function cloneValue(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function stripByKeys(value, keys, onStrip) {
  if (Array.isArray(value)) {
    return value.map(function (item) { return stripByKeys(item, keys, onStrip); });
  }
  if (!value || typeof value !== 'object') return value;

  const safe = {};
  Object.keys(value).forEach(function (key) {
    if (keys.indexOf(key) !== -1) {
      if (onStrip) onStrip(key);
      return;
    }
    safe[key] = stripByKeys(value[key], keys, onStrip);
  });
  return safe;
}

/**
 * Role-aware sanitizer.
 * - No role: legacy safe context used internally; strips trainer guidance.
 * - student: deep-clones and aggressively removes all forbidden keys.
 * - trainer/founder: deep-clones without stripping trainer content.
 */
function stripTrainerOnlyFields(payload, role) {
  const normalizedRole = role === null || role === undefined ? null : String(role).toLowerCase();

  if (normalizedRole && normalizedRole !== 'student') return cloneValue(payload);

  const keys = normalizedRole === 'student' ? STUDENT_FORBIDDEN_KEYS : TRAINER_ONLY_KEYS;
  let foundSecurityKey = false;
  const safe = stripByKeys(payload, keys, function (key) {
    if (STUDENT_SECURITY_KEYS.indexOf(key) !== -1) foundSecurityKey = true;
  });

  if (normalizedRole === 'student' && foundSecurityKey) {
    console.warn('[SECURITY] Trainer-only fields detected in student payload!');
  }
  return safe;
}

function stripStudentRestrictedFields(value) {
  return stripTrainerOnlyFields(value, 'student');
}

/* Cross-role participant data is deliberately name-only. Contact details,
   profile ids, job titles and business fields never cross the session boundary. */
function participant(userId) {
  const user = db.findUserById(userId);
  if (!user) return null;
  return { name: user.name };
}

/* Subject is display/content selection only. Missing values are always math. */
function subjectView(value) {
  return subjectCatalog.publicView(value);
}

/* Small, stable question bank for an English session that has no stored quiz
   questions. It uses the same question shape as a math quiz; answerIndex and
   explanation are trainer-only and every student view is scrubbed below. */
const ENGLISH_QUIZ_BANK = [
  {
    id: 'eng_q_1',
    prompt: 'Which sentence uses a describing word correctly?',
    options: [
      'The calm river moved slowly.',
      'The river calm moved slowly.',
      'The slowly river moved calm.',
      'Calm the river moved slowly.'
    ],
    answerIndex: 0,
    explanation: 'Calm describes the river and sits before the noun.',
    source: 'template',
    templateId: 'english_core',
    status: 'active'
  },
  {
    id: 'eng_q_2',
    prompt: 'Which reply shows active listening?',
    options: [
      'I hear that you are worried about the test. Tell me more.',
      'That is not a big deal.',
      'You should not feel that way.',
      'Let us talk about my day instead.'
    ],
    answerIndex: 0,
    explanation: 'Naming the feeling and inviting more detail shows active listening.',
    source: 'template',
    templateId: 'english_core',
    status: 'active'
  },
  {
    id: 'eng_q_3',
    prompt: "Which word best completes: 'Maya ___ the shelf for her brother'?",
    options: ['helped', 'help', 'helping', 'helps'],
    answerIndex: 0,
    explanation: 'The past-tense verb helped matches a finished action.',
    source: 'template',
    templateId: 'english_core',
    status: 'active'
  }
];

function hasStoredQuizQuestions(session) {
  return Boolean(session && session.quiz && Array.isArray(session.quiz.questions)
    && session.quiz.questions.length);
}

/* A picture question carries its own image, never its image-generation prompt
   or trainer guidance. Only image-like fields cross the role boundary. */
function safeQuestionImage(question) {
  if (!question) return null;
  var image = question.image || question.imageUrl || question.image_url ||
    question.imageData || question.image_data || question.photo || question.attachment;
  if (!image) return null;
  var source = typeof image === 'string' ? image :
    (image.data || image.dataUrl || image.src || image.url || '');
  source = String(source || '').trim();
  if (!source) return null;
  if (source.indexOf('data:image/') === 0 ||
      /^https?:\/\//.test(source) || source.charAt(0) === '/') return source;
  if (image && typeof image === 'object' && image.mime &&
      /^image\//.test(image.mime) && /^[A-Za-z0-9+/=\s]+$/.test(source)) {
    return 'data:' + image.mime + ';base64,' + source.replace(/\s+/g, '');
  }
  return null;
}

/* One question source for both serializers and answer validation. Stored
   questions always win; math and other subjects never borrow this bank. */
function quizQuestionsFor(session) {
  if (hasStoredQuizQuestions(session)) return session.quiz.questions;
  if (session && subjectCatalog.normalize(session.subject) === 'english') {
    return ENGLISH_QUIZ_BANK;
  }
  return session && session.quiz && Array.isArray(session.quiz.questions)
    ? session.quiz.questions : [];
}

/* Trainer-only attendance rows need an opaque row key, never contact data. */
function attendanceStudent(userId) {
  const user = db.findUserById(userId);
  if (!user) return null;
  return { id: user.id, name: user.name };
}

function readiness(session) {
  const attempts = (session.quiz && session.quiz.attempts) || [];
  if (!attempts.length) return 0;
  const correct = attempts.filter(function (attempt) { return attempt.correct; }).length;
  return Math.round((correct / attempts.length) * 100);
}

function trainerQuiz(session) {
  return {
    status: session.quiz.status,
    phase: session.quiz.phase,
    currentQuestionId: session.quiz.currentQuestionId,
    startedAt: session.quiz.startedAt,
    readiness: readiness(session),
    questions: quizQuestionsFor(session).map(function (question) {
      var view = {
        id: question.id,
        prompt: question.prompt,
        options: question.options.slice(),
        answerIndex: question.answerIndex,
        hint: question.hint,
        explanation: question.explanation,
        source: question.source || 'template',
        templateId: question.templateId || null,
        concept: question.concept || null,
        difficultyLevel: question.difficultyLevel || null,
        requiresCorrectAnswer: question.requiresCorrectAnswer === true,
        status: question.status || 'active'
      };
      var image = safeQuestionImage(question);
      if (image) view.image = image;
      return view;
    }),
    attempts: session.quiz.attempts.slice(),
    reveals: (session.quiz.reveals || []).slice(),
    drafts: (session.quiz.drafts || []).slice()
  };
}

function grantedHint(options, questionId, legacyHint) {
  const settings = options || {};
  const granted = settings.grantedHints && settings.grantedHints[questionId];
  if (granted && typeof granted === 'object') {
    return typeof granted.hint === 'string' ? granted.hint : granted.text || null;
  }
  if (granted) return granted;
  if (settings.includeHints === true && legacyHint) return legacyHint;
  return null;
}

function studentQuiz(session, options) {
  const revealed = {};
  (session.quiz.reveals || []).forEach(function (reveal) { revealed[reveal.questionId] = true; });

  const payload = {
    status: session.quiz.status,
    phase: session.quiz.phase,
    currentQuestionId: session.quiz.currentQuestionId,
    startedAt: session.quiz.startedAt,
    revealedQuestionIds: Object.keys(revealed),
    questions: quizQuestionsFor(session).map(function (question) {
      const answer = {
        id: question.id,
        prompt: question.prompt,
        options: question.options.slice()
      };
      const image = safeQuestionImage(question);
      if (image) answer.image = image;
      if (question.requiresCorrectAnswer === true) {
        answer.requiresCorrectAnswer = true;
      }
      const hint = grantedHint(options, question.id, question.hint);
      if (hint) answer.hint = hint;
      if (revealed[question.id]) {
        answer.answerIndex = question.answerIndex;
        answer.explanation = question.explanation;
      }
      return answer;
    }),
    attempts: session.quiz.attempts.map(function (attempt) {
      const result = {
        id: attempt.id,
        questionId: attempt.questionId,
        optionIndex: attempt.optionIndex,
        at: attempt.at
      };
      if (revealed[attempt.questionId]) result.correct = attempt.correct;
      return result;
    })
  };

  return payload;
}

/** Student view of the new three-tier curriculum quiz from cloudflareService. */
function toStudentQuizTiers(payload, options) {
  if (!payload || typeof payload !== 'object') return null;

  const tiers = {};
  Object.keys(payload.quiz || {}).forEach(function (tier) {
    tiers[tier] = (payload.quiz[tier] || []).map(function (item) {
      const safe = {
        id: item.id,
        stem: item.stem || item.prompt,
        options: Array.isArray(item.options) ? item.options.map(function (option) {
          return { id: option.id, text: option.text };
        }) : [],
        time_limit_sec: item.time_limit_sec,
        requires_sketch: Boolean(item.requires_sketch),
        bloom: item.bloom || null
      };

      const granted = grantedHint(options, item.id, (item.hints || [])[0] || item.hint);
      if (granted) safe.hints = [granted];
      return safe;
    });
  });

  return stripStudentRestrictedFields({
    quiz: tiers,
    advance_criteria: payload.advance_criteria
      ? { gate_pct: payload.advance_criteria.gate_pct, repeat_if_below: payload.advance_criteria.repeat_if_below }
      : null,
    parent_summary: payload.parent_summary || ''
  });
}

/** Student view of a generated planner. Trainer notes and sketch prompts never ship. */
function toStudentCurriculum(payload, options) {
  if (!payload || typeof payload !== 'object') return null;

  const planner = payload.planner || {};
  const curriculumMap = stripTrainerOnlyFields(payload.curriculum_map || {});
  return stripStudentRestrictedFields({
    topic_id: payload.topic_id || null,
    curriculum_map: curriculumMap,
    planner: {
      version: planner.version || 1,
      estimated_minutes: planner.estimated_minutes || null,
      blocks: (planner.blocks || []).map(function (block) {
        const sketch = block.sketch ? {
          minHeight: block.sketch.minHeight,
          expandable: block.sketch.expandable === true
        } : undefined;
        const safe = {
          id: block.id,
          type: block.type,
          content: {
            text: block.content && block.content.text ? block.content.text : '',
            image_prompt: block.content && block.content.image_prompt ? block.content.image_prompt : '',
            alt: block.content && block.content.alt ? block.content.alt : '',
            caption: block.content && block.content.caption ? block.content.caption : ''
          }
        };
        if (sketch) safe.sketch = sketch;
        return stripTrainerOnlyFields(safe);
      })
    },
    quiz: payload.quiz ? toStudentQuizTiers(payload, options) : undefined
  });
}

function toTrainerSummary(session) {
  return {
    id: session.id,
    code: session.code,
    title: session.title,
    status: session.status,
    startedAt: session.startedAt,
    currentPage: session.currentPage,
    student: participant(session.studentId),
    pack: session.pack,
    mastery: session.mastery,
    recordingUrl: session.recording ? session.recording.url : null
  };
}

function toTrainerSession(session) {
  return {
    id: session.id,
    code: session.code,
    title: session.title,
    status: session.status,
    startedAt: session.startedAt,
    elapsedSeconds: session.elapsedSeconds,
    currentPage: session.currentPage,
    trainer: participant(session.trainerId),
    student: participant(session.studentId),
    pack: session.pack,
    mastery: session.mastery,
    recording: session.recording,
    rtc: session.rtc,
    planner: session.planner.map(function (item) { return Object.assign({}, item); }),
    pages: session.pages.map(function (page) {
      return {
        id: page.id,
        page: page.page,
        title: page.title,
        eyebrow: page.eyebrow,
        prompt: page.prompt,
        sketchLabel: page.sketchLabel,
        trainer_instructions: page.trainerNotes.map(function (note) { return Object.assign({}, note); })
      };
    }),
    quiz: trainerQuiz(session),
    board: { version: session.board.version, strokeCount: session.board.strokes.length }
  };
}

function toStudentSession(session, options) {
  return stripTrainerOnlyFields({
    id: session.id,
    code: session.code,
    title: session.title,
    status: session.status,
    startedAt: session.startedAt,
    elapsedSeconds: session.elapsedSeconds,
    currentPage: session.currentPage,
    trainer: participant(session.trainerId),
    student: participant(session.studentId),
    pack: session.pack,
    mastery: session.mastery,
    recording: session.recording,
    rtc: { provider: session.rtc.provider, channel: session.rtc.channel, status: session.rtc.status },
    pages: session.pages.map(function (page) {
      return {
        id: page.id,
        page: page.page,
        title: page.title,
        eyebrow: page.eyebrow,
        prompt: page.prompt,
        sketchLabel: page.sketchLabel
      };
    }),
    quiz: studentQuiz(session, options),
    board: { version: session.board.version, strokeCount: session.board.strokes.length }
  }, 'student');
}

async function toSessionState(session, user) {
  const trainerView = user && (user.role === 'trainer' || user.role === 'founder');
  /* Subject is academic display data. It never changes access, RTC, payment
     or attendance behaviour; every caller defaults a missing value to math. */
  const subject = await subjectService.forSession(session);
  const media = mediaPermission.normalize(session.mediaPermissions);
  const applause = reactionPermission.normalize(session.reactionPermissions);
  const presenceSnapshot = await presenceService.compute(session);
  const minimumQuota = sessionTiming.minimumQuota(presenceSnapshot);
  /* A live legacy session has no join webhook, so its own startedAt is the
     presence anchor. A scheduled room waits for verified trainer presence. */
  const trainerPresenceAt = session.status === 'live'
    ? (session.startedAt || presenceSnapshot.trainerJoinedAt)
    : presenceSnapshot.trainerJoinedAt;
  const timing = sessionTiming.clock(session, undefined, trainerPresenceAt, {
    trainerActiveSeconds: minimumQuota.trainerCountedSeconds,
    timerRunning: presenceSnapshot.trainerTimerRunning === true
  });
  /* The same counted quota drives the room cue and the trainer pay gate. */
  timing.minimumQuota = minimumQuota;
  timing.minimumQuotaReached = minimumQuota.reached === true;
  timing.childPresent = minimumQuota.childJoined;
  timing.childStillPresent = minimumQuota.childStillPresent;
  const state = {
    id: session.id,
    subject: subject,
    status: session.status,
    currentPage: session.currentPage,
    boardVersion: session.board.version,
    quizStatus: session.quiz.status,
    quizPhase: session.quiz.phase,
    reteachRequired: Boolean(session.reteachRequired),
    unlockedNext: Boolean(session.unlockedNext),
    currentTopicId: session.currentTopicId || null,
    recordingUrl: session.recording ? session.recording.url : null,
    participants: {
      trainer: participant(session.trainerId),
      student: participant(session.studentId)
    },
    viewerRole: user ? user.role : 'anonymous',
    permissions: {
      canViewTrainerInstructions: trainerView,
      canViewAnswerKey: trainerView,
      canEditPlanner: trainerView,
      canDraw: true,
      canToggleMedia: trainerView || media.studentCanToggleMedia,
      canStudentToggleMedia: media.studentCanToggleMedia,
      canStudentApplaud: applause.studentCanApplaud,
      canStudentReact: applause.studentCanReact
    },
    mediaPermissions: {
      studentCanToggleMedia: media.studentCanToggleMedia,
      forceMicOn: media.forceMicOn,
      forceCameraOn: media.forceCameraOn,
      studentMuted: media.studentMuted,
      studentCameraOff: media.studentCameraOff,
      version: media.version
    },
    reactionPermissions: {
      studentCanReact: applause.studentCanReact,
      studentCanApplaud: applause.studentCanApplaud,
      version: applause.version
    },
    network: networkQuality.stateFor(session, user),
    roomAccess: sessionAccess.evaluate(session, user),
    sessionTiming: timing,
    /* Trainer pay state is staff-only. A child receives only their own
       attendance summary below. */
    payoutRequirement: trainerView ? presenceSnapshot.payoutRequirement : null,
    /* The child's own dashboard sees only their attendance state. No trainer
       pay, fine or private teaching note is ever included here. */
    studentAttendance: {
      status: presenceSnapshot.attendance.student,
      present: presenceSnapshot.studentPresent === true,
      activeSeconds: presenceSnapshot.participants.student.countedSeconds,
      activeMinutes: presenceSnapshot.participants.student.countedMinutes,
      requiredMinutes: (appPolicy.presence && Number(appPolicy.presence.studentMinPresentMinutes)) || 15
    },
    /* Observer identity is intentionally visible in the shared room. No user
       id, contact detail or private metadata is included. */
    founderObserver: sessionAccess.publicState(session)
  };
  /* Live pay/fine tracker for the trainer only. Without a child the 15-minute
     trainer presence rule applies; with a child both the 35-minute child gate
     and the 50-minute trainer teaching gate apply. A student state never gets
     this key, not even as null. */
  if (trainerView) {
    /* The child requirement is always reported as 35 minutes, even when no
       child joined; the quota object itself zeroes unavailable child fields. */
    const childRequiredSeconds = (appPolicy.presence &&
      Number(appPolicy.presence.studentMinPayGateMinutes) || 35) * 60;
    state.payGate = {
      childJoined: minimumQuota.childJoined,
      childStillPresent: minimumQuota.childStillPresent,
      childRequiredSeconds: childRequiredSeconds,
      childCountedSeconds: minimumQuota.childCountedSeconds,
      childGateMet: !minimumQuota.childJoined ||
        minimumQuota.childCountedSeconds >= childRequiredSeconds,
      trainerRequiredSeconds: minimumQuota.trainerRequiredSeconds,
      trainerCountedSeconds: minimumQuota.trainerCountedSeconds,
      trainerGateMet: minimumQuota.trainerCountedSeconds >= minimumQuota.trainerRequiredSeconds,
      trainerOnlyMinutes: (appPolicy.presence && Number(appPolicy.presence.trainerMinPresentMinutes)) || 15,
      source: 'presence_events'
    };
  }
  return state;
}

const ATTENDANCE_STATES = [
  { value: 'present', code: 'p', label: 'Present' },
  { value: 'absent', code: 'a', label: 'Absent' },
  { value: 'late', code: 'l', label: 'Late' },
  { value: 'leave', code: 'lv', label: 'Mutual leave' },
  { value: 'unattended', code: 'u', label: 'Unattended' }
];

function toAttendanceRegister(sessions, attendance) {
  const ordered = sessions.slice().sort(function (a, b) {
    return new Date(a.startedAt || 0) - new Date(b.startedAt || 0);
  }).slice(-6);

  const sessionsById = {};
  ordered.forEach(function (session) { sessionsById[session.id] = session; });

  const columns = ordered.map(function (session) {
    const starts = session.startedAt ? new Date(session.startedAt) : null;
    return {
      id: session.id,
      code: session.code,
      title: session.title,
      startsAt: session.startsAt || session.startedAt,
      date: starts ? starts.toISOString().slice(0, 10) : null,
      status: session.status,
      editable: session.status === 'live' || session.status === 'scheduled'
    };
  });

  const studentIds = [];
  ordered.forEach(function (session) {
    if (studentIds.indexOf(session.studentId) === -1) studentIds.push(session.studentId);
  });

  const rows = studentIds.map(function (studentId) {
    const cells = {};
    columns.forEach(function (column) {
      const row = (attendance || []).find(function (item) {
        return item.sessionId === column.id && item.studentId === studentId;
      });
      cells[column.id] = attendancePolicy.effectiveStudentStatus(
        sessionsById[column.id],
        row ? row.status : null,
        appPolicy
      );
    });
    return { student: attendanceStudent(studentId), cells: cells };
  });

  return {
    statuses: ATTENDANCE_STATES.map(function (item) { return Object.assign({}, item); }),
    columns: columns,
    rows: rows,
    provenance: 'mock'
  };
}

function toTrainerPayout(user, sessions, period, policy, context) {
  return payoutService.buildPayout(user, sessions, period, policy, context);
}

function toTrainerScore(user, policy) {
  const config = (policy && policy.teachingScore) || {};
  const subScores = (config.subScores || []).map(function (item) {
    return {
      key: item.key,
      label: item.label,
      value: null,
      source: 'unconfigured'
    };
  });

  return {
    trainer: {
      id: user.id,
      name: user.name,
      role: user.role
    },
    score: {
      value: null,
      scaleMax: config.scaleMax || null,
      bands: config.bands || null,
      target: config.target || null,
      source: 'unconfigured',
      note: 'Teaching score bands are not configured yet.'
    },
    subScores: subScores,
    provenance: 'mock'
  };
}

function trainerAttention(sessions, attendance) {
  const ordered = sessions.slice().sort(function (a, b) {
    return new Date(a.startedAt || 0) - new Date(b.startedAt || 0);
  });
  const next = ordered.find(function (session) { return session.status === 'live'; })
    || ordered.find(function (session) { return session.status === 'scheduled'; })
    || null;
  const items = [];

  function add(item) {
    if (!items.some(function (existing) { return existing.id === item.id; })) items.push(item);
  }

  function attendanceRecord(session) {
    return (attendance || []).find(function (row) {
      return row.sessionId === session.id && row.studentId === session.studentId;
    });
  }

  if (next && next.planner) {
    const open = next.planner.filter(function (item) { return !item.done; }).length;
    if (open) {
      add({
        id: 'planning_' + next.id,
        kind: 'planning',
        title: open + ' planner step' + (open === 1 ? '' : 's') + ' still open',
        meta: next.title,
        sessionId: next.id,
        student: participant(next.studentId),
        status: 'today',
        action: 'open_planner',
        source: 'planner_items'
      });
    }
  }

  ordered.forEach(function (session) {
    const upcoming = session.status === 'live' || session.status === 'scheduled';
    const quiz = session.quiz || {};

    if (upcoming && !attendanceRecord(session)) {
      add({
        id: 'attendance_' + session.id,
        kind: 'attendance',
        title: 'Attendance not saved',
        meta: session.title,
        sessionId: session.id,
        student: participant(session.studentId),
        status: 'today',
        action: 'open_register',
        source: 'attendance_records'
      });
    }

    const drafts = quiz.drafts || [];
    if (drafts.length) {
      add({
        id: 'drafts_' + session.id,
        kind: 'quiz',
        title: drafts.length + ' AI draft' + (drafts.length === 1 ? '' : 's') + ' awaiting review',
        meta: session.title,
        sessionId: session.id,
        student: participant(session.studentId),
        status: 'info',
        action: 'review_drafts',
        source: 'quiz_drafts'
      });
    }

    if (quiz.phase === 'awaiting_reveal') {
      add({
        id: 'reveal_' + session.id,
        kind: 'quiz',
        title: quiz.attempts.length + ' answer' + (quiz.attempts.length === 1 ? '' : 's') + ' waiting for reveal',
        meta: session.title,
        sessionId: session.id,
        student: participant(session.studentId),
        status: 'today',
        action: 'reveal_answers',
        source: 'quiz_attempts'
      });
    }

    if (session === next && quiz.status === 'ready') {
      add({
        id: 'quiz_' + session.id,
        kind: 'quiz',
        title: 'Quiz ready to launch',
        meta: session.title,
        sessionId: session.id,
        student: participant(session.studentId),
        status: 'info',
        action: 'launch_quiz',
        source: 'quizzes'
      });
    }

    if (session.status === 'ended' && !session.recording) {
      add({
        id: 'recording_' + session.id,
        kind: 'recording',
        title: 'Recording link pending',
        meta: session.title,
        sessionId: session.id,
        student: participant(session.studentId),
        status: 'later',
        action: 'open_recap',
        source: 'recordings'
      });
    }
  });

  const rank = { today: 0, info: 1, later: 2 };
  return items.sort(function (a, b) { return rank[a.status] - rank[b.status]; });
}

function toTrainerAttention(sessions, attendance) {
  const items = trainerAttention(sessions, attendance);
  return {
    items: items,
    count: items.length,
    provenance: 'mock'
  };
}

function toTrainerDashboard(user, sessions, attendance) {
  const ownSubject = subjectView(user.subject);
  const ordered = sessions.slice().sort(function (a, b) {
    return new Date(a.startedAt || 0) - new Date(b.startedAt || 0);
  });
  const todayKey = new Date().toISOString().slice(0, 10);
  const todaySessions = ordered.filter(function (session) {
    return String(session.startedAt || '').slice(0, 10) === todayKey;
  });
  const completed = todaySessions.filter(function (session) {
    return session.status === 'completed' || session.status === 'ended';
  }).length;
  const activityBySession = {};
  (attendance || []).forEach(function (row) {
    activityBySession[row.sessionId] = Math.max(
      activityBySession[row.sessionId] || 0,
      Number(row.activeTrainerMinutes || row.activeMinutes || 0)
    );
  });
  function elapsedMinutes(session) {
    const start = new Date(session.startedAt || session.scheduledAt || 0).getTime();
    return isNaN(start) ? 0 : (Date.now() - start) / 60000;
  }
  const eligible = todaySessions.filter(function (session) {
    const required = sessionTiming.lifetimeFor(session).requiredTeachingMinutes;
    return session.status === 'completed'
      || session.status === 'ended'
      || activityBySession[session.id] >= required
      || elapsedMinutes(session) >= required;
  }).length;
  const taken = Math.max(completed, eligible);
  const remaining = Math.max(0, todaySessions.length - taken);
  const next = todaySessions.find(function (session) {
    /* Keep the desk attached to a live class through the warning and the
       server-owned close window. Dropping it at the teaching-threshold would
       hide the 40/50-minute cue and the auto-close event. */
    const closeAt = sessionTiming.lifetimeFor(session).closeAtMinutes;
    return session.status === 'live' && elapsedMinutes(session) < closeAt;
  }) || todaySessions.find(function (session) {
    const duration = sessionTiming.lifetimeFor(session).durationMinutes;
    return session.status === 'scheduled'
      && new Date(session.startedAt || 0) >= new Date(Date.now() - duration * 60000);
  }) || null;

  const today = todaySessions.map(function (session) {
    const record = (attendance || []).find(function (row) { return row.sessionId === session.id; });
    return {
      id: session.id,
      code: session.code,
      title: session.title,
      status: session.status,
      subject: subjectView(session.subject || ownSubject.subject),
      startsAt: session.startedAt,
      classType: sessionTiming.isDemoSession(session) ? 'demo' : 'regular',
      durationMinutes: sessionTiming.lifetimeFor(session).durationMinutes,
      student: participant(session.studentId),
      attendance: attendancePolicy.effectiveStudentStatus(session, record ? record.status : null, appPolicy)
    };
  });

  const present = todaySessions.filter(function (session) {
    const record = (attendance || []).find(function (row) { return row.sessionId === session.id; });
    return attendancePolicy.effectiveStudentStatus(session, record ? record.status : null, appPolicy) === 'present';
  }).length;
  const countedSessions = todaySessions.filter(function (session) {
    const record = (attendance || []).find(function (row) { return row.sessionId === session.id; });
    const status = attendancePolicy.effectiveStudentStatus(session, record ? record.status : null, appPolicy);
    return status !== 'leave';
  });
  const attendancePercent = countedSessions.length
    ? Math.round((present / countedSessions.length) * 100)
    : null;

  const attempts = ordered.reduce(function (total, session) {
    return total + ((session.quiz && session.quiz.attempts) ? session.quiz.attempts.length : 0);
  }, 0);

  const attention = trainerAttention(ordered, attendance);
  const subjectCounts = {};
  today.forEach(function (item) {
    const slug = item.subject.subject;
    subjectCounts[slug] = (subjectCounts[slug] || 0) + 1;
  });
  const subjectSummary = Object.keys(subjectCounts).map(function (slug) {
    return Object.assign({}, subjectView(slug), { count: subjectCounts[slug] });
  });

  return {
    trainer: {
      id: user.id,
      name: user.name,
      role: user.role,
      title: user.title || null,
      subject: ownSubject,
      ratePerSession: user.payPerSession || null
    },
    summary: {
      sessionsToday: today.length,
      sessionsTaken: taken,
      sessionsRemaining: remaining,
      studentsNext: 1,
      needsAttention: attention.length
    },
    nextSession: next ? {
      id: next.id,
      code: next.code,
      title: next.title,
      status: next.status,
      subject: subjectView(next.subject || ownSubject.subject),
      startsAt: next.startedAt,
      classType: sessionTiming.isDemoSession(next) ? 'demo' : 'regular',
      durationMinutes: sessionTiming.lifetimeFor(next).durationMinutes,
      activeThroughMinutes: sessionTiming.lifetimeFor(next).closeAtMinutes,
      currentPage: next.currentPage,
      student: participant(next.studentId),
      planner: next.planner.map(function (item) { return Object.assign({}, item); }),
      recordingUrl: next.recording ? next.recording.url : null
    } : null,
    today: today,
    subjectSummary: subjectSummary,
    attention: attention,
    metrics: {
      attendance: {
        value: attendancePercent,
        source: attendancePercent === null ? 'unconfigured' : 'attendance_records'
      },
      teachingScore: {
        value: null,
        source: 'unconfigured',
        note: 'Scoring bands are not configured yet.'
      },
      toReview: {
        value: attempts,
        source: 'quiz_attempts'
      },
      payout: {
        value: null,
        sessionCount: today.length,
        ratePerSession: user.payPerSession || null,
        source: 'unconfigured',
        note: 'Payout and bonus rules are not configured yet.'
      }
    },
    provenance: 'mock'
  };
}

function toStudentDashboard(user, sessions) {
  const ownSubject = subjectView(user.subject);
  const mine = sessions.filter(function (session) { return session.studentId === user.id; });
  const live = mine.find(function (session) { return session.status === 'live'; }) || null;
  const recordings = mine
    .filter(function (session) { return session.recording; })
    .map(function (session) {
      return {
        id: session.id,
        title: session.title,
        /* Private recordings are opened through an authorized signed-link
           endpoint; no permanent browser URL is published here. */
        url: null,
        available: Boolean(session.recording.objectKey && session.recording.status === 'stopped'),
        durationSeconds: session.recording.durationSeconds,
        readyAt: session.recording.readyAt,
        chapters: Array.isArray(session.recording.chapters)
          ? session.recording.chapters.map(function (chapter) {
            return {
              label: String(chapter.label || 'Chapter').slice(0, 120),
              seconds: Math.max(0, Number(chapter.seconds) || 0)
            };
          })
          : []
      };
    });

  return {
    student: {
      id: user.id,
      name: user.name,
      grade: user.grade,
      batch: user.batch,
      subject: ownSubject,
      sessionsRemaining: user.sessionsRemaining === undefined ? null : user.sessionsRemaining
    },
    streak: user.streak,
    mastery: user.mastery,
    nextSession: live
      ? {
          id: live.id,
          title: live.title,
          startedAt: live.startedAt,
          status: live.status,
          subject: subjectView(live.subject || ownSubject.subject),
          trainer: participant(live.trainerId)
        }
      : null,
    recordings: recordings,
    badges: badgeService.forStudent(user),
    trophyPoints: badgeService.pointsFor(user),
    masteryPractice: [
      { id: 'mastery_ratios', title: 'Ratios', progress: user.mastery, status: 'in-progress' },
      { id: 'mastery_fractions', title: 'Fractions', progress: 68, status: 'in-progress' }
    ]
  };
}

module.exports = {
  readiness,
  quizQuestionsFor,
  stripTrainerOnlyFields,
  stripStudentRestrictedFields,
  toStudentCurriculum,
  toStudentQuizTiers,
  toTrainerSummary,
  toTrainerSession,
  toStudentSession,
  toSessionState,
  toAttendanceRegister,
  toTrainerAttention,
  toTrainerPayout,
  toTrainerScore,
  toTrainerDashboard,
  toStudentDashboard
};
