const KEY = 'vcrm_token';
export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(getToken() ? { authorization: 'Bearer ' + getToken() } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    setToken(null);
    window.location.assign('/login');
    throw new Error('Signed out');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function download(path, filename) {
  const res = await fetch('/api' + path, { headers: { authorization: 'Bearer ' + getToken() } });
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export const money = (n) => 'PKR ' + Math.round(Number(n) || 0).toLocaleString('en-US');
export const STAGES = ['lead', 'interested', 'negotiating', 'won', 'lost'];
export const INTENT_LABEL = { ready_to_buy: 'Ready to buy', interested: 'Interested', browsing: 'Browsing', support_issue: 'Support issue', churn_risk: 'Churn risk', satisfied: 'Satisfied' };
export const INTENT_TONE = { ready_to_buy: 'green', interested: 'blue', browsing: 'grey', support_issue: 'amber', churn_risk: 'red', satisfied: 'green' };
export const SENT_TONE = { positive: 'green', neutral: 'grey', negative: 'red' };

export function ago(iso) {
  if (!iso) return '-';
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, Math.round(m))} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}
