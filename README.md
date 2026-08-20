# StrideUp Finance

Upload an invoice, watch the month update. A private finance tracker for one
person: revenue, expenses, cash, capital, outstanding payments and a monthly
P&L, with no spreadsheet to maintain.

**A standalone application.** Its own server, its own database, its own login,
its own deployment and its own URL. It shares nothing with StrideUp's employee
onboarding portal, which lives in a separate repository.

| Layer | Tech |
|---|---|
| **Client** | React + Vite |
| **Server** | Express — auth, ingestion, reconciliation, a server-side Anthropic proxy |
| **Database** | Postgres (Neon in production; embedded pglite locally, zero setup) |

## The sections

| | |
|---|---|
| **Overview** | How the month is going, at a glance — the figures and the graphs, nothing to read |
| **Revenue** | Where it came from: by month, by category, by customer, and what is still outstanding |
| **Expenses** | Where it went: by month, by category, by supplier |
| **Cash flow** | Opening position, what moved, closing position — with capital on its own line, because a funding round is not a good trading month |
| **P&L** | A proper statement: revenue, cost of sales, gross profit, operating expenses, operating profit, tax, net |
| **Ledger** | Every entry, with inline fixes, deletion, and a form for anything that never had a document |
| **Import & close** | GoHighLevel exports, and settling the month |

Statements are fetched only when their section is opened, so the dashboard
never pays for four of them nobody asked to see.

## How it works

Every financial fact — an uploaded document, a GoHighLevel payment, a manual
entry — passes through **one normaliser** and becomes **one row** in
`fin_entries`, carrying a deterministic `dedup_key` with a unique index.
Re-uploading the same receipt or re-importing the same export changes nothing,
so every import is idempotent and every job is safely retryable.

- **Reading documents.** One Claude call per file, answering into a fixed JSON
  shape, with the live chart of accounts in the prompt so it picks a real
  category rather than inventing one. Everything it returns is validated before
  it can reach the ledger. Uploads are checked against their real magic bytes
  first, so a mislabelled file never costs an API call.
- **Rules before AI.** A vendor seen once is categorised deterministically from
  `fin_rules` — no model call at all. Correcting a row teaches a rule, so the
  same vendor never needs a second look. Month one might need thirty decisions;
  month four needs two or three.
- **Flagged, never blocked.** Low confidence, or a total that doesn't equal
  subtotal + tax, marks the row for review — but it still lands in the ledger.
  The month's totals are always complete; review is about attribution. Fixing
  happens inline in the ledger table, not in a separate queue.
- **Revenue.** GoHighLevel is a CRM, not a bank, so it owns *who owes what*
  (`fin_invoices`); paid transactions also post revenue. CSV rows carry the
  same dedup key live webhooks would, so overlap is a no-op.
- **Capital** — equity, loans, draws — flows through cash but is excluded from
  burn, which is what keeps runway honest.
- **Foreign currency.** An amount is stored twice: as written on the document,
  and converted to `FINANCE_BASE_CURRENCY` at that day's rate. Only the
  converted figure is ever summed, so a ₹20,000 invoice cannot land in a
  dollar total as 20,000. Rates are cached per day, so a past month's figures
  never drift. If a rate cannot be fetched the entry is still recorded, in its
  own currency and flagged — an unconverted amount you can see beats a
  document that vanished. A currency the reader misread can be corrected from
  the ledger, which re-converts on the spot.
- **Month snapshots.** Closing a month means a late document dated inside it
  posts to the open month as an adjustment, instead of changing a figure you
  have already used.
- **Export.** `/api/finance/export.csv` hands your accountant the complete
  ledger — generated, never hand-edited.

### What it is not

A management instrument, not a statutory accounting system: no double-entry, no
tax logic, no audit trail a tax authority would accept on its own. The ledger is
shaped so entries can be pushed into Xero or QuickBooks when an accountant needs
proper books. The full design is in [`docs/finance-automation-design.md`](docs/finance-automation-design.md).

## Security

One account owns this app and **there is no registration route** — nobody can
sign themselves up to see the company's books. The account is seeded from
`OWNER_EMAIL` / `OWNER_PASSWORD` on first boot; changing `OWNER_PASSWORD` and
redeploying resets it, which is the recovery path if it's forgotten.

Sessions are signed JWTs in an httpOnly, `SameSite=Strict`, Secure cookie, with
double-submit CSRF on every mutating request, Helmet security headers including
a strict CSP, rate limiting on login and on the document endpoint, and zod
validation on every route. The Anthropic key stays server-side; the browser
cannot send arbitrary prompts.

## Run it locally

```bash
npm run install:all
cp .env.example .env      # set SESSION_SECRET, OWNER_EMAIL, OWNER_PASSWORD
npm run dev               # API on :4100, Vite on :5273
```

Open http://localhost:5273. With `DATABASE_URL` blank it uses an embedded
Postgres under `./data/pg`, so nothing external is needed. Without
`ANTHROPIC_API_KEY` everything works except automatic document reading, and the
dashboard says so.

## Deploy as its own Vercel project

1. **New Project** → import `strideup-finance`. No root directory or build
   settings to change — `vercel.json` already describes the build.
2. **Storage → Create Database → Neon**, attached to this project. It sets
   `DATABASE_URL` automatically.
3. Add environment variables:
   - `SESSION_SECRET` — long random string
     (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `OWNER_EMAIL`, `OWNER_PASSWORD`, `OWNER_NAME`
   - `ANTHROPIC_API_KEY` — from https://console.anthropic.com/settings/keys
   - *(optional)* `FINANCE_BASE_CURRENCY` (default `USD`)
4. **Deploy**, then open `/api/health`. `{"ok":true,"ai":true}` means it's ready;
   if `ok` is false, `configErrors` names exactly what to set.

Then sign in with the `OWNER_EMAIL` / `OWNER_PASSWORD` you set, and drop an
invoice on it.
