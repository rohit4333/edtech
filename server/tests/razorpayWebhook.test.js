/* Razorpay webhook exactly-once regression. Plain node assert only: every
   dependency is stubbed in-process and no HTTP or Supabase call is made. */

const assert = require('assert');
const crypto = require('crypto');

const db = require('../db');
const supabase = require('../db/supabase');
const config = require('../config');
const service = require('../services/razorpayService');
const realtime = require('../realtime');
const router = require('../routes/razorpay');

const SECRET = 'razorpay-webhook-test-secret';
const webhookLayers = router.stack.filter(function (layer) {
  return layer.route && layer.route.path === '/webhook';
});
assert.strictEqual(webhookLayers.length, 1, 'webhook route is mounted once');
const handler = webhookLayers[0].route.stack[0].handle;

const DB_METHODS = [
  'findPayment', 'findRazorpayOrder', 'findRazorpayOrderByReceipt', 'findUserById',
  'claimPayment', 'releasePayment', 'creditOrderIfCreated', 'uncreditOrderIfCredited',
  'recordPayment', 'addSessions', 'saveRazorpayOrder'
];
const SERVICE_METHODS = ['verifyWebhookSignature', 'capturedPayment'];
const savedDb = {};
const savedService = {};
const savedRealtimePublish = realtime.publish;
const savedSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

function freshState() {
  return {
    user: { id: 'usr_student_001', sessionsRemaining: 9 },
    order: {
      id: 'order_once_1',
      studentId: 'usr_student_001',
      packId: 'monthly_12',
      sessions: 12,
      amount: 54000,
      currency: 'SAR',
      receipt: 'receipt_once_1',
      status: 'created'
    },
    payments: [],
    packs: [],
    publishes: [],
    publishResolved: false,
    uncredits: [],
    failAddSessionsOnce: false
  };
}

function installStubs(state, asyncMode, delay) {
  /* Mutations happen synchronously inside `work`; asyncMode only delays the
     returned value, which is how the Supabase adapter behaves. */
  function wrap(work) {
    return function () {
      const value = work.apply(null, arguments);
      if (!asyncMode) return value;
      if (!delay) return Promise.resolve().then(function () { return value; });
      return new Promise(function (resolve) {
        setTimeout(function () { resolve(value); }, delay);
      });
    };
  }

  db.findPayment = wrap(function (id) {
    const found = state.payments.find(function (payment) { return payment.id === id; });
    return found ? Object.assign({}, found) : null;
  });
  db.findRazorpayOrder = wrap(function (id) {
    return state.order && state.order.id === id ? Object.assign({}, state.order) : null;
  });
  db.findRazorpayOrderByReceipt = wrap(function (receipt) {
    return state.order && state.order.receipt === receipt ? Object.assign({}, state.order) : null;
  });
  db.findUserById = wrap(function (id) {
    return state.user && state.user.id === id ? Object.assign({}, state.user) : null;
  });
  db.claimPayment = wrap(function (payment) {
    const existing = state.payments.find(function (row) { return row.id === payment.id; });
    if (existing) return { claimed: false, payment: Object.assign({}, existing) };
    state.payments.push(Object.assign({}, payment));
    return { claimed: true, payment: Object.assign({}, payment) };
  });
  db.releasePayment = wrap(function (id) {
    const index = state.payments.findIndex(function (row) { return row.id === id; });
    if (index === -1) return false;
    state.payments.splice(index, 1);
    return true;
  });
  db.creditOrderIfCreated = wrap(function (orderId, paymentId, creditedAt) {
    if (!state.order || state.order.id !== orderId) return { claimed: false, order: null };
    if (state.order.status === 'credited') return { claimed: false, order: state.order };
    state.order = Object.assign({}, state.order, {
      status: 'credited', paymentId: paymentId, creditedAt: creditedAt
    });
    return { claimed: true, order: Object.assign({}, state.order) };
  });
  db.uncreditOrderIfCredited = wrap(function (orderId, paymentId) {
    state.uncredits.push({ orderId: orderId, paymentId: paymentId });
    if (!state.order || state.order.id !== orderId) return { released: false, order: null };
    if (state.order.status !== 'credited') return { released: false, order: state.order };
    if (paymentId && state.order.paymentId && state.order.paymentId !== paymentId) {
      return { released: false, order: state.order };
    }
    state.order = Object.assign({}, state.order, { status: 'created' });
    delete state.order.paymentId;
    delete state.order.creditedAt;
    return { released: true, order: Object.assign({}, state.order) };
  });
  db.recordPayment = db.claimPayment;
  db.saveRazorpayOrder = wrap(function (order) {
    state.order = Object.assign({}, order);
    return Object.assign({}, order);
  });
  db.addSessions = wrap(function (studentId, sessions, payment) {
    if (state.failAddSessionsOnce) {
      state.failAddSessionsOnce = false;
      throw new Error('transient session credit failure');
    }
    const packId = 'pack_' + payment.id;
    if (state.packs.some(function (pack) { return pack.id === packId; })) {
      return Object.assign({}, state.user);
    }
    state.user.sessionsRemaining += sessions;
    state.packs.push({ id: packId, paymentRef: payment.id, remainingSessions: sessions });
    return Object.assign({}, state.user);
  });
  realtime.publish = function (studentId, event, payload) {
    state.publishes.push({ studentId: studentId, event: event, payload: payload });
    if (!asyncMode || !delay) {
      return Promise.resolve(true).then(function () {
        state.publishResolved = true;
        return true;
      });
    }
    return new Promise(function (resolve) {
      setTimeout(function () {
        state.publishResolved = true;
        resolve(true);
      }, delay);
    });
  };
}

