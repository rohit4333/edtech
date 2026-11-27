/* Temporary, local-only planner fixture adapter.
 *
 * This is NOT a planner generator and NOT a founder-authored planner. It only
 * reads a checked-in JSON fixture when a developer explicitly loads it, turns
 * its practice questions into the existing role-scoped quiz shape, and exposes
 * a story guide view. No endpoint calls this in production, and no trainer
 * mutation path is created here.
 */

const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.join(__dirname, '..', '..', 'scripts', 'fixtures', 'temporary-ratio-planner.json');

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function text(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function load() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
}

function validate(fixture) {
  if (!fixture || typeof fixture !== 'object') throw new Error('Fixture must be an object.');
  if (fixture.status !== 'temporary_dev_fixture') {
    throw new Error('Fixture must declare status temporary_dev_fixture.');
  }
  if (!fixture.story || !text(fixture.story.title) || !Array.isArray(fixture.story.beats)) {
    throw new Error('Fixture story needs a title and beats.');
  }
  if (!Array.isArray(fixture.concepts) || !fixture.concepts.length) {
    throw new Error('Fixture needs at least one concept.');
  }
  const ids = new Set();
  fixture.concepts.forEach(function (concept) {
    if (!text(concept.id) || !text(concept.title) || !Array.isArray(concept.practiceQuestions)) {
      throw new Error('Each concept needs an id, title and practiceQuestions array.');
    }
    concept.practiceQuestions.forEach(function (question) {
      if (!text(question.id) || !text(question.stem)) {
        throw new Error('Each practice question needs an id and stem.');
      }
      if (ids.has(question.id)) throw new Error('Duplicate fixture question id: ' + question.id);
      ids.add(question.id);
      if (!Array.isArray(question.options) || question.options.length < 2) {
        throw new Error('Question ' + question.id + ' needs at least two options.');
      }
      if (!Number.isInteger(question.answerIndex) ||
          question.answerIndex < 0 || question.answerIndex >= question.options.length) {
        throw new Error('Question ' + question.id + ' has an invalid answerIndex.');
      }
    });
  });
  return fixture;
}

function safeImage(value) {
  if (!value || typeof value !== 'string') return null;
  const source = value.trim();
  if (!source) return null;
  if (source.indexOf('data:image/') === 0 || source.charAt(0) === '/' || /^https?:\/\//.test(source)) {
    return source;
  }
  return null;
}

/* Quiz questions carry answer material for the trainer serializer. The guide
   view below deliberately copies only narrative and stem fields, so the answer
   key, hint, explanation and trainer notes never enter the guide payload. */
function build(fixture) {
  const source = validate(fixture || load());
  const questions = [];
  const concepts = source.concepts.map(function (concept) {
    return {
      id: concept.id,
      title: concept.title,
      narration: text(concept.narration),
      practiceQuestions: concept.practiceQuestions.map(function (question) {
        const stored = {
          id: question.id,
          prompt: question.stem,
          options: question.options.slice(),
          answerIndex: question.answerIndex,
          concept: concept.title,
          source: 'temporary_dev_fixture',
          templateId: source.id,
          status: 'active',
          requiresCorrectAnswer: true
        };
        const image = safeImage(question.image);
        if (image) stored.image = image;
        if (text(question.hint)) stored.hint = text(question.hint);
        if (text(question.explanation)) stored.explanation = text(question.explanation);
        if (text(question.trainerInstructions)) stored.trainerInstructions = text(question.trainerInstructions);
        if (Array.isArray(question.misconceptions) && question.misconceptions.length) {
          stored.misconceptions = question.misconceptions.slice();
        }
        questions.push(stored);
        const view = { id: question.id, stem: question.stem, image: image };
        if (text(question.trainerInstructions)) view.trainerInstructions = text(question.trainerInstructions);
        if (Array.isArray(question.misconceptions) && question.misconceptions.length) {
          view.misconceptions = question.misconceptions.slice();
        }
        return view;
      })
    };
  });

  const rule = source.completionRule || {};
  const parsedMinimum = Number(rule.minimumCorrectPerSection);
  const minimum = Number.isFinite(parsedMinimum) && parsedMinimum > 0 ? parsedMinimum : 3;
  const guide = {
    id: source.id,
    label: source.label,
    status: source.status,
    warning: source.warning,
    story: copy(source.story),
    concepts: concepts,
    progress: {
      currentConceptId: concepts[0].id,
      currentQuestionId: questions[0].id,
      completedQuestionIds: [],
      unlockRule: rule.type,
      minimumCorrectPerSection: minimum,
      sectionCorrect: 0,
      sectionRequired: minimum,
      sectionComplete: false
    }
  };
  return { questions: questions, guide: guide };
}

