const express = require('express');
const cors = require('cors');
const { createRouter } = require('./routes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/', createRouter());

app.listen(PORT, () => {
  console.log(`SQL Editor backend running on http://localhost:${PORT}`);
});
