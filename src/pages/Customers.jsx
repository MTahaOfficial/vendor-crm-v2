import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, download, money, ago, STAGES, INTENT_LABEL } from '../api.js';
import { useUser } from '../App.jsx';
import { IntentBadge, SentBadge, StageBadge, Err, Empty } from '../components/ui.jsx';

export default function Customers() {
  const { user } = useUser();
  const [rows, setRows] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [f, setF] = useState({ q: '', stage: '', intent: '', vendor: '', attention: false });
  const [view, setView] = useState('table');
  const [error, setError] = useState('');

  useEffect(() => {
    if (user.role === 'owner') api('/vendors').then((r) => setVendors(r.vendors)).catch(() => {});
  }, [user.role]);
  useEffect(() => {
    const p = new URLSearchParams();
    if (f.q) p.set('q', f.q);
    if (f.stage) p.set('stage', f.stage);
    if (f.intent) p.set('intent', f.intent);
    if (f.vendor) p.set('vendor', f.vendor);
    if (f.attention) p.set('attention', '1');
    const t = setTimeout(() => api('/customers?' + p).then((r) => setRows(r.customers)).catch((e) => setError(e.message)), 150);
    return () => clearTimeout(t);
  }, [f]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const move = async (id, stage) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, stage } : r)));
    try { await api(`/customers/${id}`, { method: 'PATCH', body: { stage } }); } catch (e) { setError(e.message); }
  };

  return (
    <>
      <header className="page-head split">
        <div><h1>Customers</h1><p>{rows ? `${rows.length} conversations` : 'Loading...'}</p></div>
        <div className="actions">
          <div className="seg"><button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>List</button><button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Pipeline</button></div>
          <button className="ghost" onClick={() => download('/export/customers.csv', 'customers.csv')}>Export CSV</button>
        </div>
      </header>
      <div className="filters">
        <input placeholder="Search name or phone" value={f.q} onChange={set('q')} />
        <select value={f.stage} onChange={set('stage')}><option value="">All stages</option>{STAGES.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={f.intent} onChange={set('intent')}><option value="">All intents</option>{Object.entries(INTENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {user.role === 'owner' && <select value={f.vendor} onChange={set('vendor')}><option value="">All vendors</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>}
        <label className="chk"><input type="checkbox" checked={f.attention} onChange={set('attention')} /> Needs attention</label>
      </div>
      <Err msg={error} />
      {!rows ? <div className="boot">Loading...</div> : rows.length === 0 ? <Empty>No customers match these filters.</Empty> : view === 'table' ? (
        <div className="card flush">
          <table>
            <thead><tr><th>Customer</th><th>Vendor</th><th>Stage</th><th>AI reading</th><th>Last message</th><th className="r">Spent</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className={c.attention ? 'att' : ''}>
                  <td><Link to={`/customers/${c.id}`}><b>{c.name}</b></Link><small>{c.phone}</small></td>
                  <td>{c.vendor}</td>
                  <td><StageBadge stage={c.stage} /></td>
                  <td><IntentBadge intent={c.intent} /> <SentBadge s={c.sentiment} />{c.attention && <span className="flag" title="Needs attention">!</span>}<p className="sum">{c.summary}</p></td>
                  <td>{ago(c.last_message_at)}</td>
                  <td className="r">{c.spent ? money(c.spent) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="board">
          {STAGES.map((s) => (
            <div className="col" key={s} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = Number(e.dataTransfer.getData('id')); if (id) move(id, s); }}>
              <h3><StageBadge stage={s} /> <span>{rows.filter((r) => r.stage === s).length}</span></h3>
              {rows.filter((r) => r.stage === s).map((c) => (
                <div className={`kcard ${c.attention ? 'att' : ''}`} key={c.id} draggable onDragStart={(e) => e.dataTransfer.setData('id', String(c.id))}>
                  <Link to={`/customers/${c.id}`}><b>{c.name}</b></Link>
                  <small>{c.vendor}</small>
                  <div><IntentBadge intent={c.intent} /></div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
