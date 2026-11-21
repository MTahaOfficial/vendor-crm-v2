# Vendor CRM v2: customer conversations with AI insights

A multi-vendor CRM that reads the chats between vendors and customers, and tells you who is ready to buy, who is unhappy and who has been waiting too long. It replaces the browser-only v1 (a React page that called a chat API directly) with a real backend.

## What it does

- **Reads conversations** from a Sendbird-style chat API on the server (the token never reaches the browser). With no chat configured it loads a fictional demo marketplace: 4 vendors, 24 customers, English and Roman Urdu chats.
- **AI insight per conversation**: intent (ready to buy, interested, browsing, support issue, churn risk, satisfied), sentiment, "needs attention" flag, a one-line summary, a suggested reply and a suggested pipeline stage. Uses Claude when `ANTHROPIC_API_KEY` is set; otherwise a built-in rule engine (English + Roman Urdu) so the app works offline. Only conversations with new messages are re-analysed.
- **CRM**: pipeline stages (list and drag-and-drop board), notes, follow-ups, orders and revenue, first-reply-time metric, CSV export.
- **Roles**: the owner sees everything; each vendor logs in and sees only their own customers (enforced in the API and covered by tests).

## Run it

**Easiest (Windows):** double-click `start.bat`. It uses a built-in database, so no PostgreSQL install or password is needed. Or run `npm run start:local`.

**With your own PostgreSQL:** needs Node 20+ and PostgreSQL.

```bash
npm install
cp .env.example .env        # edit DATABASE_URL etc.
npm run build               # builds the web app into dist/
npm start                   # http://localhost:4100
```

The database is created automatically. First start creates the owner account from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (default `owner@vendorcrm.local` / `owner123`; change it, production mode refuses the default) and loads demo data when no chat source is set.

Development: `npm run dev` (API on 4100, web on 5173).

## Connect real data

| Variable | Purpose |
|---|---|
| `SENDBIRD_API`, `SENDBIRD_TOKEN` | Chat source. Vendors are matched by the "Chat user id" you give each vendor; other channel members are customers. Synced every 5 minutes and from Settings. |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | Use Claude for insights. Falls back to the rule engine if the call fails. |

## Tests

`npm run test:api` runs 42 checks against a running server: the rule engine, login, vendor isolation, notes, follow-ups, orders and revenue, stage locking, CSV export, SQL-injection safety.

## Honest limits

- The Sendbird adapter and the Claude call are written to the documented API shape but were **not run against live services** here (no keys); the demo data and the rule engine are what was tested end to end.
- The rule engine is keyword-based: good for a demo and as a fallback, weaker than Claude on subtle messages.
- All names and chats in the demo are fictional.
