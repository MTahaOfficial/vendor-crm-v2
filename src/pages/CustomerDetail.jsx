import { useEffect, useState, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, money, ago, STAGES } from '../api.js';
import { Badge, IntentBadge, SentBadge, Err, Empty } from '../components/ui.jsx';

export default function CustomerDetail() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [fu, setFu] = useState({ title: '', due_at: '' });
  const [amount, setAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const chat = useRef(null);

  const load = () => api(`/customers/${id}`).then(setD).catch((e) => setError(e.message));
  useEffect(() => { setD(null); load(); }, [id]);
  useEffect(() => { if (chat.current) chat.current.scrollTop = chat.current.scrollHeight; }, [d?.messages?.length]);

  const act = async (fn) => { setError(''); try { await fn(); await load(); } catch (e) { setError(e.message); } };
  if (error && !d) return <><Link to="/customers">&larr; Customers</Link><Err msg={error} /></>;
  if (!d) return <div className="boot">Loading...</div>;
  const { customer: c, conversation: cv } = d;

  return (
    <>
      <Link to="/customers" className="back">&larr; Customers</Link>
      <header className="page-head split">
        <div><h1>{c.name}</h1><p>{d.vendor?.name} · {c.phone || 'no phone'} · {cv ? ago(cv.last_message_at) : ''}</p></div>
        <div className="actions"><label className="inline">Stage
          <select value={c.stage} onChange={(e) => act(() => api(`/customers/${c.id}`, { method: 'PATCH', body: { stage: e.target.value } }))}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></label></div>
      </header>
      <Err msg={error} />
      <div className="detail">
        <section className="card chat-card">
          <h2>Conversation <small>{d.messages.length} messages</small></h2>
          <div className="chat" ref={chat}>
            {d.messages.length === 0 ? <Empty>No messages yet.</Empty> : d.messages.map((m) => (
              <div key={m.id} className={`msg ${m.sender}`}><p>{m.body}</p><small>{m.sender === 'vendor' ? 'Vendor' : c.name} · {new Date(m.sent_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</small></div>
            ))}
          </div>
        </section>
        <div className="side-col">
          <section className="card ai">
            <h2>AI insight {cv?.engine && <Badge tone={cv.engine === 'claude' ? 'blue' : 'grey'}>{cv.engine === 'claude' ? 'Claude' : 'Built-in rules'}</Badge>}</h2>
            {cv?.intent ? (
              <>
                <div className="chips"><IntentBadge intent={cv.intent} /><SentBadge s={cv.sentiment} />{cv.attention && <Badge tone="red">Needs attention</Badge>}</div>
                <p className="summary">{cv.summary}</p>
                {cv.stage_suggestion && cv.stage_suggestion !== c.stage && <p className="hint">Suggested stage: <b>{cv.stage_suggestion}</b></p>}
                <h3>Suggested reply</h3>
                <blockquote>{cv.suggested_reply}</blockquote>
                <div className="actions">
                  <button className="ghost" onClick={() => { navigator.clipboard?.writeText(cv.suggested_reply); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy reply'}</button>
                  <button className="ghost" disabled={busy} onClick={async () => { setBusy(true); await act(() => api(`/customers/${c.id}/analyze`, { method: 'POST' })); setBusy(false); }}>{busy ? 'Analysing...' : 'Re-analyse'}</button>
                </div>
              </>
            ) : <Empty>Not analysed yet.</Empty>}
          </section>

          <section className="card">
            <h2>Orders <small>{money(d.orders.filter((o) => o.status === 'paid').reduce((s, o) => s + o.amount, 0))} paid</small></h2>
            {d.orders.map((o) => <div className="line" key={o.id}><span>{money(o.amount)} <Badge tone={o.status === 'paid' ? 'green' : o.status === 'pending' ? 'amber' : 'grey'}>{o.status}</Badge></span><small>{new Date(o.created_at).toLocaleDateString()}</small></div>)}
            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); act(async () => { await api(`/customers/${c.id}/orders`, { method: 'POST', body: { amount: Number(amount) } }); setAmount(''); }); }}>
              <input type="number" min="0" step="any" placeholder="Amount (PKR)" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              <button className="primary">Add paid order</button>
            </form>
          </section>

          <section className="card">
            <h2>Follow-ups</h2>
            {d.followups.map((f) => (
              <label className={`line chk ${f.done ? 'done' : ''}`} key={f.id}>
                <span><input type="checkbox" checked={f.done} onChange={() => act(() => api(`/followups/${f.id}`, { method: 'PATCH', body: { done: !f.done } }))} /> {f.title}</span>
                <small className={!f.done && new Date(f.due_at) < new Date() ? 't-red' : ''}>{new Date(f.due_at).toLocaleDateString()}</small>
              </label>
            ))}
            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); act(async () => { await api(`/customers/${c.id}/followups`, { method: 'POST', body: { title: fu.title, due_at: new Date(fu.due_at).toISOString() } }); setFu({ title: '', due_at: '' }); }); }}>
              <input placeholder="e.g. Send price list" value={fu.title} onChange={(e) => setFu({ ...fu, title: e.target.value })} required />
              <input type="date" value={fu.due_at} onChange={(e) => setFu({ ...fu, due_at: e.target.value })} required />
              <button className="primary">Add</button>
            </form>
          </section>

          <section className="card">
            <h2>Notes</h2>
            {d.notes.map((n) => <div className="note" key={n.id}><p>{n.body}</p><small>{n.author || 'User'} · {ago(n.created_at)}</small></div>)}
            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); act(async () => { await api(`/customers/${c.id}/notes`, { method: 'POST', body: { body: note } }); setNote(''); }); }}>
              <input placeholder="Add a private note" value={note} onChange={(e) => setNote(e.target.value)} required />
              <button className="primary">Save</button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
