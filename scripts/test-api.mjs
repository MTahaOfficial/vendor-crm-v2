// End-to-end API checks against a running server:  node scripts/test-api.mjs [http://localhost:4100]
import { analyzeRules } from '../server/ai.js';
const BASE = process.argv[2] || 'http://localhost:4100';
let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { c ? pass++ : (fail++, console.log('FAIL', name, extra)); };
const call = async (method, path, { token, body, raw } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: raw ? await r.text() : await r.json().catch(() => ({})) };
};

// --- rule engine (offline AI) ---
const mk = (arr, name = 'Test') => ({ customerName: name, messages: arr.map(([s, b, ago = 60]) => ({ sender: s, body: b, sent_at: new Date(Date.now() - ago * 60_000) })) });
ok(analyzeRules(mk([['customer', 'Is the set available? price?'], ['vendor', '4800'], ['customer', 'ok confirm my order, I will pay in advance', 5]])).intent === 'ready_to_buy', 'rules: ready_to_buy');
ok(analyzeRules(mk([['customer', 'Salam, LED hai kya?'], ['vendor', '4500'], ['customer', 'Done, confirm kar do, order kar dunga', 5]])).intent === 'ready_to_buy', 'rules: roman urdu buy');
ok(analyzeRules(mk([['customer', 'The parcel is late and the product is damaged, I want a refund', 5]])).intent === 'support_issue', 'rules: support');
const churn = analyzeRules(mk([['customer', 'Too expensive. Cancel my order, never again', 5]]));
ok(churn.intent === 'churn_risk' && churn.attention && churn.sentiment === 'negative', 'rules: churn + attention');
ok(analyzeRules(mk([['customer', 'Received the item, perfect! Shukriya, will order again', 5]])).intent === 'satisfied', 'rules: satisfied');
ok(analyzeRules(mk([['customer', 'Hi'], ['vendor', 'Hello'], ['customer', 'Just looking', 5]])).intent === 'browsing', 'rules: browsing');
ok(analyzeRules(mk([['customer', 'How much for 10 pieces? I want to order', 600]])).attention, 'rules: long wait on a buyer needs attention');

// --- auth ---
ok((await call('GET', '/api/dashboard')).status === 401, 'no token -> 401');
ok((await call('POST', '/api/auth/login', { body: { email: 'owner@vendorcrm.local', password: 'wrong' } })).status === 401, 'bad password -> 401');
const login = await call('POST', '/api/auth/login', { body: { email: 'owner@vendorcrm.local', password: process.env.ADMIN_PASSWORD || 'owner123' } });
ok(login.status === 200 && login.data.user?.role === 'owner', 'owner login');
const T = login.data.token;

// --- data present (demo) ---
const dash = await call('GET', '/api/dashboard', { token: T });
ok(dash.status === 200 && dash.data.totals.customers > 0, 'dashboard has customers');
ok(dash.data.revenue.revenue > 0 && dash.data.revenue.orders > 0, 'revenue from paid orders');
ok(dash.data.firstResponseMinutes !== null, 'first response time computed');
const list = (await call('GET', '/api/customers', { token: T })).data.customers;
ok(list.length >= 20, 'customer list');
ok(list.every((c) => c.intent), 'every customer has an AI insight');
const att = (await call('GET', '/api/customers?attention=1', { token: T })).data.customers;
ok(att.length > 0 && att.every((c) => c.attention), 'attention filter');
ok((await call('GET', '/api/customers?stage=won', { token: T })).data.customers.every((c) => c.stage === 'won'), 'stage filter');
ok((await call('GET', "/api/customers?q=' OR 1=1 --", { token: T })).data.customers.length === 0, 'search is parameterised');

