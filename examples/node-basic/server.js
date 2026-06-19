const express = require('express');

const app = express();
const port = Number(process.env.PORT || 3000);

app.get('/', (_req, res) => {
  res.send('DevSurface node-basic example');
});

app.listen(port, '127.0.0.1', () => {
  console.log(`node-basic listening on http://127.0.0.1:${port}`);
});
