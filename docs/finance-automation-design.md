# StrideUp Finance Engine — end-to-end automation design

A design for a live finance dashboard fed by automated ingestion of expense
documents (Google Drive), revenue and payment data (GoHighLevel + payment
processor), and bank activity — with no spreadsheets to maintain by hand.

> Tool prices and third-party API surface names below are indicative at the time
> of writing. Confirm both against current vendor docs at build time.

---

## 1. The core idea: one pipe, many consumers

Most small-company finance stacks fail the same way: three tools each hold part
of the truth, a spreadsheet is created to reconcile them, and within two months
the spreadsheet *is* the system — manually maintained, stale, and trusted by
nobody.

The fix is structural, not tooling. **Every financial fact — a receipt, a card
charge, a GHL invoice payment, a bank line, a capital injection — enters through
one normaliser and lands as one row in one ledger table.** The dashboard, the
alerts, the accountant's export, and (optionally) statutory accounting software
are all *readers* of that table. Nothing is ever typed twice, and there is no
second store to keep in sync because there is no second store.

```
            ┌──────────────────────────────────────────┐
Drive ──────┤                                          │
GHL ────────┤   normaliser  →  fin_entries (ledger)    ├──→ live dashboard
Stripe ─────┤   (dedup, categorise, FX, review flag)   ├──→ nightly tie-out + alerts
Bank feed ──┤                                          ├──→ accountant export / Xero
CSV upload ─┤                                          │
            └──────────────────────────────────────────┘
```

Everything else in this document is detail underneath that one sentence.

### Who operates this

One person — the CEO — maintains this, and the data is the **company's books**, not
personal finances. Those two facts pull in opposite directions, so it is worth
being precise about which governs what.

**Single operator simplifies the interface.** No roles or permissions beyond one
login. No approval workflows, no handoffs, no notifications to anyone else. The
review queue is not a separate screen: uncertain rows are highlighted in the
ledger table and corrected in place.

**Company books do not relax the rigor.** Completeness, traceability back to
source documents, and agreement with the bank still matter, because these figures
may end up in front of an accountant, a bank, or an investor. Three things that
look like finance-department ceremony still earn their place with a single user:

- **Bank reconciliation** is the completeness guarantee. A document you forget to
  upload is invisible and silently understates expenses. Nothing except the
  nightly bank tie-out (§7) will catch it.
- **Month snapshots.** Once you have acted on a month's figure, it should not
  silently change. Not a locking ceremony — just a flag that routes a late
  document to an adjustment in the open month, so history stays stable.
- **Capital tracking** — equity in, director's loans, draws. The company has a
  balance sheet even when nobody is asking to see it.

**One honest limit.** This is a management instrument, not a statutory accounting
system. It has no double-entry, no tax logic, and no audit trail a tax authority
would accept on its own. For a registered company that files accounts, an
accountant will eventually want proper books — which is exactly why §2 keeps Xero
as a *downstream consumer fed from this ledger* rather than a competing store.
Build this to see the business clearly; add Xero when someone needs to file.

---

## 2. Recommended stack

The strong recommendation is to **build the hub inside the existing
`employee-onboarding` app** rather than assembling it from no-code tools. That is
not the usual advice, but it is right here for a specific reason: StrideUp
already runs the exact stack this needs — Neon Postgres, an Express API on
Vercel, a server-side Anthropic proxy with the key never reaching the browser,
an admin-guarded dashboard, and session auth. The finance module is a new route
and a new schema namespace on infrastructure that is already deployed, secured,
and paid for.

