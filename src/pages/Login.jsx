import { useState } from 'react';
import { api, setToken } from '../api.js';
import { useUser } from '../App.jsx';
import { Err } from '../components/ui.jsx';

export default function Login() {
  const { setUser } = useUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api('/auth/login', { method: 'POST', body: { email, password } });
      setToken(r.token); setUser(r.user);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand big"><span className="logo">V</span><div><b>Vendor CRM</b><small>Customer conversations, understood</small></div></div>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <Err msg={error} />
        <button className="primary" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
        <p className="hint">Demo owner: owner@vendorcrm.local / owner123</p>
      </form>
    </div>
  );
}
