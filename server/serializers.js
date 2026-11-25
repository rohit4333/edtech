/* Role-aware response builders. Student serializers never touch trainer_instructions. */
const db = require('./db');
const payoutService = require('./services/payoutService');

function person(userId) {
  const user = db.findUserById(userId);
  if (!user) return null;
  return { id: user.id, name: user.name, role: user.role, title: user.title || null };
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
    questions: session.quiz.questions.map(function (question) {
      return {
        id: question.id,
        prompt: question.prompt,
        options: question.options.slice(),
        answerIndex: question.answerIndex,
        hint: question.hint,
        explanation: question.explanation,
        source: question.source || 'template',
        templateId: question.templateId || null,
        status: question.status || 'active'
      };
    }),
    attempts: session.quiz.attempts.slice(),
    reveals: (session.quiz.reveals || []).slice(),
    drafts: (session.quiz.drafts || []).slice()
  };
}

function studentQuiz(session) {
  const revealed = {};
  (session.quiz.reveals || []).forEach(function (reveal) { revealed[reveal.questionId] = true; });

  return {
    status: session.quiz.status,
    phase: session.quiz.phase,
    currentQuestionId: session.quiz.currentQuestionId,
    startedAt: session.quiz.startedAt,
    revealedQuestionIds: Object.keys(revealed),
    questions: session.quiz.questions.map(function (question) {
      const answer = {
        id: question.id,
        prompt: question.prompt,
        options: question.options.slice(),
        hint: question.hint
      };
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
}

function toTrainerSummary(session) {
  return {
    id: session.id,
    code: session.code,
    title: session.title,
    status: session.status,
    startedAt: session.startedAt,
    currentPage: session.currentPage,
    student: person(session.studentId),
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
    trainer: person(session.trainerId),
    student: person(session.studentId),
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

function toStudentSession(session) {
  return {
    id: session.id,
    code: session.code,
    title: session.title,
    status: session.status,
    startedAt: session.startedAt,
    elapsedSeconds: session.elapsedSeconds,
    currentPage: session.currentPage,
    trainer: person(session.trainerId),
    student: person(session.studentId),
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
    quiz: studentQuiz(session),
    board: { version: session.board.version, strokeCount: session.board.strokes.length }
  };
}

function toSessionState(session, user) {
  const trainerView = user && (user.role === 'trainer' || user.role === 'founder');
  const state = {
    id: session.id,
    status: session.status,
    currentPage: session.currentPage,
    boardVersion: session.board.version,
    quizStatus: session.quiz.status,
    quizPhase: session.quiz.phase,
    recordingUrl: session.recording ? session.recording.url : null,
    participants: {
      trainer: person(session.trainerId),
      student: person(session.studentId)
    },
    viewerRole: user ? user.role : 'anonymous',
    permissions: {
      canViewTrainerInstructions: trainerView,
      canViewAnswerKey: trainerView,
      canEditPlanner: trainerView,
      canDraw: true
    }
  };
  return state;
}

const ATTENDANCE_STATES = [
  { value: 'present', code: 'p', label: 'Present' },
  { value: 'absent', code: 'a', label: 'Absent' },
  { value: 'late', code: 'l', label: 'Late' }
];

function toAttendanceRegister(sessions, attendance) {
  const ordered = sessions.slice().sort(function (a, b) {
    return new Date(a.startedAt || 0) - new Date(b.startedAt || 0);
  }).slice(-6);

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
      cells[column.id] = row ? row.status : null;
    });
    return { student: person(studentId), cells: cells };
  });

  return {
    statuses: ATTENDANCE_STATES.map(function (item) { return Object.assign({}, item); }),
    columns: columns,
    rows: rows,
    provenance: 'mock'
  };
}

function toTrainerPayout(user, sessions, period, policy) {
  return payoutService.buildPayout(user, sessions, period, policy);
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
        student: person(next.studentId),
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
        student: person(session.studentId),
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
        student: person(session.studentId),
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
        student: person(session.studentId),
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
        student: person(session.studentId),
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
        student: person(session.studentId),
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
  const ordered = sessions.slice().sort(function (a, b) {
    return new Date(a.startedAt || 0) - new Date(b.startedAt || 0);
  });
  const todayKey = new Date().toISOString().slice(0, 10);
  const todaySessions = ordered.filter(function (session) {
    return String(session.startedAt || '').slice(0, 10) === todayKey;
  });
  const next = todaySessions.find(function (session) { return session.status === 'live'; })
    || todaySessions.find(function (session) { return session.status === 'scheduled'; })
    || null;

  const today = todaySessions.map(function (session) {
    const record = (attendance || []).find(function (row) { return row.sessionId === session.id; });
    return {
      id: session.id,
      code: session.code,
      title: session.title,
      status: session.status,
      startsAt: session.startedAt,
      student: person(session.studentId),
      attendance: record ? record.status : null
    };
  });

  const present = (attendance || []).filter(function (row) { return row.status === 'present'; }).length;
  const attendancePercent = (attendance || []).length
    ? Math.round((present / attendance.length) * 100)
    : null;

  const attempts = ordered.reduce(function (total, session) {
    return total + ((session.quiz && session.quiz.attempts) ? session.quiz.attempts.length : 0);
  }, 0);

  const attention = trainerAttention(ordered, attendance);

  return {
    trainer: {
      id: user.id,
      name: user.name,
      role: user.role,
      title: user.title || null,
      ratePerSession: user.payPerSession || null
    },
    summary: {
      sessionsToday: today.length,
      studentsNext: 1,
      needsAttention: attention.length
    },
    nextSession: next ? {
      id: next.id,
      code: next.code,
      title: next.title,
      status: next.status,
      startsAt: next.startedAt,
      currentPage: next.currentPage,
      student: person(next.studentId),
      planner: next.planner.map(function (item) { return Object.assign({}, item); }),
      recordingUrl: next.recording ? next.recording.url : null
    } : null,
    today: today,
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
  const mine = sessions.filter(function (session) { return session.studentId === user.id; });
  const live = mine.find(function (session) { return session.status === 'live'; }) || null;
  const recordings = mine
    .filter(function (session) { return session.recording; })
    .map(function (session) {
      return {
        id: session.id,
        title: session.title,
        url: session.recording.url,
        durationSeconds: session.recording.durationSeconds,
        readyAt: session.recording.readyAt
      };
    });

  return {
    student: {
      id: user.id,
      name: user.name,
      grade: user.grade,
      batch: user.batch,
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
          trainer: person(live.trainerId)
        }
      : null,
    recordings: recordings,
    masteryPractice: [
      { id: 'mastery_ratios', title: 'Ratios', progress: user.mastery, status: 'in-progress' },
      { id: 'mastery_fractions', title: 'Fractions', progress: 68, status: 'in-progress' }
    ]
  };
}

module.exports = {
  readiness,
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
