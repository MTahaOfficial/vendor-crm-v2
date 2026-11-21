import pg from 'pg';
import { config } from './config.js';

pg.types.setTypeParser(20, (v) => parseInt(v, 10)); // BIGINT/COUNT as numbers
pg.types.setTypeParser(1700, (v) => parseFloat(v)); // NUMERIC as numbers

export let pool;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, handle TEXT NOT NULL DEFAULT '', external_id TEXT,
  active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vendors_ext_uq ON vendors (company_id, external_id) WHERE external_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vendor_id INT REFERENCES vendors(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','vendor')), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (lower(email));
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vendor_id INT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  external_id TEXT, name TEXT NOT NULL DEFAULT 'Unknown', phone TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead','interested','negotiating','won','lost')),
  stage_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_ext_uq ON customers (vendor_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_company_idx ON customers (company_id, vendor_id);
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vendor_id INT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  external_id TEXT, last_message_at TIMESTAMPTZ, msg_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_ext_uq ON conversations (company_id, external_id) WHERE external_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  external_id TEXT, sender TEXT NOT NULL CHECK (sender IN ('vendor','customer','system')),
  body TEXT NOT NULL DEFAULT '', sent_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS messages_ext_uq ON messages (conversation_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages (conversation_id, sent_at);
CREATE TABLE IF NOT EXISTS insights (
  conversation_id INT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  intent TEXT NOT NULL, sentiment TEXT NOT NULL, attention BOOLEAN NOT NULL DEFAULT false,
  summary TEXT NOT NULL DEFAULT '', suggested_reply TEXT NOT NULL DEFAULT '',
  stage_suggestion TEXT, engine TEXT NOT NULL DEFAULT 'rules', msg_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vendor_id INT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0), status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('pending','paid','cancelled')),
  note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_company_idx ON orders (company_id, vendor_id);
CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY, customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE SET NULL, body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS followups (
  id SERIAL PRIMARY KEY, customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL, due_at TIMESTAMPTZ NOT NULL, done BOOLEAN NOT NULL DEFAULT false,
  created_by INT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS followups_due_idx ON followups (done, due_at);
`;

const dbName = (u) => decodeURIComponent(new URL(u).pathname.replace(/^\//, ''));

export async function initDb() {
  const name = dbName(config.databaseUrl);
  let p = new pg.Pool({ connectionString: config.databaseUrl });
  try {
    await p.query('SELECT 1');
  } catch (e) {
    if (e.code !== '3D000') throw e; // database does not exist yet
    await p.end().catch(() => {});
    const admin = new URL(config.databaseUrl);
    admin.pathname = '/postgres';
    const a = new pg.Client({ connectionString: admin.toString() });
    await a.connect();
    await a.query(`CREATE DATABASE "${name.replace(/"/g, '')}"`);
    await a.end();
    p = new pg.Pool({ connectionString: config.databaseUrl });
  }
  pool = p;
  await pool.query(SCHEMA);
}
