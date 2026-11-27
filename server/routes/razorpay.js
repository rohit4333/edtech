/* Razorpay order creation + payment.captured webhook. */
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const realtime = require('../realtime');
const service = require('../services/razorpayService');
const demoService = require('../services/demoService');

const router = express.Router();

function packSummary() {
  return {
    id: service.MONTHLY_PACK.id,
    label: service.MONTHLY_PACK.label,
    sessions: service.MONTHLY_PACK.sessions,
    amount: service.MONTHLY_PACK.amount,
    currency: service.MONTHLY_PACK.currency
  };
}

router.post('/orders/monthly', auth.requireAuth, auth.requireRole('student', 'founder'), async function (req, res) {
  const requestedStudentId = String((req.body || {}).studentId || '').trim();

  if (req.user.role === 'student' && requestedStudentId && requestedStudentId !== req.user.id) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only buy your own pack.' });
  }

  const studentId = requestedStudentId || (req.user.role === 'student' ? req.user.id : '');

  try {
    /* Same pack + customer inside one retry window reuses the saved order. */
    const receipt = service.monthlyPackReceipt(studentId);
    const existing = await db.findRazorpayOrderByReceipt(receipt);
    if (existing && existing.status === 'created') {
      return res.status(200).json({
        order: { id: existing.id, receipt: existing.receipt },
        pack: packSummary()
      });
    }

    const result = await service.createMonthlyPackOrder({ studentId: studentId, receipt: receipt });
    await db.saveRazorpayOrder({
      id: result.order.id,
      studentId: studentId,
      packId: result.pack.id,
      sessions: result.pack.sessions,
      amount: result.pack.amount,
      currency: result.pack.currency,
      receipt: result.order.receipt,
      status: 'created',
      createdAt: new Date().toISOString()
    });

    return res.status(201).json(result);
  } catch (error) {
    const status = error.code === 'INVALID_PAYLOAD' ? 400 :
      error.code === 'RAZORPAY_NOT_CONFIGURED' ? 503 : 502;
    return res.status(status).json({
      error: error.code || 'ORDER_CREATION_FAILED',
      message: error.message
    });
  }
});

router.post('/webhook', async function (req, res) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

  let verified;
  try {
    verified = service.verifyWebhookSignature(rawBody, req.headers['x-razorpay-signature']);
  } catch (error) {
    return res.status(503).json({ error: error.code, message: error.message });
  }

  if (!verified) {
    return res.status(401).json({ error: 'INVALID_SIGNATURE', message: 'Webhook signature mismatch.' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (error) {
    return res.status(400).json({ error: 'INVALID_JSON', message: 'Webhook body is not JSON.' });
  }

  if (event.event !== 'payment.captured') {
    return res.json({ received: true, ignored: true, reason: 'EVENT_NOT_HANDLED' });
  }

  const payment = service.capturedPayment(event);
  if (!payment || payment.status !== 'captured') {
    return res.json({ received: true, ignored: true, reason: 'NO_CAPTURED_PAYMENT' });
  }

  const already = function () {
    return res.json({ received: true, ignored: true, reason: 'ALREADY_CREDITED' });
  };

  try {
    if (await db.findPayment(payment.id)) return already();

    /* Credit only against the order this server created. Payment notes and
       order notes supplied by a client are never trusted for identity or value. */
    const savedOrder = payment.orderId ? await db.findRazorpayOrder(payment.orderId) : null;
    if (!savedOrder) {
      return res.json({ received: true, ignored: true, reason: 'ORDER_NOT_FOUND' });
    }
    if (savedOrder.status === 'credited') return already();

    const studentId = savedOrder.studentId;
    const sessions = Number(savedOrder.sessions);

    if (!studentId || !Number.isInteger(sessions) || sessions < 1) {
      return res.json({ received: true, ignored: true, reason: 'INVALID_ORDER' });
    }

    if (payment.amount !== savedOrder.amount || payment.currency !== savedOrder.currency) {
      return res.json({ received: true, ignored: true, reason: 'PACK_MISMATCH' });
    }

    if (!await db.findUserById(studentId)) {
      return res.json({ received: true, ignored: true, reason: 'STUDENT_NOT_FOUND' });
    }

    const creditedAt = new Date().toISOString();
    const claim = await db.claimPayment({
      id: payment.id,
      orderId: payment.orderId,
      studentId: studentId,
      amount: payment.amount,
      currency: payment.currency,
      sessions: sessions,
      capturedAt: payment.capturedAt,
      createdAt: creditedAt
    });
    if (!claim || !claim.claimed) return already();

    /* Second gate: the order itself can only transition created -> credited.
       If another payment won that race, roll back our payment claim. */
    const orderClaim = await db.creditOrderIfCreated(payment.orderId, payment.id, creditedAt);
    if (!orderClaim || !orderClaim.claimed) {
      await db.releasePayment(payment.id);
      return already();
    }

    /* Once the order is credited, every remaining step must be able to undo
       that CAS. Otherwise a transient failure would leave the order marked
       credited and a retry would report ALREADY_CREDITED with no pack. */
    const compensate = async function () {
      try { await db.uncreditOrderIfCredited(payment.orderId, payment.id); }
      catch (error) { /* best effort: never hide the original failure */ }
      try { await db.releasePayment(payment.id); }
      catch (error) { /* best effort: never hide the original failure */ }
    };

    try {
      const student = await db.addSessions(studentId, sessions, { id: payment.id });
      if (!student) {
        await compensate();
        return res.json({ received: true, ignored: true, reason: 'STUDENT_NOT_FOUND' });
      }

      await realtime.publish(studentId, 'pack.credited', {
        paymentId: payment.id,
        sessionsAdded: sessions,
        sessionsRemaining: student.sessionsRemaining
      });

      /* A credited pack restores ordinary class access for demo families.
         This notice is best effort and never changes the payment response. */
      try {
        await demoService.onEnrolled(studentId);
      } catch (error) {
        console.error('[demo] enrollment update failed:', error.message);
      }

      return res.json({
        received: true,
        credited: true,
        studentId: studentId,
        sessionsAdded: sessions,
        sessionsRemaining: student.sessionsRemaining
      });
    } catch (error) {
      await compensate();
      throw error;
    }
  } catch (error) {
    return res.status(502).json({
      error: error.code || 'WEBHOOK_PROCESSING_FAILED',
      message: error.message
    });
  }
});

module.exports = router;
