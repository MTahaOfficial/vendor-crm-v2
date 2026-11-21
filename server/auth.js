import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { config } from './config.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sign = (u) => jwt.sign({ uid: u.id }, config.jwtSecret, { expiresIn: '7d' });

/** Loads the user on every request so a deleted or changed account takes effect at once. */
export function requireAuth(role) {
  return async (req, _res, next) => {
    try {
      const h = req.headers.authorization || '';
      if (!h.startsWith('Bearer ')) throw new HttpError(401, 'Sign in required');
      let payload;
      try {
        payload = jwt.verify(h.slice(7), config.jwtSecret);
      } catch {
        throw new HttpError(401, 'Session expired, sign in again');
      }
      const u = (await pool.query('SELECT id, company_id, vendor_id, name, email, role FROM users WHERE id = $1', [payload.uid])).rows[0];
      if (!u) throw new HttpError(401, 'Account no longer exists');
      if (role && u.role !== role) throw new HttpError(403, 'Not allowed for your role');
      req.user = u;
      next();
    } catch (e) {
      next(e);
    }
  };
}

const fails = new Map();
const recent = (ip) => (fails.get(ip) || []).filter((t) => Date.now() - t < 60_000);

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  if (recent(req.ip).length >= 8) throw new HttpError(429, 'Too many attempts, wait a minute');
  const { email = '', password = '' } = req.body || {};
  const u = (await pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [String(email)])).rows[0];
  if (!u || !(await bcrypt.compare(String(password), u.password_hash))) {
    fails.set(req.ip, [...recent(req.ip), Date.now()]);
    throw new HttpError(401, 'Wrong email or password');
  }
  res.json({ token: sign(u), user: await profile(u.id) });
});

authRouter.get('/me', requireAuth(), async (req, res) => res.json({ user: await profile(req.user.id) }));

export async function profile(id) {
  return (
    await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.vendor_id, c.name AS company, v.name AS vendor
         FROM users u JOIN companies c ON c.id = u.company_id LEFT JOIN vendors v ON v.id = u.vendor_id WHERE u.id = $1`,
      [id],
    )
  ).rows[0];
}

export async function ensureOwner() {
  const has = (await pool.query("SELECT 1 FROM users WHERE role = 'owner' LIMIT 1")).rowCount;
  if (has) return;
  if (config.production && config.adminPassword === 'owner123') {
    throw new Error('Set ADMIN_PASSWORD in .env before running in production');
  }
  const c = (await pool.query('INSERT INTO companies (name) VALUES ($1) RETURNING id', [config.companyName])).rows[0];
  await pool.query("INSERT INTO users (company_id, name, email, password_hash, role) VALUES ($1,'Owner',$2,$3,'owner')", [c.id, config.adminEmail, await bcrypt.hash(config.adminPassword, 10)]);
  console.log(`[auth] owner created: ${config.adminEmail}`);
}