function apply(session, fixture) {
  const built = build(fixture || load());
  return Object.assign({}, session, {
    plannerGuide: built.guide,
    quiz: {
      status: 'ready',
      phase: 'draft',
      currentQuestionId: built.questions[0].id,
      startedAt: null,
      questions: built.questions,
      attempts: [],
      reveals: [],
      drafts: [],
      overrides: []
    }
  });
}

/* The view is recalculated from live quiz attempts so a correct answer really
   is what unlocks the next item. A student view stops at the current concept
   and never receives trainer notes, hints, keys or future narration beats. */
function guideFor(session, role) {
  const base = session && session.plannerGuide;
  if (!base) return undefined;
  const guide = copy(base);
  const questions = (session.quiz && session.quiz.questions) || [];
  const attempts = (session.quiz && session.quiz.attempts) || [];
  const solved = new Set(attempts.filter(function (attempt) {
    return attempt && attempt.correct === true;
  }).map(function (attempt) { return attempt.questionId; }));
  /* Retest questions are generated at runtime and are not in the stored guide
     cards, but a correct retest must still count toward the section. */
  const allQuestionIds = questions.filter(function (question) {
    const value = conceptOf(question);
    return guide.concepts.some(function (concept) {
      return value === concept.id || value === concept.title;
    });
  }).map(function (question) { return question.id; });
  const completed = allQuestionIds.filter(function (id) { return solved.has(id); });
  const currentId = (session.quiz && session.quiz.currentQuestionId) ||
    completed[completed.length - 1] || allQuestionIds[0] || null;

  let currentConcept = guide.concepts.find(function (concept) {
    return concept.practiceQuestions.some(function (question) { return question.id === currentId; });
  });
  if (!currentConcept && solved.has(currentId)) {
    currentConcept = guide.concepts.find(function (concept) {
      return concept.practiceQuestions.some(function (question) { return solved.has(question.id); });
    });
  }
  if (!currentConcept) currentConcept = guide.concepts[0];
  const currentIndex = guide.concepts.indexOf(currentConcept);

  const section = sectionStats(session, currentConcept.id);
  guide.progress = {
    currentConceptId: currentConcept.id,
    currentQuestionId: currentId,
    completedQuestionIds: completed,
    currentSolved: solved.has(currentId),
    sectionCorrect: section.correct,
    sectionRequired: section.required,
    sectionComplete: section.complete,
    unlockedNext: section.complete && currentIndex < guide.concepts.length - 1,
    complete: section.complete && currentIndex === guide.concepts.length - 1,
    unlockRule: base.progress && base.progress.unlockRule,
    minimumCorrectPerSection: section.required
  };

  if (role === 'student') {
    const visibleConcepts = guide.concepts.slice(0, currentIndex + 1).map(function (concept) {
      return {
        id: concept.id,
        title: concept.title,
        narration: concept.narration,
        practiceQuestions: concept.practiceQuestions.map(function (question) {
          return { id: question.id, stem: question.stem, image: question.image || null };
        })
      };
    });
    const visibleIds = new Set(visibleConcepts.map(function (concept) { return concept.id; }));
    guide.concepts = visibleConcepts;
    guide.story.beats = guide.story.beats.filter(function (beat) {
      return visibleIds.has(beat.conceptId);
    });
  }
  return guide;
}

function guideConcepts(session) {
  const guide = session && session.plannerGuide;
  if (!guide || !Array.isArray(guide.concepts)) return [];
  return guide.concepts.map(function (concept, index) {
    return { id: concept.id, title: concept.title, index: index };
  });
}

function conceptOf(question) {
  if (!question) return null;
  return question.concept || question.topicId || null;
}