| Layer | Recommendation | Why this one | Indicative cost |
|---|---|---|---|
| **Ledger / database** | Neon Postgres — new `fin_*` tables in the existing database | Already provisioned. SQL views give exact, auditable metric definitions; no aggregation logic hidden in a BI tool | $0 at this volume |
| **Ingestion + normalisation** | Node module in `server/src/finance/`, Vercel Cron for scheduled jobs | One codebase, one deploy, versioned in git, testable | $0 |
| **Document extraction** | Claude via the existing server-side proxy, structured (JSON-schema) output | Reads crumpled photos, foreign-language invoices, and odd layouts that template OCR fails on; already wired up | ~$0.01–0.03 per document |
| **Expense capture surface** | A Google Drive folder + Drive push notifications | Zero training cost — everyone already knows how to drop a file in Drive | $0 |
| **Revenue / cash truth** | Payment processor webhooks (Stripe or whichever GHL is connected to) | This is where money actually moves — see §3 | $0 |
| **Sales / AR data** | GHL API v2 via a Private Integration Token, plus a CSV importer on the same contract | Invoices, subscriptions, outstanding balances | $0 |
| **Bank** | Bank feed via Plaid/TrueLayer, or a nightly CSV/OFX drop into the same Drive folder | The reconciliation backstop that makes the dashboard trustworthy | $0–$30/mo |
| **Dashboard** | New `/finance` React route in the existing client, admin-guarded | Live, custom metrics, no extra login, no per-seat BI cost | $0 |
| **Statutory accounting** | Xero or QuickBooks, *fed from* the ledger — added when an accountant needs it | Double-entry, tax filing, accountant compatibility | ~$40–70/mo when added |

**Total: roughly $0–$50/month** until statutory accounting is added, then under
~$120/month.

### When *not* to build this

If StrideUp would rather buy than build, the equivalent no-build stack is Xero +
Hubdoc (receipt capture, included with Xero) + the native Stripe→Xero connector +
Syft or Fathom for dashboards, plus Make.com for GHL. It is live in about a week
and costs ~$120–180/month. What it will not give you is the custom live dashboard
with GHL-specific AR and runway metrics that this brief asks for — Xero's own
reporting is generic and lags. The design below assumes the build path, but every
data-model and reconciliation principle in §4 and §7 applies to both.

A useful middle path: build the hub, and once it is running, have it **push**
finished entries into Xero via API. The hub stays the operational dashboard; Xero
becomes the statutory record. Because both read from the same normalised ledger,
they can never disagree.

---

## 3. GHL: direct integration or CSV?

**Recommendation: build both — but not as alternatives.** Direct webhooks are the
live path; the CSV importer is the same pipeline with a different transport,
used for backfill and monthly assurance. They share a normaliser and, critically,
a deduplication key, so running both can never double-count.

But the more important point comes first.

### GHL is not where the money is

GoHighLevel is a CRM and marketing platform. It does not hold funds — it hands
card payments to a connected processor (Stripe, PayPal, NMI, or
Authorize.net) and records what that processor told it. Several things that
matter to a P&L therefore live in the processor and not in GHL, or arrive there
late and incomplete:

- **Processor fees** — real operating expense, typically 1.5–3% of revenue. GHL
  reports gross; the bank receives net.
- **Refunds, partial refunds and chargebacks** — often reflected slowly or as a
  status change rather than an offsetting transaction.
- **Payouts** — GHL knows a customer paid on the 3rd; the bank receives a batched
  payout on the 5th. Cash flow needs the payout, revenue needs the charge.
- **Failed and retried subscription charges** — dunning state that changes after
  the fact.
- **Off-platform payments** — bank transfers, cash, invoices settled by other
  means. These never touch GHL at all.

So the rule is:

> **Take cash and revenue from the payment processor. Take invoices,
> subscriptions and outstanding balances from GHL. Take the final word from the
> bank feed.**

Treating GHL as the source of financial truth is the single most common mistake
in this exact setup, and it produces a dashboard that is quietly 2–3% wrong on
revenue and materially wrong on cash timing.

### Direct vs CSV, compared

