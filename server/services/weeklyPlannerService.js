/* Auto-selected early-years weekly planner.
 *
 * The LMS asks for a planner by the child's registered board, grade and topic
 * (the profile's school chapter). The cache key stays curriculum+grade only:
 * the topic shapes the first generation prompt, never a second cache entry.
 * A cache hit returns stored JSON without touching the provider chain.
 * Only the founder may edit or regenerate; trainers may trigger generation
 * when no active planner exists yet.
 */

const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const catalog = require('./curriculumCatalog');
const subjects = require('./subjectCatalog');
const standardsRegistry = require('./weeklyPlannerStandards');
const ai = require('./cloudflareAiService');

const PROMPT_VERSION = 'weekly-planner-v1';
const FIRST_VERSION = 1;
const TEMPERATURE = 0.2;
const MAX_ATTEMPTS = 2;
const MAX_OUTPUT_TOKENS = 5000;

const FORBIDDEN_KEYS = new Set([
  'answer', 'answerkey', 'answercorrect', 'answers', 'answerindex', 'correct',
  'correctanswer', 'correctoptionid', 'correctoptionindex', 'hint', 'hints',
  'explanation', 'rationale', 'trainerinstructions', 'trainernotes',
  'misconception', 'misconceptionwatch', 'solution', 'scorekey'
]);
const FORBIDDEN_TEXT = /<script|javascript:|https?:\/\/|whatsapp|instagram|facebook|youtube|twitter|linkedin|@[a-z0-9._-]+\.[a-z]/i;
const UNSAFE_ACTIVITY = /\b(knife|scissors|fire|stove|chop|raw egg|medicine|ladder)\b/i;

const COLORS = [
  { name: 'sunflower', from: '#FFF3C4', to: '#FFD166', text: '#6B4A00' },
  { name: 'seafoam', from: '#DCF7EE', to: '#9AE6C9', text: '#14563F' },
  { name: 'sky', from: '#E4F2FF', to: '#A9D6FF', text: '#174A70' },
  { name: 'lilac', from: '#F1E9FF', to: '#D5BCFF', text: '#4C2E78' },
  { name: 'coral', from: '#FFE7DF', to: '#FFB69E', text: '#7A3320' }
];
const COLOR_NAMES = new Set(COLORS.map(function (color) { return color.name; }));

const DAY_TEMPLATES = [
  {
    day: 'Monday',
    narrative: 'Two red balls sit on a mat. One ball rolls under a chair. How many can we see?',
    theme: 'Roll and count',
    story: 'Tiny ball tale',
    making: 'Paper ball toss',
    reflect: 'Show two fingers'
  },
  {
    day: 'Tuesday',
    narrative: 'Three yellow ducks swim in a bowl. Two ducks hide behind a leaf. How many are in sight?',
    theme: 'Duck hide and seek',
    story: 'Leaf boat story',
    making: 'Fold a paper duck',
    reflect: 'Tell what you saw'
  },
  {
    day: 'Wednesday',
    narrative: 'Four blue blocks stand in a row. We add one green block. Now the tower feels tall.',
    theme: 'Block tower walk',
    story: 'The little tower',
    making: 'Build a block bridge',
    reflect: 'Point to the top'
  },
  {
    day: 'Thursday',
    narrative: 'Five round seeds lie on a plate. We sort them into two cups. Each cup holds a group.',
    theme: 'Seed basket sort',
    story: 'Seeds go home',
    making: 'Make a seed picture',
    reflect: 'Count each cup'
  },
  {
    day: 'Friday',
    narrative: 'Six soft stars shine on a card. We cover two with a cloth. What can you still count?',
    theme: 'Star shape hunt',
    story: 'Night sky story',
    making: 'Draw a star map',
    reflect: 'Draw what is left'
  }
];

const SYSTEM_PROMPT = [
  'You are Mathify\'s early-years weekly planner author.',
  'Return ONLY strict JSON. No markdown, no comments, no prose outside the object.',
  'Write for one child and one trusted adult. Use warm, simple, age-appropriate language.',
  'Use the supplied SUBJECT, CURRICULUM, GRADE and TOPIC to infer age band, theme, tone and standards.',
  'TOPIC comes from the child profile school chapter; shape every day around it.',
  'Coding plans use unplugged logic games and short pretend code ideas.',
  'English plans use reading, writing, speaking and listening; no literature or grammar drill.',
  'Use only official strand names and the exact standard codes supplied by the caller.',
  'Never invent a standard code, school board, logo, brand, personal detail or unsafe task.',
  'No sentence may be longer than twelve words. Each day narrative has two or three short sentences.',
  'Every day has four to six blocks and must include play, story, making and reflection.',
  'Each activity has exactly one emoji, one icon name and one color from a soft palette.',
  'Every activity includes support, core and stretch differentiation and an "I can..." chip.',
  'Return this exact shape:',
  '{',
  '  "meta": {"title","subject","curriculumSlug","curriculumLabel","gradeSlug","gradeLabel","topic","ageBand","theme","tone","standardsFramework","promptVersion"},',
  '  "hero": {"title","subtitle","emoji","colorTheme":{"name","from","to","angle","text"}},',
  '  "standards": [{"code","label","strand","framework","ageBand"}],',
  '  "week": {"days": [{"day","narrative","emoji","activities":[',
  '    {"id","type","title","emoji","icon","color","durationMinutes","instructions",',
  '     "materials","iCan","differentiation":{"support","core","stretch"},"observation","standardCodes"}]}]},',
  '  "materialsMasterList": [{"name","quantity","preparation"}],',
  '  "observationTracker": [{"id","label","criteria","standardCodes"}],',
  '  "homeConnection": {"title","familyNote","conversationStarters","printLabel"},',
  '  "safetyNotes": [{"title","detail"}]',
  '}',
  'All arrays must be non-empty. No null values. Keep the whole object under 5000 tokens.'
].join('\n');

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function fail(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 400;
  return error;
}

