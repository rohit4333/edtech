/* Mathify curriculum catalogue for the LMS auto-planner.
 *
 * One registry owns the board choices and the grade choices that belong to
 * each board. The browser receives a sanitized copy; the server uses the same
 * registry to normalize a child's registered curriculum and grade into stable
 * slug keys. Unknown/local systems are represented by an explicit fallback so
 * the LMS never has to invent a board or a grade.
 */

const LEGACY_PROFILES = {
  CBSE: {
    country: 'India',
    style: 'NCERT textbook-aligned, step-by-step proofs, Indian real-life examples',
    notation: 'Indian number system (lakhs/crores), metric units, ₹ (Rupees)',
    pedagogy: 'Concept-first, then application. Heavy on NCERT exercises.',
    illustrationContext: 'Use Indian context (rupees, cricket, Indian festivals, local geography).'
  },
  ICSE: {
    country: 'India',
    style: 'Detailed, emphasis on analytical thinking, richer vocabulary',
    notation: 'Indian number system, metric units, ₹ (Rupees)',
    pedagogy: 'Deeper conceptual understanding, longer word problems.',
    illustrationContext: 'Use Indian context (rupees, cricket, Indian festivals, local geography).'
  },
  IB: {
    country: 'International',
    style: 'Inquiry-based, real-world applications, global context',
    notation: 'International standard, SI units',
    pedagogy: 'Conceptual, interdisciplinary, encourages student questioning.',
    illustrationContext: 'Use global context (UN SDGs, international scenarios, diverse cultures).'
  },
  IGCSE: {
    country: 'International (British)',
    style: 'British curriculum, structured progression, exam-focused',
    notation: 'British English spelling (colour, centre), metric units, £ (Pounds)',
    pedagogy: 'Clear learning objectives, past-paper style questions.',
    illustrationContext: 'Use culturally relevant examples for International (British).'
  },
  'Common Core': {
    country: 'USA',
    style: 'American curriculum, emphasis on mathematical practices and reasoning',
    notation: 'US customary + metric, $ (Dollars)',
    pedagogy: 'Problem-solving first, multiple solution methods encouraged.',
    illustrationContext: 'Use American context (dollars, miles, US geography, baseball/football).'
  },
  'British National': {
    country: 'UK',
    style: 'Key Stage aligned, structured progression',
    notation: 'British English, £ (Pounds), metric',
    pedagogy: 'Mastery approach, clear step-by-step progression.',
    illustrationContext: 'Use culturally relevant examples for UK.'
  },
  Ontario: {
    country: 'Canada',
    style: 'Canadian curriculum, inclusive examples',
    notation: 'Metric, $ (Canadian Dollars)',
    pedagogy: 'Discovery-based, collaborative problem-solving.',
    illustrationContext: 'Use culturally relevant examples for Canada.'
  }
};

const FAMILIES = {
  indian: {
    style: 'Textbook-aligned, step-by-step number work with Indian examples',
    notation: 'Indian number system, metric units, ₹ (Rupees)',
    pedagogy: 'Concept first, then guided practice and application.',
    standardsFramework: 'NCERT mathematics strands'
  },
  international: {
    style: 'Inquiry-led, real-world applications with global context',
    notation: 'International standard, SI units',
    pedagogy: 'Conceptual, playful and discussion-led.',
    standardsFramework: 'International early-years mathematics strands'
  },
  american: {
    style: 'Mathematical practices, reasoning and multiple solution paths',
    notation: 'US customary + metric, $ (Dollars)',
    pedagogy: 'Problem-solving first, then precise practice.',
    standardsFramework: 'Common Core State Standards for Mathematics'
  },
  british: {
    style: 'Key Stage and early-years aligned, structured progression',
    notation: 'British English, £ (Pounds), metric',
    pedagogy: 'Mastery approach with clear small steps.',
    standardsFramework: 'UK early-years and National Curriculum mathematics strands'
  },
  middleEast: {
    style: 'Ministry-aligned number work with local, family-safe contexts',
    notation: 'Metric units, local currency where appropriate',
    pedagogy: 'Concrete materials first, then drawing and symbols.',
    standardsFramework: 'Ministry early-years mathematics strands'
  },
  eastAsian: {
    style: 'Precise, practice-led progression with strong number sense',
    notation: 'Metric units, local currency',
    pedagogy: 'Concrete-pictorial-abstract sequence with careful repetition.',
    standardsFramework: 'National early-years mathematics strands'
  },
  european: {
    style: 'Playful, language-rich mathematics in familiar local settings',
    notation: 'Metric units, local currency',
    pedagogy: 'Hands-on exploration followed by short teacher-led practice.',
    standardsFramework: 'National early-years mathematics strands'
  },
  african: {
    style: 'Resource-light, oral and practical mathematics with local contexts',
    notation: 'Metric units, local currency',
    pedagogy: 'Concrete objects, songs and stories before symbols.',
    standardsFramework: 'National early-years mathematics strands'
  },
  latinAmerican: {
    style: 'Warm, story-led mathematics using everyday family contexts',
    notation: 'Metric units, local currency',
    pedagogy: 'Play, talk and drawing before formal notation.',
    standardsFramework: 'National early-years mathematics strands'
  },
  local: {
    style: 'Flexible local-board alignment with universally safe examples',
    notation: 'Metric units, local currency where appropriate',
    pedagogy: 'Concrete, playful, short steps with frequent recall.',
    standardsFramework: 'Mathify global early-years mathematics strands'
  }
};

