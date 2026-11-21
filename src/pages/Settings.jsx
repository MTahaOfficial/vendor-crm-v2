import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useUser } from '../App.jsx';
import { Err, Badge } from '../components/ui.jsx';

export default function Settings() {
  const { user } = useUser();
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => { api('/status').then(setS).catch((e) => setError(e.message)); }, []);
  const run = (label, path) => async () => {
    setBusy(label); setError(''); setMsg('');
    try { const r = await api(path, { method: 'POST' }); setMsg(`${label} done: ${JSON.stringify(r)}`); setS(await api('/status')); } catch (e) { setError(e.message); } finally { setBusy(''); }
  };
  const owner = user.role === 'owner';
  return (
    <>
      <header className="page-head"><h1>{owner ? 'Settings' : 'Account'}</h1><p>{user.email}</p></header>
      <Err msg={error} />
      {msg && <div className="ok">{msg}</div>}
      <section className="card">
        <h2>Connections</h2>
        <div className="line"><span>Chat source</span>{s && <Badge tone={s.chat === 'sendbird' ? 'green' : 'amber'}>{s.chat === 'sendbird' ? 'Live chat API' : 'Demo data'}</Badge>}</div>
        <div className="line"><span>AI engine</span>{s && <Badge tone={s.ai.engine === 'claude' ? 'blue' : 'grey'}>{s.ai.engine === 'claude' ? `Claude (${s.ai.model})` : 'Built-in rules (English + Roman Urdu)'}</Badge>}</div>
        <p className="hint">Set SENDBIRD_API and SENDBIRD_TOKEN in the server .env to read real conversations, and ANTHROPIC_API_KEY to use Claude. Keys stay on the server and never reach the browser.</p>
      </section>
      {owner && (
        <section className="card">
          <h2>Data</h2>
          <div className="actions wrap">
            <button className="primary" disabled={!!busy} onClick={run('Sync', '/sync')}>{busy === 'Sync' ? 'Syncing...' : 'Sync and analyse now'}</button>
            <button className="ghost" disabled={!!busy} onClick={run('Re-analyse', '/analyze-all')}>{busy === 'Re-analyse' ? 'Working...' : 'Re-analyse every conversation'}</button>
            {s?.chat === 'demo' && <button className="ghost" disabled={!!busy} onClick={run('Reload demo', '/demo/load')}>Reload demo data</button>}
          </div>
        </section>
      )}
    </>
  );
}
