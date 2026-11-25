require('dotenv').config();

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

const app = express();
const configuredOrigin = process.env.CORS_ORIGIN || '*';

app.use(cors({
  origin: configuredOrigin === '*' ? '*' : configuredOrigin.split(',').map(function (value) { return value.trim(); })
}));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', function (req, res) {
  return res.json({
    ok: true,
    service: 'mathify-server',
    phase: 1,
    database: process.env.DATABASE_MODE || 'mock',
    realtime: realtime.mode
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/trainer', trainerRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/policy', policyRoutes);
app.use('/api/webhooks', webhookRoutes);

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
