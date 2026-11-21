import { useEffect, useState, createContext, useContext } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Customers from './pages/Customers.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import Vendors from './pages/Vendors.jsx';
import Settings from './pages/Settings.jsx';

const Ctx = createContext(null);
export const useUser = () => useContext(Ctx);

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());
  useEffect(() => {
    if (getToken()) api('/auth/me').then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);
  if (!ready) return <div className="boot">Loading...</div>;
  return (
    <Ctx.Provider value={{ user, setUser }}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/*" element={user ? <Shell /> : <Navigate to="/login" />} />
      </Routes>
    </Ctx.Provider>
  );
}

function Shell() {
  const { user, setUser } = useUser();
  const nav = useNavigate();
  const owner = user.role === 'owner';
  const out = () => { setToken(null); setUser(null); nav('/login'); };
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><span className="logo">V</span><div><b>Vendor CRM</b><small>{user.company}</small></div></div>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/customers">Customers</NavLink>
          {owner && <NavLink to="/vendors">Vendors</NavLink>}
          <NavLink to="/settings">{owner ? 'Settings' : 'Account'}</NavLink>
        </nav>
        <div className="me">
          <div><b>{owner ? 'Owner' : user.vendor || user.name}</b><small>{user.email}</small></div>
          <button className="ghost" onClick={out}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/vendors" element={owner ? <Vendors /> : <Navigate to="/" />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
