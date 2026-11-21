import pg from '/tmp/vt2/node_modules/pg/lib/index.js';
const BASE = 'http://localhost:4200';
const pool = new pg.Pool({ connectionString: 'postgres://postgres:postgres@localhost:5440/vendorcrm' });
const login = await (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@vendorcrm.local', password: 'owner123' }) })).json();
const H = { authorization: 'Bearer ' + login.token };
const get = (p) => fetch(BASE + p, { headers: H }).then((r) => r.json());
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
async function time(path, n) { const t = []; for (let i = 0; i < n; i++) { const s = performance.now(); await get(path); t.push(performance.now() - s); } return { median: +pct(t, 0.5).toFixed(1), p95: +pct(t, 0.95).toFixed(1) }; }

const co = (await pool.query('SELECT id FROM companies LIMIT 1')).rows[0].id;
const v = (await pool.query('SELECT id FROM vendors WHERE company_id=$1 ORDER BY id LIMIT 1', [co])).rows[0].id;
const lines = ['Hi is it available? price?', 'Yes, PKR 4500', 'Can you do a discount? I will order today', 'Best is 5% off', 'Ok confirm my order, will pay advance', 'Parcel is late and broken, I want a refund', 'Shukriya, mil gaya, zabardast'];
// synthetic: 2000 customers / conversations / ~5 messages each
const c = await pool.connect();
await c.query('BEGIN');
for (let i = 0; i < 2000; i++) {
  const cu = (await c.query("INSERT INTO customers (company_id, vendor_id, external_id, name) VALUES ($1,$2,$3,$4) RETURNING id", [co, v, 'bench-' + i, 'Bench ' + i])).rows[0].id;
  const cv = (await c.query("INSERT INTO conversations (company_id, vendor_id, customer_id, external_id, msg_count, last_message_at) VALUES ($1,$2,$3,$4,5,now()) RETURNING id", [co, v, cu, 'bench-ch-' + i])).rows[0].id;
  for (let m = 0; m < 5; m++) await c.query("INSERT INTO messages (conversation_id, external_id, sender, body, sent_at) VALUES ($1,$2,$3,$4, now() - ($5 || ' minutes')::interval)", [cv, 'b' + i + '-' + m, m % 2 ? 'vendor' : 'customer', lines[(i + m) % lines.length], String(100 - m * 10)]);
}
await c.query('COMMIT'); c.release();
const total = (await pool.query('SELECT (SELECT count(*) FROM customers) AS c, (SELECT count(*) FROM messages) AS m')).rows[0];
let s = performance.now();
const an = await (await fetch(BASE + '/api/analyze-all', { method: 'POST', headers: H })).json();
const analyzeMs = performance.now() - s;
const out = { customers: total.c, messages: total.m, analysed: an.analysed, analyzeSeconds: +(analyzeMs / 1000).toFixed(2), perConversationMs: +(analyzeMs / an.analysed).toFixed(2),
  dashboard: await time('/api/dashboard', 100), customersList: await time('/api/customers', 100), customersFiltered: await time('/api/customers?stage=won&attention=1', 100) };
const one = (await get('/api/customers?q=Bench 7')).customers[0];
out.customerDetail = await time('/api/customers/' + one.id, 200);
console.log(JSON.stringify(out, null, 1));
await pool.query("DELETE FROM customers WHERE external_id LIKE 'bench-%'");
await pool.end();