function capturedEvent(overrides) {
  const payment = Object.assign({
    id: 'pay_once_1',
    order_id: 'order_once_1',
    amount: 54000,
    currency: 'SAR',
    status: 'captured',
    captured_at: 1760000000
  }, (overrides && overrides.payment) || {});
  return { event: 'payment.captured', payload: { payment: { entity: payment } } };
}

function signedRequest(event, secret) {
  const body = Buffer.from(JSON.stringify(event));
  return {
    body: body,
    headers: {
      'x-razorpay-signature': crypto.createHmac('sha256', secret).update(body).digest('hex')
    }
  };
}

function response() {
  const capture = { status: 200, body: null };
  return {
    capture: capture,
    status: function (code) { capture.status = code; return this; },
    json: function (body) { capture.body = body; return this; }
  };
}

/* Live adapter repro for A-02: a stubbed fetch emulates the mathify_records
   primary key plus the conditional PATCH used by the optimistic balance CAS.
   Two DISTINCT payments on one student must both add their sessions. */
async function assertConcurrentPackCredits() {
  const originalFetch = global.fetch;
  const savedSupabase = Object.assign({}, config.supabase);
  const records = [{
    collection: 'users',
    key: 'usr_student_001',
    data: { id: 'usr_student_001', sessionsRemaining: 9 }
  }];

  function eq(params, name) {
    const value = params.get(name);
    return value === null ? null : value.replace(/^eq\./, '');
  }

  global.fetch = async function (url, options) {
    const parsed = new URL(String(url));
    const params = parsed.searchParams;
    const settings = options || {};
    const method = settings.method || 'GET';
    const collection = eq(params, 'collection');
    const key = eq(params, 'key');
    const expectedBalance = eq(params, 'data->>sessionsRemaining');
    const body = settings.body ? JSON.parse(settings.body) : null;
    await Promise.resolve();

    if (method === 'POST' && parsed.pathname === '/rest/v1/mathify_records') {
      const incoming = Array.isArray(body) ? body : [body];
      for (const row of incoming) {
        if (records.some(function (item) {
          return item.collection === row.collection && item.key === row.key;
        })) {
          return {
            ok: false,
            status: 409,
            text: async function () {
              return JSON.stringify({
                code: '23505', message: 'duplicate key value violates unique constraint'
              });
            }
          };
        }
        records.push({ collection: row.collection, key: row.key, data: row.data });
      }
      return { ok: true, status: 201, text: async function () { return ''; } };
    }

    const matches = function (row) {
      if (collection !== null && row.collection !== collection) return false;
      if (key !== null && row.key !== key) return false;
      if (expectedBalance !== null && String(row.data.sessionsRemaining) !== expectedBalance) return false;
      return true;
    };
    const asRows = function (rows) {
      return JSON.stringify(rows.map(function (row) { return { data: row.data }; }));
    };

    if (method === 'GET') {
      return { ok: true, status: 200, text: async function () { return asRows(records.filter(matches)); } };
    }
    if (method === 'PATCH') {
      const rows = records.filter(matches);
      if (!rows.length) return { ok: true, status: 200, text: async function () { return '[]'; } };
      rows.forEach(function (row) { row.data = body.data; });
      return { ok: true, status: 200, text: async function () { return asRows(rows); } };
    }
    if (method === 'DELETE') {
      for (let index = records.length - 1; index >= 0; index -= 1) {
        if (matches(records[index])) records.splice(index, 1);
      }
      return { ok: true, status: 204, text: async function () { return ''; } };
    }
    throw new Error('unexpected stub request ' + method + ' ' + String(url));
  };

  config.supabase.url = 'https://stub.supabase.test';
  config.supabase.publishableKey = 'stub-publishable';
  config.supabase.secretKey = 'stub-secret';
  try {
    await Promise.all([
      supabase.addSessions('usr_student_001', 12, { id: 'pay_distinct_a' }),
      supabase.addSessions('usr_student_001', 12, { id: 'pay_distinct_b' })
    ]);
    const user = records.find(function (row) {
      return row.collection === 'users' && row.key === 'usr_student_001';
    });
    const packs = records.filter(function (row) { return row.collection === 'packs'; });
    assert.strictEqual(user.data.sessionsRemaining, 33,
      'two distinct concurrent payments both add their 12 sessions');
    assert.strictEqual(packs.length, 2, 'both distinct pack claims are present');

    await supabase.addSessions('usr_student_001', 12, { id: 'pay_distinct_a' });
    assert.strictEqual(user.data.sessionsRemaining, 33, 'same-payment replay stays a no-op');
    assert.strictEqual(packs.length, 2, 'same-payment replay issues no extra pack');
  } finally {
    global.fetch = originalFetch;
    Object.keys(savedSupabase).forEach(function (key) { config.supabase[key] = savedSupabase[key]; });
  }
}

