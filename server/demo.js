import { pool } from './db.js';
import { analyzeAll } from './insights.js';

// Fictional demo marketplace. Used when no chat source is configured, and by the tests.
const H = 3600_000;
const VENDORS = [
  ['Al-Noor Fabrics', '@alnoor'],
  ['Karachi Electronics', '@khielectro'],
  ['Fresh Basket', '@freshbasket'],
  ['Urban Kicks', '@urbankicks'],
];
// scenario: [customer name, [ [sender, text, minutes-after-previous] ... ], hoursAgoOfLastMessage, order amount|null]
const S = {
  buy: (n, item, amt) => [n, [['c', `Hi, is the ${item} available?`, 0], ['v', 'Yes, in stock. Price is PKR ' + amt, 6], ['c', 'Can you do a small discount? I will order today', 4], ['v', 'Best I can do is 5% off', 9], ['c', 'Ok confirm my order please, I will pay in advance', 3]], 2],
  buyUr: (n, item) => [n, [['c', `Salam, ${item} hai kya?`, 0], ['v', 'Jee available hai, rate 4500 hai', 12], ['c', 'Thora kam ho sakta hai? Theek hai to order kar dunga', 5], ['v', '4200 final', 7], ['c', 'Done, confirm kar do, payment bhej raha hun', 2]], 1],
  interest: (n, item) => [n, [['c', `Hello, can you send pictures and sizes of the ${item}?`, 0], ['v', 'Sure, sending now', 15], ['c', 'Thanks, what is the delivery time to Lahore?', 20]], 7],
  browse: (n) => [n, [['c', 'Hi', 0], ['v', 'Hello! How can I help?', 30], ['c', 'Just looking, thanks', 10]], 30],
  late: (n, item) => [n, [['c', `I ordered the ${item} last week and it has not arrived`, 0], ['v', 'Sorry, checking with the courier', 60], ['c', 'This is a problem, it is late and nobody replies. I want a refund', 1440]], 20],
  unhappy: (n, item) => [n, [['c', `${item} is kharab, bilkul galat product aya hai`, 0], ['v', 'Apologies, please send a photo', 40], ['c', 'Never again. Cancel my order, too expensive and bad quality', 90]], 5],
  happy: (n, item) => [n, [['c', `Received the ${item}, perfect!`, 0], ['v', 'Great, thank you! Please leave a review', 20], ['c', 'Shukriya, zabardast quality. Will order again', 8]], 48],
  waiting: (n, item) => [n, [['c', `How much for 10 pieces of ${item}? I want to place an order`, 0]], 9],
};

const PLAN = [
  [S.buy('Ayesha Khan', 'cotton lawn set', 4800), 4800], [S.interest('Bilal Ahmed', 'silk dupatta')], [S.late('Hina Raza', 'lawn suit')],
  [S.happy('Sana Iqbal', 'chiffon scarf'), 3200], [S.waiting('Usman Ali', 'cotton fabric')], [S.browse('Maria Tariq')],
  [S.buyUr('Zain Malik', 'LED TV 43 inch'), 62000], [S.interest('Fahad Shah', 'air fryer')], [S.unhappy('Nida Hassan', 'Bluetooth speaker')],
  [S.waiting('Omar Farooq', 'inverter UPS')], [S.happy('Sidra Aziz', 'iron'), 7500], [S.browse('Hamza Butt')],
  [S.buy('Laiba Noor', 'organic honey 1kg', 1900), 1900], [S.interest('Danish Rauf', 'fruit box')], [S.late('Kiran Javed', 'grocery bundle')],
  [S.waiting('Imran Sheikh', 'dates carton')], [S.happy('Rabia Anwar', 'olive oil'), 2600], [S.browse('Talha Mir')],
  [S.buyUr('Anum Siddiqui', 'running shoes'), 8900], [S.interest('Haris Jamil', 'sneakers size 42')], [S.unhappy('Mehwish Gul', 'sandals')],
  [S.waiting('Adeel Khan', 'sports shoes')], [S.happy('Fatima Zahra', 'slides'), 3500], [S.browse('Arslan Qureshi')],
];

export async function loadDemo(companyId, { reset = true } = {}) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    if (reset) {
      await c.query("DELETE FROM customers WHERE company_id = $1 AND external_id LIKE 'demo-%'", [companyId]);
      await c.query("DELETE FROM vendors WHERE company_id = $1 AND external_id LIKE 'demo-%'", [companyId]);
    }
    const vids = [];
    for (let i = 0; i < VENDORS.length; i++) {
      const r = await c.query(
        `INSERT INTO vendors (company_id, name, handle, external_id) VALUES ($1,$2,$3,$4)
         ON CONFLICT (company_id, external_id) WHERE external_id IS NOT NULL DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [companyId, VENDORS[i][0], VENDORS[i][1], `demo-v${i + 1}`],
      );
      vids.push(r.rows[0].id);
    }
    const now = Date.now();
    for (let i = 0; i < PLAN.length; i++) {
      const [[name, steps, lastAgoH], amount] = PLAN[i];
      const vi = Math.floor(i / 6), vendorId = vids[vi];
      const cu = await c.query(
        `INSERT INTO customers (company_id, vendor_id, external_id, name, phone, stage) VALUES ($1,$2,$3,$4,$5,'lead')
         ON CONFLICT (vendor_id, external_id) WHERE external_id IS NOT NULL DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [companyId, vendorId, `demo-c${i + 1}`, name, `92300${String(1000000 + i * 7919).slice(-7)}`],
      );
      const cid = cu.rows[0].id;
      const cv = await c.query(
        `INSERT INTO conversations (company_id, vendor_id, customer_id, external_id) VALUES ($1,$2,$3,$4)
         ON CONFLICT (company_id, external_id) WHERE external_id IS NOT NULL DO UPDATE SET customer_id = EXCLUDED.customer_id RETURNING id`,
        [companyId, vendorId, cid, `demo-ch${i + 1}`],
      );
      const convId = cv.rows[0].id;
      const total = steps.reduce((s, x) => s + x[2], 0);
      let t = now - lastAgoH * H - total * 60_000;
      let n = 0;
      for (const [who, body, gap] of steps) {
        t += gap * 60_000;
        await c.query(
          `INSERT INTO messages (conversation_id, external_id, sender, body, sent_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [convId, `m${i + 1}-${++n}`, who === 'c' ? 'customer' : 'vendor', body, new Date(t)],
        );
      }
      await c.query('UPDATE conversations SET msg_count = $2, last_message_at = $3 WHERE id = $1', [convId, n, new Date(t)]);
      if (amount && !(await c.query("SELECT 1 FROM orders WHERE customer_id = $1 AND note = 'Demo order'", [cid])).rowCount) {
        await c.query(`INSERT INTO orders (company_id, vendor_id, customer_id, amount, status, note, created_at) VALUES ($1,$2,$3,$4,'paid','Demo order',$5)`, [companyId, vendorId, cid, amount, new Date(t + 3 * H)]);
        await c.query("UPDATE customers SET stage = 'won' WHERE id = $1", [cid]);
      }
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
  await analyzeAll(companyId);
  return { vendors: VENDORS.length, customers: PLAN.length };
}