function versionKey(version) {
  return 'v' + Number(version || FIRST_VERSION);
}

/* Math keeps the original board+grade key contract exactly. Coding and
   English are namespaced so the same board and grade can hold three different
   immutable planners. The topic still never enters a key. */
function keyPrefix(subject) {
  const slug = subjects.normalize(subject);
  return slug === 'math' ? '' : slug + ':';
}

function cacheKeyFor(curriculumSlug, gradeSlug, version, subject) {
  return 'planner:' + versionKey(version) + ':' + keyPrefix(subject) + curriculumSlug + ':' + gradeSlug;
}

function pointerKeyFor(curriculumSlug, gradeSlug, subject) {
  return 'planner:active:' + keyPrefix(subject) + curriculumSlug + ':' + gradeSlug;
}

function seedFor(cacheKey) {
  const digest = crypto.createHash('sha256').update(String(cacheKey)).digest();
  return (digest.readUInt32BE(0) % 9999999999) + 1;
}

function cleanTopic(value, subject) {
  const text = String(value === null || value === undefined ? '' : value)
    .replace(/[\r\n\t<>@]+/g, ' ').replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 120);
  if (text) return text;
  const slug = subjects.normalize(subject);
  if (slug === 'coding') return 'General Coding';
  if (slug === 'english') return 'General Communication';
  return 'General Mathematics';
}

function resolveSelection(input) {
  const value = input || {};
  const resolved = catalog.resolve(value.curriculum || value.curriculumSlug, value.grade || value.gradeSlug);
  if (!resolved) throw fail('Unknown curriculum. Choose a board from the LMS catalogue.', 'UNKNOWN_CURRICULUM');
  if (!resolved.gradeSlug) throw fail('Unknown grade for this curriculum.', 'UNKNOWN_GRADE');
  const subject = subjects.normalize(value.subject);
  const view = subjects.publicView(subject);
  /* The topic only shapes generation. It is deliberately absent from the
     immutable cache key so a registered planner is never regenerated silently
     when a profile chapter changes. */
  resolved.subject = subject;
  resolved.subjectLabel = view.label;
  resolved.subjectWorkspace = view.workspace;
  resolved.topic = cleanTopic(value.topic || value.schoolChapter, subject);
  return resolved;
}

function allowedStandards(selection) {
  return standardsRegistry.allowedStandards(
    selection.subject,
    selection.curriculumSlug,
    selection.gradeSlug
  );
}

function buildUserPrompt(selection, allowed) {
  return JSON.stringify({
    SUBJECT: selection.subjectLabel,
    subjectSlug: selection.subject,
    workspace: selection.subjectWorkspace,
    CURRICULUM: selection.curriculumLabel,
    curriculumSlug: selection.curriculumSlug,
    board: selection.curriculumCanonical,
    country: selection.country,
    GRADE: selection.gradeLabel,
    gradeSlug: selection.gradeSlug,
    TOPIC: selection.topic,
    ageBand: selection.ageBand,
    theme: selection.theme,
    tone: selection.tone,
    standardsFramework: selection.standardsFramework,
    promptVersion: PROMPT_VERSION,
    allowedStandardCodes: allowed.map(function (entry) {
      return { code: entry.code, label: entry.label, strand: entry.strand };
    }),
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    activityTypes: ['play', 'story', 'making', 'practice', 'reflection']
  });
}

function parseJSON(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  return ai.safeParseJSON(value);
}

function sentencesOf(text) {
  return String(text || '').split(/[.!?]+/).map(function (part) { return part.trim(); }).filter(Boolean);
}

function wordsOf(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean);
}

function syllables(word) {
  const clean = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 0;
  if (clean.length <= 3) return 1;
  let value = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = value.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

function fleschKincaidGrade(text) {
  const sentences = sentencesOf(text).length || 1;
  const words = wordsOf(text);
  if (!words.length) return 99;
  const syllablesTotal = words.reduce(function (sum, word) { return sum + syllables(word); }, 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syllablesTotal / words.length) - 15.59;
}

function validateNarrative(text) {
  if (typeof text !== 'string') return 'narrative must be text';
  const sentences = sentencesOf(text);
  const words = wordsOf(text);
  if (sentences.length < 2 || sentences.length > 3) return 'narrative needs two or three sentences';
  if (words.length > 40) return 'narrative must stay under forty words';
  if (sentences.some(function (sentence) { return wordsOf(sentence).length > 12; })) {
    return 'narrative sentences must stay under twelve words';
  }
  if (fleschKincaidGrade(text) > 2) return 'narrative reading level is above grade two';
  return null;
}

function walk(value, visit, pathName) {
  if (value === null) {
    visit(pathName, 'null');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) visit(pathName, 'empty array');
    value.forEach(function (item, index) { walk(item, visit, pathName + '[' + index + ']'); });
    return;
  }
  if (value && typeof value === 'object') {
    Object.keys(value).forEach(function (key) {
      visit(pathName + '.' + key, 'key:' + key);
      walk(value[key], visit, pathName + '.' + key);
    });
  }
}

