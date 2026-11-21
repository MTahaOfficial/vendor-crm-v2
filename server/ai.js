import { config } from './config.js';

// ---------------------------------------------------------------------------
// AI insights for one conversation.
//   engine "claude": Anthropic Messages API (needs ANTHROPIC_API_KEY)
//   engine "rules":  built-in scorer (English + Roman Urdu), used with no key or if the API fails
// Output: { intent, sentiment, attention, summary, suggested_reply, stage_suggestion, engine }
// ---------------------------------------------------------------------------

export const INTENTS = ['ready_to_buy', 'interested', 'browsing', 'support_issue', 'churn_risk', 'satisfied'];
export const SENTIMENTS = ['positive', 'neutral', 'negative'];
const STAGES = ['lead', 'interested', 'negotiating', 'won', 'lost'];

const W = {
  buy: ['buy', 'order', 'confirm', 'checkout', 'pay', 'payment', 'advance', 'send me', 'book', 'deal', 'final', 'lena hai', 'le lunga', 'le lungi', 'order kar', 'confirm kar', 'bhej do', 'bhejdo', 'done'],
  price: ['price', 'rate', 'cost', 'discount', 'kitne', 'kitna', 'qeemat', 'kam kar', 'offer', 'bundle', 'how much'],
  interest: ['interested', 'details', 'pictures', 'photo', 'size', 'colour', 'color', 'available', 'stock', 'catalog', 'video', 'dikhao', 'dikha', 'hai kya', 'milega', 'milegi', 'warranty', 'delivery'],
  problem: ['problem', 'issue', 'late', 'delay', 'broken', 'damaged', 'defect', 'wrong', 'not working', 'refund', 'return', 'complaint', 'worst', 'bad', 'kharab', 'galat', 'nahi aya', 'nahi mila', 'dair', 'masla', 'wapas', 'disappointed'],
  cancel: ['cancel', 'never again', 'not buying', 'forget it', 'too expensive', 'expensive', 'mehnga', 'mehngi', 'chor do', 'nahi chahiye', 'no longer', 'switch'],
  thanks: ['thanks', 'thank you', 'shukriya', 'great', 'perfect', 'love', 'received', 'mil gaya', 'mil gayi', 'excellent', 'happy', 'acha', 'zabardast'],
};
const count = (text, list) => list.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);