async function main() {
  DB_METHODS.forEach(function (name) { savedDb[name] = db[name]; });
  SERVICE_METHODS.forEach(function (name) { savedService[name] = service[name]; });
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;

  try {
    /* Real HMAC verification stays in the path; only storage is stubbed. */
    let state = freshState();
    installStubs(state, false);
    let request = signedRequest(capturedEvent(), SECRET);
    let call = response();
    await handler(request, call);

    assert.strictEqual(call.capture.status, 200, 'valid captured payment returns 200');
    assert.strictEqual(call.capture.body.credited, true, 'valid captured payment credits the pack');
    assert.strictEqual(call.capture.body.sessionsAdded, 12, 'the 12-session pack is credited');
    assert.strictEqual(state.user.sessionsRemaining, 21, 'sessions are added exactly once');
    assert.strictEqual(state.packs.length, 1, 'one pack credential is issued');
    assert.strictEqual(state.packs[0].id, 'pack_pay_once_1', 'pack id is deterministic');
    assert.strictEqual(state.payments.length, 1, 'payment identity is recorded once');

    let replay = response();
    await handler(request, replay);
    assert.strictEqual(replay.capture.status, 200, 'replay is acknowledged');
    assert.strictEqual(replay.capture.body.reason, 'ALREADY_CREDITED', 'replay is ignored');
    assert.strictEqual(state.user.sessionsRemaining, 21, 'replay does not add sessions');
    assert.strictEqual(state.packs.length, 1, 'replay does not add a pack');

    /* Concurrent duplicates with async (Supabase-shaped) adapters: all calls
       observe the same payment, only one wins the claim. */
    state = freshState();
    installStubs(state, true, 1);
    request = signedRequest(capturedEvent(), SECRET);
    const concurrent = await Promise.all([
      handler(request, response()),
      handler(request, response()),
      handler(request, response())
    ]);
    assert.strictEqual(concurrent.filter(function (call) {
      return call.capture.body.credited === true;
    }).length, 1, 'exactly one concurrent duplicate credits');
    assert.strictEqual(concurrent.filter(function (call) {
      return call.capture.body.reason === 'ALREADY_CREDITED';
    }).length, 2, 'the other concurrent duplicates are acknowledged as replays');
    assert.strictEqual(state.user.sessionsRemaining, 21, 'concurrent calls add 12 sessions once');
    assert.strictEqual(state.packs.length, 1, 'concurrent calls create one pack');
    assert.strictEqual(state.payments.length, 1, 'concurrent calls claim one payment');

    /* Value and order identity come from the server-saved order only. */
    state = freshState();
    installStubs(state, false);
    request = signedRequest(capturedEvent({ payment: { amount: 54001 } }), SECRET);
    call = response();
    await handler(request, call);
    assert.strictEqual(call.capture.body.reason, 'PACK_MISMATCH', 'amount mismatch is rejected');
    assert.strictEqual(state.user.sessionsRemaining, 9, 'mismatched amount does not credit');
    assert.strictEqual(state.payments.length, 0, 'mismatched amount is not claimed');

    request = signedRequest(capturedEvent({ payment: { order_id: 'order_elsewhere' } }), SECRET);
    call = response();
    await handler(request, call);
    assert.strictEqual(call.capture.body.reason, 'ORDER_NOT_FOUND', 'unknown order is rejected');
    assert.strictEqual(state.user.sessionsRemaining, 9, 'unknown order does not credit');

    /* HMAC failure is rejected before any storage call. */
    state = freshState();
    installStubs(state, false);
    call = response();
    await handler({
      body: Buffer.from(JSON.stringify(capturedEvent())),
      headers: { 'x-razorpay-signature': 'not-the-right-signature' }
    }, call);
    assert.strictEqual(call.capture.status, 401, 'bad signature returns 401');
    assert.strictEqual(call.capture.body.error, 'INVALID_SIGNATURE', 'bad signature is named');
    assert.strictEqual(state.user.sessionsRemaining, 9, 'bad signature does not credit');
    assert.strictEqual(state.payments.length, 0, 'bad signature is not claimed');

    /* Awaiting delayed promises proves no adapter result is treated as a
       resolved value too early, including the realtime publish. */
    state = freshState();
    installStubs(state, true, 2);
    request = signedRequest(capturedEvent(), SECRET);
    call = response();
    await handler(request, call);
    assert.strictEqual(call.capture.body.credited, true, 'async adapter credit is awaited');
    assert.strictEqual(call.capture.body.sessionsAdded, 12, 'async sessions count is a number');
    assert.strictEqual(call.capture.body.sessionsRemaining, 21, 'async balance is resolved');
    assert.strictEqual(state.publishes.length, 1, 'async realtime publish is invoked');
    assert.strictEqual(state.publishResolved, true, 'async realtime publish is awaited');

    /* A-03: a failure after the order CAS must roll the order back, release
       the payment and let a retry credit exactly once. */
    state = freshState();
    state.failAddSessionsOnce = true;
    installStubs(state, true, 1);
    request = signedRequest(capturedEvent(), SECRET);
    call = response();
    await handler(request, call);
    assert.strictEqual(call.capture.status, 502, 'transient post-CAS failure is surfaced');
    assert.strictEqual(state.uncredits.length, 1, 'compensation uncredits the order once');
    assert.strictEqual(state.order.status, 'created', 'compensated order is claimable again');
    assert.strictEqual(state.payments.length, 0, 'compensation releases the payment claim');
    assert.strictEqual(state.user.sessionsRemaining, 9, 'failed credit adds no sessions');

    call = response();
    await handler(request, call);
    assert.strictEqual(call.capture.body.credited, true, 'retry after compensation credits');
    assert.strictEqual(call.capture.body.sessionsAdded, 12, 'retry credits the 12-session pack');
    assert.strictEqual(state.user.sessionsRemaining, 21, 'retry adds sessions exactly once');
    assert.strictEqual(state.packs.length, 1, 'retry issues exactly one pack');
    call = response();
    await handler(request, call);
    assert.strictEqual(call.capture.body.reason, 'ALREADY_CREDITED',
      'same-payment replay after retry is still ignored');

    await assertConcurrentPackCredits();

    console.log('razorpayWebhook: all exactly-once assertions passed');
  } finally {
    DB_METHODS.forEach(function (name) { db[name] = savedDb[name]; });
    SERVICE_METHODS.forEach(function (name) { service[name] = savedService[name]; });
    realtime.publish = savedRealtimePublish;
    if (savedSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = savedSecret;
  }
}

main().catch(function (error) {
  console.error('razorpayWebhook: FAILED');
  console.error(error);
  process.exitCode = 1;
});