function currentConcept(session) {
  const concepts = guideConcepts(session);
  if (!concepts.length) return null;
  const questions = (session.quiz && session.quiz.questions) || [];
  const currentId = session.quiz && session.quiz.currentQuestionId;
  const current = questions.find(function (question) { return question.id === currentId; });
  const value = conceptOf(current);
  return concepts.find(function (concept) {
    return concept.id === value || concept.title === value;
  }) || concepts[0];
}

function sectionStats(session, conceptId) {
  const concepts = guideConcepts(session);
  const target = concepts.find(function (concept) { return concept.id === conceptId; }) || concepts[0];
  if (!target) return null;
  const requiredRaw = session.plannerGuide.progress &&
    session.plannerGuide.progress.minimumCorrectPerSection;
  const parsed = Number(requiredRaw);
  const required = Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
  const questions = (session.quiz && session.quiz.questions) || [];
  const attempts = (session.quiz && session.quiz.attempts) || [];
  const ids = new Set(questions.filter(function (question) {
    const value = conceptOf(question);
    return value === target.id || value === target.title;
  }).map(function (question) { return question.id; }));
  const correct = attempts.filter(function (attempt) {
    return attempt && attempt.correct === true && ids.has(attempt.questionId);
  }).length;
  return {
    id: target.id,
    title: target.title,
    index: target.index,
    correct: correct,
    required: required,
    complete: correct >= required
  };
}

/* The temporary planner uses section mastery instead of per-item locking: a
   wrong answer does not end the section. The trainer explains it on the board,
   Retest replaces it with a fresh AI question, and three correct answers in
   that section unlock the next one. */
function pendingSection(session) {
  if (!session || !session.plannerGuide) return null;
  const concept = currentConcept(session);
  if (!concept) return null;
  const stats = sectionStats(session, concept.id);
  if (!stats) return null;
  const currentId = session.quiz && session.quiz.currentQuestionId;
  const attempts = (session.quiz && session.quiz.attempts) || [];
  const currentSolved = attempts.some(function (attempt) {
    return attempt && attempt.questionId === currentId && attempt.correct === true;
  });
  if (!currentSolved) {
    return {
      reason: 'current_question',
      id: currentId,
      conceptId: stats.id,
      concept: stats.title,
      correct: stats.correct,
      required: stats.required
    };
  }
  if (stats.complete) return null;
  /* Moving to another unsolved question inside the same section is allowed —
     the child needs three correct answers, not three attempts on one card. */
  if (nextQuestionId(session)) return null;
  return {
    reason: 'section',
    id: currentId,
    conceptId: stats.id,
    concept: stats.title,
    correct: stats.correct,
    required: stats.required
  };
}

function nextQuestionId(session) {
  if (!session || !session.plannerGuide) return null;
  const concept = currentConcept(session);
  if (!concept) return null;
  const stats = sectionStats(session, concept.id);
  const questions = (session.quiz && session.quiz.questions) || [];
  const attempts = (session.quiz && session.quiz.attempts) || [];
  const solved = new Set(attempts.filter(function (attempt) {
    return attempt && attempt.correct === true;
  }).map(function (attempt) { return attempt.questionId; }));
  const currentId = session.quiz && session.quiz.currentQuestionId;
  const sameSection = questions.filter(function (question) {
    const value = conceptOf(question);
    return value === concept.id || value === concept.title;
  });

  if (!stats || !stats.complete) {
    const nextInSection = sameSection.find(function (question) {
      return question.id !== currentId && !solved.has(question.id);
    });
    return nextInSection ? nextInSection.id : null;
  }

  const nextConcept = guideConcepts(session)[concept.index + 1];
  if (!nextConcept) return null;
  const candidates = questions.filter(function (question) {
    const value = conceptOf(question);
    return value === nextConcept.id || value === nextConcept.title;
  });
  if (!candidates.length) return null;
  const unsolved = candidates.find(function (question) { return !solved.has(question.id); });
  return (unsolved || candidates[0]).id;
}

module.exports = {
  FIXTURE_PATH: FIXTURE_PATH,
  load: load,
  validate: validate,
  build: build,
  apply: apply,
  guideFor: guideFor,
  sectionStats: sectionStats,
  pendingSection: pendingSection,
  nextQuestionId: nextQuestionId
};
