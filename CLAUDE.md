# StrideUp Finance — working notes

A private finance tracker for one person. Upload an invoice, it is read,
categorised and added to the month. Revenue, expenses, cash, capital,
receivables and a P&L, with no spreadsheet anywhere.

Read `docs/finance-automation-design.md` for why it is shaped this way. This
file is the short version for changing it.

## The one idea

Every financial fact — an uploaded document, a GoHighLevel payment, an entry
typed by hand — passes through **one normaliser** and becomes **one row** in
`fin_entries`. The dashboard, the statements and the export are all readers of
that table. There is no second store, so there is nothing to reconcile between.

## Invariants — break these and the numbers stop meaning anything

1. **Every entry carries a unique `dedup_key`.** `doc:<sha256>` for documents,
   `ghl:<transaction_id>` for GoHighLevel, `manual:<uuid>` for typed entries.
   The unique index is what makes every import idempotent and every job safely
   retryable. Never insert an entry without one.
2. **Only `base_amount_minor` is ever summed.** `amount_minor` is what the
   document said and is for display. Summing it mixes currencies — a ₹20,000
   invoice would count as $20,000. Every aggregate in `metrics.js` uses the
   base column; keep it that way.
3. **Amounts are positive; `direction` carries the sign.** `'in'` or `'out'`.
   No negative amounts anywhere.
4. **A low-confidence reading is recorded and flagged, never blocked.** Totals
   must always be complete; review is about *attribution*, not existence. Rows
   with `review_status = 'needs_review'` still count. Only `'rejected'` is
   excluded from totals.
5. **Rules are checked before any model call.** `matchRule()` in `ingest.js`
   runs first; a vendor seen once is categorised deterministically and free.
   Approving a correction writes a rule, so accuracy compounds.
6. **A document with no ledger entry is retried, not called a duplicate.**
   Only a document that actually produced an entry is a duplicate. Otherwise a
   failed read (no API key, no credit) would strand the file permanently.
7. **A closed month is not rewritten.** A late document dated inside it posts
   to the open month as an adjustment, with a note saying so. Each set of books
   closes on its own — `fin_periods` is keyed `(period, entity)`.
8. **Two sets of books never mix.** Every entry carries `entity` — `'strideup'`
   or `'personal'`. Every aggregate in `metrics.js` filters on it. Picking
   "Both" returns two separate blocks under `byEntity`; it never sums them.
   There is no entity whose profit a combined figure would represent.

## Conventions

- **Money is in minor units** (`bigint`). `toMinor` / `fromMinor` in
  `extract.js` handle zero-decimal currencies (JPY, KRW…) — do not multiply by
  100 inline.
- **Postgres `date` columns come back as `Date` objects** on both drivers.
  Always pass them through `isoDate()` from `util.js` before rendering or
  comparing as strings. This has caused two real bugs: dates printing as
  `Sun Aug 02 2026` in the CSV export, and a `Map` lookup silently missing and
  zeroing the whole trend chart.
- **SQL uses `?` placeholders**, converted to `$1, $2 …` by `db.js`.
- **Every route** is wrapped in `ah()` and validates its body with zod.
- **Categories are entity-tagged.** Each row in `FIN_CATEGORIES` ends with
  `'strideup'`, `'personal'`, or `'both'`, and the pickers filter on it. Note
  the deliberate personal split: **Loan interest** is opex, **Loan principal
  repaid** is capital, so an EMI's principal stays out of the personal P&L.
- **Schema statements are fatal; migrations are not.** `FIN_SCHEMA` runs first
  and any error takes the app down. `FIN_MIGRATIONS` runs after, each statement
  wrapped in its own try/catch. Anything referencing a column added by a
  migration — an index especially — belongs in `FIN_MIGRATIONS`, never in
  `FIN_SCHEMA`. `CREATE TABLE IF NOT EXISTS` is a no-op on an existing
  database, so a new column in a schema statement simply will not appear.
- **There is no registration route, deliberately.** One owner account, seeded
  from `OWNER_EMAIL` / `OWNER_PASSWORD` on boot. Changing `OWNER_PASSWORD` and
  redeploying is the password reset. Do not add self-service sign-up.

## Where things are

