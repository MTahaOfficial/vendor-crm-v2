import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { requireAuth, HttpError } from './auth.js';
import { analyzeConversation, analyzeAll } from './insights.js';
import { syncAndAnalyze, chatConfigured } from './sync.js';
import { loadDemo } from './demo.js';
import { aiStatus } from './ai.js';

export const api = Router();
api.use(requireAuth());

const STAGES = ['lead', 'interested', 'negotiating', 'won', 'lost'];
const owner = requireAuth('owner');
const wrap = (f) => (req, res, next) => Promise.resolve(f(req, res, next)).catch(next);
const int = (v) => (/^\d+$/.test(String(v)) ? Number(v) : NaN);

/** Vendors only ever see their own customers; owners see the whole company. */
const scope = (req, alias = 'cu', start = 2) => {
  const p = [req.user.company_id];
  let sql = `${alias}.company_id = $1`;
  if (req.user.role === 'vendor') {
    p.push(req.user.vendor_id || 0);
    sql += ` AND ${alias}.vendor_id = $${start}`;
  }
  return { sql, p };
};

async function loadCustomer(req, id) {
  if (!Number.isInteger(id)) throw new HttpError(400, 'Bad id');
  const s = scope(req, 'cu', 3);
  const c = (await pool.query(`SELECT cu.* FROM customers cu WHERE cu.id = $2 AND ${s.sql.replace('$1', '$1')}`.replace(/\$3/g, '$3'), [s.p[0], id, ...s.p.slice(1)])).rows[0];
  if (!c) throw new HttpError(404, 'Customer not found');
  return c;
}

api.get('/status', wrap(async (req, res) =>
  res.json({ ai: aiStatus(), chat: chatConfigured() ? 'sendbird' : 'demo' })));

// ---- Dashboard ------------------------------------------------------------
api.get('/dashboard', wrap(async (req, res) => {
  const s = scope(req);
  const q = (sql, p = s.p) => pool.query(sql, p).then((r) => r.rows);
  const [totals] = await q(
    `SELECT count(*) AS customers,
            count(*) FILTER (WHERE cu.stage = 'won') AS won,
            count(*) FILTER (WHERE i.attention) AS attention,
            count(*) FILTER (WHERE i.intent = 'ready_to_buy' AND cu.stage <> 'won') AS hot
       FROM customers cu LEFT JOIN conversations cv ON cv.customer_id = cu.id LEFT JOIN insights i ON i.conversation_id = cv.id WHERE ${s.sql}`);
  const [rev] = await q(
    `SELECT COALESCE(sum(o.amount) FILTER (WHERE o.status = 'paid'), 0) AS revenue,
            COALESCE(sum(o.amount) FILTER (WHERE o.status = 'paid' AND o.created_at > now() - interval '30 days'), 0) AS revenue_30d,
            count(*) FILTER (WHERE o.status = 'paid') AS orders
       FROM orders o JOIN customers cu ON cu.id = o.customer_id WHERE ${s.sql}`);
  const stages = await q(`SELECT cu.stage, count(*) AS n FROM customers cu WHERE ${s.sql} GROUP BY cu.stage`);
  const intents = await q(`SELECT i.intent, count(*) AS n FROM insights i JOIN conversations cv ON cv.id = i.conversation_id JOIN customers cu ON cu.id = cv.customer_id WHERE ${s.sql} GROUP BY i.intent`);
  const sentiments = await q(`SELECT i.sentiment, count(*) AS n FROM insights i JOIN conversations cv ON cv.id = i.conversation_id JOIN customers cu ON cu.id = cv.customer_id WHERE ${s.sql} GROUP BY i.sentiment`);
  // first response: minutes between a customer's first message and the first vendor reply after it
  const [frt] = await q(
    `SELECT round(avg(x.mins)::numeric, 1) AS avg_minutes FROM (
        SELECT EXTRACT(EPOCH FROM (min(v.sent_at) - min(c.sent_at))) / 60 AS mins
          FROM conversations cv JOIN customers cu ON cu.id = cv.customer_id
          JOIN messages c ON c.conversation_id = cv.id AND c.sender = 'customer'
          JOIN messages v ON v.conversation_id = cv.id AND v.sender = 'vendor' AND v.sent_at > c.sent_at
         WHERE ${s.sql} GROUP BY cv.id) x`);
  const attention = await q(
    `SELECT cu.id, cu.name, v.name AS vendor, i.intent, i.summary, cv.last_message_at
       FROM insights i JOIN conversations cv ON cv.id = i.conversation_id JOIN customers cu ON cu.id = cv.customer_id JOIN vendors v ON v.id = cu.vendor_id
      WHERE ${s.sql} AND i.attention ORDER BY cv.last_message_at DESC LIMIT 8`);
  const due = await q(
    `SELECT f.id, f.title, f.due_at, cu.id AS customer_id, cu.name AS customer
       FROM followups f JOIN customers cu ON cu.id = f.customer_id WHERE ${s.sql} AND NOT f.done ORDER BY f.due_at LIMIT 8`);
  res.json({ totals, revenue: rev, stages, intents, sentiments, firstResponseMinutes: frt?.avg_minutes ?? null, attention, followups: due });
}));

