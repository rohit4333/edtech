/* Mathify curriculum authoring.
 *
 * Full planner + all three quiz tiers do not fit safely in one completion, so
 * generation is deliberately split into two calls:
 *   1. generatePlannerAndCurriculum(context)
 *   2. generateQuizTiers(context, plannerOutput)
 *
 * Both calls are strict-JSON, manually validated, and trainer-reviewable.
 * Student-facing filtering lives in serializers.js, never in this file.
 */

const generator = require('../quiz/generator');
const serializers = require('../serializers');

const DEFAULT_TIMEOUT_MS = 15000;
const BLOCK_TYPES = ['heading', 'text', 'image', 'sketch_space', 'analogy', 'story'];
const TIER_SPECS = [
  { key: 'level_1', timeLimit: 45, bloom: 'Understand' },
  { key: 'level_2', timeLimit: 75, bloom: 'Apply' },
  { key: 'level_3', timeLimit: 120, bloom: 'Analyze' }
];

let missingKeyWarned = false;

const SYSTEM_PROMPT_PLANNER = `You are Mathify's curriculum author for 1-on-1 math tutoring.
Return ONLY valid JSON. No prose, no markdown fences.

INPUT
  board: {{board}}   grade: {{grade}}   topic: {{topic}}
  student_age: {{age}}   language: {{lang}}
  mode: {{mode}}
  school_chapter_context: {{context}}

AUTHORING RULES
1. Every concept must open with a VISUAL ANALOGY (concrete, physical, Indian-context friendly) and a short STORY NARRATION (3–6 sentences) that carries the math inside it.
2. Sequence: hook -> analogy -> story -> concept -> worked example -> guided practice -> check.
3. After each heading/text/image cluster, insert a \`sketch_space\` block. The trainer draws there live with a Wacom, so give it real height and mark it expandable.
4. For EVERY block write \`trainerInstructions\`: what to say, what to draw, what misconception to watch for, when to pause. This field is trainer-only.
5. Age-appropriate language. No shame, no comparison to other kids.
6. If mode = school_curriculum, map every block to the school chapter in \`curriculum_map\`.

SCHEMA
{
  "topic_id": "string",
  "curriculum_map": { "board": "", "grade": 0, "chapter": "", "learning_objectives": [""] },
  "planner": {
    "version": 1,
    "estimated_minutes": 45,
    "blocks": [
      {
        "id": "b1",
        "type": "heading|text|image|sketch_space|analogy|story",
        "content": { "text": "", "image_prompt": "", "alt": "", "caption": "" },
        "sketch": { "minHeight": 220, "expandable": true, "prompt_for_trainer": "" },
        "trainerInstructions": "string",
        "misconception_watch": [""]
      }
    ]
  }
}`;

const SYSTEM_PROMPT_QUIZ = `You are Mathify's quiz author for 1-on-1 math tutoring.
Return ONLY valid JSON. No prose, no markdown fences.

INPUT
  board: {{board}}   grade: {{grade}}   topic: {{topic}}
  mastery_pct: {{mastery_pct}}   current_level: {{current_level}}
  previously_asked_questions: {{previously_asked_questions}}
  curriculum_context: {{curriculum_context}}

QUIZ RULES
1. Generate 3 tiers: level 1 (easiest), level 2 (moderate), level 3 (stretch).
2. Each item: exactly 4 options, one correct, plausible distractors built from real misconceptions (name the misconception in \`distractor_rationale\`).
3. \`hints\`: array of 2, ordered gentle -> direct. Never restate the answer.
4. \`time_limit_sec\`: level 1 = 45, level 2 = 75, level 3 = 120.
5. Advance gate is 70–80% correct; ensure level 2 is a fair test of that gate.
6. Include at least one item that requires drawing/reasoning in the sketch space (\`requires_sketch: true\`).
7. Do NOT repeat questions from previously_asked_questions. Vary context, not just digits.

SCHEMA
{
  "quiz": {
    "level_1": [ { "id":"", "stem":"", "options":[{"id":"a","text":""}], "correctOptionId":"", "answerKey":"", "explanation":"", "hints":["",""], "time_limit_sec":45, "distractor_rationale":{"b":""}, "requires_sketch":false, "bloom":"" } ],
    "level_2": [],
    "level_3": []
  },
  "advance_criteria": { "gate_pct": 75, "repeat_if_below": true },
  "parent_summary": "2 sentences, plain language, no jargon."
}`;

