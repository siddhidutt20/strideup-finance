# Integrating StrideUp Finance

A developer handover. If you only want your own copy running on the internet and
you are not going to touch the code, read [`your-own-copy.md`](./your-own-copy.md)
instead — it covers the same ground without the terminal.

This document assumes you can run Node and read JavaScript.

---

## 1. What you have

A full-stack finance application: 85 files, about 21,650 lines, all JavaScript.
No TypeScript, no build step on the server, no framework beyond React and
Express.

```
strideup-finance/
├── api/index.js              Serverless entry point — mounts the Express app
├── server/src/
│   ├── app.js                Express app: middleware, CSRF, static, routers
│   ├── server.js             Local entry point (node server/src/server.js)
│   ├── config.js             Every setting, read from the environment once
│   ├── db.js                 Postgres (Neon) in production, pglite locally
│   ├── auth.js               Session cookie, CSRF, password hashing
│   ├── routes/
│   │   ├── auth.js           Login, logout, profile, avatar
│   │   └── finance.js        Every finance route (~59 of them)
│   └── finance/
│       ├── schema.js         Tables, migrations, entity configuration
│       ├── metrics.js        The calculation core — every figure comes from here
│       ├── ingest.js         Turning a document into ledger rows
│       ├── extract.js        Amount/currency helpers, the document prompt
│       ├── fx.js             Exchange rates, including the pegged currencies
│       ├── rules.js          Deterministic categorisation, tried before any model
│       └── ghl.js            CSV import
├── client/
│   ├── index.html
│   ├── vite.config.js
│   ├── public/               Logos, tab icons, self-hosted fonts
│   └── src/
│       ├── App.jsx           Auth gate and brand loading
│       ├── Login.jsx
│       ├── FinanceDashboard.jsx   The shell: nav, header, view switch
│       ├── api.js            Every call the client makes
│       └── finance/          28 files — one per page, plus shared pieces
├── scripts/
│   ├── audit.mjs             166 checks against a running instance
│   ├── refx.mjs              Re-price amounts stored at face value
│   └── move-entity.mjs       Move rows between sets of books
├── docs/                     Design notes, this file, the non-technical guide
├── CLAUDE.md                 **Read this before changing anything**
└── vercel.json               Build and routing for Vercel
```

**`CLAUDE.md` is the important one.** It holds the architecture, the invariants,
the conventions and a list of mistakes that have already been made once. It is
364 lines and it will save you a day.

---

## 2. Run it in five minutes

No database to install. Locally the app runs an embedded Postgres (pglite) and
writes to a directory.

```bash
npm install
npm --prefix client install
npm run build

SESSION_SECRET=any-long-random-string-at-least-32-chars \
OWNER_NAME="Your Name" \
node server/src/server.js
```

Open <http://localhost:4177> and sign in with `owner@strideup.org` /
`owner-dev-password` (the development default — it only applies when
`NODE_ENV` is not `production`).

For live reload while developing, `npm run dev` runs the server and the Vite dev
server together.

### Prove it works

With the app running, in another terminal:

```bash
AUDIT_BASE="http://localhost:4177/api" \
AUDIT_EMAIL="owner@strideup.org" \
AUDIT_PASSWORD="owner-dev-password" \
node scripts/audit.mjs
```

166 checks. Every figure the app displays is recomputed from the ledger and
compared against the same figure everywhere else it appears. **Run this after any
change to `metrics.js`.** A dashboard whose pages disagree is worse than no
dashboard, and this is what catches it.

---

## 3. Configuration

Only three settings matter to get started. Everything else has a working
default.