| Path | What it does |
|---|---|
| `server/src/finance/schema.js` | All `fin_*` DDL and the chart of accounts |
| `server/src/finance/extract.js` | Reads a document. Prompt varies by `kind` (`expense` \| `revenue`); magic-byte check; confidence and arithmetic gates |
| `server/src/finance/ingest.js` | The normaliser: dedup, rules, counterparty, currency conversion, period resolution |
| `server/src/finance/fx.js` | Rate lookup, cached per day. Returns `null` on failure — the caller flags rather than throws |
| `server/src/finance/ghl.js` | CSV parser and importer. Shares the dedup key live webhooks would use |
| `server/src/finance/metrics.js` | Every reported figure, defined in SQL |
| `server/src/routes/finance.js` | The API |
| `client/src/FinanceDashboard.jsx` | Shell: nav, view switching, upload |
| `client/src/finance/views.jsx` | The seven sections |
| `client/src/finance/pieces.jsx` | Panels, KPI tiles, charts, ranked lists |
| `client/src/finance/styles.js` | All CSS |

## Running and testing locally

```bash
npm run install:all
cp .env.example .env      # set SESSION_SECRET, OWNER_EMAIL, OWNER_PASSWORD
npm run dev               # API :4100, Vite :5273
```

With `DATABASE_URL` blank it uses an embedded Postgres under `./data/pg`.

**Testing without spending money or needing keys.** Two base URLs are
overridable so the whole pipeline can run against local mocks:

- `ANTHROPIC_BASE_URL` — point at a server returning
  `{"content":[{"type":"text","text":"<the extraction JSON>"}]}`. This is how
  the ingest path, rule learning, confidence gating and the failure messages
  were all verified.
- `FINANCE_FX_URL` — a `{date}` / `{from}` / `{to}` template returning
  `{"rates":{"USD":0.012}}`.

Both are unset in every real environment.

**Distinct test documents matter.** The dedup key is the sha256 of the file
bytes, so re-using the same bytes across cases silently hits the duplicate path
and every assertion after the first passes vacuously. Generate genuinely
different files per case.

## Deliberately absent

- **Double-entry bookkeeping, tax logic, a statutory audit trail.** This is a
  management instrument. The ledger is shaped so entries can be pushed to Xero
  or QuickBooks when an accountant needs real books.
- **A bank feed.** The largest known gap: the headline figure is
  "Recorded position", not cash, because nothing reconciles against reality.
  A forgotten receipt is invisible.
- **Multi-user, alerts, live GoHighLevel.** Not planned for now.

### The current roadmap

1. **Entity separation** — done. Two sets of books, never summed.
2. **Contracts and commitments** — a contract is one document describing many
   future payments; extract the terms, generate a schedule into a new
   `fin_commitments` table, both directions.
3. **Matching and payment status** — match real payments to commitments by
   party, amount and due date; paid / due / overdue; a party view.
4. **Forecasting** — future months are confirmed commitments plus actuals to
   date. Contracted revenue is shown as contracted. Where revenue is not
   contracted, show nothing rather than a guess. No trend extrapolation
   presented as fact.
5. **Gmail sync** — read-only OAuth, poll for invoice and receipt attachments,
   into the existing pipeline with the same sha256 dedup and confidence gating.
   Never act on email content beyond extracting financial documents.

## Things that have bitten before

- **A `useEffect` dependency array that did not get the new state.** The entity
  switcher set its own button active but never refetched, because the load
  effect's deps were still `[period, ledgerScope]`. Symptom: the control
  responds, the data does not. If a control visibly works but nothing reloads,
  read the deps before reading anything else.
- **A scripted `.replace()` that silently matched nothing.** This has produced
  a 17-placeholder / 16-column insert and an index in the wrong file. After any
  scripted edit, grep for the *result*, not for something nearby.

- Vercel bakes environment variables into a deployment at build time — a new
  variable needs a redeploy, code changes do not.
- Vercel's "Sensitive" flag makes a variable write-only. The edit dialog always
  looks empty; saving a blank box wipes the value. `/api/health` is the only
  reliable check.
- The connection string can arrive as `DATABASE_URL`, `POSTGRES_URL`,
  `STORAGE_URL` or a custom prefix. `config.js` tries the known names then
  falls back to scanning for a `postgres://` URL.
