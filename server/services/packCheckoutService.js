/* Parent session packs — server-owned SAR pricing and deterministic mock credit.
 *
 * The browser never supplies an amount, currency or discount. This service is
 * the only place that turns a session count into money, and the only place that
 * credits a child's balance. It calls the existing db.addSessions() path, so the
 * replay-safe pack identity works in both mock and live database modes.
 *
 * No Razorpay, WhatsApp, Twilio or any other external provider is involved:
 * packs are mock-checkout records with a fixed 'mock' provider marker.
 */
const policy = require('../config/policy.json');
const db = require('../db');

/* Accept both the nested policy block and the flat public-safe mirror. */
const RULES = policy.parentPack || policy;

const CLIENT_MONEY_KEYS = [
  'amount',
  'amountSAR',
  'currency',
  'discount',
  'discountPercent',
  'discountSAR',
  'price',
  'pricePerSessionSAR',
  'subtotal',
  'subtotalSAR',
  'total',
  'totalSAR',
  'paymentId',
  'payment',
  'provider',
  'razorpayOrderId',
];

function rules() {
  return {
    currency: RULES.currency || 'SAR',
    pricePerSessionSAR: Number(RULES.pricePerSessionSAR) || 90,
    minSessions: Number(RULES.minSessions) || 4,
    maxSessions: Number(RULES.maxSessions) || 100,
    standardMax: Number(RULES.standardMax) || 39,
    bulkMin: Number(RULES.bulkMin) || 40,
    discountMinSessions: Number(RULES.discountMinSessions) || 41,
    discountPercent: Number(RULES.discountPercent) || 5,
    presets: Array.isArray(RULES.presets) ? RULES.presets.slice() : [4, 8, 16, 20],
  };
}

function publicPricing() {
  const config = rules();
  return {
    currency: config.currency,
    pricePerSessionSAR: config.pricePerSessionSAR,
    minSessions: config.minSessions,
    maxSessions: config.maxSessions,
    standardMax: config.standardMax,
    bulkMin: config.bulkMin,
    discountMinSessions: config.discountMinSessions,
    discountPercent: config.discountPercent,
    presets: config.presets,
    standardLabel: 'Standard deck · ' + config.minSessions + '–' + config.standardMax + ' sessions',
    bulkLabel: 'Bulk deck · ' + config.bulkMin + '–' + config.maxSessions + ' sessions',
    discountLabel:
      config.discountPercent +
      '% off every session when you book ' +
      config.discountMinSessions +
      '–' +
      config.maxSessions,
    perSessionLabel: 'SAR ' + config.pricePerSessionSAR + ' per session',
    lowBalanceThreshold: 2,
  };
}

function integerCount(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value;
}

function invalidCount(message) {
  const error = new Error(message || 'Choose a whole number of sessions between 4 and 100.');
  error.code = 'INVALID_SESSION_COUNT';
  error.status = 400;
  return error;
}

function money(value) {
  /* Two decimals match SAR halalas and avoid binary-float drift in receipts. */
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function quote(input) {
  const config = rules();
  const count = integerCount(input && typeof input === 'object' ? input.count : input);
  if (count === null || count < config.minSessions || count > config.maxSessions) {
    throw invalidCount();
  }

  const discountApplied = count >= config.discountMinSessions;
  const subtotal = money(count * config.pricePerSessionSAR);
  const discount = discountApplied ? money((subtotal * config.discountPercent) / 100) : 0;
  const total = money(subtotal - discount);
  const deck = count >= config.bulkMin ? 'bulk' : 'standard';

  return {
    count: count,
    currency: config.currency,
    deck: deck,
    deckLabel:
      deck === 'bulk'
        ? 'Bulk deck · ' + config.bulkMin + '–' + config.maxSessions + ' sessions'
        : 'Standard deck · ' + config.minSessions + '–' + config.standardMax + ' sessions',
    pricePerSessionSAR: config.pricePerSessionSAR,
    subtotalSAR: subtotal,
    discountPercent: discountApplied ? config.discountPercent : 0,
    discountSAR: discount,
    totalSAR: total,
    discountApplied: discountApplied,
  };
}

function assertNoClientMoney(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return;
  const supplied = CLIENT_MONEY_KEYS.filter(function (key) {
    return Object.prototype.hasOwnProperty.call(body, key);
  });
  if (!supplied.length) return;
  const error = new Error('Pricing is set by Mathify. Send only the session count.');
  error.code = 'CLIENT_AMOUNT_REJECTED';
  error.status = 400;
  error.fields = supplied;
  throw error;
}

async function checkout(parentUser, input) {
  assertNoClientMoney(input);
  if (!parentUser || parentUser.role !== 'parent' || !parentUser.childId) {
    const error = new Error('A linked child is required to add sessions.');
    error.code = 'PARENT_CHILD_REQUIRED';
    error.status = 403;
    throw error;
  }

  const child = await Promise.resolve(db.findUserById(parentUser.childId));
  if (!child || child.role !== 'student') {
    const error = new Error('A linked child is required to add sessions.');
    error.code = 'PARENT_CHILD_REQUIRED';
    error.status = 403;
    throw error;
  }

  const selected = quote(input);

  /* Deterministic identity from state already on the server: a replay with the
     same payment id is a no-op in db.addSessions(), so no balance is credited
     twice. Nothing about the amount comes from the request. */
  const ownedPacks = await Promise.resolve(db.listPacksForStudent(child.id));
  const sequence =
    (Array.isArray(ownedPacks) ? ownedPacks : []).filter(function (pack) {
      return pack && String(pack.paymentRef || '').indexOf('mockpay_') === 0;
    }).length + 1;
  const paymentId = 'mockpay_' + child.id + '_' + sequence;

  const payment = await Promise.resolve(
    db.recordPayment({
      id: paymentId,
      provider: 'mock',
      method: 'mock_checkout',
      status: 'succeeded',
      parentId: parentUser.id,
      studentId: child.id,
      currency: selected.currency,
      sessions: selected.count,
      amountSAR: selected.totalSAR,
      createdAt: new Date().toISOString(),
    })
  );

  const updated = await Promise.resolve(db.addSessions(child.id, selected.count, payment));
  if (!updated) {
    const error = new Error('The child account could not be credited.');
    error.code = 'SESSION_CREDIT_FAILED';
    error.status = 503;
    throw error;
  }

  const packs = await Promise.resolve(db.listPacksForStudent(child.id));
  const pack =
    (Array.isArray(packs) ? packs : []).find(function (row) {
      return row && row.id === 'pack_' + paymentId;
    }) || null;
  const balance = Number(updated.sessionsRemaining) || 0;

  return {
    quote: selected,
    balance: balance,
    childId: child.id,
    pack: pack,
    payment: payment,
    receipt:
      selected.count +
      ' sessions credited · SAR ' +
      (Number.isInteger(selected.totalSAR)
        ? String(selected.totalSAR)
        : selected.totalSAR.toFixed(2)),
  };
}

module.exports = {
  quote: quote,
  checkout: checkout,
  publicPricing: publicPricing,
  assertNoClientMoney: assertNoClientMoney,
};
