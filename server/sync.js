import { pool } from './db.js';
import { config } from './config.js';
import { analyzeAll } from './insights.js';
import { loadDemo } from './demo.js';

// Chat source adapter. Reads a Sendbird-style API server-side, so the token never reaches the browser.
//   GET {api}/group_channels?limit=100                       -> { channels: [{channel_url, name, members:[{user_id,nickname,role}]}] }
//   GET {api}/group_channels/{url}/messages?message_ts=0&next_limit=200 -> { messages: [{message_id,message,user:{user_id,nickname},created_at}] }
// Vendors are the channel members whose user_id is listed in the vendors table (external_id); everyone else is a customer.
export const chatConfigured = () => !!(config.sendbirdApi && config.sendbirdToken);

async function sb(path) {
  const res = await fetch(config.sendbirdApi.replace(/\/$/, '') + path, {
    headers: { 'Api-Token': config.sendbirdToken, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Chat API ${res.status} on ${path.split('?')[0]}`);
  return res.json();
}

export async function syncCompany(companyId) {
  if (!chatConfigured()) {
    const r = await loadDemo(companyId, { reset: false });
    return { source: 'demo', ...r };
  }
  const vendors = (await pool.query('SELECT id, external_id FROM vendors WHERE company_id = $1 AND external_id IS NOT NULL', [companyId])).rows;
  const byExt = new Map(vendors.map((v) => [v.external_id, v.id]));
  const { channels = [] } = await sb('/group_channels?limit=100&member_state_filter=all');
  let newMsgs = 0, convs = 0;
  for (const ch of channels) {
    const members = ch.members || [];
    const vm = members.find((m) => byExt.has(m.user_id));
    const cm = members.find((m) => !byExt.has(m.user_id));
    if (!vm || !cm) continue;
    const vendorId = byExt.get(vm.user_id);
    const cu = await pool.query(
      `INSERT INTO customers (company_id, vendor_id, external_id, name) VALUES ($1,$2,$3,$4)
       ON CONFLICT (vendor_id, external_id) WHERE external_id IS NOT NULL DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [companyId, vendorId, cm.user_id, cm.nickname || cm.user_id],
    );
    const cv = await pool.query(
      `INSERT INTO conversations (company_id, vendor_id, customer_id, external_id) VALUES ($1,$2,$3,$4)
       ON CONFLICT (company_id, external_id) WHERE external_id IS NOT NULL DO UPDATE SET customer_id = EXCLUDED.customer_id RETURNING id`,
      [companyId, vendorId, cu.rows[0].id, ch.channel_url],
    );
    const convId = cv.rows[0].id;
    const since = (await pool.query('SELECT COALESCE(EXTRACT(EPOCH FROM max(sent_at)) * 1000, 0)::bigint AS ts FROM messages WHERE conversation_id = $1', [convId])).rows[0].ts;
    const { messages = [] } = await sb(`/group_channels/${encodeURIComponent(ch.channel_url)}/messages?message_ts=${since}&next_limit=200&prev_limit=0`);
    for (const m of messages) {
      if (!m.message) continue;
      const r = await pool.query(
        `INSERT INTO messages (conversation_id, external_id, sender, body, sent_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [convId, String(m.message_id), m.user?.user_id === vm.user_id ? 'vendor' : 'customer', m.message, new Date(m.created_at)],
      );
      newMsgs += r.rowCount;
    }
    await pool.query(
      `UPDATE conversations SET msg_count = (SELECT count(*) FROM messages WHERE conversation_id = $1),
              last_message_at = (SELECT max(sent_at) FROM messages WHERE conversation_id = $1) WHERE id = $1`,
      [convId],
    );
    convs++;
  }
  return { source: 'chat', conversations: convs, newMessages: newMsgs };
}

export async function syncAndAnalyze(companyId) {
  const s = await syncCompany(companyId);
  const a = await analyzeAll(companyId);
  return { ...s, ...a };
}
