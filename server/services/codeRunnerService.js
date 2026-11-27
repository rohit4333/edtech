/* JavaScript-only answer checker for coding practice.
 *
 * Student code and trainer-authored hidden tests run in a fresh `node:vm`
 * context per check. The context has no filesystem, network, process, require,
 * eval or dynamic code generation. A test failure never returns an assertion
 * message (which could contain an expected value), only a generic category.
 *
 * This is a compiler-type checker for a single language, not a general remote
 * code execution service. Other languages are read-only starter code.
 */

const vm = require('node:vm');
const util = require('node:util');

const MAX_CODE_CHARS = 20000;
const MAX_TEST_CODE_CHARS = 4000;
const MAX_TESTS = 12;
const TIMEOUT_MS = 750;
const MAX_LOG_ENTRIES = 40;
const MAX_LOG_CHARS = 4000;

function fail(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 400;
  return error;
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeTests(tests) {
  const list = Array.isArray(tests) ? tests.slice(0, MAX_TESTS) : [];
  return list.map(function (item, index) {
    const source = text(item && (item.code || item.test || item.source));
    if (!source.trim()) {
      throw fail('A hidden test needs JavaScript source.', 'TEST_SOURCE_REQUIRED', 422);
    }
    if (source.length > MAX_TEST_CODE_CHARS) {
      throw fail('A hidden test is too long.', 'TEST_TOO_LONG', 422);
    }
    return {
      name: text(item && item.name).slice(0, 80) || 'Check ' + (index + 1),
      code: source,
      hidden: item && item.hidden !== false
    };
  });
}

function assertionFailed() {
  const error = new Error('ASSERTION_FAILED');
  error.__mathifyCheck = 'ASSERTION_FAILED';
  return error;
}

function buildAssert() {
  function requireCondition(condition) {
    if (!condition) throw assertionFailed();
  }
  return Object.freeze({
    ok: function (value) { requireCondition(Boolean(value)); },
    equal: function (actual, expected) { requireCondition(actual == expected); }, // eslint-disable-line eqeqeq
    strictEqual: function (actual, expected) { requireCondition(actual === expected); },
    notStrictEqual: function (actual, expected) { requireCondition(actual !== expected); },
    deepStrictEqual: function (actual, expected) {
      requireCondition(util.isDeepStrictEqual(actual, expected));
    },
    throws: function (fn) {
      let threw = false;
      try { fn(); } catch (error) { threw = true; }
      requireCondition(threw);
    }
  });
}

function createContext(capture) {
  /* Everything the learner can reach is explicit. codeGeneration:false blocks
     eval, the Function constructor and `constructor.constructor` escapes. */
  const sandbox = Object.create(null);
  sandbox.console = Object.freeze({
    log: function () { capture(Array.prototype.slice.call(arguments)); },
    info: function () { capture(Array.prototype.slice.call(arguments)); },
    warn: function () { capture(Array.prototype.slice.call(arguments)); },
    error: function () { capture(Array.prototype.slice.call(arguments)); }
  });
  sandbox.assert = buildAssert();
  sandbox.Function = undefined;
  sandbox.eval = undefined;
  sandbox.require = undefined;
  sandbox.process = undefined;
  sandbox.global = undefined;
  /* globalThis stays available so submissions can expose `solution`; dynamic
     code generation is disabled above, so it is not an escape hatch. */
  sandbox.fetch = undefined;
  sandbox.XMLHttpRequest = undefined;
  sandbox.WebSocket = undefined;
  sandbox.setTimeout = undefined;
  sandbox.setInterval = undefined;
  sandbox.setImmediate = undefined;
  sandbox.queueMicrotask = undefined;
  return vm.createContext(sandbox, {
    name: 'mathify-code-check',
    codeGeneration: { strings: false, wasm: false }
  });
}

function formatLog(args) {
  return args.map(function (value) {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (error) { return String(value); }
  }).join(' ').slice(0, 500);
}

function category(error) {
  if (!error) return 'Check failed.';
  if (error.__mathifyCheck === 'ASSERTION_FAILED') return 'Assertion failed.';
  if (error && (error.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' ||
      /timed out/i.test(String(error.message || '')))) return 'Timed out.';
  if (error instanceof SyntaxError || (error && error.name === 'SyntaxError')) return 'Syntax error.';
  return 'Runtime error.';
}

/**
 * Runs learner code against hidden tests.
 * @param {string} code learner JavaScript (must define `solution`)
 * @param {Array<{name:string,code:string,hidden?:boolean}>} tests
 * @returns {{passed:boolean, results:Array, output:string, ranAt:string}}
 */
function runChecks(code, tests) {
  const source = text(code);
  if (!source.trim()) {
    throw fail('Write some code first.', 'CODE_REQUIRED', 422);
  }
  if (source.length > MAX_CODE_CHARS) {
    throw fail('Code is too long.', 'CODE_TOO_LONG', 422);
  }
  const hiddenTests = normalizeTests(tests);
  const logs = [];
  const capture = function (value) {
    const args = Array.isArray(value) ? value : [value];
    if (logs.length < MAX_LOG_ENTRIES) logs.push(formatLog(args));
  };
  const context = createContext(capture);
  const results = [];

  /* A learner defines `solution`; the wrapper copies it onto the shared global
     so each independent hidden-test script can call the same submitted code. */
  const wrapped = '"use strict";\n' + source +
    '\n;globalThis.solution = typeof solution === "function" ? solution : null;';
  try {
    new vm.Script(wrapped, { filename: 'submission.js' }).runInContext(context, { timeout: TIMEOUT_MS });
  } catch (error) {
    const message = category(error);
    return {
      passed: false,
      results: hiddenTests.map(function (test) {
        return { name: test.name, passed: false, message: message };
      }),
      output: logs.join('\n').slice(0, MAX_LOG_CHARS),
      ranAt: new Date().toISOString()
    };
  }

  for (let index = 0; index < hiddenTests.length; index += 1) {
    const test = hiddenTests[index];
    let passed = false;
    let message = 'Check failed.';
    try {
      new vm.Script('"use strict";\n' + test.code, {
        filename: 'hidden-test.js'
      }).runInContext(context, { timeout: TIMEOUT_MS });
      passed = true;
      message = 'Passed.';
    } catch (error) {
      message = category(error);
    }
    /* Only the test's display name is returned. No source, expected value or
       assertion detail ever crosses this boundary. */
    results.push({ name: test.name, passed: passed, message: message });
  }

  return {
    passed: hiddenTests.length > 0 && results.every(function (item) { return item.passed; }),
    results: results,
    output: logs.join('\n').slice(0, MAX_LOG_CHARS),
    ranAt: new Date().toISOString()
  };
}

/* A small starter challenge keeps practice usable before a trainer publishes
   one. Its tests exist only here on the server. */
const STARTER = Object.freeze({
  id: 'starter',
  sessionId: null,
  title: 'Your first function',
  prompt: 'Write solution(a, b) that returns the sum of a and b. Use JavaScript.',
  language: 'javascript',
  starterCode: 'function solution(a, b) {\n  // Write your code here.\n}\n',
  entryPoint: 'solution',
  tests: Object.freeze([
    Object.freeze({ name: 'Adds two numbers', code: 'assert.strictEqual(solution(2, 3), 5);', hidden: true }),
    Object.freeze({ name: 'Handles negatives', code: 'assert.strictEqual(solution(-4, 9), 5);', hidden: true })
  ]),
  testsHidden: true
});

function publicChallenge(record) {
  if (!record) {
    return {
      id: STARTER.id,
      sessionId: null,
      title: STARTER.title,
      prompt: STARTER.prompt,
      language: 'javascript',
      starterCode: STARTER.starterCode,
      entryPoint: STARTER.entryPoint,
      testsHidden: true,
      starter: true
    };
  }
  return {
    id: record.id,
    sessionId: record.sessionId || null,
    title: text(record.title).slice(0, 120) || 'Coding challenge',
    prompt: text(record.prompt).slice(0, 2000),
    language: 'javascript',
    starterCode: text(record.starterCode).slice(0, MAX_CODE_CHARS),
    entryPoint: 'solution',
    testsHidden: true,
    starter: false
  };
}

module.exports = {
  runChecks: runChecks,
  normalizeTests: normalizeTests,
  publicChallenge: publicChallenge,
  STARTER: STARTER,
  MAX_CODE_CHARS: MAX_CODE_CHARS,
  MAX_TESTS: MAX_TESTS,
  TIMEOUT_MS: TIMEOUT_MS
};