// --- vendor isolation ---
const vname = 'Test Vendor ' + Date.now();
const email = `v${Date.now()}@test.local`;
const nv = await call('POST', '/api/vendors', { token: T, body: { name: vname, email, password: 'secret12' } });
ok(nv.status === 201, 'create vendor with login');
ok((await call('POST', '/api/vendors', { token: T, body: { name: 'x', email, password: 'secret12' } })).status === 409, 'duplicate email -> 409');
const vl = await call('POST', '/api/auth/login', { body: { email, password: 'secret12' } });
ok(vl.status === 200 && vl.data.user.role === 'vendor', 'vendor login');
const VT = vl.data.token;
ok((await call('GET', '/api/customers', { token: VT })).data.customers.length === 0, 'new vendor sees no customers');
ok((await call('GET', '/api/vendors', { token: VT })).status === 403, 'vendor cannot list vendors');
ok((await call('POST', '/api/sync', { token: VT })).status === 403, 'vendor cannot sync');
const foreign = list[0];
ok((await call('GET', `/api/customers/${foreign.id}`, { token: VT })).status === 404, "vendor cannot open another vendor's customer");
ok((await call('POST', `/api/customers/${foreign.id}/notes`, { token: VT, body: { body: 'x' } })).status === 404, "vendor cannot write notes on another vendor's customer");
ok((await call('PATCH', `/api/customers/${foreign.id}`, { token: VT, body: { stage: 'won' } })).status === 404, "vendor cannot change another vendor's stage");

// --- customer detail, notes, follow-ups, orders, stage ---
const c = list.find((x) => x.stage !== 'won' && x.intent === 'interested') || list[0];
const d = await call('GET', `/api/customers/${c.id}`, { token: T });
ok(d.status === 200 && d.data.messages.length > 0 && d.data.conversation?.suggested_reply, 'detail has chat + suggested reply');
const n0 = d.data.notes.length, f0 = d.data.followups.length;
ok((await call('POST', `/api/customers/${c.id}/notes`, { token: T, body: { body: 'Call after Friday prayers' } })).status === 201, 'add note');
ok((await call('POST', `/api/customers/${c.id}/followups`, { token: T, body: { title: 'Send price list', due_at: new Date(Date.now() + 86400000).toISOString() } })).status === 201, 'add follow-up');
ok((await call('POST', `/api/customers/${c.id}/followups`, { token: T, body: { title: 'x', due_at: 'garbage' } })).status === 400, 'bad follow-up date -> 400');
const d2 = (await call('GET', `/api/customers/${c.id}`, { token: T })).data;
ok(d2.notes.length === n0 + 1 && d2.followups.length === f0 + 1, 'note and follow-up stored');
ok((await call('PATCH', `/api/followups/${d2.followups.find((x) => x.title === 'Send price list' && !x.done).id}`, { token: T, body: { done: true } })).status === 200, 'complete follow-up');
ok((await call('PATCH', `/api/customers/${c.id}`, { token: T, body: { stage: 'nonsense' } })).status === 400, 'unknown stage rejected');
ok((await call('PATCH', `/api/customers/${c.id}`, { token: T, body: { stage: 'negotiating' } })).status === 200, 'set stage by hand');
await call('POST', `/api/customers/${c.id}/analyze`, { token: T });
ok((await call('GET', `/api/customers/${c.id}`, { token: T })).data.customer.stage === 'negotiating', 'AI does not overwrite a stage set by hand');
const before = (await call('GET', '/api/dashboard', { token: T })).data.revenue.revenue;
ok((await call('POST', `/api/customers/${c.id}/orders`, { token: T, body: { amount: -5 } })).status === 400, 'negative order rejected');
ok((await call('POST', `/api/customers/${c.id}/orders`, { token: T, body: { amount: 2500, note: 'Test' } })).status === 201, 'add order');
const after = (await call('GET', '/api/dashboard', { token: T })).data.revenue.revenue;
ok(after === before + 2500, 'revenue grows by the order amount', `${before} -> ${after}`);

// --- export + demo reset ---
const ex = await call('GET', '/api/export/customers.csv', { token: T, raw: true });
ok(ex.status === 200 && ex.data.split('\n')[0].includes('Customer') && ex.data.split('\n').length > 20, 'CSV export');
ok((await call('GET', '/api/status', { token: T })).data.ai.engine, 'status reports AI engine');
const sync = await call('POST', '/api/sync', { token: T });
ok(sync.status === 200 && sync.data.source === 'demo', 'sync in demo mode');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