| Variable | Required | What it does |
|---|---|---|
| `SESSION_SECRET` | **Yes in production** | Signs the session cookie. 32+ characters, random. |
| `OWNER_PASSWORD` | **Yes in production** | The password you sign in with. |
| *a database URL* | **Yes in production** | See below. |
| `OWNER_EMAIL` | No | Defaults to `owner@strideup.org`. |
| `OWNER_NAME` | No | The name shown in the app. Only applied until the owner sets one in their profile — after that the profile wins, and a redeploy will not revert it. |
| `FINANCE_ENTITIES` | No | Which sets of books this deployment keeps. `strideup`, `personal`, or both comma-separated. One value makes the deployment single-entity and removes the switcher. Default `strideup`. |
| `FINANCE_APP_NAME` | No | What the app calls itself. |
| `FINANCE_BASE_CURRENCY` | No | The currency every figure is reported in. Default `USD`. Changing it re-bases every historical figure, so decide early. |
| `FINANCE_LOGO` / `FINANCE_ICON` | No | Paths or URLs to the wordmark and tab icon. |
| `FINANCE_FX_URL` | No | Where daily rates come from. `{date}`, `{from}`, `{to}` are substituted. |
| `FINANCE_CONFIDENCE_FLOOR` | No | Below this, a document read is flagged for review rather than approved. Default `0.85`. |
| `ANTHROPIC_API_KEY` | No | Enables reading uploaded invoices and contracts. **Everything else works without it.** |
| `ANTHROPIC_MODEL` | No | Overrides the model used for document reading. |
| `CLIENT_ORIGIN` | No | CORS origin, if the client is served from a different host. |
| `PGLITE_DIR` | No | Where the local embedded database writes. Local only. |
| `PORT` | No | Default `4177`. |

### The database URL

The app looks for the first of these that is set, then falls back to any
environment variable whose value looks like a Postgres URL:

`DATABASE_URL`, `POSTGRES_URL`, `STORAGE_URL`, `NEON_DATABASE_URL`,
`DATABASE_URL_UNPOOLED`, `POSTGRES_URL_NON_POOLING`

This is deliberate: hosting platforms name it differently, and the fallback
means connecting a database in a dashboard usually just works with no
configuration at all.

Any Postgres works. It is queried through `@neondatabase/serverless`, which
speaks plain Postgres over HTTP.

**Configuration problems are collected, not thrown.** `GET /api/health` returns
`configErrors` as an array. A crash at import time on a serverless host produces
an opaque 500 with no body, which is impossible to debug — so the app boots and
tells you what is missing instead.

---

## 4. Deploying it

### Vercel

`vercel.json` is already set up. Import the repository, add a Postgres database
(Storage → Create Database → Neon), set `SESSION_SECRET` and `OWNER_PASSWORD`,
deploy. The build runs `npm run build`; `client/dist` is served statically and
`api/index.js` handles `/api/*`.

### Anywhere else that runs Node

There is nothing Vercel-specific in the application itself — `api/index.js` is
four lines that export the Express app. Set the environment variables, run
`npm run build` once, then `node server/src/server.js`. It serves the built
client itself when `client/dist` exists.

### Two deployments, two sets of books

One codebase can serve a business instance and a personal instance from the
same repository, with separate databases, by setting `FINANCE_ENTITIES` to a
single value on each. See [`second-instance.md`](./second-instance.md).

---

## 5. Integrating it with something else

Three ways, in increasing order of coupling.

### (a) Deploy it standalone and talk to its API

The least invasive, and the one to prefer. Deploy it as its own app and have
your system post entries into it.

Authentication is a signed session cookie plus a double-submit CSRF token.
Log in once, keep the cookies, echo the CSRF cookie back in a header on writes:

```bash
# Log in, keeping cookies
curl -c jar.txt -X POST https://your-app/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"owner@example.com","password":"..."}'

# Read the CSRF cookie and send it back on any write
CSRF=$(grep sf_csrf jar.txt | awk '{print $7}')

curl -b jar.txt -H "x-csrf-token: $CSRF" \
  -X POST https://your-app/api/finance/entries \
  -H 'content-type: application/json' \
  -d '{"entryDate":"2026-09-17","direction":"out","amount":1250.00,
       "currency":"USD","categoryId":5,"description":"Server hosting"}'
```

If you are writing a machine client rather than a browser, consider adding a
bearer-token path in `server/src/auth.js`. The CSRF double-submit exists to
protect a browser session and is friction you do not need for a server-to-server
caller.

**Every write is idempotent by design.** Each row carries a `dedup_key`; posting
the same fact twice produces one row. Retry freely. The key formats are in
`CLAUDE.md`.

### (b) Mount the Express router inside an existing Node app

`server/src/app.js` builds and returns an app, but the routers are exported
separately and can be mounted anywhere:

