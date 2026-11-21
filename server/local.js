// One-window start with a built-in PostgreSQL (no install, no password):  npm run start:local
// Starts a private PostgreSQL on its own port (5433 or the next free one), then starts the app on it.
// Your own PostgreSQL, if any, is left alone. Data is kept in server/data/pg.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { ROOT } from './config.js';

let EmbeddedPostgres;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
} catch (e) {
  console.error('The built-in database is not installed for this computer:', e.message);
  console.error('Run npm install, or install PostgreSQL and use `npm start` with DATABASE_URL in .env');
  process.exit(1);
}

const free = (p) => new Promise((ok) => { const s = net.createServer(); s.once('error', () => ok(false)); s.once('listening', () => s.close(() => ok(true))); s.listen(p, '127.0.0.1'); });
let port = Number(process.env.PGPORT) || 5433;
while (!(await free(port))) port++;

const dir = process.env.EMBEDDED_PG_DIR || path.join(ROOT, 'server', 'data', 'pg');
fs.mkdirSync(path.dirname(dir), { recursive: true });
const tail = [];
const keep = (m) => { for (const l of String(m).split(/\r?\n/)) if (l.trim()) tail.push(l.trim()); tail.splice(0, Math.max(0, tail.length - 30)); };
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port, persistent: true, onLog: keep, onError: keep });

const fail = (e) => {
  console.error('\nThe built-in database could not start:', e?.message || '');
  if (tail.length) console.error(tail.slice(-12).join('\n'));
  console.error('\nTry: (1) install "Microsoft Visual C++ Redistributable 2015-2022 (x64)" if a DLL is mentioned; (2) delete server\\data\\pg and run again; (3) use your own PostgreSQL with `npm start`.');
  process.exit(1);
};
if (!fs.existsSync(path.join(dir, 'PG_VERSION'))) { console.log('First run: preparing the database (about 20 seconds)...'); await pg.initialise().catch(fail); }
await pg.start().catch(fail);
try { await pg.createDatabase('vendorcrm'); } catch { /* exists */ }
process.env.DATABASE_URL = `postgres://postgres:postgres@localhost:${port}/vendorcrm`;
console.log(`Built-in PostgreSQL running on port ${port}`);

let stopping = false;
const stop = async () => { if (stopping) return; stopping = true; console.log('\nStopping database...'); try { await pg.stop(); } finally { process.exit(0); } };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await import('./index.js');
