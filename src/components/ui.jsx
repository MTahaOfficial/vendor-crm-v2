import { INTENT_LABEL, INTENT_TONE, SENT_TONE } from '../api.js';

export const Badge = ({ tone = 'grey', children }) => <span className={`badge ${tone}`}>{children}</span>;
export const IntentBadge = ({ intent }) => (intent ? <Badge tone={INTENT_TONE[intent]}>{INTENT_LABEL[intent] || intent}</Badge> : <Badge>Not analysed</Badge>);
export const SentBadge = ({ s }) => (s ? <Badge tone={SENT_TONE[s]}>{s}</Badge> : null);
export const StageBadge = ({ stage }) => <span className={`stage st-${stage}`}>{stage}</span>;
export const Stat = ({ label, value, sub, tone }) => (
  <div className={`stat ${tone || ''}`}><small>{label}</small><b>{value}</b>{sub && <em>{sub}</em>}</div>
);
export const Err = ({ msg }) => (msg ? <div className="err">{msg}</div> : null);
export const Empty = ({ children }) => <div className="empty">{children}</div>;

/** Horizontal bars for a {label, n} list. */
export function Bars({ rows, tone = () => 'blue', labelOf = (x) => x }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar" key={r.k}>
          <span>{labelOf(r.k)}</span>
          <i><u className={tone(r.k)} style={{ width: `${(r.n / max) * 100}%` }} /></i>
          <b>{r.n}</b>
        </div>
      ))}
    </div>
  );
}
