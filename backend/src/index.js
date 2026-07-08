const express = require('express');
const cors = require('cors');
const { createRouter } = require('./routes');

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Credentials cannot be used with the wildcard origin, so only enable them
// when a specific frontend origin is configured.
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: CORS_ORIGIN !== '*',
}));
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

// Health / root route (outside /api so Render shows something at the bare URL)
app.get('/', (_req, res) => {
  res.json({
    name: 'SQL Editor backend',
    status: 'ok',
    endpoints: {
      health: '/api/health',
      schema: '/api/schema',
      executeQuery: '/api/execute-query',
    },
  });
});

// All API routes live under /api
app.use('/api', createRouter());

app.listen(PORT, () => {
  console.log(`SQL Editor backend running on http://localhost:${PORT}`);
});