| | **Direct (webhooks + API v2)** | **CSV export + upload** |
|---|---|---|
| Latency | Seconds | Whenever a human remembers |
| Manual work | None after setup | ~10 min per export, every time |
| Setup cost | OAuth marketplace app, or a Make/Zapier connector (~half a day either way) | An afternoon — parse, map, validate |
| Reliability | High, but webhooks *do* get missed; needs a reconciliation sweep | Deterministic, but depends entirely on a human |
| Backfill / history | Awkward — paginated API pulls | Excellent — this is what CSV is for |
| Failure mode | Silent gap until the nightly sweep catches it | Silent staleness until someone notices |
| Survives GHL plan/permission changes | Not always | Always |

### The recommendation in practice

1. **Direct is the primary path — and it needs no third-party middleware.**
   Generate a **Private Integration Token** in GHL's settings: a static, scoped
   access token that requires no OAuth marketplace app and no refresh cycle. That
   token alone drives the nightly sweep in step 2. For seconds-latency AR, add a
   GHL **Workflow** with an *Invoice Paid* (or sent / overdue) trigger and an
   outbound **Webhook** action pointing at your endpoint — native, no middleware.
   Check your plan first: the full Custom Webhook action, the one with auth
   headers and arbitrary HTTP methods, is an LC Premium Action and may be billed
   per execution.
2. **A nightly sweep closes webhook gaps.** Every night, pull the last 7 days
   from the GHL API and re-run it through the normaliser. Entries already
   ingested no-op on the dedup key; anything a missed webhook dropped gets
   filled in. This is what makes "direct" reliable rather than merely fast.
