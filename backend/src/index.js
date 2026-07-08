const express = require('express');
const cors = require('cors');
const { createRouter } = require('./routes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Request logger: prints every hit, the port it arrived on, payload, status and timing
app.use((req, res, next) => {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const body = req.body && Object.keys(req.body).length
      ? JSON.stringify(req.body).slice(0, 500)
      : '-';

    console.log(
      `[${timestamp}] PORT:${PORT} ${req.method} ${req.originalUrl} ` +
      `status=${res.statusCode} duration=${duration}ms body=${body}`
    );
  });

  next();
});

app.use('/', createRouter());

app.listen(PORT, () => {
  console.log(`SQL Editor backend running on http://localhost:${PORT}`);
});