function hasForbiddenContent(value) {
  let reason = null;
  walk(value, function (pathName, marker) {
    if (reason) return;
    if (marker === 'null') { reason = pathName + ' is null'; return; }
    if (marker.indexOf('key:') === 0) {
      const key = marker.slice(4).toLowerCase().replace(/[^a-z]/g, '');
      if (FORBIDDEN_KEYS.has(key)) { reason = pathName + ' is trainer-only content'; return; }
    }
  }, 'planner');
  if (reason) return reason;
  const serialized = JSON.stringify(value);
  if (FORBIDDEN_TEXT.test(serialized)) return 'planner contains a link, logo or personal handle';
  if (UNSAFE_ACTIVITY.test(serialized)) return 'planner contains an unsafe activity';
  return null;
}

function nonEmptyString(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

function validColor(value) {
  return Boolean(value && /^#[0-9a-f]{6}$/i.test(String(value.from || '')) &&
    /^#[0-9a-f]{6}$/i.test(String(value.to || '')) &&
    /^#[0-9a-f]{6}$/i.test(String(value.text || '')) &&
    Number.isFinite(Number(value.angle)));
}

function validatePlannerOutput(value, selection, allowed) {
  const planner = parseJSON(value);
  if (!planner || typeof planner !== 'object' || Array.isArray(planner)) {
    return { ok: false, reason: 'planner is not a JSON object' };
  }
  const unsafe = hasForbiddenContent(planner);
  if (unsafe) return { ok: false, reason: unsafe };

  const meta = planner.meta || {};
  const hero = planner.hero || {};
  const week = planner.week || {};
  const days = week.days;
  const home = planner.homeConnection || {};
  if (!nonEmptyString(meta.title) || meta.curriculumSlug !== selection.curriculumSlug ||
      meta.gradeSlug !== selection.gradeSlug || !nonEmptyString(meta.topic) ||
      !nonEmptyString(meta.ageBand) || !nonEmptyString(meta.theme) ||
      !nonEmptyString(meta.tone) || meta.promptVersion !== PROMPT_VERSION) {
    return { ok: false, reason: 'meta does not match the selected curriculum, grade and topic' };
  }
  /* Legacy math planners are accepted without a subject token. Coding and
     English are new, so their generated JSON must declare which one it is. */
  if (selection.subject && selection.subject !== 'math' && meta.subject !== selection.subject) {
    return { ok: false, reason: 'meta does not match the selected subject' };
  }
  if (!nonEmptyString(hero.title) || !nonEmptyString(hero.subtitle) ||
      !nonEmptyString(hero.emoji) || !validColor(hero.colorTheme) ||
      !COLOR_NAMES.has(String(hero.colorTheme.name))) {
    return { ok: false, reason: 'hero needs a title, emoji and one soft palette name' };
  }
  if (!Array.isArray(planner.standards) || planner.standards.length === 0) {
    return { ok: false, reason: 'standards must be a non-empty array' };
  }
  const allowedCodes = new Set(allowed.map(function (entry) { return entry.code; }));
  const badStandard = planner.standards.find(function (entry) {
    return !entry || !allowedCodes.has(entry.code);
  });
  if (badStandard) return { ok: false, reason: 'a standard code is not in the approved registry' };
  if (!Array.isArray(days) || days.length !== 5) {
    return { ok: false, reason: 'week must contain exactly five days' };
  }

  for (let index = 0; index < days.length; index += 1) {
    const day = days[index] || {};
    const narrativeReason = validateNarrative(day.narrative);
    if (narrativeReason) return { ok: false, reason: 'day ' + (index + 1) + ': ' + narrativeReason };
    if (!nonEmptyString(day.day) || !nonEmptyString(day.emoji)) {
      return { ok: false, reason: 'day ' + (index + 1) + ' needs a name and emoji' };
    }
    const activities = day.activities;
    if (!Array.isArray(activities) || activities.length < 4 || activities.length > 6) {
      return { ok: false, reason: 'day ' + (index + 1) + ' needs four to six blocks' };
    }
    const types = activities.map(function (activity) { return activity && activity.type; });
    if (types.indexOf('play') === -1 || types.indexOf('reflection') === -1) {
      return { ok: false, reason: 'day ' + (index + 1) + ' needs play and reflection' };
    }
    for (let block = 0; block < activities.length; block += 1) {
      const activity = activities[block] || {};
      const diff = activity.differentiation || {};
      if (!nonEmptyString(activity.title) || !nonEmptyString(activity.emoji) ||
          !nonEmptyString(activity.icon) || !nonEmptyString(activity.color) ||
          !Number.isFinite(Number(activity.durationMinutes)) ||
          !Array.isArray(activity.instructions) || activity.instructions.length === 0 ||
          !Array.isArray(activity.materials) || activity.materials.length === 0 ||
          !nonEmptyString(activity.iCan) || !nonEmptyString(diff.support) ||
          !nonEmptyString(diff.core) || !nonEmptyString(diff.stretch) ||
          !nonEmptyString(activity.observation) ||
          !Array.isArray(activity.standardCodes) || activity.standardCodes.length === 0) {
        return { ok: false, reason: 'day ' + (index + 1) + ' block ' + (block + 1) + ' is incomplete' };
      }
      if (Array.from(String(activity.emoji)).length > 4 || !/^[a-z0-9-]{1,32}$/.test(String(activity.icon))) {
        return { ok: false, reason: 'activity emoji/icon must each be a single mark' };
      }
      if (!COLOR_NAMES.has(String(activity.color))) {
        return { ok: false, reason: 'activity color must be one soft palette name' };
      }
      const childLines = [activity.iCan, activity.observation]
        .concat(activity.instructions, [diff.support, diff.core, diff.stretch]);
      if (childLines.some(function (line) { return wordsOf(line).length > 12; })) {
        return { ok: false, reason: 'day ' + (index + 1) + ' block ' + (block + 1) +
          ' has a sentence longer than twelve words' };
      }
      if (activity.standardCodes.some(function (code) { return !allowedCodes.has(code); })) {
        return { ok: false, reason: 'activity uses an unapproved standard code' };
      }
    }
  }

  if (!Array.isArray(planner.materialsMasterList) || planner.materialsMasterList.length === 0 ||
      !Array.isArray(planner.observationTracker) || planner.observationTracker.length === 0 ||
      !Array.isArray(planner.safetyNotes) || planner.safetyNotes.length === 0 ||
      !nonEmptyString(home.familyNote) || !Array.isArray(home.conversationStarters) ||
      home.conversationStarters.length === 0) {
    return { ok: false, reason: 'materials, observations, family note and safety notes are required' };
  }

  let emptyPath = null;
  walk(planner, function (pathName, marker) { if (marker === 'empty array' && !emptyPath) emptyPath = pathName; }, 'planner');
  if (emptyPath) return { ok: false, reason: emptyPath + ' must not be empty' };
  /* A compact proxy for the 5000-token ceiling: UTF-8 bytes stay below 20 KB. */
  if (Buffer.byteLength(JSON.stringify(planner), 'utf8') > 20000) {
    return { ok: false, reason: 'planner exceeds the 5000-token budget' };
  }

  return { ok: true, planner: planner };
}

/* Math fallback is intentionally unchanged: existing v1 planners stay byte-
   stable when a child has no coding/english subject on the profile. */
function buildMathFallback(selection, allowed) {
  const codes = allowed.map(function (entry) { return entry.code; });
  const materials = [
    { name: 'Soft balls', quantity: '2', preparation: 'Place them on a clean mat.' },
    { name: 'Paper squares', quantity: '5', preparation: 'Fold two squares in half.' },
    { name: 'Counting cups', quantity: '2', preparation: 'Set the cups side by side.' },
    { name: 'Washable markers', quantity: '2', preparation: 'Keep caps closed between turns.' },
    { name: 'Cloth cover', quantity: '1', preparation: 'Use a soft, clean cloth.' }
  ];
  const days = DAY_TEMPLATES.map(function (template, dayIndex) {
    const activities = [
      {
        id: 'd' + (dayIndex + 1) + '-play', type: 'play', title: template.theme,
        emoji: '🧩', icon: 'circle', color: COLORS[dayIndex % COLORS.length].name,
        durationMinutes: 7,
        instructions: ['Put the objects on a clean mat.', 'Ask your child to count out loud.', 'Praise careful looking.'],
        materials: [materials[0].name, materials[2].name],
        iCan: 'I can count with my hands.',
        differentiation: {
          support: 'Count together slowly.',
          core: 'Count up to six objects.',
          stretch: 'Ask what changes after one more.'
        },
        observation: 'Does the child count each object once?',
        standardCodes: [codes[dayIndex % codes.length]]
      },
      {
        id: 'd' + (dayIndex + 1) + '-story', type: 'story', title: template.story,
        emoji: '📖', icon: 'book', color: COLORS[(dayIndex + 1) % COLORS.length].name,
        durationMinutes: 6,
        instructions: ['Tell the short story slowly.', 'Pause after each count.', 'Let your child finish the last word.'],
        materials: [materials[1].name],
        iCan: 'I can listen for numbers.',
        differentiation: {
          support: 'Use fingers with the story.',
          core: 'Retell one number from the story.',
          stretch: 'Change one number in the story.'
        },
        observation: 'Can the child join the counting part?',
        standardCodes: [codes[(dayIndex + 1) % codes.length]]
      },
      {
        id: 'd' + (dayIndex + 1) + '-making', type: 'making', title: template.making,
        emoji: '🎨', icon: 'sparkles', color: COLORS[(dayIndex + 2) % COLORS.length].name,
        durationMinutes: 8,
        instructions: ['Draw the objects on paper.', 'Add one more with a marker.', 'Say how many are on the page.'],
        materials: [materials[1].name, materials[3].name],
        iCan: 'I can show a group by drawing.',
        differentiation: {
          support: 'Trace over a prepared dot.',
          core: 'Draw up to six marks.',
          stretch: 'Make two equal groups.'
        },
        observation: 'Does the drawing match the counted group?',
        standardCodes: [codes[(dayIndex + 2) % codes.length]]
      },
      {
        id: 'd' + (dayIndex + 1) + '-reflection', type: 'reflection', title: template.reflect,
        emoji: '💬', icon: 'reflect', color: COLORS[(dayIndex + 3) % COLORS.length].name,
        durationMinutes: 4,
        instructions: ['Ask what felt easy today.', 'Ask what felt tricky.', 'Clap for one brave try.'],
        materials: [materials[4].name],
        iCan: 'I can talk about what I did.',
        differentiation: {
          support: 'Offer two simple choices.',
          core: 'Name one thing you learned.',
          stretch: 'Explain how you checked your count.'
        },
        observation: 'Can the child name one strategy they used?',
        standardCodes: [codes[(dayIndex + 3) % codes.length]]
      }
    ];
    return {
      day: template.day,
      narrative: template.narrative,
      emoji: ['🧩', '🦆', '🧱', '🌱', '⭐'][dayIndex],
      activities: activities
    };
  });

  return {
    meta: {
      title: selection.theme.replace(/^./, function (letter) { return letter.toUpperCase(); }) + ' maths week',
      curriculumSlug: selection.curriculumSlug,
      curriculumLabel: selection.curriculumLabel,
      gradeSlug: selection.gradeSlug,
      gradeLabel: selection.gradeLabel,
      topic: selection.topic,
      ageBand: selection.ageBand,
      theme: selection.theme,
      tone: selection.tone,
      standardsFramework: selection.standardsFramework,
      promptVersion: PROMPT_VERSION
    },
    hero: {
      title: 'A gentle maths week',
      subtitle: 'Five short days of play, stories and talk.',
      emoji: '🌟',
      colorTheme: { name: COLORS[0].name, from: COLORS[0].from, to: COLORS[0].to, angle: 135, text: COLORS[0].text }
    },
    standards: allowed.slice(0, 5),
    week: { days: days },
    materialsMasterList: materials,
    observationTracker: [
      { id: 'obs-count', label: 'Counts objects once each', criteria: 'Touch or point while counting.', standardCodes: [codes[0]] },
      { id: 'obs-match', label: 'Matches a drawing to a group', criteria: 'Draws one mark for each object.', standardCodes: [codes[1]] },
      { id: 'obs-talk', label: 'Explains a simple choice', criteria: 'Uses a short sentence about the task.', standardCodes: [codes[2]] },
      { id: 'obs-enjoy', label: 'Joins the story counting', criteria: 'Says a number at the pause.', standardCodes: [codes[3]] }
    ],
    homeConnection: {
      title: 'Family note',
      familyNote: 'This week we counted, drew and talked about small groups. Keep practice short and happy. Stop while your child still wants one more turn.',
      conversationStarters: [
        'What did you count today?',
        'Can you show me two objects at home?',
        'Which part felt fun?'
      ],
      printLabel: 'Print family note'
    },
    safetyNotes: [
      { title: 'Use safe objects', detail: 'Choose soft, clean objects that fit in one hand.' },
      { title: 'Stay close', detail: 'An adult stays nearby and pours or moves materials.' },
      { title: 'Keep it kind', detail: 'Stop if your child feels tired or frustrated.' }
    ]
  };
}

const CODING_DAYS = [
  {
    day: 'Monday', narrative: 'Mia puts red cards in a row. Sam adds one blue card. The row grows.',
    emoji: '🃏', theme: 'Step cards', story: 'The lost button', making: 'Draw a step map', reflect: 'Say the next step'
  },
  {
    day: 'Tuesday', narrative: 'A toy bear hides under a hat. Riya looks in three places. She finds it there.',
    emoji: '🧸', theme: 'Hide and seek', story: 'Bear under the hat', making: 'Make a choice card', reflect: 'Name two choices'
  },
  {
    day: 'Wednesday', narrative: 'Four beads sit on a string. Dev adds one more bead. The pattern repeats.',
    emoji: '🔵', theme: 'Bead repeat', story: 'The bead train', making: 'Draw a repeat', reflect: 'Show the pattern'
  },
  {
    day: 'Thursday', narrative: 'A paper robot needs three jobs. Zara gives each job a name. The jobs work well.',
    emoji: '🤖', theme: 'Robot jobs', story: 'The tiny helper', making: 'Build a paper bot', reflect: 'Explain one job'
  },
  {
    day: 'Friday', narrative: 'One card has a wrong step. Arjun finds the bad step. He fixes it with a grin.',
    emoji: '🐞', theme: 'Bug hunt', story: 'The mixed-up map', making: 'Fix a step map', reflect: 'Tell how you fixed it'
  }
];

const ENGLISH_DAYS = [
  {
    day: 'Monday', narrative: 'Leo reads a short note. He circles one new word. Then he says it aloud.',
    emoji: '📄', theme: 'Word hunt', story: 'A note from home', making: 'Write one line', reflect: 'Say your new word'
  },
  {
    day: 'Tuesday', narrative: 'Maya listens to a short tale. She names one kind act. Then she tells her friend.',
    emoji: '👂', theme: 'Listen and tell', story: 'The kind little dog', making: 'Draw a thought bubble', reflect: 'Tell one kind act'
  },
  {
    day: 'Wednesday', narrative: 'A picture shows a rainy park. Sam says three things. His words paint the scene.',
    emoji: '🖼️', theme: 'Picture talk', story: 'The rainy park', making: 'Write a caption', reflect: 'Read your caption'
  },
  {
    day: 'Thursday', narrative: 'Nina stands tall and speaks. Her voice is clear. The room hears her idea.',
    emoji: '🎤', theme: 'Clear voice', story: 'The class meeting', making: 'Make a speaking card', reflect: 'Say one idea aloud'
  },
  {
    day: 'Friday', narrative: 'A story has a happy end. Ari changes one part. Now the ending feels new.',
    emoji: '✨', theme: 'New ending', story: 'The little kite', making: 'Write a new end', reflect: 'Explain your ending'
  }
];

function subjectActivity(dayIndex, blockIndex, type, codes, copy) {
  const color = COLORS[(dayIndex + blockIndex) % COLORS.length].name;
  return {
    id: 'd' + (dayIndex + 1) + '-' + type,
    type: type,
    title: copy.title,
    emoji: copy.emoji,
    icon: copy.icon,
    color: color,
    durationMinutes: copy.minutes,
    instructions: copy.instructions.slice(),
    materials: copy.materials.slice(),
    iCan: copy.iCan,
    differentiation: {
      support: copy.support,
      core: copy.core,
      stretch: copy.stretch
    },
    observation: copy.observation,
    standardCodes: [codes[(dayIndex + blockIndex) % codes.length]]
  };
}

function buildSubjectFallback(selection, allowed, subject) {
  const coding = subject === 'coding';
  const templates = coding ? CODING_DAYS : ENGLISH_DAYS;
  const codes = allowed.map(function (entry) { return entry.code; });
  const materials = coding
    ? [
        { name: 'Paper cards', quantity: '6', preparation: 'Write one step on each card.' },
        { name: 'Soft pencil', quantity: '1', preparation: 'Keep it ready for drawing.' },
        { name: 'Colour dots', quantity: '5', preparation: 'Place them in a clear row.' }
      ]
    : [
        { name: 'Short note', quantity: '1', preparation: 'Choose two clear lines to read.' },
        { name: 'Picture card', quantity: '1', preparation: 'Pick a simple scene with people.' },
        { name: 'Soft pencil', quantity: '1', preparation: 'Keep it ready for writing.' }
      ];
  const blocksFor = function (template, dayIndex) {
    if (coding) {
      return [
        subjectActivity(dayIndex, 0, 'play', codes, {
          title: template.theme, emoji: '🧩', icon: 'cards', minutes: 7,
          instructions: ['Put three cards in a row.', 'Ask what comes next.', 'Say the steps out loud.'],
          materials: ['Paper cards'], iCan: 'I can put steps in order.',
          support: 'Use two cards only.', core: 'Use three cards in order.',
          stretch: 'Add one extra step.', observation: 'Can the child name the next step?'
        }),
        subjectActivity(dayIndex, 1, 'story', codes, {
          title: template.story, emoji: '📖', icon: 'book', minutes: 6,
          instructions: ['Tell a tiny story about a lost button.', 'Pause before the last step.', 'Let your child guess it.'],
          materials: ['Paper cards'], iCan: 'I can follow a story in steps.',
          support: 'Retell one step.', core: 'Guess the last step.',
          stretch: 'Change one step in the story.', observation: 'Can the child follow the story order?'
        }),
        subjectActivity(dayIndex, 2, 'making', codes, {
          title: template.making, emoji: '🛠️', icon: 'sparkles', minutes: 8,
          instructions: ['Draw a map with three steps.', 'Add one turn to the map.', 'Trace the steps with a finger.'],
          materials: ['Soft pencil', 'Paper cards'], iCan: 'I can draw clear steps.',
          support: 'Draw two steps together.', core: 'Draw three clear steps.',
          stretch: 'Add one choice to the map.', observation: 'Does the drawing show each step?'
        }),
        subjectActivity(dayIndex, 3, 'reflection', codes, {
          title: template.reflect, emoji: '💬', icon: 'reflect', minutes: 4,
          instructions: ['Ask which step felt fun.', 'Ask which step was hard.', 'Cheer one careful try.'],
          materials: ['Colour dots'], iCan: 'I can talk about my steps.',
          support: 'Offer two simple choices.', core: 'Name one step you liked.',
          stretch: 'Explain how you fixed a step.', observation: 'Can the child name one step they used?'
        })
      ];
    }
    return [
      subjectActivity(dayIndex, 0, 'play', codes, {
        title: template.theme, emoji: '🗣️', icon: 'voice', minutes: 7,
        instructions: ['Say your name in a loud voice.', 'Pass a made-up word around.', 'Clap for each clear voice.'],
        materials: ['Short note'], iCan: 'I can say a word clearly.',
        support: 'Say one word together.', core: 'Say one word aloud.',
        stretch: 'Say a short phrase aloud.', observation: 'Can the child speak clearly?'
      }),
      subjectActivity(dayIndex, 1, 'story', codes, {
        title: template.story, emoji: '📖', icon: 'book', minutes: 6,
        instructions: ['Read two lines from the note.', 'Ask what the sentence tells us.', 'Say it again with feeling.'],
        materials: ['Short note'], iCan: 'I can read a short line.',
        support: 'Read one line together.', core: 'Read two short lines.',
        stretch: 'Read with a happy voice.', observation: 'Can the child read the line?'
      }),
      subjectActivity(dayIndex, 2, 'making', codes, {
        title: template.making, emoji: '✏️', icon: 'pencil', minutes: 8,
        instructions: ['Write one line about the picture.', 'Add one describing word.', 'Underline your best phrase.'],
        materials: ['Picture card', 'Soft pencil'], iCan: 'I can write one clear line.',
        support: 'Copy one short line.', core: 'Write one line alone.',
        stretch: 'Add one more detail.', observation: 'Does the line match the picture?'
      }),
      subjectActivity(dayIndex, 3, 'reflection', codes, {
        title: template.reflect, emoji: '💬', icon: 'reflect', minutes: 4,
        instructions: ['Ask what was easy to read.', 'Ask what to say next time.', 'Praise one brave speaker.'],
        materials: ['Picture card'], iCan: 'I can talk about my writing.',
        support: 'Choose from two ideas.', core: 'Name one thing you wrote.',
        stretch: 'Explain one word you chose.', observation: 'Can the child share one idea?'
      })
    ];
  };

  const days = templates.map(function (template, dayIndex) {
    return {
      day: template.day,
      narrative: template.narrative,
      emoji: template.emoji,
      activities: blocksFor(template, dayIndex)
    };
  });

  return {
    meta: {
      title: selection.theme.replace(/^./, function (letter) { return letter.toUpperCase(); }) +
        ' ' + (coding ? 'coding' : 'communication') + ' week',
      subject: subject,
      curriculumSlug: selection.curriculumSlug,
      curriculumLabel: selection.curriculumLabel,
      gradeSlug: selection.gradeSlug,
      gradeLabel: selection.gradeLabel,
      topic: selection.topic,
      ageBand: selection.ageBand,
      theme: selection.theme,
      tone: selection.tone,
      standardsFramework: allowed.length && allowed[0].framework
        ? allowed[0].framework
        : subjects.get(subject).label + ' skills',
      promptVersion: PROMPT_VERSION
    },
    hero: {
      title: coding ? 'A gentle code week' : 'A gentle speaking week',
      subtitle: coding ? 'Five short days of steps and play.' : 'Five short days of reading and talk.',
      emoji: coding ? '💻' : '🎤',
      colorTheme: { name: COLORS[0].name, from: COLORS[0].from, to: COLORS[0].to, angle: 135, text: COLORS[0].text }
    },
    standards: allowed.slice(0, 5),
    week: { days: days },
    materialsMasterList: materials,
    observationTracker: [
      {
        id: 'obs-main',
        label: coding ? 'Puts steps in order' : 'Reads and says a clear line',
        criteria: coding ? 'Names each step before moving on.' : 'Reads one line without rushing.',
        standardCodes: [codes[0]]
      },
      {
        id: 'obs-make',
        label: coding ? 'Draws a simple step map' : 'Writes one clear line',
        criteria: coding ? 'Shows three ordered steps.' : 'Uses one line about a picture.',
        standardCodes: [codes[1]]
      },
      {
        id: 'obs-talk',
        label: coding ? 'Explains one fix' : 'Shares one idea aloud',
        criteria: coding ? 'Says what changed in the map.' : 'Speaks in a clear voice.',
        standardCodes: [codes[2]]
      }
    ],
    homeConnection: {
      title: 'Family note',
      familyNote: coding
        ? 'This week we played with steps, choices and tiny fixes. Keep each task short and stop while your child wants one more turn.'
        : 'This week we read short lines, wrote one clear line and spoke aloud. Keep practice warm and stop while your child wants one more turn.',
      conversationStarters: coding
        ? ['What step came first?', 'What did you change?', 'Which part felt fun?']
        : ['What did you read today?', 'Which word did you use?', 'Which part felt fun?'],
      printLabel: 'Print family note'
    },
    safetyNotes: [
      { title: 'Use safe objects', detail: 'Choose soft, clean objects that fit in one hand.' },
      { title: 'Stay close', detail: 'An adult stays nearby during each short task.' },
      { title: 'Keep it kind', detail: 'Stop if your child feels tired or frustrated.' }
    ]
  };
}

function buildFallback(selection, allowed) {
  if (selection.subject === 'coding' || selection.subject === 'english') {
    return buildSubjectFallback(selection, allowed, selection.subject);
  }
  return buildMathFallback(selection, allowed);
}

function buildResponse(record, hit, source) {
  return {
    planner: copy(record.planner),
    cache: {
      topic: record.topic || null,
      subject: record.subject || 'math',
      cacheKey: record.cacheKey,
      version: record.version,
      promptVersion: record.promptVersion,
      generatedAt: record.generatedAt,
      provider: record.provider,
      temperature: record.temperature,
      seed: record.seed,
      hit: Boolean(hit),
      source: source
    }
  };
}

async function store(record) {
  const result = await db.insertWeeklyPlannerCache(record);
  return result && result.record ? result.record : record;
}

async function pointerVersion(selection) {
  const pointer = await db.findWeeklyPlannerPointer(
    pointerKeyFor(selection.curriculumSlug, selection.gradeSlug, selection.subject)
  );
  return Number(pointer && pointer.version) || FIRST_VERSION;
}

async function getOrCreate(input, options) {
  const settings = options || {};
  const selection = resolveSelection(input);
  /* Normal reads follow the founder-controlled active pointer. An explicit
     version is used only by the founder's regenerate/edit flow. */
  const version = Number(settings.version) || await pointerVersion(selection);
  const cacheKey = cacheKeyFor(selection.curriculumSlug, selection.gradeSlug, version, selection.subject);
  const seed = seedFor(cacheKey);

  if (!settings.force) {
    const cached = await db.findWeeklyPlannerCache(cacheKey);
    if (cached && cached.planner) return buildResponse(cached, true, 'cache');
  }

  const allowed = allowedStandards(selection);
  const userPrompt = buildUserPrompt(selection, allowed);
  let lastReason = 'AI did not return valid planner JSON.';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const providerOut = {};
    try {
      const generated = await ai.generateAIResponse(SYSTEM_PROMPT, userPrompt, {
        jsonOnly: true,
        allowFallback: !config.isProduction,
        temperature: TEMPERATURE,
        seed: seed,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        providerOut: providerOut
      });
      if (generated === null || generated === undefined || generated === '') {
        lastReason = 'AI provider was unavailable.';
        continue;
      }
      const checked = validatePlannerOutput(generated, selection, allowed);
      if (!checked.ok) {
        lastReason = checked.reason;
        continue;
      }
      const record = {
        cacheKey: cacheKey,
        subject: selection.subject,
        subjectLabel: selection.subjectLabel,
        curriculumSlug: selection.curriculumSlug,
        gradeSlug: selection.gradeSlug,
        topic: selection.topic,
        version: version,
        promptVersion: PROMPT_VERSION,
        temperature: TEMPERATURE,
        seed: seed,
        provider: providerOut.provider || 'unknown',
        model: providerOut.model || null,
        generatedAt: new Date().toISOString(),
        planner: checked.planner
      };
      const stored = await store(record);
      return buildResponse(stored, false, 'ai');
    } catch (error) {
      lastReason = error && error.message ? error.message : lastReason;
    }
  }

  if (config.isProduction) {
    throw fail('Weekly planner generation failed: ' + lastReason, 'PLANNER_GENERATION_FAILED', 502);
  }

  const fallbackRecord = {
    cacheKey: cacheKey,
    subject: selection.subject,
    subjectLabel: selection.subjectLabel,
    curriculumSlug: selection.curriculumSlug,
    gradeSlug: selection.gradeSlug,
    topic: selection.topic,
    version: version,
    promptVersion: PROMPT_VERSION,
    temperature: TEMPERATURE,
    seed: seed,
    provider: 'deterministic-default',
    model: null,
    generatedAt: new Date().toISOString(),
    planner: buildFallback(selection, allowed)
  };
  const storedFallback = await store(fallbackRecord);
  return buildResponse(storedFallback, false, 'default');
}

