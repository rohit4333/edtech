/* /api/parent — in-app class reminders, session balance and mock pack checkout.
 * The child link is always reloaded from the database; a client-supplied child
 * id, amount, currency or discount is never accepted, so one parent cannot read
 * or credit another family's sessions. */

const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db');
const service = require('../services/parentReminderService');
const packs = require('../services/packCheckoutService');

const router = express.Router();

async function linkedChild(req) {
  const user = await Promise.resolve(db.findUserById(req.user.id));
  if (!user || user.role !== 'parent' || !user.childId) return null;
  const child = await Promise.resolve(db.findUserById(user.childId));
  if (!child || child.role !== 'student') return null;
  return { user: user, child: child };
}

function noChild(res) {
  return res.status(403).json({
    error: 'PARENT_CHILD_REQUIRED',
    message: 'Sign in as a parent with a linked child.',
  });
}

router.get('/reminders', auth.requireAuth, auth.requireRole('parent'), async function (req, res) {
  try {
    const user = await db.findUserById(req.user.id);
    if (!user || user.role !== 'parent' || !user.childId) {
      return res.json({
        reminders: [],
        earlyJoinMinutes: 10,
        timezone: (user && user.timezone) || null,
      });
    }
    const data = await service.forStudent(user.childId, Date.now(), user);
    return res.json(data);
  } catch (error) {
    return res
      .status(error && error.status >= 400 && error.status < 600 ? error.status : 503)
      .json({
        error: 'PARENT_REMINDERS_UNAVAILABLE',
        message: 'Class reminders are unavailable right now.',
      });
  }
});

router.get('/wallet', auth.requireAuth, auth.requireRole('parent'), async function (req, res) {
  try {
    const link = await linkedChild(req);
    if (!link) return noChild(res);
    const balance = Number(link.child.sessionsRemaining) || 0;
    return res.json({
      childId: link.child.id,
      sessionsRemaining: balance,
      balance: balance,
      lowBalanceThreshold: 2,
      lowBalance: balance <= 2,
      currency: 'SAR',
      pricing: packs.publicPricing(),
    });
  } catch (error) {
    return res.status(503).json({
      error: 'PARENT_WALLET_UNAVAILABLE',
      message: 'The class balance could not be loaded right now.',
    });
  }
});

router.get('/pack/quote', auth.requireAuth, auth.requireRole('parent'), async function (req, res) {
  try {
    const link = await linkedChild(req);
    if (!link) return noChild(res);
    const raw = req.query.count;
    /* Only a JSON integer is accepted. "4", "4.0" and 4.5 are all rejected. */
    const count = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
    return res.json({ quote: packs.quote({ count: count }) });
  } catch (error) {
    return res.status(error && error.status === 400 ? 400 : 503).json({
      error:
        error && error.code === 'INVALID_SESSION_COUNT' ? error.code : 'PACK_QUOTE_UNAVAILABLE',
      message:
        error && error.status === 400 ? error.message : 'A quote could not be prepared right now.',
    });
  }
});

router.post(
  '/pack/checkout',
  auth.requireAuth,
  auth.requireRole('parent'),
  async function (req, res) {
    try {
      const link = await linkedChild(req);
      if (!link) return noChild(res);
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      /* A crafted request that sends money fields is rejected before any quote
       is produced; the amount is always computed by packCheckoutService. */
      packs.assertNoClientMoney(body);
      const result = await packs.checkout(link.user, { count: body.count });
      return res.status(201).json(result);
    } catch (error) {
      if (error && error.status === 400) {
        return res.status(400).json({
          error: error.code || 'INVALID_CHECKOUT',
          message: error.message,
        });
      }
      if (error && error.status === 403) {
        return noChild(res);
      }
      return res.status(503).json({
        error: 'PACK_CHECKOUT_UNAVAILABLE',
        message: 'Sessions could not be added right now. Please retry.',
      });
    }
  }
);

module.exports = router;
