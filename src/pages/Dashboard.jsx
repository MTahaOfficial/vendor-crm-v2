import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, ago, STAGES, INTENT_LABEL, INTENT_TONE } from '../api.js';
import { Stat, Bars, IntentBadge, Err, Empty } from '../components/ui.jsx';

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/dashboard').then(setD).catch((e) => setError(e.message)); }, []);
  if (error) return <Err msg={error} />;
  if (!d) return <div className="boot">Loading...</div>;
  const by = (arr, key) => Object.fromEntries(arr.map((r) => [r[key], r.n]));
  const st = by(d.stages, 'stage'), it = by(d.intents, 'intent'), se = by(d.sentiments, 'sentiment');
  return (
    <>
      <header className="page-head"><h1>Dashboard</h1><p>What your customers are saying, and what needs you today.</p></header>
      <div className="stats">
        <Stat label="Revenue (paid)" value={money(d.revenue.revenue)} sub={`${money(d.revenue.revenue_30d)} in the last 30 days`} />
        <Stat label="Customers" value={d.totals.customers} sub={`${d.totals.won} won`} />
        <Stat label="Need attention" value={d.totals.attention} tone={d.totals.attention ? 'warn' : ''} sub="upset, at risk or waiting" />
        <Stat label="Ready to buy" value={d.totals.hot} tone="good" sub="not closed yet" />
        <Stat label="First reply time" value={d.firstResponseMinutes == null ? '-' : `${d.firstResponseMinutes} min`} sub="average, vendor to customer" />
      </div>
      <div className="grid2">
        <section className="card">
          <h2>Pipeline</h2>
          <Bars rows={STAGES.map((k) => ({ k, n: st[k] || 0 }))} tone={(k) => (k === 'won' ? 'green' : k === 'lost' ? 'red' : 'blue')} />
        </section>
        <section className="card">
          <h2>What customers want (AI)</h2>
          <Bars rows={Object.keys(INTENT_LABEL).map((k) => ({ k, n: it[k] || 0 }))} labelOf={(k) => INTENT_LABEL[k]} tone={(k) => INTENT_TONE[k]} />
          <p className="mood">Mood: <b className="t-green">{se.positive || 0} positive</b> · {se.neutral || 0} neutral · <b className="t-red">{se.negative || 0} negative</b></p>
        </section>
      </div>
      <div className="grid2">
        <section className="card">
          <h2>Needs attention</h2>
          {d.attention.length === 0 ? <Empty>Nothing urgent. Nice.</Empty> : d.attention.map((a) => (
            <Link className="row-link" to={`/customers/${a.id}`} key={a.id}>
              <div><b>{a.name}</b> <small>{a.vendor} · {ago(a.last_message_at)}</small><p>{a.summary}</p></div>
              <IntentBadge intent={a.intent} />
            </Link>
          ))}
        </section>
        <section className="card">
          <h2>Follow-ups due</h2>
          {d.followups.length === 0 ? <Empty>No open follow-ups.</Empty> : d.followups.map((f) => (
            <Link className="row-link" to={`/customers/${f.customer_id}`} key={f.id}>
              <div><b>{f.title}</b><p>{f.customer}</p></div>
              <small className={new Date(f.due_at) < new Date() ? 't-red' : ''}>{new Date(f.due_at).toLocaleDateString()}</small>
            </Link>
          ))}
        </section>
      </div>
    </>
  );
}
