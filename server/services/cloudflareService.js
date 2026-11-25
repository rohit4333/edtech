/* Mathify curriculum authoring.
 *
 * Two-phase generation keeps each Workers AI completion inside the output
 * token limit:
 *   1. generatePlannerAndCurriculum(context)
 *   2. generateQuizTiers(context, plannerOutput)
 *
 * Responses are parsed as strict JSON, validated with Zod, and checked for
 * cross-field curriculum rules. Student-side filtering belongs in
 * serializers.js, never here.
 */

const { z } = require('zod');
const generator = require('../quiz/generator');
const serializers = require('../serializers');
const cloudflareClient = require('./cloudflareClient');
const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'];
const BLOCK_TYPES = ['heading', 'text', 'image', 'sketch_space', 'analogy', 'story'];
const TIER_SPECS = [
  { key: 'level_1', timeLimit: 45, bloom: 'Understand' },
  { key: 'level_2', timeLimit: 75, bloom: 'Apply' },
  { key: 'level_3', timeLimit: 120, bloom: 'Analyze' }
];

let missingProviderWarned = false;

const SYSTEM_PROMPT_PLANNER = `You are Mathify's curriculum author. Return ONLY valid JSON. Sequence: hook -> visual analogy (Indian context) -> story narration -> concept -> worked example. After each text/image, insert a \`sketch_space\` block (minHeight: 220, expandable: true). For EVERY block, write \`trainerInstructions\` (what to say/draw) and \`misconception_watch\`. This is trainer-only.

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

const SYSTEM_PROMPT_QUIZ = `Generate 3 tiers: level_1, level_2, level_3. Each item: exactly 4 options, 1 correct, \`distractor_rationale\`, 2 hints (gentle -> direct), \`time_limit_sec\` (45, 75, 120), and \`requires_sketch\` boolean. Do NOT repeat previously asked questions.

You are Mathify's quiz author for 1-on-1 math tutoring.
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

/* Used after a failed item, once the trainer has explained it on the board. */
const SYSTEM_PROMPT_PARALLEL = "You are Mathify's AI tutor. The student failed a question about: [failedQuestionConcept]. Generate exactly ONE new parallel question testing the SAME underlying concept, but with different numbers, context, or framing so it is not a repeated question. Return ONLY valid JSON: { 'id': 'string', 'stem': 'string', 'options': [{'id':'a','text':''}, ...], 'correctOptionId': 'string', 'explanation': 'string', 'hint': 'string' }.";

/* ---------- Zod schemas ---------- */

const plannerBlockSchema = z.object({
  id: z.string().min(1),
  type: z.enum(BLOCK_TYPES),
  content: z.object({
    text: z.string().default(''),
    image_prompt: z.string().default(''),
    alt: z.string().default(''),
    caption: z.string().default('')
  }),
  sketch: z.object({
    minHeight: z.number().int().min(120),
    expandable: z.literal(true),
    prompt_for_trainer: z.string().min(1)
  }).optional(),
  trainerInstructions: z.string().min(1),
  misconception_watch: z.array(z.string().min(1)).min(1)
}).superRefine(function (block, context) {
  if (block.type === 'sketch_space' && !block.sketch) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sketch'],
      message: 'sketch_space blocks require a sketch object.'
    });
  }
  if (block.type === 'analogy' && !block.content.image_prompt && !block.content.caption) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['content', 'image_prompt'],
      message: 'Analogy blocks need an image prompt or caption.'
    });
  }
});

const plannerSchema = z.object({
  topic_id: z.string().min(1),
  curriculum_map: z.object({
    board: z.string().min(1),
    grade: z.number().int(),
    chapter: z.string().default(''),
    learning_objectives: z.array(z.string().min(1)).min(1)
  }),
  planner: z.object({
    version: z.number().int().min(1),
    estimated_minutes: z.number().int().min(15),
    blocks: z.array(plannerBlockSchema).min(1)
  })
}).superRefine(function (payload, context) {
  const types = payload.planner.blocks.map(function (block) { return block.type; });
  ['analogy', 'story', 'sketch_space'].forEach(function (required) {
    if (types.indexOf(required) === -1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['planner', 'blocks'],
        message: 'Planner must include at least one ' + required + ' block.'
      });
    }
  });
});

const quizOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1)
});

const quizItemBaseSchema = z.object({
  id: z.string().min(1),
  stem: z.string().min(1),
  options: z.array(quizOptionSchema).length(4),
  correctOptionId: z.string().min(1),
  answerKey: z.string().min(1),
  explanation: z.string().min(1),
  hints: z.array(z.string().min(1)).length(2),
  time_limit_sec: z.number().int(),
  distractor_rationale: z.record(z.string().min(1)),
  requires_sketch: z.boolean(),
  bloom: z.string().min(1)
});

function refineQuizItem(item, context) {
  const ids = item.options.map(function (option) { return option.id; });
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: 'Quiz option ids must be unique.'
    });
  }
  if (ids.indexOf(item.correctOptionId) === -1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['correctOptionId'],
      message: 'correctOptionId must match one of the options.'
    });
  }
  if (item.hints[0] === item.hints[1]) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['hints'],
      message: 'Hints must be ordered gentle then direct.'
    });
  }
  ids.forEach(function (id) {
    if (id !== item.correctOptionId && !item.distractor_rationale[id]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['distractor_rationale', id],
        message: 'Each distractor needs a misconception rationale.'
      });
    }
  });
}

function tierItemSchema(limit) {
  return quizItemBaseSchema.extend({
    time_limit_sec: z.literal(limit)
  }).superRefine(refineQuizItem);
}

const quizSchema = z.object({
  quiz: z.object({
    level_1: z.array(tierItemSchema(45)).min(1),
    level_2: z.array(tierItemSchema(75)).min(1),
    level_3: z.array(tierItemSchema(120)).min(1)
  }),
  advance_criteria: z.object({
    gate_pct: z.number().min(70).max(80),
    repeat_if_below: z.literal(true)
  }),
  parent_summary: z.string().min(1)
});

const parallelQuestionSchema = z.object({
  id: z.string().min(1),
  stem: z.string().min(1),
  options: z.array(quizOptionSchema).length(4),
  correctOptionId: z.string().min(1),
  explanation: z.string().min(1),
  hint: z.string().min(1)
}).superRefine(function (item, context) {
  const ids = item.options.map(function (option) { return option.id; });
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: 'Parallel question option ids must be unique.'
    });
  }
  if (ids.indexOf(item.correctOptionId) === -1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['correctOptionId'],
      message: 'correctOptionId must match one of the four options.'
    });
  }
});

/* ---------- Helpers ---------- */

function failure(message, code, status) {
  const problem = new Error(message);
  problem.code = code;
  problem.status = status || 502;
  return problem;
}

function invalid(message) {
  return failure(message, 'CLOUDFLARE_INVALID_JSON', 502);
}

function zodMessage(error) {
  const issue = error && error.issues && error.issues[0];
  if (!issue) return 'Payload failed schema validation.';
  const path = issue.path && issue.path.length ? issue.path.join('.') + ': ' : '';
  return path + issue.message;
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeStem(value) {
  return text(value, '').toLowerCase();
}

/** Label variant of the adaptive step: easy|medium|hard. */
function calculateNextDifficultyLabel(currentLevel, score) {
  const level = text(currentLevel, 'medium').toLowerCase();
  const index = DIFFICULTY_LEVELS.indexOf(level);
  const currentIndex = index === -1 ? 1 : index;
  const value = number(score, 0);
  const safeScore = clamp(Math.round(value), 0, 100);

  if (safeScore >= 80) return DIFFICULTY_LEVELS[Math.min(currentIndex + 1, DIFFICULTY_LEVELS.length - 1)];
  if (safeScore < 40) return DIFFICULTY_LEVELS[Math.max(currentIndex - 1, 0)];
  return DIFFICULTY_LEVELS[currentIndex];
}

/**
 * Backward-compatible adaptive step. Numeric levels delegate to the original
 * generator helper; string levels use the curriculum label variant.
 */
function calculateNextDifficulty(currentLevel, score) {
  const raw = String(currentLevel === null || currentLevel === undefined ? '' : currentLevel)
    .trim()
    .toLowerCase();
  if (DIFFICULTY_LEVELS.indexOf(raw) !== -1) {
    return calculateNextDifficultyLabel(raw, score);
  }
  return generator.calculateNextDifficulty(currentLevel, score);
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

/** Parse fences and trailing commas. Returns null instead of throwing. */
function safeParseJSON(raw) {
  let content = String(raw === null || raw === undefined ? '' : raw).trim();
  if (!content) return null;

  const fenced = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) content = fenced[1].trim();

  try {
    return JSON.parse(stripTrailingCommas(content));
  } catch (problem) {
    return null;
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
    current_level: calculateNextDifficulty(input.current_level, input.mastery_pct),
    previously_asked_questions: previous,
    learning_objectives: objectives,
    estimated_minutes: clamp(number(input.estimated_minutes, 45), 15, 120),
    allowFallback: input.allowFallback
  };
}

function warnMissingProvider() {
  if (missingProviderWarned) return;
  missingProviderWarned = true;
  console.warn('[cloudflare] Workers AI credentials missing; using deterministic fallback.');
}

async function requestJSON(systemPrompt, userPrompt, allowFallback) {
  const generatedText = await cloudflareClient.generateAIResponse(systemPrompt, userPrompt, {
    allowFallback: allowFallback,
    jsonOnly: true
  });
  const parsed = safeParseJSON(generatedText);
  if (parsed) return parsed;

  if (allowFallback === false) {
    throw invalid('Cloudflare Workers AI response was not valid JSON.');
  }
  warnMissingProvider();
  return null;
}

/** Zod validation for the planner completion. */
function validatePlannerOutput(parsed, context) {
  const result = plannerSchema.safeParse(parsed);
  if (!result.success) {
    throw invalid('Planner response failed schema validation: ' + zodMessage(result.error));
  }

  const output = result.data;
  if (context && context.mode === 'school_curriculum' && !output.curriculum_map.chapter) {
    throw invalid('school_curriculum mode requires curriculum_map.chapter.');
  }

  return {
    topic_id: output.topic_id,
    curriculum_map: {
      board: output.curriculum_map.board,
      grade: output.curriculum_map.grade,
      chapter: output.curriculum_map.chapter,
      learning_objectives: output.curriculum_map.learning_objectives.slice()
    },
    planner: {
      version: output.planner.version,
      estimated_minutes: output.planner.estimated_minutes,
      blocks: output.planner.blocks.map(function (block) {
        const safe = {
          id: block.id,
          type: block.type,
          content: {
            text: block.content.text,
            image_prompt: block.content.image_prompt,
            alt: block.content.alt,
            caption: block.content.caption
          },
          trainerInstructions: block.trainerInstructions,
          misconception_watch: block.misconception_watch.slice()
        };
        if (block.type === 'sketch_space' && block.sketch) safe.sketch = block.sketch;
        return safe;
      })
    }
  };
}

/** Zod validation plus cross-item rules for the three-tier quiz. */
function validateQuizOutput(parsed, context) {
  const result = quizSchema.safeParse(parsed);
  if (!result.success) {
    throw invalid('Quiz response failed schema validation: ' + zodMessage(result.error));
  }

  const output = result.data;
  const seenIds = [];
  const seenStems = [];
  const previousStems = (context && context.previously_asked_questions
    ? context.previously_asked_questions
    : []).map(function (item) {
    return normalizeStem(isObject(item) ? (item.stem || item.question || item.text) : item);
  }).filter(Boolean);
  let hasSketchItem = false;

  const quiz = {};
  TIER_SPECS.forEach(function (spec) {
    quiz[spec.key] = output.quiz[spec.key].map(function (item) {
      if (seenIds.indexOf(item.id) !== -1) {
        throw invalid('Quiz item ids must be unique.');
      }
      seenIds.push(item.id);

      const stemKey = normalizeStem(item.stem);
      if (seenStems.indexOf(stemKey) !== -1 || previousStems.indexOf(stemKey) !== -1) {
        throw invalid('Quiz item ' + item.id + ' repeats a previously asked question.');
      }
      seenStems.push(stemKey);

      const correctOption = item.options.find(function (option) {
        return option.id === item.correctOptionId;
      });
      if (!correctOption) throw invalid('Quiz item ' + item.id + ' has no valid correct option.');
      if (item.answerKey !== item.correctOptionId && item.answerKey !== correctOption.text) {
        throw invalid('Quiz item ' + item.id + ' answerKey must match the correct option.');
      }

      const answerKey = correctOption.text;
      const hints = item.hints.slice();
      if (hints.some(function (hint) {
        return hint.toLowerCase().indexOf(answerKey.toLowerCase()) !== -1;
      })) {
        throw invalid('Quiz item ' + item.id + ' hint must not restate the answer.');
      }

      const distractorRationale = {};
      item.options.forEach(function (option) {
        if (option.id === item.correctOptionId) return;
        distractorRationale[option.id] = item.distractor_rationale[option.id];
      });

      if (item.requires_sketch) hasSketchItem = true;

      return {
        id: item.id,
        stem: item.stem,
        options: item.options.map(function (option) {
          return { id: option.id, text: option.text };
        }),
        correctOptionId: item.correctOptionId,
        answerKey: answerKey,
        explanation: item.explanation,
        hints: hints,
        time_limit_sec: spec.timeLimit,
        distractor_rationale: distractorRationale,
        requires_sketch: item.requires_sketch,
        bloom: item.bloom
      };
    });
  });

  if (!hasSketchItem) {
    throw invalid('At least one quiz item must have requires_sketch set to true.');
  }

  const parentSummary = text(output.parent_summary, '');
  const sentences = parentSummary.split(/[.!?]+(?:\s|$)/).filter(function (part) { return part.trim(); });
  if (sentences.length !== 2) {
    throw invalid('parent_summary must be exactly 2 plain-language sentences.');
  }

  return {
    quiz: quiz,
    advance_criteria: {
      gate_pct: output.advance_criteria.gate_pct,
      repeat_if_below: true
    },
    parent_summary: parentSummary
  };
}

/** Zod validation for a single trainer-requested parallel check. */
function validateParallelQuestionOutput(parsed, context) {
  const result = parallelQuestionSchema.safeParse(parsed);
  if (!result.success) {
    throw invalid('Parallel question failed schema validation: ' + zodMessage(result.error));
  }

  const item = result.data;
  const stemKey = normalizeStem(item.stem);
  const usedPrompts = (context && context.usedPrompts ? context.usedPrompts : [])
    .map(function (value) {
      return normalizeStem(isObject(value) ? (value.stem || value.prompt || value.text) : value);
    })
    .filter(Boolean);
  if (usedPrompts.indexOf(stemKey) !== -1) {
    throw invalid('Parallel question repeats a previously asked question.');
  }

  const correctOption = item.options.find(function (option) {
    return option.id === item.correctOptionId;
  });
  if (!correctOption) throw invalid('Parallel question correctOptionId is not one of its options.');

  return {
    id: item.id,
    stem: item.stem,
    options: item.options.map(function (option) {
      return { id: option.id, text: option.text };
    }),
    correctOptionId: item.correctOptionId,
    answerKey: correctOption.text,
    explanation: item.explanation,
    hint: item.hint
  };
}

/* ---------- Deterministic fallback (no API key) ---------- */

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

  return validatePlannerOutput({
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
  }, context);
}

function optionLetter(index) {
  return String.fromCharCode(97 + index);
}

function buildQuizFallback(context) {
  const topic = context.topic;
  const usedPrompts = (context.previously_asked_questions || []).map(function (item) {
    return isObject(item) ? (item.stem || item.question || item.text) : item;
  }).filter(Boolean);
  const quiz = {};
  let itemNumber = 0;

  TIER_SPECS.forEach(function (spec, tierIndex) {
    const question = generator.buildFallbackQuiz(topic, context.mastery_pct, {
      count: 1,
      level: tierIndex + 1,
      usedPrompts: usedPrompts
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

  return validateQuizOutput({
    quiz: quiz,
    advance_criteria: { gate_pct: 75, repeat_if_below: true },
    parent_summary: 'This checkpoint checks the topic one small step at a time. We will revisit the same topic until the idea is secure.'
  }, context);
}

/* ---------- Public API ---------- */

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
  return validatePlannerOutput(parsed || buildPlannerFallback(settings), settings);
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
  return validateQuizOutput(parsed || buildQuizFallback(settings), settings);
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

function buildParallelFallback(concept, difficulty, settings) {
  const question = generator.buildFallbackQuiz(concept, scoreForDifficulty(difficulty), {
    count: 1,
    level: generator.difficultyNumber(difficulty) || generator.difficultyForMastery(scoreForDifficulty(difficulty)),
    usedPrompts: settings.usedPrompts || []
  })[0];
  const options = question.options.map(function (optionText, index) {
    return { id: optionLetter(index), text: optionText };
  });
  const correctOptionId = optionLetter(question.answerIndex);

  return {
    id: 'q_parallel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    stem: question.prompt,
    options: options,
    correctOptionId: correctOptionId,
    answerKey: question.correctAnswer,
    explanation: 'Use the same relationship as the worked example, with the new numbers.',
    hint: question.hint
  };
}

/**
 * One parallel check after a trainer explanation. The prompt is intentionally
 * single-item so the completion never competes with the two-phase curriculum
 * output for output tokens.
 */
async function generateParallelQuestion(failedQuestionConcept, difficulty, options) {
  const settings = options || {};
  const concept = text(failedQuestionConcept, '');
  if (!concept) {
    throw failure('failedQuestionConcept must be a non-empty string.', 'MISSING_CONCEPT', 400);
  }

  const rendered = SYSTEM_PROMPT_PARALLEL.replace('[failedQuestionConcept]', concept);
  const parsed = await requestJSON(
    rendered,
    'Difficulty: ' + generator.difficultyLabel(difficulty) +
      '. Test the same concept with a fresh context. Do not repeat an earlier stem.',
    settings.allowFallback
  );
  const output = validateParallelQuestionOutput(
    parsed || buildParallelFallback(concept, difficulty, settings),
    { usedPrompts: settings.usedPrompts || [] }
  );

  return Object.assign({}, output, {
    concept: concept,
    difficulty: generator.difficultyLabel(difficulty),
    source: parsed ? 'ai' : 'fallback'
  });
}

/** Backward-compatible wrapper for existing callers. */
async function generateQuizDraft(topic, difficulty) {
  return generator.generateAdaptiveQuiz(topic, scoreForDifficulty(difficulty), { count: 3 });
}

module.exports = Object.assign({}, generator, {
  SYSTEM_PROMPT_PLANNER: SYSTEM_PROMPT_PLANNER,
  SYSTEM_PROMPT_QUIZ: SYSTEM_PROMPT_QUIZ,
  SYSTEM_PROMPT_PARALLEL: SYSTEM_PROMPT_PARALLEL,
  DIFFICULTY_LEVELS: DIFFICULTY_LEVELS,
  plannerSchema: plannerSchema,
  quizSchema: quizSchema,
  parallelQuestionSchema: parallelQuestionSchema,
  safeParseJSON: safeParseJSON,
  calculateNextDifficulty: calculateNextDifficulty,
  calculateNextDifficultyLabel: calculateNextDifficultyLabel,
  calculateNextNumericDifficulty: generator.calculateNextDifficulty,
  difficultyForMastery: generator.difficultyForMastery,
  generatePlannerAndCurriculum: generatePlannerAndCurriculum,
  generateQuizTiers: generateQuizTiers,
  generateParallelQuestion: generateParallelQuestion,
  validatePlannerOutput: validatePlannerOutput,
  validateQuizOutput: validateQuizOutput,
  validateParallelQuestionOutput: validateParallelQuestionOutput,
  generateQuizDraft: generateQuizDraft,
  difficultyLabel: generator.difficultyLabel
});