```js
import express from "express";
import cookieParser from "cookie-parser";
import { authRouter } from "./server/src/routes/auth.js";
import { financeRouter } from "./server/src/routes/finance.js";
import { ensureReady } from "./server/src/db.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Creates tables, runs migrations and seeds the owner. Memoised, so this is a
// no-op after the first request rather than work on every one.
app.use((req, res, next) => ensureReady().then(() => next()).catch(next));

app.use("/finance/api/auth", authRouter);
app.use("/finance/api/finance", financeRouter);
```

Three things to know:

- The client calls `/api/...` with a hard-coded prefix in `client/src/api.js`.
  Mount the routers somewhere else and you must change that prefix to match.
- `ensureReady()` is safe to call on every request and does its work once. It
  is wired as middleware rather than at boot because a serverless host has no
  long-lived boot step to hang it on.
- `SCHEMA` and `FIN_SCHEMA` statements are fatal if they fail; every statement
  in `FIN_MIGRATIONS` and `OWNER_MIGRATIONS` is caught individually, so a
  migration already applied does not stop start-up. **Add new columns to the
  migration lists, never to the schema statements.**
- `authRouter` expects the session and CSRF cookies it sets itself. If your host
  app already has authentication, you are integrating two session systems —
  path (a) is almost certainly the better trade.

### (c) Reuse the front end inside another React application

`FinanceDashboard.jsx` is a single component that takes four props:

```jsx
<FinanceDashboard
  owner={{ name, email }}   // whoever is signed in
  brand={{ name, wordmarkSrc, icon, wordmark }}
  onLogout={...}
  onOwner={setOwner}        // called when the profile changes
/>
```

It brings its own styles — every stylesheet is a template literal in
`finance/styles.js`, joined into one `ALL_CSS` constant and injected as a
`<style>` element. Nothing leaks out through a global reset, but nothing is
scoped either: the class names are all prefixed (`fin-`, `hm-`, `ov-`, `tb-`,
`ol-`), so collisions are unlikely rather than impossible.

There is no CSS framework, no component library and no charting library. Every
tile, table, donut and line chart is hand-written SVG and CSS in this codebase.
That is why it can be reshaped freely — and why there is no upgrade path to
inherit if you would rather it looked like your own product.

---

## 6. The API

All paths are under `/api`. `?entity=` selects which set of books where a
deployment keeps more than one; `?period=YYYY-MM-01` selects the month.

**Authentication** — `/api/auth`

| | |
|---|---|
| `POST /login` | Email and password in, session cookie out |
| `POST /logout` | |
| `GET /me` | The signed-in owner |
| `GET /avatar` | The profile picture |
| `POST /profile` | Change name or picture (12 MB body limit) |

**Reading figures** — `/api/finance`. All `GET`, all return `{ entity, entities, byEntity, baseCurrency }`.

| | |
|---|---|
| `/overview` | The business dashboard |
| `/home` | The household home page |
| `/income`, `/expenses` | One side of the month, in detail |
| `/wealth`, `/goals`, `/reports` | Household pages |
| `/household`, `/budgets` | Budget and bills |
| `/outlook` | The household forecast — `?months=1..24` |
| `/forecast` | The business projection |
| `/reminders` | What has reached its date and wants an answer |
| `/due` | Scheduled commitments and outstanding invoices — `?days=1..120` |
| `/pl`, `/statements`, `/cash`, `/dashboard` | Statements |
| `/side/:direction` | `in` or `out` |
| `/vendors`, `/schedule`, `/commitments` | Agreements and parties |
| `/entries` | The ledger — `?q&from&to&direction&categoryId&limit&offset` |
| `/categories` | Categories, and which books this deployment keeps |
| `/export.csv`, `/vendors/export.csv` | Spreadsheet exports |

**Writing** — every write is idempotent.

