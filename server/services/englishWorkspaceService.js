/* English Communication workspace.
 *
 * This is a communication course: reading, writing, public speaking, listening
 * and vocabulary. It is deliberately not a literature or grammar drill track.
 * All content is academic and every field is bounded before it is stored.
 */

const DEFAULT_WORK = Object.freeze({
  reading: Object.freeze({
    title: 'A note from the park',
    text: 'The park was quiet in the morning. A small dog ran across the grass. ' +
      'Maya stopped, looked around, and called out gently. The dog turned and came back to her. ' +
      'She smiled and walked on, happy that she had been kind.'
  }),
  annotations: '',
  vocabulary: Object.freeze(['quiet', 'gently', 'notice', 'kind', 'around']),
  speaking: Object.freeze({
    prompt: 'Tell your trainer about a time you helped someone. Speak for thirty seconds and use one new word.',
    responses: Object.freeze([])
  }),
  writing: Object.freeze({ draft: '', revisions: Object.freeze([]) }),
  feedback: ''
});

const LIMITS = {
  short: 160,
  passage: 6000,
  notes: 8000,
  item: 120,
  revisions: 20,
  responses: 20,
  vocabulary: 30
};

function text(value, limit) {
  return typeof value === 'string'
    ? value.replace(/[\r\n]+/g, '\n').trim().slice(0, limit)
    : '';
}

function stringList(value, limit, count) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, count).map(function (item) {
    return text(item, limit);
  }).filter(Boolean);
}

function normalize(record) {
  const source = record && typeof record === 'object' ? record : {};
  const reading = source.reading && typeof source.reading === 'object' ? source.reading : {};
  const speaking = source.speaking && typeof source.speaking === 'object' ? source.speaking : {};
  const writing = source.writing && typeof source.writing === 'object' ? source.writing : {};
  return {
    reading: {
      title: text(reading.title, LIMITS.short) || DEFAULT_WORK.reading.title,
      text: text(reading.text, LIMITS.passage) || DEFAULT_WORK.reading.text
    },
    annotations: text(source.annotations, LIMITS.notes),
    vocabulary: stringList(
      source.vocabulary && source.vocabulary.length ? source.vocabulary : DEFAULT_WORK.vocabulary,
      LIMITS.item, LIMITS.vocabulary
    ),
    speaking: {
      prompt: text(speaking.prompt, LIMITS.short) || DEFAULT_WORK.speaking.prompt,
      responses: stringList(speaking.responses, LIMITS.notes, LIMITS.responses)
    },
    writing: {
      draft: text(writing.draft, LIMITS.notes),
      revisions: stringList(writing.revisions, LIMITS.notes, LIMITS.revisions)
    },
    feedback: text(source.feedback, LIMITS.notes),
    updatedAt: source.updatedAt || null,
    updatedByRole: source.updatedByRole || null
  };
}

/* Student edits only their own reading notes, writing, vocabulary use and
   spoken responses. Trainer edits prompts, passage, word bank and feedback. */
function applyUpdate(current, body, role) {
  const input = body && typeof body === 'object' ? body : {};
  const next = normalize(current);
  if (role === 'trainer' || role === 'founder') {
    if (input.reading && typeof input.reading === 'object') {
      if (input.reading.title !== undefined) next.reading.title = text(input.reading.title, LIMITS.short) || next.reading.title;
      if (input.reading.text !== undefined) next.reading.text = text(input.reading.text, LIMITS.passage) || next.reading.text;
    }
    if (input.vocabulary !== undefined) next.vocabulary = stringList(input.vocabulary, LIMITS.item, LIMITS.vocabulary);
    if (input.speaking && typeof input.speaking === 'object' && input.speaking.prompt !== undefined) {
      next.speaking.prompt = text(input.speaking.prompt, LIMITS.short) || next.speaking.prompt;
    }
    if (input.feedback !== undefined) next.feedback = text(input.feedback, LIMITS.notes);
  } else if (role === 'student') {
    if (input.annotations !== undefined) next.annotations = text(input.annotations, LIMITS.notes);
    if (input.writing && typeof input.writing === 'object') {
      if (input.writing.draft !== undefined) next.writing.draft = text(input.writing.draft, LIMITS.notes);
      if (input.writing.revisions !== undefined) {
        next.writing.revisions = stringList(input.writing.revisions, LIMITS.notes, LIMITS.revisions);
      }
    }
    if (input.speaking && typeof input.speaking === 'object' && input.speaking.responses !== undefined) {
      next.speaking.responses = stringList(input.speaking.responses, LIMITS.notes, LIMITS.responses);
    }
  }
  next.updatedAt = new Date().toISOString();
  next.updatedByRole = role;
  return next;
}

function publicView(record) {
  const work = normalize(record);
  return {
    work: work,
    reading: work.reading,
    passage: work.reading.text,
    annotations: work.annotations,
    vocabulary: work.vocabulary,
    speaking: work.speaking,
    speakingPrompt: work.speaking.prompt,
    writing: work.writing,
    draft: work.writing.draft,
    feedback: work.feedback
  };
}

module.exports = {
  DEFAULT_WORK: DEFAULT_WORK,
  normalize: normalize,
  applyUpdate: applyUpdate,
  publicView: publicView
};
