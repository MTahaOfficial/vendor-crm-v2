import { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { Err } from '../components/ui.jsx';

export default function Vendors() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [f, setF] = useState({ name: '', handle: '', external_id: '', email: '', password: '' });
  const load = () => api('/vendors').then((r) => setRows(r.vendors)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const submit = async (e) => {
    e.preventDefault(); setError('');
    try { await api('/vendors', { method: 'POST', body: f }); setF({ name: '', handle: '', external_id: '', email: '', password: '' }); load(); } catch (err) { setError(err.message); }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <header className="page-head"><h1>Vendors</h1><p>Compare vendors and give each one a login that sees only their own customers.</p></header>
      <Err msg={error} />
      <div className="card flush">
        <table>
          <thead><tr><th>Vendor</th><th className="r">Customers</th><th className="r">Won</th><th className="r">Need attention</th><th className="r">Revenue</th><th>Login</th></tr></thead>
          <tbody>{(rows || []).map((v) => (
            <tr key={v.id}><td><b>{v.name}</b><small>{v.handle}</small></td><td className="r">{v.customers}</td><td className="r">{v.won}</td><td className="r">{v.attention || '-'}</td><td className="r">{money(v.revenue)}</td><td>{v.login_email || <small>none</small>}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <form className="card form-grid" onSubmit={submit}>
        <h2>Add a vendor</h2>
        <label>Name<input value={f.name} onChange={set('name')} required /></label>
        <label>Handle<input value={f.handle} onChange={set('handle')} placeholder="@shop" /></label>
        <label>Chat user id<input value={f.external_id} onChange={set('external_id')} placeholder="id used in your chat system (optional)" /></label>
        <label>Login email<input type="email" value={f.email} onChange={set('email')} placeholder="optional" /></label>
        <label>Login password<input type="password" minLength={6} value={f.password} onChange={set('password')} placeholder="min 6 characters" /></label>
        <button className="primary">Add vendor</button>
      </form>
    </>
  );
}
