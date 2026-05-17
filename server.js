// server.js — ESM entry point
// The original src/app.js is missing from the repository.
// Replace this with the actual application setup.
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'VAPEX API is running' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