async function archiveActive(selection, actorId) {
  const currentVersion = await pointerVersion(selection);
  const currentKey = cacheKeyFor(
    selection.curriculumSlug, selection.gradeSlug, currentVersion, selection.subject
  );
  const previous = await db.findWeeklyPlannerCache(currentKey);
  if (previous) {
    await db.archiveWeeklyPlannerCache(Object.assign({}, previous, {
      archivedAt: new Date().toISOString(),
      archivedBy: actorId || null
    }));
  }
  return currentVersion;
}

async function movePointer(selection, version, cacheKey, actorId) {
  await db.saveWeeklyPlannerPointer({
    pointerKey: pointerKeyFor(selection.curriculumSlug, selection.gradeSlug, selection.subject),
    subject: selection.subject,
    curriculumSlug: selection.curriculumSlug,
    gradeSlug: selection.gradeSlug,
    version: version,
    activeCacheKey: cacheKey,
    updatedAt: new Date().toISOString(),
    updatedBy: actorId || null
  });
}

/* Founder-only regeneration: archive the active immutable record, generate a
   new version and move the pointer. Trainers cannot reach this operation. */
async function regenerate(input, actorId) {
  const selection = resolveSelection(input);
  const currentVersion = await archiveActive(selection, actorId);
  const nextVersion = currentVersion + 1;
  const result = await getOrCreate(selection, { force: true, version: nextVersion });
  await movePointer(selection, nextVersion, result.cache.cacheKey, actorId);
  return result;
}

