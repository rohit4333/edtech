/* Razorpay order + webhook service. Amounts are in the currency's smallest unit. */
const crypto = require('crypto');
const Razorpay = require('razorpay');

const MONTHLY_PACK = Object.freeze({
  id: 'monthly_12',
  label: 'Monthly pack · 12 sessions',
  sessions: 12,
  amount: 54000,
  currency: 'SAR'
});

function client() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keyId || !keySecret) {
    const error = new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be configured.');
    error.code = 'RAZORPAY_NOT_CONFIGURED';
    throw error;
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

async function createMonthlyPackOrder(input) {
  const studentId = String((input && input.studentId) || '').trim();
  if (!studentId) {
    const error = new Error('studentId is required.');
    error.code = 'INVALID_PAYLOAD';
    throw error;
  }

  const receipt = 'mathify_' + studentId.replace(/[^a-zA-Z0-9]/g, '').slice(-12) +
    '_' + Date.now().toString().slice(-8);

  const order = await client().orders.create({
    amount: MONTHLY_PACK.amount,
    currency: MONTHLY_PACK.currency,
    receipt: receipt,
    notes: {
      packId: MONTHLY_PACK.id,
      sessions: String(MONTHLY_PACK.sessions),
      studentId: studentId
    }
  });

  return {
    order: order,
    pack: {
      id: MONTHLY_PACK.id,
      label: MONTHLY_PACK.label,
      sessions: MONTHLY_PACK.sessions,
      amount: MONTHLY_PACK.amount,
      currency: MONTHLY_PACK.currency
    }
  };
}

function verifyWebhookSignature(rawBody, signature) {
  const secret = String(process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    const error = new Error('RAZORPAY_WEBHOOK_SECRET must be configured.');
    error.code = 'WEBHOOK_NOT_CONFIGURED';
    throw error;
  }
  if (!signature) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const actual = Buffer.from(String(signature));
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length) return false;
  return crypto.timingSafeEqual(actual, wanted);
}

function capturedPayment(event) {
  const payment = event && event.payload && event.payload.payment &&
    event.payload.payment.entity;
  const order = event && event.payload && event.payload.order &&
    event.payload.order.entity;
  if (!payment) return null;
  return {
    id: payment.id,
    orderId: payment.order_id || (order && order.id) || null,
    amount: Number(payment.amount),
    currency: String(payment.currency || '').toUpperCase(),
    status: String(payment.status || ''),
    notes: Object.assign({}, (order && order.notes) || {}, payment.notes || {}),
    capturedAt: payment.captured_at ? new Date(payment.captured_at * 1000).toISOString() : null
  };
}

module.exports = {
  MONTHLY_PACK,
  createMonthlyPackOrder,
  verifyWebhookSignature,
  capturedPayment
};