const THEMES = {
  indian: ['market day', 'monsoon shapes', 'festival lanterns', 'garden counting'],
  international: ['space picnic', 'tidy toy shop', 'rainbow garden', 'little explorer trail'],
  american: ['classroom pet shop', 'rainy day buses', 'backyard trail', 'community helpers'],
  british: ['seaside shells', 'rainy playground', 'storybook castle', 'garden birds'],
  middleEast: ['desert stars', 'date-palm garden', 'market baskets', 'kite day'],
  eastAsian: ['paper lanterns', 'temple garden', 'train station', 'seasonal festivals'],
  european: ['village bakery', 'forest walk', 'bicycle ride', 'market square'],
  african: ['market baskets', 'drum patterns', 'savannah shapes', 'water and wheels'],
  latinAmerican: ['fruit stall', 'carnival patterns', 'family kitchen', 'butterfly garden'],
  local: ['toy box treasure', 'neighbourhood walk', 'kitchen counting', 'shape hunt']
};

const TONES = {
  indian: 'warm, playful and respectful',
  international: 'curious, kind and globally aware',
  american: 'encouraging, energetic and practical',
  british: 'calm, gentle and story-led',
  middleEast: 'warm, hospitable and gentle',
  eastAsian: 'calm, precise and encouraging',
  european: 'friendly, exploratory and calm',
  african: 'rhythmic, communal and practical',
  latinAmerican: 'warm, expressive and playful',
  local: 'gentle, concrete and reassuring'
};

function grade(slug, label, group, band, aliases) {
  const list = [slug, label].concat(aliases || []).map(normalizeToken).filter(Boolean);
  return { slug: slug, label: label, group: group, band: band, aliases: Array.from(new Set(list)) };
}