function failure(message, code, status) {
  const problem = new Error(message);
  problem.code = code;
  problem.status = status || 502;
  return problem;
}

function invalid(message) {
  return failure(message, 'DEEPSEEK_INVALID_JSON', 502);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value, fallback) {
  if (value === null || value === undefined) return fallback;
  return String(value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nonEmptyText(value, label) {
  const result = text(value, '');
  if (!result) throw invalid(label + ' must be a non-empty string.');
  return result;
}

function number(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function integer(value, label) {
  const result = number(value, NaN);
  if (!Number.isFinite(result)) throw invalid(label + ' must be a number.');
  return result;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeStem(value) {
  return text(value, '').toLowerCase();
}

function stripTrailingCommas(source) {
  let output = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }

    if (character === ',') {
      let next = index + 1;
      while (next < source.length && /\s/.test(source[next])) next += 1;
      if (source[next] === '}' || source[next] === ']') continue;
    }

    output += character;
  }

  return output;
}

/** Parse strict JSON from a model response, tolerating fences and trailing commas. */
function safeParseJSON(input) {
  let content = String(input === null || input === undefined ? '' : input).trim();
  if (!content) throw invalid('DeepSeek returned an empty response.');

  const fenced = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) content = fenced[1].trim();

  try {
    return JSON.parse(stripTrailingCommas(content));
  } catch (problem) {
    throw invalid('Model response was not valid JSON.');
  }
}

function inlineValue(value) {
  if (Array.isArray(value) || isObject(value)) return JSON.stringify(value);
  return text(value, '');
}

function renderPrompt(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, function (match, key) {
    return inlineValue(values[key]);
  });
}

function normalizeContext(context) {
  const input = isObject(context) ? context : {};
  const previous = Array.isArray(input.previously_asked_questions)
    ? input.previously_asked_questions
    : [];
  const objectives = Array.isArray(input.learning_objectives)
    ? input.learning_objectives
    : [];

  return {
    board: text(input.board, 'CBSE'),
    grade: input.grade === null || input.grade === undefined ? '' : input.grade,
    topic: text(input.topic, 'general mathematics'),
    student_age: input.student_age === undefined ? (input.age || '') : input.student_age,
    language: text(input.language, 'English'),
    mode: text(input.mode, 'mathify_planner'),
    school_chapter_context: text(
      input.school_chapter_context === undefined ? input.context : input.school_chapter_context,
      ''
    ),
    mastery_pct: clamp(number(input.mastery_pct, 0), 0, 100),
    current_level: clamp(Math.round(number(input.current_level, 1)), 1, 3),
    previously_asked_questions: previous,
    learning_objectives: objectives,
    estimated_minutes: clamp(number(input.estimated_minutes, 45), 15, 120),
    allowFallback: input.allowFallback
  };
}

function warnMissingKey() {
  if (missingKeyWarned) return;
  missingKeyWarned = true;
  console.warn('[deepseek] DEEPSEEK_API_KEY is not configured; using deterministic fallback.');
}