/* Founder-only manual edit. The edit is a new immutable version, never an
   in-place overwrite of the generated JSON. */
async function editPlanner(input, actorId) {
  const selection = resolveSelection(input);
  const allowed = allowedStandards(selection);
  const checked = validatePlannerOutput(input.planner, selection, allowed);
  if (!checked.ok) {
    throw fail('Founder edit is invalid: ' + checked.reason, 'INVALID_PLANNER', 400);
  }
  const currentVersion = await archiveActive(selection, actorId);
  const nextVersion = currentVersion + 1;
  const editedKey = cacheKeyFor(
    selection.curriculumSlug, selection.gradeSlug, nextVersion, selection.subject
  );
  const record = {
    cacheKey: editedKey,
    subject: selection.subject,
    subjectLabel: selection.subjectLabel,
    curriculumSlug: selection.curriculumSlug,
    gradeSlug: selection.gradeSlug,
    topic: selection.topic,
    version: nextVersion,
    promptVersion: PROMPT_VERSION,
    temperature: TEMPERATURE,
    seed: seedFor(editedKey),
    provider: 'founder-edit',
    model: null,
    generatedAt: new Date().toISOString(),
    editedAt: new Date().toISOString(),
    editedBy: actorId || null,
    planner: checked.planner
  };
  const stored = await store(record);
  await movePointer(selection, nextVersion, stored.cacheKey, actorId);
  return buildResponse(stored, false, 'founder-edit');
}

async function activeVersion(input) {
  return pointerVersion(resolveSelection(input));
}

module.exports = {
  PROMPT_VERSION: PROMPT_VERSION,
  TEMPERATURE: TEMPERATURE,
  MAX_ATTEMPTS: MAX_ATTEMPTS,
  SYSTEM_PROMPT: SYSTEM_PROMPT,
  cacheKeyFor: cacheKeyFor,
  pointerKeyFor: pointerKeyFor,
  seedFor: seedFor,
  resolveSelection: resolveSelection,
  allowedStandards: allowedStandards,
  buildUserPrompt: buildUserPrompt,
  buildFallback: buildFallback,
  validatePlannerOutput: validatePlannerOutput,
  fleschKincaidGrade: fleschKincaidGrade,
  getOrCreate: getOrCreate,
  regenerate: regenerate,
  editPlanner: editPlanner,
  activeVersion: activeVersion
};