function normalizeToken(value) {
  return String(value === null || value === undefined ? '' : value)
    .toLowerCase().replace(/[\r\n\t]+/g, ' ').replace(/[^a-z0-9+#./ -]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function numbered(prefix, labelPrefix, count, options) {
  const settings = options || {};
  const group = settings.group || 'Primary';
  const bandFor = settings.bandFor || function () { return '6–8 years'; };
  const aliasFor = settings.aliasFor || function (index) { return [String(index), 'grade ' + index]; };
  const list = [];
  for (let index = 1; index <= count; index += 1) {
    list.push(grade(prefix + '-' + index, labelPrefix + ' ' + index, group, bandFor(index), aliasFor(index)));
  }
  return list;
}

function earlyYears() {
  return [
    grade('pre-nursery', 'Pre-Nursery', 'Early years', '3–4 years', ['nursery 0', 'pre nursery']),
    grade('nursery', 'Nursery', 'Early years', '3–5 years', ['nursery 1', 'pre-primary']),
    grade('kg-1', 'Junior KG', 'Early years', '4–5 years', ['kg1', 'junior kg', 'lower kg', 'lkg']),
    grade('kg-2', 'Senior KG', 'Early years', '5–6 years', ['kg2', 'senior kg', 'upper kg', 'ukg'])
  ];
}

function bandForGrade(index) {
  if (index <= 2) return '6–8 years';
  if (index <= 5) return '8–11 years';
  if (index <= 8) return '11–14 years';
  return '14–17 years';
}

const GRADE_SETS = {
  indian: earlyYears().concat(numbered('class', 'Class', 12, { bandFor: bandForGrade })),
  international: [
    grade('early-years', 'Early Years', 'Early years', '4–6 years', ['foundation', 'pre-primary'])
  ].concat(numbered('grade', 'Grade', 12, { bandFor: bandForGrade })),
  american: [
    grade('pre-k', 'Pre-K', 'Early years', '3–4 years', ['prekindergarten', 'preschool']),
    grade('kindergarten', 'Kindergarten', 'Early years', '4–5 years', ['kg', 'k'])
  ].concat(numbered('grade', 'Grade', 12, { bandFor: bandForGrade })),
  british: [
    grade('reception', 'Reception', 'Early years', '4–5 years', ['eyfs', 'foundation stage'])
  ].concat(numbered('year', 'Year', 13, {
    bandFor: function (index) {
      if (index <= 2) return '5–7 years';
      if (index <= 6) return '7–11 years';
      if (index <= 9) return '11–14 years';
      return '14–18 years';
    },
    aliasFor: function (index) {
      const aliases = [String(index - 1), 'year ' + index, 'grade ' + (index - 1)];
      if (index === 13) aliases.push('grade 12', '12');
      return aliases;
    }
  })),
  ib: [
    grade('pyp-1', 'PYP 1', 'Early years', '4–5 years', ['pre-k', 'kindergarten', 'k']),
    grade('pyp-2', 'PYP 2', 'Early years', '5–6 years', ['grade 1', '1']),
    grade('pyp-3', 'PYP 3', 'Lower primary', '6–7 years', ['grade 2', '2']),
    grade('pyp-4', 'PYP 4', 'Lower primary', '7–8 years', ['grade 3', '3']),
    grade('pyp-5', 'PYP 5', 'Upper primary', '8–9 years', ['grade 4', '4']),
    grade('pyp-6', 'PYP 6', 'Upper primary', '9–10 years', ['grade 5', '5']),
    grade('myp-1', 'MYP 1', 'Middle years', '10–11 years', ['grade 6', '6']),
    grade('myp-2', 'MYP 2', 'Middle years', '11–12 years', ['grade 7', '7']),
    grade('myp-3', 'MYP 3', 'Middle years', '12–13 years', ['grade 8', '8']),
    grade('myp-4', 'MYP 4', 'Middle years', '13–14 years', ['grade 9', '9']),
    grade('myp-5', 'MYP 5', 'Middle years', '14–15 years', ['grade 10', '10']),
    grade('dp-1', 'DP 1', 'Diploma', '15–16 years', ['grade 11', '11']),
    grade('dp-2', 'DP 2', 'Diploma', '16–17 years', ['grade 12', '12'])
  ],
  singapore: [
    grade('preschool-1', 'Preschool 1', 'Early years', '3–4 years', ['nursery']),
    grade('preschool-2', 'Preschool 2', 'Early years', '4–5 years', ['kindergarten']),
    grade('preschool-3', 'Preschool 3', 'Early years', '5–6 years', ['kg'])
  ].concat(numbered('primary', 'Primary', 6, {
    group: 'Primary',
    bandFor: function (index) { return (5 + index) + '–' + (6 + index) + ' years'; },
    aliasFor: function (index) { return [String(index), 'grade ' + index]; }
  }), numbered('secondary', 'Secondary', 5, {
    group: 'Secondary',
    bandFor: function (index) { return (11 + index) + '–' + (12 + index) + ' years'; },
    aliasFor: function (index) { return [String(index + 6), 'grade ' + (index + 6)]; }
  }), [
    grade('jc-1', 'Junior College 1', 'Pre-university', '16–17 years', ['grade 11', '11']),
    grade('jc-2', 'Junior College 2', 'Pre-university', '17–18 years', ['grade 12', '12'])
  ]),
  japan: [
    grade('preschool', 'Preschool', 'Early years', '3–5 years', ['nursery', 'kindergarten'])
  ].concat(numbered('elementary', 'Elementary', 6, {
    bandFor: function (index) { return (5 + index) + '–' + (6 + index) + ' years'; },
    aliasFor: function (index) { return [String(index), 'grade ' + index]; }
  }), numbered('junior-high', 'Junior High', 3, {
    group: 'Lower secondary',
    bandFor: function (index) { return (11 + index) + '–' + (12 + index) + ' years'; },
    aliasFor: function (index) { return [String(index + 6), 'grade ' + (index + 6)]; }
  }), numbered('high-school', 'High School', 3, {
    group: 'Upper secondary',
    bandFor: function (index) { return (14 + index) + '–' + (15 + index) + ' years'; },
    aliasFor: function (index) { return [String(index + 9), 'grade ' + (index + 9)]; }
  })),
  china: [
    grade('kindergarten', 'Kindergarten', 'Early years', '4–6 years', ['kg', 'preschool'])
  ].concat(numbered('grade', 'Grade', 12, { bandFor: bandForGrade })),
  ministry: [
    grade('kg-1', 'KG 1', 'Early years', '4–5 years', ['kg1', 'kindergarten 1']),
    grade('kg-2', 'KG 2', 'Early years', '5–6 years', ['kg2', 'kindergarten 2'])
  ].concat(numbered('grade', 'Grade', 12, { bandFor: bandForGrade }))
};

const CURRICULUM_DEFS = [
  ['cbse', 'CBSE — India', 'India', 'indian', 'CBSE', ['cbse', 'ncert', 'central board of secondary education', 'india cbse']],
  ['icse', 'ICSE / ISC — India', 'India', 'indian', 'ICSE', ['icse', 'isc', 'indian certificate of secondary education']],
  ['ib', 'IB — International Baccalaureate', 'International', 'international', 'IB', ['ib', 'ibdp', 'pyp', 'myp', 'international baccalaureate']],
  ['igcse', 'IGCSE / Cambridge (International)', 'International', 'british', 'IGCSE', ['igcse', 'igsce', 'cambridge', 'cie', 'pearson edexcel international']],
  ['common-core', 'Common Core — United States', 'United States', 'american', 'Common Core', ['us', 'usa', 'united states', 'common core', 'ccss', 'us common core']],
  ['us-state', 'US state standards', 'United States', 'american', 'Common Core', ['us state', 'state standards', 'us state standards', 'flipstandards']],
  ['uk-national', 'National Curriculum — England & UK', 'United Kingdom', 'british', 'British National', ['uk', 'england', 'united kingdom', 'british national', 'gcse', 'national curriculum']],
  ['scotland', 'Curriculum for Excellence — Scotland', 'Scotland', 'british', 'British National', ['scotland', 'scottish']],
  ['wales', 'Curriculum for Wales', 'Wales', 'british', 'British National', ['wales', 'welsh']],
  ['ireland', 'Primary Mathematics Curriculum — Ireland', 'Ireland', 'european', 'Irish National Curriculum', ['ireland', 'irish']],
  ['ontario', 'Ontario Mathematics — Canada', 'Canada', 'american', 'Ontario', ['ontario', 'canada', 'canadian']],
  ['british-columbia', 'BC Curriculum — Canada', 'Canada', 'american', 'British Columbia Curriculum', ['bc', 'british columbia', 'canada bc']],
  ['uae-ministry', 'UAE Ministry of Education', 'United Arab Emirates', 'middleEast', 'UAE Ministry of Education', ['uae', 'united arab emirates', 'uae national', 'moet', 'ministry of education uae']],
  ['dubai-private', 'Dubai private schools (KHDA)', 'United Arab Emirates', 'middleEast', 'Dubai KHDA', ['dubai', 'khda', 'dubai private', 'uae dubai']],
  ['uae-cbse', 'CBSE — UAE', 'United Arab Emirates', 'indian', 'CBSE UAE', ['uae cbse', 'cbse uae']],
  ['uae-igcse', 'IGCSE — UAE', 'United Arab Emirates', 'british', 'IGCSE UAE', ['uae igcse', 'igcse uae', 'cambridge uae']],
  ['uae-british', 'British curriculum — UAE', 'United Arab Emirates', 'british', 'British UAE', ['uae british', 'british uae', 'uk uae']],
  ['uae-american', 'American curriculum — UAE', 'United Arab Emirates', 'american', 'American UAE', ['uae american', 'american uae', 'us uae']],
  ['uae-ib', 'IB — UAE', 'United Arab Emirates', 'international', 'IB UAE', ['uae ib', 'ib uae']],
  ['saudi-national', 'Saudi National Curriculum', 'Saudi Arabia', 'middleEast', 'Saudi National Curriculum', ['saudi', 'saudia', 'saudi arabia', 'ksa']],
  ['singapore-moe', 'Singapore MOE', 'Singapore', 'eastAsian', 'Singapore MOE', ['singapore', 'moe singapore', 'singapore maths']],
  ['japan-mext', 'Japan MEXT', 'Japan', 'eastAsian', 'Japan MEXT', ['japan', 'mext', 'japanese']],
  ['china-national', 'China National Curriculum', 'China', 'eastAsian', 'China National Curriculum', ['china', 'chinese', 'prc']],
  ['hong-kong', 'Hong Kong Curriculum', 'Hong Kong', 'eastAsian', 'Hong Kong Curriculum', ['hong kong', 'hk']],
  ['taiwan', 'Taiwan Curriculum', 'Taiwan', 'eastAsian', 'Taiwan Curriculum', ['taiwan', 'roc']],
  ['south-korea', 'Korean National Curriculum', 'South Korea', 'eastAsian', 'Korean National Curriculum', ['korea', 'south korea', 'korean']],
  ['australia', 'Australian Curriculum (ACARA)', 'Australia', 'british', 'Australian Curriculum', ['australia', 'acara', 'australian']],
  ['new-zealand', 'New Zealand Curriculum', 'New Zealand', 'british', 'New Zealand Curriculum', ['new zealand', 'nz']],
  ['south-africa', 'CAPS — South Africa', 'South Africa', 'african', 'CAPS', ['south africa', 'caps']],
  ['nigeria', 'Nigerian National Curriculum', 'Nigeria', 'african', 'Nigerian National Curriculum', ['nigeria', 'nigerian']],
  ['kenya', 'Kenya CBC', 'Kenya', 'african', 'Kenya CBC', ['kenya', 'cbc kenya']],
  ['egypt', 'Egyptian National Curriculum', 'Egypt', 'middleEast', 'Egyptian National Curriculum', ['egypt', 'egyptian']],
  ['morocco', 'Moroccan National Curriculum', 'Morocco', 'middleEast', 'Moroccan National Curriculum', ['morocco', 'moroccan']],
  ['pakistan', 'Pakistan National Curriculum', 'Pakistan', 'indian', 'Pakistan National Curriculum', ['pakistan', 'pakistani']],
  ['bangladesh', 'Bangladesh National Curriculum', 'Bangladesh', 'indian', 'Bangladesh National Curriculum', ['bangladesh', 'bangladeshi']],
  ['sri-lanka', 'Sri Lanka National Curriculum', 'Sri Lanka', 'indian', 'Sri Lanka National Curriculum', ['sri lanka', 'srilanka']],
  ['malaysia', 'Malaysia National Curriculum', 'Malaysia', 'eastAsian', 'Malaysia National Curriculum', ['malaysia', 'malaysian']],
  ['indonesia', 'Indonesia Merdeka Curriculum', 'Indonesia', 'eastAsian', 'Indonesia Merdeka', ['indonesia', 'merdeka']],
  ['philippines', 'Philippines K to 12', 'Philippines', 'american', 'Philippines K to 12', ['philippines', 'k to 12', 'deped']],
  ['vietnam', 'Vietnam National Curriculum', 'Vietnam', 'eastAsian', 'Vietnam National Curriculum', ['vietnam', 'vietnamese']],
  ['thailand', 'Thailand Basic Education Core', 'Thailand', 'eastAsian', 'Thailand Basic Education Core', ['thailand', 'thai']],
  ['france', 'French National Curriculum', 'France', 'european', 'French National Curriculum', ['france', 'french']],
  ['germany', 'German National Curriculum', 'Germany', 'european', 'German National Curriculum', ['germany', 'german']],
  ['spain', 'Spanish National Curriculum', 'Spain', 'european', 'Spanish National Curriculum', ['spain', 'spanish']],
  ['italy', 'Italian National Curriculum', 'Italy', 'european', 'Italian National Curriculum', ['italy', 'italian']],
  ['netherlands', 'Dutch National Curriculum', 'Netherlands', 'european', 'Dutch National Curriculum', ['netherlands', 'dutch', 'holland']],
  ['sweden', 'Swedish National Curriculum', 'Sweden', 'european', 'Swedish National Curriculum', ['sweden', 'swedish']],
  ['norway', 'Norwegian National Curriculum', 'Norway', 'european', 'Norwegian National Curriculum', ['norway', 'norwegian']],
  ['finland', 'Finnish National Curriculum', 'Finland', 'european', 'Finnish National Curriculum', ['finland', 'finnish']],
  ['denmark', 'Danish National Curriculum', 'Denmark', 'european', 'Danish National Curriculum', ['denmark', 'danish']],
  ['poland', 'Polish National Curriculum', 'Poland', 'european', 'Polish National Curriculum', ['poland', 'polish']],
  ['turkey', 'Turkish National Curriculum', 'Türkiye', 'european', 'Turkish National Curriculum', ['turkey', 'turkish', 'turkiye']],
  ['israel', 'Israeli National Curriculum', 'Israel', 'middleEast', 'Israeli National Curriculum', ['israel', 'israeli']],
  ['russia', 'Russian Federal Curriculum', 'Russia', 'european', 'Russian Federal Curriculum', ['russia', 'russian']],
  ['brazil', 'Brazilian National Curriculum', 'Brazil', 'latinAmerican', 'Brazilian National Curriculum', ['brazil', 'brazilian']],
  ['mexico', 'Mexican National Curriculum', 'Mexico', 'latinAmerican', 'Mexican National Curriculum', ['mexico', 'mexican']],
  ['argentina', 'Argentine National Curriculum', 'Argentina', 'latinAmerican', 'Argentine National Curriculum', ['argentina', 'argentine']],
  ['chile', 'Chilean National Curriculum', 'Chile', 'latinAmerican', 'Chilean National Curriculum', ['chile', 'chilean']],
  ['colombia', 'Colombian National Curriculum', 'Colombia', 'latinAmerican', 'Colombian National Curriculum', ['colombia', 'colombian']],
  ['other-local', 'Other / local curriculum', 'International', 'local', 'Mathify Local Curriculum', ['other', 'custom', 'local', 'home school', 'homeschool', 'unknown board']]
];

function familyProfile(family, country) {
  const base = FAMILIES[family] || FAMILIES.local;
  return {
    country: country,
    style: base.style,
    notation: base.notation,
    pedagogy: base.pedagogy,
    illustrationContext: 'Use familiar, family-safe examples from ' + country + '.'
  };
}

/* The prompt-context mapper intentionally keeps seven stable profile names.
   New catalogue entries reuse the closest legacy profile instead of adding a
   new one, so existing integrations keep their exact context contract. */
function profileKeyFor(canonical, family) {
  if (LEGACY_PROFILES[canonical]) return canonical;
  const token = normalizeToken(canonical);
  const words = token.split(' ');
  if (words.indexOf('cbse') !== -1) return 'CBSE';
  if (words.indexOf('icse') !== -1 || words.indexOf('isc') !== -1) return 'ICSE';
  if (words.indexOf('ib') !== -1 || token.indexOf('international baccalaureate') !== -1 ||
      words.indexOf('pyp') !== -1 || words.indexOf('myp') !== -1) return 'IB';
  if (words.indexOf('igcse') !== -1 || words.indexOf('cambridge') !== -1) return 'IGCSE';
  if (words.indexOf('ontario') !== -1) return 'Ontario';
  if (family === 'indian') return 'CBSE';
  if (family === 'british') return 'British National';
  if (family === 'american') return 'Common Core';
  return 'IB';
}

const CURRICULA = CURRICULUM_DEFS.map(function (definition) {
  const slug = definition[0];
  const label = definition[1];
  const country = definition[2];
  const family = definition[3];
  const canonical = definition[4];
  const aliases = definition[5];
  const profileKey = profileKeyFor(canonical, family);
  const baseProfile = LEGACY_PROFILES[profileKey] || familyProfile(family, country);
  const legacy = LEGACY_PROFILES[canonical];
  const gradeSet = family === 'indian' && slug !== 'pakistan' && slug !== 'bangladesh' && slug !== 'sri-lanka'
    ? 'indian'
    : (family === 'american' ? 'american'
      : (family === 'british' ? 'british'
        : (canonical === 'IB' || canonical === 'IB UAE' ? 'ib'
          : (slug === 'singapore-moe' ? 'singapore'
            : (slug === 'japan-mext' ? 'japan'
              : (slug === 'china-national' || slug === 'hong-kong' || slug === 'taiwan' ? 'china'
                : (family === 'middleEast' ? 'ministry' : 'international')))))));
  const profile = copy(baseProfile);
  return {
    slug: slug,
    label: label,
    country: country,
    family: family,
    canonical: canonical,
    profileKey: profileKey,
    aliases: Array.from(new Set([slug, canonical, label].concat(aliases).map(normalizeToken).filter(Boolean))),
    gradeSet: gradeSet,
    ageBand: '3–18 years',
    theme: THEMES[family],
    tone: TONES[family],
    standardsFramework: legacy
      ? (canonical === 'Common Core' ? 'Common Core State Standards for Mathematics'
        : canonical === 'IB' ? 'IB early-years mathematics strands'
          : canonical === 'IGCSE' ? 'Cambridge early-years mathematics strands'
            : canonical === 'British National' ? 'UK early-years and National Curriculum mathematics strands'
              : canonical === 'Ontario' ? 'Ontario mathematics strands'
                : canonical === 'ICSE' ? 'ICSE mathematics strands' : 'NCERT mathematics strands')
      : FAMILIES[family].standardsFramework,
    profile: profile
  };
});

const ALIASES = {};
CURRICULA.forEach(function (item) {
  item.aliases.forEach(function (alias) {
    if (!ALIASES[alias]) ALIASES[alias] = item;
  });
});

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function findCurriculum(value) {
  const token = normalizeToken(value);
  if (!token) return null;
  return ALIASES[token] || null;
}

function gradesFor(curriculumValue) {
  const item = findCurriculum(curriculumValue);
  if (!item) return [];
  return (GRADE_SETS[item.gradeSet] || GRADE_SETS.international).map(copy);
}

function findGrade(curriculumValue, gradeValue) {
  const list = gradesFor(curriculumValue);
  const token = normalizeToken(gradeValue);
  if (!token) return null;
  const direct = list.find(function (item) { return item.aliases.indexOf(token) !== -1; });
  if (direct) return copy(direct);
  const numeric = /^(?:grade|class|year|std)\s*(\d{1,2})$/.exec(token);
  if (numeric) {
    const number = Number(numeric[1]);
    const byNumber = list.find(function (item) {
      return item.aliases.indexOf(String(number)) !== -1 || item.aliases.indexOf('grade ' + number) !== -1;
    });
    if (byNumber) return copy(byNumber);
  }
  return null;
}

function resolve(curriculumValue, gradeValue) {
  const item = findCurriculum(curriculumValue);
  if (!item) return null;
  const selectedGrade = findGrade(item.slug, gradeValue);
  return {
    curriculumSlug: item.slug,
    curriculumLabel: item.label,
    curriculumCanonical: item.canonical,
    country: item.country,
    family: item.family,
    theme: item.theme[0],
    tone: item.tone,
    standardsFramework: item.standardsFramework,
    gradeSlug: selectedGrade ? selectedGrade.slug : null,
    gradeLabel: selectedGrade ? selectedGrade.label : null,
    ageBand: selectedGrade ? selectedGrade.band : item.ageBand
  };
}

function profiles() {
  /* Exactly the seven legacy prompt-context profiles are public. Every other
     board reuses one of them through its profileKey. */
  const output = {};
  Object.keys(LEGACY_PROFILES).forEach(function (key) {
    output[key] = copy(LEGACY_PROFILES[key]);
  });
  return output;
}

function aliases() {
  const output = {};
  CURRICULA.forEach(function (item) {
    item.aliases.forEach(function (alias) { output[alias] = item.profileKey; });
  });
  return output;
}

function list() {
  return CURRICULA.map(function (item) {
    return {
      slug: item.slug,
      label: item.label,
      country: item.country,
      family: item.family,
      canonical: item.canonical,
      standardsFramework: item.standardsFramework,
      grades: gradesFor(item.slug).map(function (gradeItem) {
        return { slug: gradeItem.slug, label: gradeItem.label, group: gradeItem.group, band: gradeItem.band };
      })
    };
  });
}

module.exports = {
  CURRICULA: CURRICULA,
  GRADE_SETS: GRADE_SETS,
  LEGACY_PROFILES: LEGACY_PROFILES,
  profiles: profiles,
  aliases: aliases,
  list: list,
  findCurriculum: findCurriculum,
  gradesFor: gradesFor,
  findGrade: findGrade,
  resolve: resolve,
  normalizeToken: normalizeToken
};