| | |
|---|---|
| `POST /entries` | Record money. Refuses if the currency cannot be converted. |
| `PATCH`/`DELETE /entries/:id` | Correct or remove a row |
| `POST /documents` | Upload an invoice, receipt or contract |
| `POST /documents/:id/reread` | Read it again |
| `POST /commitments` | A standing agreement |
| `POST /commitments/:id/payments` | Record that one occurrence happened. Keyed on `(commitment, due date)`. |
| `DELETE /commitments/:id/payments/:dueDate` | Undo that |
| `POST /invoices`, `POST /invoices/:id/payments` | Raise and settle |
| `POST /holdings`, `POST /goals` | What you own, what you are saving toward |
| `PUT /budgets`, `POST /budgets/copy` | Plan a month |
| `POST /periods/close` | Close a month so its figures stop moving |
| `POST /import/ghl` | CSV import |
| `POST /books/import`, `POST /books/:entity/remove` | Move books between deployments |

---

## 7. The data model

Sixteen tables. Every financial fact becomes one row in `fin_entries` — that is
the whole design, and section "The one idea" of `CLAUDE.md` explains why.

| Table | Holds |
|---|---|
| `owners` | The single account, its password hash, name and avatar |
| `fin_entries` | **Every financial fact.** One row per thing that happened. |
| `fin_categories` | The chart of accounts, and its spend groups |
| `fin_counterparties` | Customers and vendors |
| `fin_documents` | Uploaded files and what was read out of them |
| `fin_commitments` | Standing agreements — bills, subscriptions, EMIs, retainers |
| `fin_commitment_payments` | Which occurrences have been settled |
| `fin_invoices` | Money owed to you |
| `fin_budgets` | A plan for a month. Never summed into a position. |
| `fin_goals` | What you are saving toward. Also never summed. |
| `fin_holdings`, `fin_holding_values` | What you own and owe, and its valuations over time |
| `fin_periods` | Which months are closed |
| `fin_fx_rates` | Daily rates, cached per day |
| `fin_rules` | Deterministic categorisation |
| `fin_bank_txns` | Reserved for a bank feed. Nothing writes to it yet. |

### Two columns to understand before you write any query

- **`amount_minor`** is the amount as written on the document, in its own
  currency. **`base_amount_minor`** is the same amount converted to the base
  currency. **Only `base_amount_minor` is ever summed.** Sum `amount_minor`
  across currencies and you get a number that means nothing.
- **`dedup_key`** makes every write idempotent, and doubles as provenance. A row
  whose key starts `commitment:` was caused by a standing agreement — which is
  how the app tells fixed spending from variable without guessing.

---

## 8. Before you change anything

Read **"Invariants — break these and the numbers stop meaning anything"** in
`CLAUDE.md`. The short version:

1. Every write carries a `dedup_key`. Posting the same fact twice makes one row.
2. Only `base_amount_minor` is summed.
3. Amounts are positive; `direction` carries the sign.
4. A closed month is never rewritten. Corrections post to the open month.
5. Deterministic rules run before any model call.
6. Five kinds of claim are kept apart and never blended: **recorded** (it
   happened), **committed** (an agreement says it will), **estimated** (derived
   from history, labelled as such), **planned** (a budget or goal — never summed
   into a position), and **valued** (a holding someone put a number on, with a
   date).

Then run the audit. It exists precisely to catch a change that broke one of
these.

---

## 9. What it deliberately does not do

Worth knowing before you promise it to anyone:

- **No bank feed.** Cash is what has been recorded, not a balance read from a
  bank. `fin_bank_txns` exists for the day that changes.
- **No payment rails.** It records that money moved; it cannot move money.
- **No multi-user.** One owner, one set of books. None of the sixteen tables
  carries an `owner_id`, so adding a second user is a schema migration and an
  authorisation layer, not a setting. Two people who want separate books need
  two deployments.
- **No scheduled email or push.** Reminders are in-app.
- **No double-entry bookkeeping.** It is a ledger with direction, not debits and
  credits. It will not produce a trial balance.

---

## 10. Licence and branding

**There is no licence file in this repository.** Under default copyright that
means nobody has been granted the right to use, copy or modify it — so if you
are handing this to someone, add one first. `MIT` if you want them to do
anything they like; `Apache-2.0` if you want the patent grant as well.

The branding is separate from whatever licence you choose. The StrideUp and
myFinance names, the wordmarks in `client/public/*-wordmark.png` and the tab
icons in `*-icon.svg` are not yours to pass on — replace them, or set
`FINANCE_LOGO` and `FINANCE_ICON` to point somewhere else.
