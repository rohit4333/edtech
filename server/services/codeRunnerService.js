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
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

/* A hard wall around the whole check. VM timeouts interrupt synchronous loops
   only; a Promise/async microtask loop keeps running after runInContext returns.
   Each check therefore runs in a short-lived child that is killed at this limit. */
const CHECK_TIMEOUT_MS = 12000;
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
  const list = Array.isArray(tests) ? tests : [];
  /* Never silently drop checks: a trainer who publishes 13 tests must hear that
     only 12 can run instead of believing all 13 are graded. */
  if (list.length > MAX_TESTS) {
    throw fail('Too many hidden tests (maximum ' + MAX_TESTS + ').', 'TOO_MANY_TESTS', 422);
  }
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

function createContext(capture, extras) {
  /* Everything the learner can reach is explicit. codeGeneration:false blocks
     eval, the Function constructor and `constructor.constructor` escapes. */
  const sandbox = Object.create(null);
  sandbox.console = Object.freeze({
    log: function () { capture(Array.prototype.slice.call(arguments)); },
    info: function () { capture(Array.prototype.slice.call(arguments)); },
    warn: function () { capture(Array.prototype.slice.call(arguments)); },
    error: function () { capture(Array.prototype.slice.call(arguments)); }
  });
  /* Non-writable and non-configurable: not even the learner's own context can
     swap in a no-op assert. Hidden tests get a brand-new context below anyway,
     so a submission can never mutate the grader's assertion helpers. */
  Object.defineProperty(sandbox, 'assert', {
    value: buildAssert(),
    writable: false,
    configurable: false,
    enumerable: true
  });
  if (extras && typeof extras === 'object') {
    Object.keys(extras).forEach(function (key) {
      Object.defineProperty(sandbox, key, {
        value: extras[key],
        writable: false,
        configurable: false,
        enumerable: true
      });
    });
  }
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
function runChecksCore(code, tests) {
  const source = text(code);
  if (!source.trim()) {
    throw fail('Write some code first.', 'CODE_REQUIRED', 422);
  }
  if (source.length > MAX_CODE_CHARS) {
    throw fail('Code is too long.', 'CODE_TOO_LONG', 422);
  }
  const hiddenTests = normalizeTests(tests);
  const logs = [];
  let captureEnabled = true;
  const capture = function (value) {
    if (!captureEnabled) return;
    const args = Array.isArray(value) ? value : [value];
    if (logs.length < MAX_LOG_ENTRIES) logs.push(formatLog(args));
  };
  const context = createContext(capture);
  const results = [];

  /* A learner defines `solution`. Only that function crosses into the grader;
     none of the learner's globals, overrides or console hooks travel with it. */
  const wrapped = '"use strict";\n' + source +
    '\n;globalThis.__mathifySolution = typeof solution === "function" ? solution : null;';
  let submitted = null;
  try {
    new vm.Script(wrapped, { filename: 'submission.js' }).runInContext(context, { timeout: TIMEOUT_MS });
    submitted = vm.runInContext('globalThis.__mathifySolution', context, { timeout: TIMEOUT_MS });
    if (typeof submitted !== 'function') submitted = null;
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

  /* Each hidden test gets a pristine, frozen context with its own assert. A
     submission that replaced assert in its own realm cannot touch this one.
     Capture is suspended so neither test code nor the submitted function can
     leak expected values into the returned output. */
  captureEnabled = false;
  try {
    for (let index = 0; index < hiddenTests.length; index += 1) {
      const test = hiddenTests[index];
      let passed = false;
      let message = 'Check failed.';
      try {
        const testContext = createContext(function () {}, { solution: submitted });
        new vm.Script('"use strict";\n' + test.code, {
          filename: 'hidden-test.js'
        }).runInContext(testContext, { timeout: TIMEOUT_MS });
        passed = true;
        message = 'Passed.';
      } catch (error) {
        message = category(error);
      }
      /* Only the test's display name is returned. No source, expected value or
         assertion detail ever crosses this boundary. */
      results.push({ name: test.name, passed: passed, message: message });
    }
  } finally {
    captureEnabled = true;
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

/* Display names are safe to echo; no test source or expected value is used. */
function failedCheckResult(tests) {
  const list = Array.isArray(tests) ? tests.slice(0, MAX_TESTS) : [];
  return {
    passed: false,
    results: list.map(function (item, index) {
      return {
        name: text(item && item.name).slice(0, 80) || 'Check ' + (index + 1),
        passed: false,
        message: 'Check could not run.'
      };
    }),
    output: '',
    ranAt: new Date().toISOString()
  };
}

/**
 * Public entry point. The actual VM work happens in a short-lived child so an
 * async microtask loop can be hard-killed instead of hanging the API process.
 * The synchronous signature is unchanged for existing callers.
 */
function runChecks(code, tests) {
  const input = JSON.stringify({
    code: text(code),
    /* Send one extra so the worker can reject over-limit input instead of
       silently truncating it; the hard cap only bounds the IPC payload. */
    tests: Array.isArray(tests) ? tests.slice(0, MAX_TESTS + 1) : []
  });
  const child = spawnSync(process.execPath, [__filename, '--worker'], {
    input: input,
    encoding: 'utf8',
    timeout: CHECK_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
    windowsHide: true
  });
  if (child.error || child.status !== 0 || !child.stdout) {
    return failedCheckResult(tests);
  }
  let payload = null;
  try { payload = JSON.parse(child.stdout); } catch (error) { return failedCheckResult(tests); }
  if (!payload || !payload.ok) {
    const detail = (payload && payload.error) || {};
    const error = new Error(detail.message || 'Check could not run.');
    error.code = detail.code || 'CHECK_FAILED';
    error.status = detail.status || 400;
    throw error;
  }
  return payload.result;
}

/* Worker mode: isolated grader process, never loaded by the HTTP server path. */
if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function (chunk) { raw += chunk; });
  process.stdin.on('end', function () {
    let payload = null;
    try {
      const input = JSON.parse(raw);
      payload = { ok: true, result: runChecksCore(input.code, input.tests) };
    } catch (error) {
      payload = {
        ok: false,
        error: {
          message: error.message || 'Check could not run.',
          code: error.code || 'CHECK_FAILED',
          status: error.status || 400
        }
      };
    }
    /* fs.writeSync + process.exit: a runaway microtask chain cannot keep the
       worker alive or delay the HTTP response. */
    try { fs.writeSync(1, JSON.stringify(payload)); } catch (error) { /* noop */ }
    process.exit(0);
  });
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
