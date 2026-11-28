/* Parent↔trainer DLP gate.
 *
 * Every outbound message is scanned here before it is stored or delivered.
 * A blocked message never reaches the other party, never reaches Realtime and
 * is never written as a chat message. The service stores only a founder-only
 * flag with a reason code and a masked preview.
 *
 * All regexes are exported so tests can assert each category directly. They
 * are intentionally declared without the global flag: .test()/exec() must be
 * stateless across calls.
 */

const REASONS = Object.freeze({
  EMAIL_ADDRESS: 'Email address',
  URL_LINK: 'Web link',
  PHONE_NUMBER: 'Phone number',
  CONTACT_SCHEME: 'Contact link',
  SOCIAL_HANDLE: 'Social handle',
  SOCIAL_PLATFORM: 'Off-platform social contact',
  PERSONAL_CONTACT: 'Personal contact request',
});

const NEUTRAL_BLOCK_MESSAGE =
  "That message can't be shared on Mathify. Please keep the conversation on the platform.";

const RULES = [
  {
    code: 'EMAIL_ADDRESS',
    label: REASONS.EMAIL_ADDRESS,
    regexes: [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
    mask: function () {
      return 'a••@••';
    },
  },
  {
    code: 'PHONE_NUMBER',
    label: REASONS.PHONE_NUMBER,
    regexes: [
      /\+\d{1,3}[\s.-]?\d{5}[\s.-]?\d{5}\b/,
      /\+\d[\d\s().-]{7,}\d\b/,
      /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/,
      /\b\d{10}\b/,
    ],
    mask: maskPhone,
  },
  {
    code: 'URL_LINK',
    label: REASONS.URL_LINK,
    regexes: [
      /\b(?:https?:\/\/|www\.)[^\s<>"']+/i,
      /\b(?:[a-z0-9-]+\.)+(?:com|org|net|in|co|io|me|tv|app|info|biz|edu|gov|xyz|online|site)\b(?:\/\S*)?/i,
    ],
    mask: function () {
      return '••••://••••';
    },
  },
  {
    code: 'CONTACT_SCHEME',
    label: REASONS.CONTACT_SCHEME,
    regexes: [/\b(?:mailto|tel):[^\s<>"']*/i],
    mask: function () {
      return '••••:••••';
    },
  },
  {
    code: 'SOCIAL_HANDLE',
    label: REASONS.SOCIAL_HANDLE,
    regexes: [/(?:^|[\s(])@[A-Za-z0-9_]{2,}\b/],
    mask: function () {
      return '@••••';
    },
  },
  {
    code: 'SOCIAL_PLATFORM',
    label: REASONS.SOCIAL_PLATFORM,
    regexes: [
      /\b(?:whatsapp|wa\.me|instagram|insta|telegram|facebook|fb|twitter|tiktok|snapchat|linkedin|discord|signal|messenger|viber|wechat)\b/i,
    ],
    mask: function () {
      return '••••';
    },
  },
  {
    code: 'PERSONAL_CONTACT',
    label: REASONS.PERSONAL_CONTACT,
    regexes: [
      /\b(?:my|your)\s+(?:phone(?:\s*number)?|mobile(?:\s*number)?|email(?:\s*address)?|contact(?:\s*(?:number|details?|info))?|inbox|handle|private chat|personal (?:chat|email|number|address))\b/i,
      /\b(?:call|text|message|dm|ping|reach|contact|add|follow|connect)\s+(?:me|us|you|him|her)?\s*(?:on|at|via|in)?\s*(?:my|your)?\s*(?:number|phone|mobile|email|inbox|handle|id|instagram|whatsapp|telegram|facebook|twitter|tiktok|snapchat)\b/i,
      /\b(?:share|send|drop|give)\s+(?:me|us)?\s*(?:your|his|her)?\s*(?:contact|number|email|id|handle)\b/i,
      /\b(?:outside|off)\s+(?:of\s+)?(?:the\s+)?(?:app|platform|mathify|chat)\b/i,
      /\b(?:private|personal)\s+(?:number|email|chat|message|account|contact)\b/i,
    ],
    mask: function () {
      return '••••';
    },
  },
];

/* Flat regex map for quick unit assertions, e.g. REGEXES.EMAIL_ADDRESS.test(text). */
const REGEXES = {};
RULES.forEach(function (rule) {
  REGEXES[rule.code] = rule.regexes.slice();
});

function maskPhone(value) {
  const raw = String(value || '');
  const hasPlus = raw.indexOf('+') !== -1;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return '••••';
  const lastFour = digits.slice(-4);
  const countryLength = hasPlus && digits.length > 10 ? Math.min(3, digits.length - 10) : 0;
  const country = digits.slice(0, countryLength);
  return (hasPlus ? '+' + country : '') + '••••••' + lastFour;
}

function maskPreview(code, matchedText) {
  const rule = RULES.find(function (item) {
    return item.code === code;
  });
  if (!rule) return '••••';
  return rule.mask(matchedText);
}

/** Scan untrusted text. Returns a neutral, non-echoing decision object. */
function inspect(value) {
  const text = typeof value === 'string' ? value : '';
  const seen = [];
  let primary = null;

  RULES.forEach(function (rule) {
    if (seen.indexOf(rule.code) !== -1) return;
    for (let index = 0; index < rule.regexes.length; index += 1) {
      const match = rule.regexes[index].exec(text);
      if (match) {
        seen.push(rule.code);
        if (!primary) {
          primary = {
            code: rule.code,
            label: rule.label,
            matchedText: match[0],
            maskedPreview: maskPreview(rule.code, match[0]),
          };
        }
        return;
      }
    }
  });

  if (!primary) {
    return {
      blocked: false,
      reason: null,
      reasonLabel: null,
      reasons: [],
      maskedPreview: null,
    };
  }

  return {
    blocked: true,
    reason: primary.code,
    reasonLabel: primary.label,
    reasons: seen.slice(),
    maskedPreview: primary.maskedPreview,
  };
}

function isBlocked(value) {
  return inspect(value).blocked;
}

function check(value) {
  return inspect(value);
}

function scan(value) {
  return inspect(value);
}

module.exports = {
  REASONS,
  REASON_CODES: REASONS,
  reasonCodes: REASONS,
  RULES,
  PATTERNS: RULES,
  REGEXES,
  EMAIL_REGEX: REGEXES.EMAIL_ADDRESS[0],
  URL_REGEX: REGEXES.URL_LINK[0],
  PHONE_REGEX: REGEXES.PHONE_NUMBER[3],
  SOCIAL_HANDLE_REGEX: REGEXES.SOCIAL_HANDLE[0],
  SOCIAL_MEDIA_REGEX: REGEXES.SOCIAL_PLATFORM[0],
  PERSONAL_CONTACT_REGEX: REGEXES.PERSONAL_CONTACT[0],
  EMAIL: REGEXES.EMAIL_ADDRESS[0],
  URL: REGEXES.URL_LINK[0],
  PHONE: REGEXES.PHONE_NUMBER[3],
  SOCIAL: REGEXES.SOCIAL_PLATFORM[0],
  NEUTRAL_BLOCK_MESSAGE,
  BLOCKED_MESSAGE: NEUTRAL_BLOCK_MESSAGE,
  inspect: inspect,
  check: check,
  scan: scan,
  detect: inspect,
  isBlocked: isBlocked,
  maskPhone: maskPhone,
  maskPreview: maskPreview,
};
