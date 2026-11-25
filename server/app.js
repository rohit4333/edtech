const config = require('./config');

const express = require('express');
const cors = require('cors');
const auth = require('./middleware/auth');
const realtime = require('./realtime');

const authRoutes = require('./routes/auth');
const trainerRoutes = require('./routes/trainer');
const studentRoutes = require('./routes/student');
const sessionRoutes = require('./routes/sessions');
const policyRoutes = require('./routes/policy');
const webhookRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin');
const agoraRoutes = require('./routes/agora');
const razorpayRoutes = require('./routes/razorpay');
const leaveRoutes = require('./routes/leaves');

const app = express();
const configuredOrigin = config.corsOrigin;

app.use(cors({
  origin: configuredOrigin === '*' ? '*' : configuredOrigin.split(',').map(function (value) { return value.trim(); })
}));
/* Razorpay and Agora sign the raw body, so these routes must be read first. */
app.use('/api/razorpay/webhook', express.raw({ type: 'application/json' }));
app.use('/api/agora/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', function (req, res) {
  return res.json({
    ok: true,
    service: 'mathify-server',
    phase: 1,
    database: config.databaseMode,
    supabaseConfigured: config.supabaseConfigured,
    realtime: realtime.mode
  });
});

/* Browser-safe Supabase config. The secret key is never exposed here. */
app.get('/api/public/config', function (req, res) {
  return res.json({
    supabase: {
      url: config.supabase.url,
      publishableKey: config.supabase.publishableKey,
      realtimeEnabled: Boolean(config.supabase.url && config.supabase.publishableKey)
    },
    realtimeMode: realtime.mode
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/trainer', trainerRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/policy', policyRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/agora', agoraRoutes);
app.use('/api/razorpay', razorpayRoutes);
app.use('/api/leaves', leaveRoutes);

app.get('/api/realtime/log', auth.requireAuth, auth.requireRole('trainer', 'founder'), function (req, res) {
  return res.json({ mode: realtime.mode, events: realtime.recent(req.query.limit) });
});

app.use(function (req, res) {
  return res.status(404).json({ error: 'NOT_FOUND', message: 'No such endpoint.' });
});

app.use(function (error, req, res, next) {
  console.error(error);
  return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong.' });
});

module.exports = app;