function endpoint() {
  const base = String(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  return base + '/chat/completions';
}

async function requestJSON(systemPrompt, userPrompt, allowFallback) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    if (allowFallback === false) {
      throw failure('DEEPSEEK_API_KEY is not configured.', 'DEEPSEEK_NOT_CONFIGURED', 503);
    }
    warnMissingKey();
    return null;
  }

  const configuredTimeout = number(process.env.DEEPSEEK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const timeoutMs = configuredTimeout > 0 ? configuredTimeout : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, timeoutMs);

  try {
    const response = await fetch(endpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        response_format: { type: 'json_object' },
        temperature: 0.25,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      }),
      signal: controller.signal
    });

    const bodyText = await response.text();
    if (!response.ok) {
      const unauthorized = response.status === 401 || response.status === 403;
      throw failure(
        'DeepSeek request failed with HTTP ' + response.status + '.',
        unauthorized ? 'DEEPSEEK_UNAUTHORIZED' : 'DEEPSEEK_REQUEST_FAILED',
        502
      );
    }

    const envelope = safeParseJSON(bodyText);
    const content = envelope && envelope.choices && envelope.choices[0] &&
      envelope.choices[0].message && envelope.choices[0].message.content;
    if (typeof content !== 'string') {
      throw invalid('DeepSeek response did not contain message content.');
    }
    return safeParseJSON(content);
  } catch (problem) {
    if (problem && problem.name === 'AbortError') {
      throw failure('DeepSeek request timed out.', 'DEEPSEEK_TIMEOUT', 504);
    }
    throw problem;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeBlock(raw, index, seenIds) {
  if (!isObject(raw)) throw invalid('Planner block ' + (index + 1) + ' must be an object.');

  const id = nonEmptyText(raw.id, 'Planner block ' + (index + 1) + ' id');
  if (seenIds.indexOf(id) !== -1) throw invalid('Planner block ids must be unique.');
  seenIds.push(id);

  const type = nonEmptyText(raw.type, 'Planner block ' + id + ' type');
  if (BLOCK_TYPES.indexOf(type) === -1) {
    throw invalid('Planner block ' + id + ' has an unsupported type.');
  }
  if (!isObject(raw.content)) throw invalid('Planner block ' + id + ' needs a content object.');

  const content = {
    text: text(raw.content.text, ''),
    image_prompt: text(raw.content.image_prompt, ''),
    alt: text(raw.content.alt, ''),
    caption: text(raw.content.caption, '')
  };
  if (type === 'analogy' && !content.image_prompt && !content.caption) {
    throw invalid('Analogy block ' + id + ' needs an image prompt or caption.');
  }

  const block = { id: id, type: type, content: content };
  if (type === 'sketch_space') {
    if (!isObject(raw.sketch)) {
      throw invalid('Sketch block ' + id + ' needs a sketch object.');
    }
    const minHeight = integer(raw.sketch.minHeight, 'Sketch ' + id + ' minHeight');
    if (minHeight < 120) throw invalid('Sketch ' + id + ' minHeight must be at least 120.');
    if (raw.sketch.expandable !== true) {
      throw invalid('Sketch ' + id + ' must be expandable.');
    }
    block.sketch = {
      minHeight: Math.round(minHeight),
      expandable: true,
      prompt_for_trainer: nonEmptyText(raw.sketch.prompt_for_trainer, 'Sketch ' + id + ' prompt')
    };
  }

  block.trainerInstructions = nonEmptyText(
    raw.trainerInstructions,
    'Planner block ' + id + ' trainerInstructions'
  );

  if (!Array.isArray(raw.misconception_watch) || !raw.misconception_watch.length) {
    throw invalid('Planner block ' + id + ' needs misconception_watch.');
  }
  block.misconception_watch = raw.misconception_watch.map(function (item) {
    return nonEmptyText(item, 'Planner block ' + id + ' misconception_watch item');
  });

  return block;
}

/** Manual schema validation for the planner completion. */
function validatePlannerOutput(parsed, context) {
  if (!isObject(parsed)) throw invalid('Planner response must be a JSON object.');

  const topicId = nonEmptyText(parsed.topic_id, 'topic_id');
  if (!isObject(parsed.curriculum_map)) throw invalid('curriculum_map must be an object.');

  const chapter = text(parsed.curriculum_map.chapter, '');
  const objectives = parsed.curriculum_map.learning_objectives;
  if (!Array.isArray(objectives) || !objectives.length) {
    throw invalid('curriculum_map.learning_objectives must be a non-empty array.');
  }

  const curriculumMap = {
    board: nonEmptyText(parsed.curriculum_map.board, 'curriculum_map.board'),
    grade: integer(parsed.curriculum_map.grade, 'curriculum_map.grade'),
    chapter: chapter,
    learning_objectives: objectives.map(function (objective) {
      return nonEmptyText(objective, 'learning objective');
    })
  };
  if (context && context.mode === 'school_curriculum' && !chapter) {
    throw invalid('school_curriculum mode requires curriculum_map.chapter.');
  }

  if (!isObject(parsed.planner)) throw invalid('planner must be an object.');
  if (integer(parsed.planner.version, 'planner.version') < 1) {
    throw invalid('planner.version must be at least 1.');
  }
  const estimatedMinutes = integer(parsed.planner.estimated_minutes, 'planner.estimated_minutes');
  if (estimatedMinutes < 15) throw invalid('planner.estimated_minutes must be at least 15.');

  if (!Array.isArray(parsed.planner.blocks) || !parsed.planner.blocks.length) {
    throw invalid('planner.blocks must be a non-empty array.');
  }

  const seenIds = [];
  const blocks = parsed.planner.blocks.map(function (block, index) {
    return normalizeBlock(block, index, seenIds);
  });
  const types = blocks.map(function (block) { return block.type; });
  ['analogy', 'story', 'sketch_space'].forEach(function (required) {
    if (types.indexOf(required) === -1) {
      throw invalid('Planner must include at least one ' + required + ' block.');
    }
  });

  return {
    topic_id: topicId,
    curriculum_map: curriculumMap,
    planner: {
      version: Math.round(integer(parsed.planner.version, 'planner.version')),
      estimated_minutes: Math.round(estimatedMinutes),
      blocks: blocks
    }
  };
}

function fallbackBlock(id, type, contentText, instructions, misconceptions, options) {
  const settings = options || {};
  const block = {
    id: id,
    type: type,
    content: {
      text: contentText,
      image_prompt: settings.imagePrompt || '',
      alt: settings.alt || '',
      caption: settings.caption || ''
    },
    trainerInstructions: instructions,
    misconception_watch: misconceptions
  };
  if (type === 'sketch_space') {
    block.sketch = {
      minHeight: settings.minHeight || 220,
      expandable: true,
      prompt_for_trainer: settings.promptForTrainer || 'Draw the working here, one step at a time.'
    };
  }
  return block;
}

/** Deterministic, schema-valid planner used only when no API key is configured. */
function buildPlannerFallback(context) {
  const topic = context.topic;
  const chapter = context.mode === 'school_curriculum'
    ? (context.school_chapter_context || topic)
    : topic;
  const objectives = context.learning_objectives.length
    ? context.learning_objectives
    : [
      'Recall the key idea in ' + topic + '.',
      'Work through a guided example without rushing.',
      'Explain the method in the student’s own words.'
    ];

  const blocks = [
    fallbackBlock('b1', 'heading', 'Hook: ' + topic,
      'Open with a calm question about where ' + topic + ' appears in everyday life. Pause before giving any method.',
      ['Jumping straight into rules before the student has a picture.']),
    fallbackBlock('b2', 'sketch_space', '',
      'Draw the hook as a simple picture. Let the student add one mark before you continue.',
      ['Drawing too much at once and losing the student.'],
      { promptForTrainer: 'Sketch the everyday situation, then label the unknown.' }),
    fallbackBlock('b3', 'analogy', '',
      'Compare ' + topic + ' to sharing physical objects, likearam tokens on a table. Keep the comparison concrete.',
      ['Treating the analogy as the answer instead of a bridge.'],
      { imagePrompt: 'A simple row of Indian-context objects being shared or grouped', caption: 'Same total, different grouping.' }),
    fallbackBlock('b4', 'story',
      'A shopkeeper has a tray of ' + topic + ' cards. One child counts them quickly, then stops. The shopkeeper asks, “Can you show me why that count is fair?” The child slows down, groups the cards, and the pattern becomes visible. Nothing about the child is slow; the picture was missing. Now the two of you can build the rule together.',
      'Read the story slowly. Stop at the question and let the student predict what the groups might look like.',
      ['Turning the story into a comparison between children.']),
    fallbackBlock('b5', 'text', 'Concept: ' + topic + ' is a way of describing a relationship, not a rule to memorise.',
      'Say the idea in one sentence, then ask the student to say it back in their own words.',
      ['Using words the student cannot yet picture.'],
      {}),
    fallbackBlock('b6', 'sketch_space', '',
      'Draw one worked example slowly. Keep the first line visible while you write the second.',
      ['Erasing earlier steps before the student has connected them.'],
      { promptForTrainer: 'Write the example line by line; leave room for the student to copy the pattern.' }),
    fallbackBlock('b7', 'text', 'Guided practice: try one small example together, then hand the pencil to the student.',
      'Give the first move only if asked. Wait at least five seconds before prompting.',
      ['Taking over the pencil too early.'],
      {}),
    fallbackBlock('b8', 'text', 'Check: explain the method back, then answer one short question independently.',
      'Use the check to decide whether to reteach or move on. Do not announce a score out loud.',
      ['Treating one wrong answer as inability rather than a gap to reteach.'],
      {})
  ];

  return {
    topic_id: text(topic, 'general-mathematics')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'general-mathematics',
    curriculum_map: {
      board: context.board,
      grade: Math.round(number(context.grade, 0)),
      chapter: chapter,
      learning_objectives: objectives
    },
    planner: {
      version: 1,
      estimated_minutes: Math.round(context.estimated_minutes),
      blocks: blocks
    }
  };
}

/** Call 1: curriculum map + planner blocks. */
async function generatePlannerAndCurriculum(context) {
  const settings = normalizeContext(context);
  const rendered = renderPrompt(SYSTEM_PROMPT_PLANNER, {
    board: settings.board,
    grade: settings.grade,
    topic: settings.topic,
    age: settings.student_age,
    lang: settings.language,
    mode: settings.mode,
    context: settings.school_chapter_context
  });

  const parsed = await requestJSON(
    rendered,
    'Create the planner for ' + settings.topic + '. Follow the JSON schema exactly.',
    settings.allowFallback
  );
  const output = parsed || buildPlannerFallback(settings);
  return validatePlannerOutput(output, settings);
}

function optionLetter(index) {
  return String.fromCharCode(97 + index);
}

function validateQuizOutput(parsed, context) {
  if (!isObject(parsed)) throw invalid('Quiz response must be a JSON object.');
  if (!isObject(parsed.quiz)) throw invalid('quiz must be an object.');

  const seenIds = [];
  const seenStems = [];
  const previousStems = (context && context.previously_asked_questions ?
    context.previously_asked_questions : []).map(function (item) {
    return normalizeStem(isObject(item) ? (item.stem || item.question || item.text) : item);
  }).filter(Boolean);
  let hasSketchItem = false;

  const quiz = {};
  TIER_SPECS.forEach(function (spec) {
    const rawItems = parsed.quiz[spec.key];
    if (!Array.isArray(rawItems) || !rawItems.length) {
      throw invalid('quiz.' + spec.key + ' must be a non-empty array.');
    }

    quiz[spec.key] = rawItems.map(function (raw, index) {
      if (!isObject(raw)) throw invalid(spec.key + ' item ' + (index + 1) + ' must be an object.');

      const id = nonEmptyText(raw.id, spec.key + ' item id');
      if (seenIds.indexOf(id) !== -1) throw invalid('Quiz item ids must be unique.');
      seenIds.push(id);

      const stem = nonEmptyText(raw.stem, spec.key + ' item stem');
      const stemKey = normalizeStem(stem);
      if (seenStems.indexOf(stemKey) !== -1 || previousStems.indexOf(stemKey) !== -1) {
        throw invalid('Quiz item ' + id + ' repeats a previously asked question.');
      }
      seenStems.push(stemKey);

      if (!Array.isArray(raw.options) || raw.options.length !== 4) {
        throw invalid('Quiz item ' + id + ' needs exactly 4 options.');
      }
      const optionIds = [];
      const options = raw.options.map(function (option, optionIndex) {
        if (!isObject(option)) throw invalid('Quiz item ' + id + ' option must be an object.');
        const optionId = nonEmptyText(option.id, 'Quiz item ' + id + ' option id');
        if (optionIds.indexOf(optionId) !== -1) {
          throw invalid('Quiz item ' + id + ' has duplicate option ids.');
        }
        optionIds.push(optionId);
        return {
          id: optionId,
          text: nonEmptyText(option.text, 'Quiz item ' + id + ' option text')
        };
      });

      const correctOptionId = nonEmptyText(raw.correctOptionId, 'Quiz item ' + id + ' correctOptionId');
      if (optionIds.indexOf(correctOptionId) === -1) {
        throw invalid('Quiz item ' + id + ' correctOptionId must match an option.');
      }
      const correctOption = options.find(function (option) { return option.id === correctOptionId; });
      const suppliedAnswerKey = nonEmptyText(raw.answerKey, 'Quiz item ' + id + ' answerKey');
      if (suppliedAnswerKey !== correctOptionId && suppliedAnswerKey !== correctOption.text) {
        throw invalid('Quiz item ' + id + ' answerKey must match the correct option.');
      }
      const answerKey = correctOption.text;

      if (!Array.isArray(raw.hints) || raw.hints.length !== 2) {
        throw invalid('Quiz item ' + id + ' needs exactly 2 hints.');
      }
      const hints = raw.hints.map(function (hint) {
        const clean = nonEmptyText(hint, 'Quiz item ' + id + ' hint');
        if (clean.toLowerCase().indexOf(answerKey.toLowerCase()) !== -1) {
          throw invalid('Quiz item ' + id + ' hint must not restate the answer.');
        }
        return clean;
      });
      if (hints[0] === hints[1]) throw invalid('Quiz item ' + id + ' hints must be ordered gentle then direct.');

      const timeLimit = integer(raw.time_limit_sec, 'Quiz item ' + id + ' time_limit_sec');
      if (timeLimit !== spec.timeLimit) {
        throw invalid('Quiz item ' + id + ' time_limit_sec must be ' + spec.timeLimit + '.');
      }

      if (!isObject(raw.distractor_rationale)) {
        throw invalid('Quiz item ' + id + ' needs distractor_rationale.');
      }
      const distractorRationale = {};
      optionIds.forEach(function (optionId) {
        if (optionId === correctOptionId) return;
        distractorRationale[optionId] = nonEmptyText(
          raw.distractor_rationale[optionId],
          'Quiz item ' + id + ' distractor_rationale.' + optionId
        );
      });

      if (typeof raw.requires_sketch !== 'boolean') {
        throw invalid('Quiz item ' + id + ' needs requires_sketch as a boolean.');
      }
      if (raw.requires_sketch) hasSketchItem = true;

      return {
        id: id,
        stem: stem,
        options: options,
        correctOptionId: correctOptionId,
        answerKey: answerKey,
        explanation: nonEmptyText(raw.explanation, 'Quiz item ' + id + ' explanation'),
        hints: hints,
        time_limit_sec: spec.timeLimit,
        distractor_rationale: distractorRationale,
        requires_sketch: raw.requires_sketch,
        bloom: nonEmptyText(raw.bloom, 'Quiz item ' + id + ' bloom')
      };
    });
  });

  if (!hasSketchItem) {
    throw invalid('At least one quiz item must have requires_sketch set to true.');
  }

  if (!isObject(parsed.advance_criteria)) {
    throw invalid('advance_criteria must be an object.');
  }
  const gate = number(parsed.advance_criteria.gate_pct, NaN);
  if (!Number.isFinite(gate) || gate < 70 || gate > 80) {
    throw invalid('advance_criteria.gate_pct must be between 70 and 80.');
  }
  if (parsed.advance_criteria.repeat_if_below !== true) {
    throw invalid('advance_criteria.repeat_if_below must be true.');
  }

  const parentSummary = nonEmptyText(parsed.parent_summary, 'parent_summary');
  const sentences = parentSummary.split(/[.!?]+(?:\s|$)/).filter(function (part) { return part.trim(); });
  if (sentences.length !== 2) {
    throw invalid('parent_summary must be exactly 2 plain-language sentences.');
  }

  return {
    quiz: quiz,
    advance_criteria: { gate_pct: gate, repeat_if_below: true },
    parent_summary: parentSummary
  };
}

/** Deterministic, schema-valid quiz tiers used only without an API key. */
function buildQuizFallback(context, plannerOutput) {
  const topic = context.topic;
  const score = context.mastery_pct;
  const usedPrompts = (context.previously_asked_questions || []).map(function (item) {
    return isObject(item) ? (item.stem || item.question || item.text) : item;
  }).filter(Boolean);
  const quiz = {};
  let itemNumber = 0;

  TIER_SPECS.forEach(function (spec, tierIndex) {
    const question = generator.buildFallbackQuiz(topic, score, {
      count: 1,
      level: tierIndex + 1,
      usedPrompts: usedPrompts,
      allowFallback: true
    })[0];
    usedPrompts.push(question.prompt);

    const options = question.options.map(function (optionText, index) {
      return { id: optionLetter(index), text: optionText };
    });
    const correctOptionId = optionLetter(question.answerIndex);
    const distractorRationale = {};
    options.forEach(function (option, index) {
      if (option.id === correctOptionId) return;
      distractorRationale[option.id] = [
        'Used the wrong operation for the given condition.',
        'Treated the numbers as unrelated instead of as one relationship.',
        'Missed the condition in the question.'
      ][(index + tierIndex) % 3];
    });

    itemNumber += 1;
    quiz[spec.key] = [{
      id: 'q_fallback_' + Date.now() + '_' + itemNumber,
      stem: question.prompt,
      options: options,
      correctOptionId: correctOptionId,
      answerKey: question.correctAnswer,
      explanation: 'Work from the condition in the question, then check the result against the original numbers.',
      hints: [
        question.hint,
        'Group the known values first, then decide which operation connects them.'
      ],
      time_limit_sec: spec.timeLimit,
      distractor_rationale: distractorRationale,
      requires_sketch: tierIndex === 1,
      bloom: spec.bloom
    }];
  });

  return {
    quiz: quiz,
    advance_criteria: { gate_pct: 75, repeat_if_below: true },
    parent_summary: 'This checkpoint checks the topic one small step at a time. We will revisit the same topic until the idea is secure.'
  };
}

/** Call 2: three quiz tiers, grounded in the planner output from call 1. */
async function generateQuizTiers(context, plannerOutput) {
  const settings = normalizeContext(context);
  if (!isObject(plannerOutput)) {
    throw failure('generateQuizTiers requires plannerOutput from generatePlannerAndCurriculum.',
      'INVALID_PLANNER_OUTPUT', 400);
  }

  const safeCurriculum = serializers.stripTrainerOnlyFields(plannerOutput);
  const rendered = renderPrompt(SYSTEM_PROMPT_QUIZ, {
    board: settings.board,
    grade: settings.grade,
    topic: settings.topic,
    mastery_pct: settings.mastery_pct,
    current_level: settings.current_level,
    previously_asked_questions: settings.previously_asked_questions,
    curriculum_context: safeCurriculum
  });

  const parsed = await requestJSON(
    rendered,
    'Create the three quiz tiers for ' + settings.topic + ' from this curriculum context. Follow the JSON schema exactly.',
    settings.allowFallback
  );
  const output = parsed || buildQuizFallback(settings, plannerOutput);
  return validateQuizOutput(output, settings);
}

const DIFFICULTY_SCORES = {
  l1: 30,
  easy: 30,
  level1: 30,
  l2: 65,
  medium: 65,
  level2: 65,
  l3: 90,
  hard: 90,
  level3: 90
};

function scoreForDifficulty(difficulty) {
  const key = String(difficulty || '').trim().toLowerCase().replace(/\s+/g, '');
  return DIFFICULTY_SCORES[key] || DIFFICULTY_SCORES.level2;
}

/** Legacy export kept so existing callers do not break. */
async function generateQuizDraft(topic, difficulty) {
  return generator.generateAdaptiveQuiz(topic, scoreForDifficulty(difficulty), { count: 3 });
}

module.exports = Object.assign({}, generator, {
  SYSTEM_PROMPT_PLANNER: SYSTEM_PROMPT_PLANNER,
  SYSTEM_PROMPT_QUIZ: SYSTEM_PROMPT_QUIZ,
  safeParseJSON: safeParseJSON,
  generatePlannerAndCurriculum: generatePlannerAndCurriculum,
  generateQuizTiers: generateQuizTiers,
  validatePlannerOutput: validatePlannerOutput,
  validateQuizOutput: validateQuizOutput,
  generateQuizDraft: generateQuizDraft,
  difficultyLabel: generator.difficultyLabel,
  calculateNextDifficulty: generator.calculateNextDifficulty
});
