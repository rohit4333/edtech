/* Razorpay order creation + payment.captured webhook. */
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const realtime = require('../realtime');
const service = require('../services/razorpayService');

const router = express.Router();

router.post('/orders/monthly', auth.requireAuth, auth.requireRole('student', 'founder'), async function (req, res) {
  const requestedStudentId = String((req.body || {}).studentId || '').trim();

  if (req.user.role === 'student' && requestedStudentId && requestedStudentId !== req.user.id) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only buy your own pack.' });
  }

  const studentId = requestedStudentId || (req.user.role === 'student' ? req.user.id : '');

  try {
    const result = await service.createMonthlyPackOrder({ studentId: studentId });
    db.saveRazorpayOrder({
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

  if (db.findPayment(payment.id)) {
    return res.json({ received: true, ignored: true, reason: 'ALREADY_CREDITED' });
  }

  const savedOrder = payment.orderId ? db.findRazorpayOrder(payment.orderId) : null;
  const studentId = payment.notes.studentId || (savedOrder && savedOrder.studentId);
  const sessions = Number(payment.notes.sessions || (savedOrder && savedOrder.sessions)) ||
    service.MONTHLY_PACK.sessions;

  if (!studentId) {
    return res.json({ received: true, ignored: true, reason: 'STUDENT_NOT_FOUND' });
  }

  if (payment.amount !== service.MONTHLY_PACK.amount ||
      payment.currency !== service.MONTHLY_PACK.currency) {
    return res.json({ received: true, ignored: true, reason: 'PACK_MISMATCH' });
  }

  if (!db.findUserById(studentId)) {
    return res.json({ received: true, ignored: true, reason: 'STUDENT_NOT_FOUND' });
  }

  db.recordPayment({
    id: payment.id,
    orderId: payment.orderId,
    studentId: studentId,
    amount: payment.amount,
    currency: payment.currency,
    sessions: sessions,
    capturedAt: payment.capturedAt,
    createdAt: new Date().toISOString()
  });

  const student = db.addSessions(studentId, sessions, { id: payment.id });
  if (!student) {
    return res.json({ received: true, ignored: true, reason: 'STUDENT_NOT_FOUND' });
  }

  realtime.publish(studentId, 'pack.credited', {
    paymentId: payment.id,
    sessionsAdded: sessions,
    sessionsRemaining: student.sessionsRemaining
  });

  return res.json({
    received: true,
    credited: true,
    studentId: studentId,
    sessionsAdded: sessions,
    sessionsRemaining: student.sessionsRemaining
  });
});

module.exports = router;
