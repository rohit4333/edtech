const config = require('./config');

const app = require('./app');
const port = config.port;

app.listen(port, function () {
  console.log('Mathify API listening on http://localhost:' + port);
  console.log('Demo logins: GET /api/auth/demo');
});
