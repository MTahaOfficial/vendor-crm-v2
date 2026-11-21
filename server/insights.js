import { pool } from './db.js';
import { analyze } from './ai.js';

/** Runs the AI on one conversation and stores the result. The stage follows the AI unless a person set it by hand. */
export async function analyzeConversation(conversationId) {
  const c = (
    await pool.query(
      `SELECT cv.id, cv.msg_count, cu.id AS customer_id, cu.name AS customer_name, cu.stage, cu.stage_locked, v.name AS vendor_name
         FROM conversations cv JOIN customers cu ON cu.id = cv.customer_id JOIN vendors v ON v.id = cv.vendor_id WHERE cv.id = $1`,
      [conversationId],
    )
  ).rows[0];
  if (!c) return null;
  const messages = (await pool.query('SELECT sender, body, sent_at FROM messages WHERE conversation_id = $1 ORDER BY sent_at, id', [conversationId])).rows;
  const r = await analyze({ customerName: c.customer_name, vendorName: c.vendor_name, messages });
  await pool.query(
    `INSERT INTO insights (conversation_id, intent, sentiment, attention, summary, suggested_reply, stage_suggestion, engine, msg_count, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     ON CONFLICT (conversation_id) DO UPDATE SET intent=$2, sentiment=$3, attention=$4, summary=$5, suggested_reply=$6, stage_suggestion=$7, engine=$8, msg_count=$9, updated_at=now()`,
    [conversationId, r.intent, r.sentiment, r.attention, r.summary, r.suggested_reply, r.stage_suggestion, r.engine, messages.length],
  );
  const paid = (await pool.query("SELECT 1 FROM orders WHERE customer_id = $1 AND status = 'paid' LIMIT 1", [c.customer_id])).rowCount > 0;
  if (!c.stage_locked) {
    const next = paid ? 'won' : r.stage_suggestion;
    if (next && next !== c.stage) await pool.query('UPDATE customers SET stage = $2 WHERE id = $1', [c.customer_id, next]);
  }
  return r;
}

/** Analyses conversations that are new or have new messages since the last analysis. */
export async function analyzeAll(companyId, { force = false } = {}) {
  const { rows } = await pool.query(
    `SELECT cv.id FROM conversations cv LEFT JOIN insights i ON i.conversation_id = cv.id
      WHERE cv.company_id = $1 AND ($2 OR i.conversation_id IS NULL OR i.msg_count <> cv.msg_count)`,
    [companyId, force],
  );
  let done = 0;
  for (const r of rows) {
    await analyzeConversation(r.id);
    done++;
  }
  return { analysed: done };
}
