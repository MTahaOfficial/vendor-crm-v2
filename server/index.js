import express from 'express';
import compression from 'compression';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { initDb, pool } from './db.js';
import { authRouter, ensureOwner, HttpError } from './auth.js';
import { api } from './routes.js';
import { loadDemo } from './demo.js';
import { syncAndAnalyze, chatConfigured } from './sync.js';

await initDb();
await ensureOwner();

const app = express();
app.set('trust proxy', 1);
app.use(compression());
app.use(express.json({ limit: '200kb' }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api', api);

if (fs.existsSync(config.distDir)) {
  app.use(express.static(config.distDir));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(config.distDir, 'index.html')));
}

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message });
});

// First run with no chat source: fill the company with demo data so the app is not empty.
const co = (await pool.query('SELECT id FROM companies ORDER BY id LIMIT 1')).rows[0];
if (!chatConfigured() && !(await pool.query('SELECT 1 FROM customers LIMIT 1')).rowCount) {
  console.log('[demo]', await loadDemo(co.id));
}
if (chatConfigured()) {
  const run = () => syncAndAnalyze(co.id).catch((e) => console.error('[sync]', e.message));
  run();
  setInterval(run, 5 * 60_000);
}

app.listen(config.port, () => console.log(`Vendor CRM on http://localhost:${config.port}`));