3. **The CSV importer is permanent infrastructure, not a fallback you hope never
   to use.** Same endpoint, same normaliser, same dedup keys. It earns its place
   three ways: initial historical backfill, a monthly assurance check (export,
   upload, confirm zero new rows — that's a passing integrity test), and a
   working revenue pipeline on any day the API is unavailable or a plan change
   revokes access.
4. **Never build a CSV-only workflow.** It reintroduces exactly the manual,
   forgettable step the brief exists to eliminate.

> **You may not need the webhook at all to start.** Once revenue and cash come
> from the processor, GHL is only carrying AR — who owes what. Outstanding-invoice
> data that is up to 24 hours stale is fine; nobody chases an invoice within the
> hour. Start with the token and the nightly pull, and add the workflow webhook
> only when you want the AR panel live.

Because both transports resolve to the same `dedup_key` (`ghl:<transaction_id>`),
uploading a CSV that overlaps live-ingested data is a no-op. That property is
what makes running both safe, and it is worth protecting with a test.

---

## 4. Data model

Three layers: raw documents (never transformed), dimensions, and one ledger.

```sql
-- ── Raw layer: nothing is transformed on the way in ──────────────────────────
create table fin_documents (
  id           bigserial primary key,
  source       text not null,        -- drive | ghl | ghl_csv | stripe | bank | manual
  external_id  text,                 -- Drive file id, Stripe charge id, GHL txn id
  content_hash text not null,        -- sha256 of file bytes, or of the canonical payload
  uri          text,                 -- link back to the original
  payload      jsonb not null default '{}',
  received_at  timestamptz not null default now(),
  parsed_at    timestamptz,
  parse_error  text,
  unique (source, content_hash)
);

-- ── Dimensions ───────────────────────────────────────────────────────────────
create table fin_categories (
  id       serial primary key,
  name     text not null unique,
  kind     text not null check (kind in
             ('revenue','cogs','opex','capex','tax','capital','transfer')),
  pnl_line text                       -- how it rolls up on the P&L
);

create table fin_counterparties (
  id                  serial primary key,
  name                text not null unique,
  aliases             text[] not null default '{}',  -- 'GOOGLE*CLOUD','GOOGLE CLOUD EMEA'
  default_category_id int references fin_categories(id),
  kind                text not null default 'supplier'
);

-- ── The ledger: one row per financial fact, from any source ──────────────────
create table fin_entries (
  id                bigserial primary key,
  entry_date        date   not null,
  direction         text   not null check (direction in ('in','out')),
  amount_minor      bigint not null check (amount_minor > 0),  -- direction carries the sign
  currency          char(3) not null,
  fx_rate           numeric(18,8) not null default 1,
  base_amount_minor bigint not null,          -- in base currency, computed on write
  counterparty_id   int    references fin_counterparties(id),
  category_id       int    references fin_categories(id),
  description       text,
  document_id       bigint references fin_documents(id),
  dedup_key         text   not null unique,   -- ← the idempotency guarantee
  confidence        numeric(3,2),             -- 0.00–1.00 from the extractor
  review_status     text   not null default 'auto'
                    check (review_status in ('auto','needs_review','approved','rejected')),
  period            date   not null,          -- first day of the accounting month
  bank_match_id     bigint,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on fin_entries (period, category_id);
create index on fin_entries (review_status) where review_status = 'needs_review';

-- ── Accounts receivable (mostly GHL) ─────────────────────────────────────────
create table fin_invoices (
  id           bigserial primary key,
  source       text not null,
  external_id  text not null,
  customer_id  int  references fin_counterparties(id),
  issue_date   date not null,
  due_date     date,
  amount_minor bigint not null,
  paid_minor   bigint not null default 0,
  currency     char(3) not null,
  status       text not null,        -- draft | sent | part_paid | paid | void | written_off
  url          text,
  updated_at   timestamptz not null default now(),
  unique (source, external_id)
);

-- ── Reconciliation, automation and control ───────────────────────────────────
create table fin_bank_txns (
  id bigserial primary key, txn_date date not null, amount_minor bigint not null,
  currency char(3) not null, description text, external_id text unique,
  matched_entry_id bigint references fin_entries(id)
);

create table fin_rules (              -- learned categorisation, applied before any AI call
  id serial primary key, priority int not null default 100,
  match_field text not null,          -- vendor_name | description | amount_exact
  match_pattern text not null,
  set_counterparty_id int references fin_counterparties(id),
  set_category_id     int references fin_categories(id),
  created_from_entry_id bigint
);

create table fin_periods (            -- close control
  period date primary key,
  status text not null default 'open' check (status in ('open','closed')),
  locked_at timestamptz
);
```

### Deduplication keys — the most important twelve lines in the system

| Source | `dedup_key` |
|---|---|
| Drive receipt | `drive:<sha256 of file bytes>` |
| Stripe | `stripe:<balance_transaction_id>` |
| GHL webhook | `ghl:<transaction_id>` |
| GHL CSV row | `ghl:<transaction_id>` — **deliberately identical to the webhook key** |
| Bank line | `bank:<bank_transaction_id>` |
| Manual entry | `manual:<uuid>` |

A unique index on `dedup_key` means every import is idempotent. Re-run the
nightly sweep twice, upload the same CSV three times, re-photograph a receipt —
the ledger is unchanged. This single constraint removes an entire category of
finance-system bugs, and it is what allows the aggressive automation everywhere
else: any job can safely be retried.

### Capital

Capital events (equity in, director's loan, loan drawdown, repayment, owner
draw, grant) are ordinary `fin_entries` with a category of `kind = 'capital'`.
They flow through cash but are excluded from the P&L and from burn — which is
exactly the treatment that makes runway correct. No extra table needed unless
loan amortisation schedules are required later.

### Derived metrics are views, never stored columns

```sql
create view fin_v_pnl_monthly as
select e.period, c.pnl_line, c.kind,
       sum(case when e.direction = 'in' then e.base_amount_minor
                else -e.base_amount_minor end) as net_minor
from fin_entries e
join fin_categories c on c.id = e.category_id
where e.review_status <> 'rejected'
  and c.kind in ('revenue','cogs','opex','tax')
group by 1, 2, 3;
```

Definitions live in version-controlled SQL, so "what counts as revenue" has one
answer that can be reviewed in a pull request — not a formula buried in a cell.

---

## 5. Pipeline A — Drive receipts and invoices → categorised expenses

**The whole user-facing workflow is: drop a file in a Drive folder. That is it.**

```
Drive/Finance/Inbox/  →  watcher  →  extract  →  categorise  →  ledger
                                                                 ↓
                          Drive/Finance/Processed/2026-08/2026-08-14_Figma_48.00.pdf
```

1. **Capture.** One shared folder, `Finance/Inbox/`. Accepts PDF, JPEG, PNG,
   HEIC. A forwarding address on the same folder (or a Gmail filter that saves
   attachments there) covers emailed supplier invoices without anyone opening
   Drive at all.

2. **Trigger.** Drive push notifications hit a webhook on the API. Because Drive
   watch channels expire (roughly weekly), a Vercel Cron job also re-lists the
   folder every night — belt and braces. Anything the webhook missed is picked up
   within 24 hours, and the dedup key makes the overlap harmless.

3. **Store raw first.** Download bytes, compute the sha256, insert into
   `fin_documents`. If the hash already exists, stop — this file has been seen.
   Only then parse. Raw-first means a parser improvement can be replayed over
   every historical document without re-fetching anything.

4. **Extract with Claude, structured.** One vision call per document, forced to a
   JSON schema:

   ```json
   {
     "vendor_name": "string",
     "vendor_tax_id": "string|null",
     "document_type": "invoice|receipt|credit_note|statement",
     "issue_date": "YYYY-MM-DD",
     "currency": "ISO-4217",
     "subtotal": "number",
     "tax_amount": "number",
     "total": "number",
     "invoice_number": "string|null",
     "line_items": [{ "description": "string", "amount": "number" }],
     "suggested_category": "one of the chart-of-accounts names",
     "confidence": "0.0–1.0"
   }
   ```

   Pass the current category list in the prompt so the model chooses from the real
   chart of accounts rather than inventing labels. Validate with zod (already a
   dependency) before anything touches the ledger.

5. **Categorise: rules first, AI second.** Check `fin_rules` for a vendor-alias
   match before calling the model at all. A known vendor is categorised
   deterministically, for free, in under a millisecond. Only unseen vendors reach
   the extractor's suggestion. **When a human approves a suggestion in the review
   queue, write a rule automatically.** Categorisation therefore converges: month
   one might need 30 decisions, month four needs two or three.

6. **Write, with a confidence gate.** Below the threshold (start at 0.85, tune
   once you have data), or a total that doesn't equal subtotal + tax, or a vendor
   never seen before — the entry is still written, flagged `needs_review`.
   **Low-confidence documents never block the ledger.** The dashboard total is
   always complete; the review queue is about correctness of *attribution*, not
   of existence. This is the difference between a system people trust and one
   that quietly stalls behind a blocked queue.

7. **File it.** Move to `Processed/YYYY-MM/` and rename to
   `YYYY-MM-DD_Vendor_Total.pdf`. The Drive folder becomes a tidy, dated
   audit trail as a side effect. Unparseable files go to `Needs-attention/` with
   the error in the filename.

Note for Vercel: serverless functions have execution limits, so process the inbox
in small batches per invocation (e.g. 10 documents) and let the cron re-fire
rather than trying to drain a large backlog in one run.

---

## 6. Pipeline B — revenue, payments and outstanding balances

Three feeds, one normaliser:

**Payment processor (cash and revenue truth).** Subscribe to charge, refund,
dispute and payout webhooks. Verify the signature on every request. Each charge
produces two ledger entries: gross revenue `in`, and the processor fee as an
`out` against a `Payment processing fees` category. Payouts are recorded as
`transfer` entries so cash-flow timing matches the bank rather than the sale date.

**GHL (sales and AR).** Invoice created/updated/paid and order/subscription
events upsert `fin_invoices` on `(source, external_id)`. GHL owns *who owes what*;
it does not create revenue entries — the processor does. When a GHL invoice is
marked paid, match it to the processor charge (amount + customer + a date window)
and link them. Unmatched paid invoices after 72 hours surface on the dashboard —
usually a real off-platform payment that needs a bank match.

**CSV upload.** An admin-only upload control on the dashboard. Detect the export
format from headers, map to the same normalised shape, show a preview with a
count of *new* vs *already known* rows, then commit. Every row carries the same
`ghl:<transaction_id>` dedup key as the live path, so overlap is silently
ignored. Store the raw CSV in `fin_documents` too.

**Bank feed.** Either an aggregator (Plaid / TrueLayer / GoCardless Bank Account
Data) or, at the simplest, a monthly OFX/CSV statement dropped into the same
Drive folder — the watcher recognises it and routes it to the bank importer
rather than the receipt extractor.

---

## 7. Reconciliation and close

Reconciliation runs on every write and again nightly. Nothing waits for a human.

**Matching, in order of confidence.** Exact amount + date within ±3 days + vendor
alias hit → auto-match, `bank_match_id` set. Exact amount within ±7 days →
match with a lower score. Amount within 1% (FX or fee rounding) → propose, and
send to review. Everything else stays unmatched and visible.

**The nightly tie-out.** One assertion is what makes the dashboard trustworthy:

```
Σ(ledger cash entries in period) == Σ(bank movements in period)
```

If those diverge, the job posts the delta and the unmatched rows to Slack or
email. A finance dashboard that cannot prove it agrees with the bank is a
guess. This check turns it into a statement.

**Period locking.** Once a month is closed in `fin_periods`, entries dated in
that period are rejected at write time and instead posted to the open period as
an adjustment, tagged with the original date. History stops moving under people's
feet — a property that matters the first time an accountant asks why last
quarter's figure changed.

**The weekly ritual (about ten minutes).** Monday morning digest: cash on hand,
runway, last week's revenue and spend, items needing review, overdue invoices.
Clear the queue from the dashboard; each approval writes a rule and makes the
next month lighter.

---

## 8. The dashboard

A new admin-guarded `/finance` route in the existing React client, reading the
SQL views. Scanned, not read — summary first, detail on demand.

**Top row — the seven numbers that answer "are we okay?"**

| Metric | Definition |
|---|---|
| Cash on hand | Latest reconciled balance across all bank accounts |
| Runway | Cash on hand ÷ trailing-3-month net burn |
| Net burn (3-mo avg) | Cash out − cash in, **excluding capital events** |
| Revenue MTD / QTD | Sum of `kind = 'revenue'` entries in period |
| Expenses MTD | Sum of `cogs + opex + tax` |
| Net P&L MTD | Revenue − expenses |
| Outstanding AR | `Σ(amount − paid)` on unpaid invoices, with the overdue share called out |

**Below that**

- **Revenue vs expenses**, monthly, 13-month trailing, with a gross-margin line.
- **Cash flow**, direct method: opening cash → operating in/out → capital → closing.
- **P&L by category** for the current month against the trailing average, so
  unusual spend stands out without anyone hunting for it.
- **AR ageing** — current / 1–30 / 31–60 / 61–90 / 90+, each bucket clickable
  through to the invoices, with DSO and collection rate alongside.
- **Capital position** — equity in, loans outstanding, draws, capital employed.
- **Review queue** — the only interactive surface; each row shows the source
  document beside the proposed categorisation. Approve, recategorise, or reject.
- **Ledger table** — filterable, sortable, with a CSV export for the accountant.
  This is the one sanctioned spreadsheet: generated, read-only, never edited.

Also worth having: MRR/ARR from GHL subscriptions, revenue per customer, and — if
ad spend is tagged to a category — blended CAC.

---

## 9. Reliability: what breaks, and what happens when it does

| Failure | How it's caught | What happens |
|---|---|---|
| Drive watch channel expires | Nightly folder re-list finds unprocessed files | Picked up within 24h; dedup prevents doubles |
| Receipt too poor to read | Confidence below threshold | Written as `needs_review` with the image attached; totals stay correct |
| GHL webhook missed | Nightly 7-day API sweep | Backfilled automatically; dedup key no-ops the rest |
| Same file uploaded twice | Unique `content_hash` | Insert no-ops |
| CSV overlapping live data | Shared `dedup_key` | Only genuinely new rows are inserted |
| Processor fees forgotten | Fee posted from the balance transaction | Recorded as a separate opex entry, always |
| Someone edits a closed month | `fin_periods` lock | Write rejected; adjustment posted to the open period |
| Extractor hallucinates a total | `subtotal + tax = total` check | Forced to review regardless of stated confidence |
| Ledger drifts from bank | Nightly tie-out assertion | Alert with the delta and unmatched rows |
| Anthropic API unavailable | Extraction fails, document already stored | Retried next run from stored bytes; nothing lost |

The common thread: **every job is safely retryable, and no failure blocks the
ledger.** Degradation is always partial and always visible.

### Security

Put the finance routes behind the existing admin guard — this is the most
sensitive data in the app. Use a Drive service account with read-only access
scoped to the one folder. Verify webhook signatures on every inbound request
(Stripe signature header; a shared secret plus timestamp for GHL). Never store
card numbers — the processor's IDs are sufficient. Rate-limit the CSV upload
endpoint as the existing code already does for auth and AI routes.

---

## 10. Build plan

| Phase | Work | Live at the end of it |
|---|---|---|
| **1. Foundations** | Dedicated business bank account; chart of accounts (~25 categories — resist more); processor connected; `fin_*` migration; base currency set | A ledger with a shape |
| **2. Expenses** | Drive folder + watcher + extractor + rules + review queue | Drop a receipt, watch it appear categorised |
| **3. Revenue** | Processor webhooks; GHL webhooks; CSV importer; historical backfill | Revenue and AR live |
| **4. Dashboard + reconciliation** | SQL views; `/finance` route; bank import; nightly tie-out; Monday digest | The system in the brief |
| **5. Optional** | Push completed entries to Xero/QBO for statutory accounts | Accountant-ready |

Phases 2 and 3 are independent and can run in parallel. Order phase 2 first if
expense tracking is the current pain, phase 3 first if it's revenue visibility.

**Start the chart of accounts small.** Twenty-five categories that everyone
understands beat eighty that get miscoded. Categories are cheap to add later and
expensive to merge.

---

## 11. What stays manual — honestly

Automation should be judged on what it removes, not on claiming to remove
everything. After this is running, expect **about 20 minutes a week**:

- **Clearing the review queue** — unseen vendors and ambiguous documents. Shrinks
  every month as rules accumulate; this is the main ongoing task.
- **Approving the monthly close.** Deliberately a human action.
- **Genuine judgement calls** — capitalise or expense, accruals, prepayments,
  what counts as COGS. No system should decide these silently.
- **Chasing overdue invoices.** The dashboard tells you exactly who and how much;
  the sending can be automated through a GHL workflow, but deciding to escalate
  is a person's call.
- **Tax filing** with an accountant, from the exported ledger or from Xero.

What it removes: opening spreadsheets, retyping receipt totals, remembering to
export anything, wondering whether a number is current, and reconciling three
tools that disagree.

---

## 12. What to buy, and what it costs

Prices verified August 2026. Xero and Plaid pricing is region-specific — US figures
shown, with UK/CA noted where they differ materially.

### Already covered — no new spend

| Item | Status |
|---|---|
| Neon Postgres | Already provisioned via Vercel. The free tier covers this data volume comfortably — a few thousand ledger rows a year is nothing |
| Google Drive | Assumes an existing Workspace account |
| Payment processor | No subscription. The 1.5–3% per transaction is already being paid on every sale today; this design just records it properly |
| Express API, React client, auth, admin guard, Anthropic proxy | Already built and deployed |

### What this system actually adds

| Item | Cost | Notes |
|---|---|---|
| **Anthropic API credits** | **~$0.20–2/mo** | The only genuinely new line item. Pay-as-you-go, no subscription, no minimum. Arithmetic below |
| **Bank feed** | **$0** | Plaid's Trial plan is free with real production data for teams created on or after 15 Apr 2026 (US/CA), capped at 10 connected accounts — you need one or two. In the UK/EU, GoCardless Bank Account Data has a free tier up to 50 connections/month. Failing both, dropping a monthly statement into the same Drive folder costs nothing and works |
| **Database, storage, capture** | **$0** | Neon free tier, existing Drive |

**Marginal cost: roughly $1–2 a month.**

### The $20 that is not this system's cost

Vercel Pro is $20/month per user, and earlier drafts of this document counted it
against the finance system. That was wrong — it is a hosting question for the
**whole app**, not a finance-system cost.

Vercel's Hobby plan is licensed for personal, non-commercial use only; commercial
use is defined as *any deployment used for the purpose of financial gain of
anyone involved in producing it*. The onboarding portal is already a commercial
deployment for StrideUp, so this applies today, with or without a finance module.
If you are already on Pro, adding the finance dashboard costs nothing. If you are
on Hobby, that is a pre-existing gap this module inherits rather than creates.

Note that **cron is not the reason**. Every scheduled job in this design runs
daily, which Hobby permits. If scheduling cadence were the only constraint,
GitHub Actions would give you free scheduled jobs firing against your existing
repo. It is the licence, not the scheduler.

### Extraction cost, precisely

A receipt is roughly 2,200 input tokens (page image plus the prompt carrying the
category list) and about 300 output tokens of structured JSON.

| Model | Rate (in / out per MTok) | Per document | 50 docs/mo | 100 docs/mo |
|---|---|---|---|---|
| Claude Haiku 4.5 | $1 / $5 | ~$0.004 | ~$0.19 | ~$0.37 |
| Claude Opus 5 | $5 / $25 | ~$0.019 | ~$0.93 | ~$1.85 |

The gap is about $3/month. **Choose on extraction accuracy, not cost** — every
misread receipt becomes a review-queue item, and queue minutes are worth far more
than three dollars. Prompt caching won't help here: the stable prefix is only
~600 tokens, below the ~1,024-token minimum cacheable prefix.

### Optional, and deferrable

| Item | Cost | When you'd buy it |
|---|---|---|
| **Middleware** (Make, Zapier, n8n) | $0 | **Not needed on the build path.** Private Integration Tokens remove the OAuth marketplace app that middleware existed to avoid, and your Express API can already receive a webhook. Middleware earns its place only on the buy path, where there is no code to receive one. If you want a visual layer anyway, n8n and Activepieces are self-hostable and free |
| **Xero** (US) | Starter $20 / Standard $47 / Premium $80 per month | Phase 5, when an accountant needs statutory books. A 90%-off promo has been running since April 2026. UK: £14/£28/£36. Canada: CAD $18/$45/$58 |
| **Syft or Fathom** | ~$29–50/mo | Only on the buy-instead-of-build path — the hub's own dashboard replaces this |

### The build path versus the buy path

| | Build (this design) | Buy (Xero + Hubdoc + Syft + Make) |
|---|---|---|
| Monthly, now | ~$1–2 | ~$87–137 |
| Monthly, with statutory books | ~$48–49 | ~$87–137 |
| Time to live | ~11–14 working days | ~1 week |
| Live custom dashboard | Yes | No — generic reporting only |
| GHL-aware AR and runway | Yes | No |

### The real cost is build time

Roughly **11–14 working days** for someone fluent in this stack: about a day for
foundations, three to four for the expense pipeline, three to four for revenue,
and four to five for the dashboard and reconciliation. At contractor rates that
is meaningful money; done in-session it is time rather than cash. Either way it
dwarfs the ~$25/month of infrastructure, and it is the number worth deciding on.