function ago(ms) {
  const h = ms / 3600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} days`;
}

export function analyzeRules(conv, now = Date.now()) {
  const msgs = conv.messages.filter((m) => m.sender !== 'system' && m.body);
  const cust = msgs.filter((m) => m.sender === 'customer');
  const text = cust.map((m) => m.body.toLowerCase()).join(' \n ');
  const lastCustomer = (cust.at(-1)?.body || '').toLowerCase();
  const last = msgs.at(-1);

  const buy = count(text, W.buy), price = count(text, W.price), interest = count(text, W.interest);
  const problem = count(text, W.problem), cancel = count(text, W.cancel), thanks = count(text, W.thanks);
  const lastProblem = count(lastCustomer, W.problem) + count(lastCustomer, W.cancel);
  const lastThanks = count(lastCustomer, W.thanks);

  let intent = 'browsing';
  if (cancel >= 1 && lastProblem >= 1) intent = 'churn_risk';
  else if (problem >= 1 && lastProblem >= 1) intent = 'support_issue';
  else if (lastThanks >= 1 && problem === 0 && /received|mil gaya|mil gayi|again|dobara|review/.test(text + ' ' + msgs.map((m) => m.body.toLowerCase()).join(' '))) intent = 'satisfied';
  else if (buy >= 2 || (buy >= 1 && price >= 1)) intent = 'ready_to_buy';
  else if (interest + price >= 1) intent = 'interested';

  let sentiment = 'neutral';
  if (lastProblem >= 1 || problem + cancel > thanks + 1) sentiment = 'negative';
  else if (lastThanks >= 1 || thanks > problem) sentiment = 'positive';

  const waitingMs = last && last.sender === 'customer' ? now - new Date(last.sent_at).getTime() : 0;
  const waitingLong = waitingMs > 3 * 3600_000;
  const attention = intent === 'support_issue' || intent === 'churn_risk' || sentiment === 'negative' || (waitingLong && !['browsing', 'satisfied'].includes(intent));

  const topics = [];
  if (price) topics.push('price');
  if (/deliver|dair|late|delay/.test(text)) topics.push('delivery');
  if (/size|colour|color|stock|available|hai kya|milega|milegi/.test(text)) topics.push('availability');
  if (/refund|return|wapas|broken|damaged|defect|kharab|galat/.test(text)) topics.push('a product problem');

  const who = conv.customerName || 'The customer';
  const base = {
    ready_to_buy: `${who} looks ready to buy${topics.length ? ` and asked about ${topics.join(', ')}` : ''}.`,
    interested: `${who} is interested${topics.length ? ` and asked about ${topics.join(', ')}` : ''}.`,
    browsing: `${who} is only browsing so far (${cust.length} message${cust.length === 1 ? '' : 's'}).`,
    support_issue: `${who} reported a problem${topics.length ? ` with ${topics.join(', ')}` : ''}.`,
    churn_risk: `${who} may be lost: price or service complaints and talk of cancelling.`,
    satisfied: `${who} received the order and is happy; a good moment to ask for a review or a repeat order.`,
  }[intent];
  const tail = waitingMs && !['satisfied', 'browsing'].includes(intent) ? ` Waiting for a reply for ${ago(waitingMs)}.` : last?.sender === 'vendor' ? ' The vendor replied last.' : '';

  const reply = {
    ready_to_buy: 'Great, I can confirm this for you now. Please share your delivery address and preferred payment method and I will lock it in today.',
    interested: 'Happy to help! I can send photos, sizes and the best price. What matters most to you: price, delivery time or availability?',
    browsing: 'Thanks for reaching out! Let me know what you are looking for and I will share the best options.',
    support_issue: 'I am sorry about this. Please send a photo or the order number and I will fix it today, with a replacement or refund if needed.',
    satisfied: 'Thank you so much! If you have a minute, a short review would mean a lot, and I can share a discount code for your next order.',
    churn_risk: 'I understand, and thank you for telling me. I would like to make this right: I can offer a discount or a faster delivery. Can we talk for two minutes?',
  }[intent];

  const stage_suggestion = { ready_to_buy: 'negotiating', interested: 'interested', browsing: 'lead', support_issue: null, churn_risk: 'lost', satisfied: 'won' }[intent];
  return { intent, sentiment, attention, summary: base + tail, suggested_reply: reply, stage_suggestion, engine: 'rules' };
}

const SYSTEM = `You analyse a sales conversation between a vendor and a customer on a marketplace. Messages may be English, Urdu or Roman Urdu.
Reply with ONLY one JSON object, no markdown:
{"intent":"ready_to_buy|interested|browsing|support_issue|churn_risk|satisfied","sentiment":"positive|neutral|negative","attention":true|false,"summary":"one or two sentences, plain language","suggested_reply":"a short, polite reply the vendor can send next, in the customer's language","stage_suggestion":"lead|interested|negotiating|won|lost|null"}
"attention" is true when the customer is upset, has a problem, may leave, or has waited a long time for an answer while showing buying interest.`;

async function analyzeClaude(conv, now) {
  const lines = conv.messages.slice(-40).map((m) => `[${new Date(m.sent_at).toISOString().slice(0, 16)}] ${m.sender === 'customer' ? 'CUSTOMER' : m.sender === 'vendor' ? 'VENDOR' : 'SYSTEM'}: ${m.body}`);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.aiModel,
      max_tokens: 500,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Vendor: ${conv.vendorName}\nCustomer: ${conv.customerName}\nNow: ${new Date(now).toISOString()}\n\n${lines.join('\n')}` }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || '').join('');
  const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  if (!INTENTS.includes(j.intent) || !SENTIMENTS.includes(j.sentiment)) throw new Error('unexpected AI output');
  return {
    intent: j.intent,
    sentiment: j.sentiment,
    attention: !!j.attention,
    summary: String(j.summary || '').slice(0, 600),
    suggested_reply: String(j.suggested_reply || '').slice(0, 800),
    stage_suggestion: STAGES.includes(j.stage_suggestion) ? j.stage_suggestion : null,
    engine: 'claude',
  };
}

export async function analyze(conv, now = Date.now()) {
  if (config.anthropicKey) {
    try {
      return await analyzeClaude(conv, now);
    } catch (e) {
      console.error('[ai] Claude failed, using rules:', e.message);
    }
  }
  return analyzeRules(conv, now);
}

export const aiStatus = () => ({ engine: config.anthropicKey ? 'claude' : 'rules', model: config.anthropicKey ? config.aiModel : null });
