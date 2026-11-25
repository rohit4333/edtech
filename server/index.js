require('dotenv').config();

const app = require('./app');
const port = Number(process.env.PORT || 4000);

app.listen(port, function () {
  console.log('Mathify API listening on http://localhost:' + port);
  console.log('Demo logins: GET /api/auth/demo');
});