// ---- Vendors (owner) ---------------------------------------------------------
api.get('/vendors', owner, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT v.id, v.name, v.handle, v.active,
            (SELECT count(*) FROM customers c WHERE c.vendor_id = v.id) AS customers,
            (SELECT count(*) FROM customers c WHERE c.vendor_id = v.id AND c.stage = 'won') AS won,
            (SELECT COALESCE(sum(o.amount),0) FROM orders o WHERE o.vendor_id = v.id AND o.status = 'paid') AS revenue,
            (SELECT count(*) FROM insights i JOIN conversations cv ON cv.id = i.conversation_id WHERE cv.vendor_id = v.id AND i.attention) AS attention,
            (SELECT email FROM users u WHERE u.vendor_id = v.id LIMIT 1) AS login_email
       FROM vendors v WHERE v.company_id = $1 ORDER BY v.name`, [req.user.company_id]);
  res.json({ vendors: rows });
}));

api.post('/vendors', owner, wrap(async (req, res) => {
  const { name, handle = '', external_id = null, email, password } = req.body || {};
  if (!String(name || '').trim()) throw new HttpError(400, 'Vendor name is required');
  if (email && String(password || '').length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const v = (await c.query('INSERT INTO vendors (company_id, name, handle, external_id) VALUES ($1,$2,$3,$4) RETURNING id', [req.user.company_id, String(name).trim(), handle, external_id || null])).rows[0];
    if (email) {
      await c.query("INSERT INTO users (company_id, vendor_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5,'vendor')", [req.user.company_id, v.id, String(name).trim(), String(email).trim(), await bcrypt.hash(String(password), 10)]);
    }
    await c.query('COMMIT');
    res.status(201).json({ id: v.id });
  } catch (e) {
    await c.query('ROLLBACK');
    if (e.code === '23505') throw new HttpError(409, 'That email or vendor id is already used');
    throw e;
  } finally {
    c.release();
  }
}));

// ---- Customers --------------------------------------------------------------
api.get('/customers', wrap(async (req, res) => {
  const s = scope(req);
  const p = [...s.p];
  let where = s.sql;
  const { stage, intent, vendor, q, attention } = req.query;
  if (STAGES.includes(stage)) where += ` AND cu.stage = $${p.push(stage)}`;
  if (intent) where += ` AND i.intent = $${p.push(String(intent))}`;
  if (vendor && req.user.role === 'owner' && Number.isInteger(int(vendor))) where += ` AND cu.vendor_id = $${p.push(int(vendor))}`;
  if (q) where += ` AND (cu.name ILIKE $${p.push('%' + String(q).slice(0, 60) + '%')} OR cu.phone ILIKE $${p.length})`;
  if (attention === '1') where += ' AND i.attention';
  const { rows } = await pool.query(
    `SELECT cu.id, cu.name, cu.phone, cu.stage, v.name AS vendor, cv.id AS conversation_id, cv.last_message_at, cv.msg_count,
            i.intent, i.sentiment, i.attention, i.summary, i.engine,
            (SELECT COALESCE(sum(amount),0) FROM orders o WHERE o.customer_id = cu.id AND o.status = 'paid') AS spent
       FROM customers cu JOIN vendors v ON v.id = cu.vendor_id
       LEFT JOIN conversations cv ON cv.customer_id = cu.id LEFT JOIN insights i ON i.conversation_id = cv.id
      WHERE ${where} ORDER BY i.attention DESC NULLS LAST, cv.last_message_at DESC NULLS LAST LIMIT 500`, p);
  res.json({ customers: rows });
}));

api.get('/customers/:id', wrap(async (req, res) => {
  const c = await loadCustomer(req, int(req.params.id));
  const [vendor, conv, orders, notes, followups] = await Promise.all([
    pool.query('SELECT id, name, handle FROM vendors WHERE id = $1', [c.vendor_id]),
    pool.query(`SELECT cv.id, cv.last_message_at, cv.msg_count, i.intent, i.sentiment, i.attention, i.summary, i.suggested_reply, i.stage_suggestion, i.engine, i.updated_at
                  FROM conversations cv LEFT JOIN insights i ON i.conversation_id = cv.id WHERE cv.customer_id = $1 ORDER BY cv.id LIMIT 1`, [c.id]),
    pool.query('SELECT id, amount, status, note, created_at FROM orders WHERE customer_id = $1 ORDER BY created_at DESC', [c.id]),
    pool.query('SELECT n.id, n.body, n.created_at, u.name AS author FROM notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.customer_id = $1 ORDER BY n.created_at DESC', [c.id]),
    pool.query('SELECT id, title, due_at, done FROM followups WHERE customer_id = $1 ORDER BY done, due_at', [c.id]),
  ]);
  const cv = conv.rows[0];
  const messages = cv ? (await pool.query('SELECT id, sender, body, sent_at FROM messages WHERE conversation_id = $1 ORDER BY sent_at, id', [cv.id])).rows : [];
  res.json({ customer: c, vendor: vendor.rows[0], conversation: cv || null, messages, orders: orders.rows, notes: notes.rows, followups: followups.rows });
}));

api.patch('/customers/:id', wrap(async (req, res) => {
  const c = await loadCustomer(req, int(req.params.id));
  const { stage, phone, name } = req.body || {};
  if (stage !== undefined && !STAGES.includes(stage)) throw new HttpError(400, 'Unknown stage');
  await pool.query(
    `UPDATE customers SET stage = COALESCE($2, stage), stage_locked = CASE WHEN $2::text IS NULL THEN stage_locked ELSE true END,
            phone = COALESCE($3, phone), name = COALESCE($4, name) WHERE id = $1`,
    [c.id, stage ?? null, phone === undefined ? null : String(phone).slice(0, 30), name === undefined ? null : String(name).slice(0, 80)]);
  res.json({ ok: true });
}));

api.post('/customers/:id/analyze', wrap(async (req, res) => {
  const c = await loadCustomer(req, int(req.params.id));
  const cv = (await pool.query('SELECT id FROM conversations WHERE customer_id = $1 LIMIT 1', [c.id])).rows[0];
  if (!cv) throw new HttpError(404, 'No conversation to analyse');
  res.json({ insight: await analyzeConversation(cv.id) });
}));

api.post('/customers/:id/notes', wrap(async (req, res) => {
  const c = await loadCustomer(req, int(req.params.id));
  const body = String(req.body?.body || '').trim();
  if (!body) throw new HttpError(400, 'Note is empty');
  const r = await pool.query('INSERT INTO notes (customer_id, user_id, body) VALUES ($1,$2,$3) RETURNING id', [c.id, req.user.id, body.slice(0, 2000)]);
  res.status(201).json({ id: r.rows[0].id });
}));

api.post('/customers/:id/followups', wrap(async (req, res) => {
  const c = await loadCustomer(req, int(req.params.id));
  const title = String(req.body?.title || '').trim();
  const due = new Date(req.body?.due_at);
  if (!title || isNaN(due)) throw new HttpError(400, 'Title and a valid due date are required');
  const r = await pool.query('INSERT INTO followups (customer_id, title, due_at, created_by) VALUES ($1,$2,$3,$4) RETURNING id', [c.id, title.slice(0, 200), due, req.user.id]);
  res.status(201).json({ id: r.rows[0].id });
}));

api.patch('/followups/:id', wrap(async (req, res) => {
  const id = int(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Bad id');
  const f = (await pool.query('SELECT customer_id FROM followups WHERE id = $1', [id])).rows[0];
  if (!f) throw new HttpError(404, 'Not found');
  await loadCustomer(req, f.customer_id);
  await pool.query('UPDATE followups SET done = $2 WHERE id = $1', [id, !!req.body?.done]);
  res.json({ ok: true });
}));

api.post('/customers/:id/orders', wrap(async (req, res) => {
  const c = await loadCustomer(req, int(req.params.id));
  const amount = Number(req.body?.amount);
  const status = req.body?.status || 'paid';
  if (!(amount >= 0) || !isFinite(amount)) throw new HttpError(400, 'Amount must be a number');
  if (!['pending', 'paid', 'cancelled'].includes(status)) throw new HttpError(400, 'Bad status');
  const r = await pool.query('INSERT INTO orders (company_id, vendor_id, customer_id, amount, status, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [c.company_id, c.vendor_id, c.id, amount, status, String(req.body?.note || '').slice(0, 300)]);
  if (status === 'paid' && !c.stage_locked) await pool.query("UPDATE customers SET stage = 'won' WHERE id = $1", [c.id]);
  res.status(201).json({ id: r.rows[0].id });
}));

// ---- Export / sync / demo -----------------------------------------------------
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
api.get('/export/customers.csv', wrap(async (req, res) => {
  const s = scope(req);
  const { rows } = await pool.query(
    `SELECT cu.name, cu.phone, v.name AS vendor, cu.stage, i.intent, i.sentiment, i.attention, i.summary, cv.last_message_at,
            (SELECT COALESCE(sum(amount),0) FROM orders o WHERE o.customer_id = cu.id AND o.status='paid') AS spent
       FROM customers cu JOIN vendors v ON v.id = cu.vendor_id LEFT JOIN conversations cv ON cv.customer_id = cu.id LEFT JOIN insights i ON i.conversation_id = cv.id
      WHERE ${s.sql} ORDER BY cu.name`, s.p);
  const head = ['Customer', 'Phone', 'Vendor', 'Stage', 'Intent', 'Sentiment', 'Needs attention', 'AI summary', 'Last message', 'Total spent'];
  const lines = rows.map((r) => [r.name, r.phone, r.vendor, r.stage, r.intent, r.sentiment, r.attention ? 'yes' : 'no', r.summary, r.last_message_at?.toISOString?.() || '', r.spent].map(csv).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
  res.send([head.map(csv).join(','), ...lines].join('\r\n'));
}));

api.post('/sync', owner, wrap(async (req, res) => res.json(await syncAndAnalyze(req.user.company_id))));
api.post('/analyze-all', owner, wrap(async (req, res) => res.json(await analyzeAll(req.user.company_id, { force: true }))));
api.post('/demo/load', owner, wrap(async (req, res) => {
  if (chatConfigured()) throw new HttpError(400, 'A real chat source is connected; demo data is disabled');
  res.json(await loadDemo(req.user.company_id));
}));
