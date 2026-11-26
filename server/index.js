const config = require('./config');

config.assertProductionConfig();

const app = require('./app');
const logger = require('./services/logger');
const reminders = require('./jobs/reminders');
const port = config.port;

const server = app.listen(port, function () {
  logger.info('server', { event: 'listening', port: port, databaseMode: config.databaseMode });
  console.log('Demo logins: GET /api/auth/demo');
});

reminders.startReminders();

function shutdown(signal) {
  logger.info('server', { event: 'shutdown', signal: signal });
  reminders.stopReminders();
  server.close(function () { process.exit(0); });
  setTimeout(function () { process.exit(0); }, 3000).unref();
}

process.on('SIGTERM', function () { shutdown('SIGTERM'); });
process.on('SIGINT', function () { shutdown('SIGINT'); });
