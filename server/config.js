import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Tiny .env loader (no dependency)
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {}

const DATA_DIR = path.join(ROOT, 'server', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const f = path.join(DATA_DIR, 'jwt.secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(f, 'utf8');
}

export const config = {
  port: Number(process.env.PORT) || 4100,
  get databaseUrl() { return process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/vendorcrm'; },
  jwtSecret: secret(),
  adminEmail: process.env.ADMIN_EMAIL || 'owner@vendorcrm.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'owner123',
  companyName: process.env.COMPANY_NAME || 'My Marketplace',
  production: process.env.NODE_ENV === 'production',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'claude-haiku-5-5',
  sendbirdApi: process.env.SENDBIRD_API || '',
  sendbirdToken: process.env.SENDBIRD_TOKEN || '',
  distDir: path.join(ROOT, 'dist'),
};
