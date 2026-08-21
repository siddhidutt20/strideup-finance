// ── Finance schema ───────────────────────────────────────────
// Three layers: raw documents (never transformed), dimensions, and one ledger.
// Every financial fact — an uploaded receipt, a GHL invoice payment, a bank
// line, a manual entry — becomes exactly one row in fin_entries, carrying a
// deterministic dedup_key. The unique index on that key is what makes every
// import idempotent and therefore safely retryable.

export const FIN_SCHEMA = [
  // Raw layer. Store the source bytes/payload first, derive afterwards, so a
  // parser improvement can be replayed over history without re-fetching.
  `CREATE TABLE IF NOT EXISTS fin_documents (
     id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     source       text NOT NULL,
     external_id  text,
     filename     text,
     mime         text,
     byte_size    integer NOT NULL DEFAULT 0,
     content_hash text NOT NULL,
     data         text,
     payload      text NOT NULL DEFAULT '{}',
     entity       text NOT NULL DEFAULT 'strideup',
     received_at  timestamptz NOT NULL DEFAULT now(),
     parsed_at    timestamptz,
     parse_error  text,
     UNIQUE (source, content_hash)
   )`,

  `CREATE TABLE IF NOT EXISTS fin_categories (
     id       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     name     text NOT NULL UNIQUE,
     kind     text NOT NULL,
     pnl_line text,
     sort     integer NOT NULL DEFAULT 100,
     entity   text NOT NULL DEFAULT 'strideup'
   )`,

  `CREATE TABLE IF NOT EXISTS fin_counterparties (
     id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     name                text NOT NULL UNIQUE,
     kind                text NOT NULL DEFAULT 'supplier',
     default_category_id integer REFERENCES fin_categories(id),
     created_at          timestamptz NOT NULL DEFAULT now()
   )`,

  // The ledger. Amount is always positive; direction carries the sign.
  `CREATE TABLE IF NOT EXISTS fin_entries (
     id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     entity            text NOT NULL DEFAULT 'strideup',
     entry_date        date NOT NULL,
     direction         text NOT NULL,
     amount_minor      bigint NOT NULL,
     currency          char(3) NOT NULL DEFAULT 'USD',
     fx_rate           numeric(18,8) NOT NULL DEFAULT 1,
     base_amount_minor bigint NOT NULL,
     counterparty_id   integer REFERENCES fin_counterparties(id),
     category_id       integer REFERENCES fin_categories(id),
     description       text,
     reference         text,
     document_id       bigint REFERENCES fin_documents(id) ON DELETE SET NULL,
     dedup_key         text NOT NULL UNIQUE,
     confidence        numeric(4,3),
     review_status     text NOT NULL DEFAULT 'auto',
     review_reason     text,
     period            date NOT NULL,
     bank_match_id     bigint,
     created_at        timestamptz NOT NULL DEFAULT now(),
     updated_at        timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_fin_entries_period ON fin_entries(period)`,
  `CREATE INDEX IF NOT EXISTS idx_fin_entries_cat ON fin_entries(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_fin_entries_review ON fin_entries(review_status)`,

  // Accounts receivable — who owes what. Sourced from GHL; never creates
  // revenue entries itself (the payment processor does that).
  `CREATE TABLE IF NOT EXISTS fin_invoices (
     id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     source       text NOT NULL,
     external_id  text NOT NULL,
     customer     text,
     issue_date   date NOT NULL,
     due_date     date,
     amount_minor bigint NOT NULL,
     paid_minor   bigint NOT NULL DEFAULT 0,
     currency     char(3) NOT NULL DEFAULT 'USD',
     status       text NOT NULL DEFAULT 'sent',
     entity       text NOT NULL DEFAULT 'strideup',
     url          text,
     updated_at   timestamptz NOT NULL DEFAULT now(),
     UNIQUE (source, external_id)
   )`,

  `CREATE TABLE IF NOT EXISTS fin_bank_txns (
     id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     txn_date         date NOT NULL,
     amount_minor     bigint NOT NULL,
     currency         char(3) NOT NULL DEFAULT 'USD',
     description      text,
     entity           text NOT NULL DEFAULT 'strideup',
     external_id      text UNIQUE,
     matched_entry_id bigint REFERENCES fin_entries(id) ON DELETE SET NULL,
     created_at       timestamptz NOT NULL DEFAULT now()
   )`,

  // Learned categorisation. Checked before any model call, so a vendor seen
  // once is categorised deterministically and free from then on.
  `CREATE TABLE IF NOT EXISTS fin_rules (
     id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     match_pattern       text NOT NULL UNIQUE,
     set_counterparty_id integer REFERENCES fin_counterparties(id),
     set_category_id     integer NOT NULL REFERENCES fin_categories(id),
     set_entity          text,
     hits                integer NOT NULL DEFAULT 0,
     created_at          timestamptz NOT NULL DEFAULT now()
   )`,

  // Month snapshots. Not a locking ceremony — it stops a figure you have
  // already acted on from silently changing when a late document arrives.
  // Rates are cached per day so a month's worth of foreign invoices costs one
  // lookup, and so a figure never silently changes because a rate moved.
  `CREATE TABLE IF NOT EXISTS fin_fx_rates (
     rate_date  date NOT NULL,
     base       char(3) NOT NULL,
     quote      char(3) NOT NULL,
     rate       numeric(20,10) NOT NULL,
     fetched_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (rate_date, base, quote)
   )`,

  `CREATE TABLE IF NOT EXISTS fin_periods (
     period    date NOT NULL,
     entity    text NOT NULL DEFAULT 'strideup',
     status    text NOT NULL DEFAULT 'open',
     closed_at timestamptz,
     PRIMARY KEY (period, entity)
   )`,

  // ── Commitments ────────────────────────────────────────────
  // A commitment is money already agreed: a retainer, a subscription, an EMI,
  // a rental agreement, a signed client contract. It is a *rule* — amount,
  // frequency, start, end — not a list of rows. Occurrences are expanded on
  // demand in metrics.js, so an open-ended commitment needs no end date and
  // nothing drifts out of date as months pass.
  //
  // This is deliberately not the ledger. A commitment is what is expected; an
  // entry is what happened. They are only ever compared, never merged.
  `CREATE TABLE IF NOT EXISTS fin_commitments (
     id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     entity            text NOT NULL DEFAULT 'strideup',
     direction         text NOT NULL,
     description       text NOT NULL,
     counterparty_id   integer REFERENCES fin_counterparties(id),
     category_id       integer REFERENCES fin_categories(id),
     amount_minor      bigint NOT NULL,
     currency          char(3) NOT NULL DEFAULT 'USD',
     fx_rate           numeric(18,8) NOT NULL DEFAULT 1,
     base_amount_minor bigint NOT NULL,
     frequency         text NOT NULL DEFAULT 'monthly',
     day_of_month      integer,
     start_date        date NOT NULL,
     end_date          date,
     status            text NOT NULL DEFAULT 'active',
     source            text NOT NULL DEFAULT 'manual',
     document_id       bigint REFERENCES fin_documents(id) ON DELETE SET NULL,
     confidence        numeric(4,3) NOT NULL DEFAULT 1,
     review_status     text NOT NULL DEFAULT 'ok',
     review_reason     text,
     dedup_key         text UNIQUE,
     created_at        timestamptz NOT NULL DEFAULT now()
   )`,

  // ── Settled occurrences ────────────────────────────────────
  // A commitment's schedule is computed, not stored, so this table records
  // only the occurrences that have actually been settled. One row per
  // (commitment, due date) — the unique key is what makes "mark paid"
  // idempotent, and what stops a payment being recorded twice.
  //
  // Marking one paid is what turns a promise into money: it writes a real
  // ledger entry. Until then the contract is visible everywhere as committed,
  // and counts toward nothing that claims to be revenue or cash.
  `CREATE TABLE IF NOT EXISTS fin_commitment_payments (
     id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     commitment_id  bigint NOT NULL REFERENCES fin_commitments(id) ON DELETE CASCADE,
     due_date       date NOT NULL,
     paid_date      date,
     entry_id       bigint REFERENCES fin_entries(id) ON DELETE SET NULL,
     status         text NOT NULL DEFAULT 'paid',
     amount_minor   bigint,
     base_amount_minor bigint,
     matched_by     text NOT NULL DEFAULT 'manual',
     note           text,
     created_at     timestamptz NOT NULL DEFAULT now(),
     UNIQUE (commitment_id, due_date)
   )`,
];

// ── Chart of accounts ────────────────────────────────────────
// Deliberately small. Twenty-odd categories everyone understands beat eighty
// that get miscoded; they are cheap to add later and expensive to merge.
// Two charts of accounts. `entity` is which books a category belongs to;
// "both" is for the genuinely shared ones — a bank charge or an insurance
// premium reads the same either side.
//
// The sixth column is the spend group: the five headings company money is
// read under — Tech, Marketing, Operations, Payroll, G&A. It is a lens over
// the chart of accounts, not a replacement for it: `kind` still decides what
// is a cost of sales and what is operating spend, so the P&L keeps its shape
// while the dashboards answer "where is it going" in five words. Categories
// with no group (revenue, capital, transfers, and the personal books) are
// read under their own name, as before.
export const FIN_CATEGORIES = [
  // ── StrideUp ──
  ["Programme revenue", "revenue", "Revenue", 10, "strideup"],
  ["Coaching revenue", "revenue", "Revenue", 11, "strideup"],
  ["Other income", "revenue", "Revenue", 19, "strideup"],

  ["Coach & contractor fees", "cogs", "Cost of sales", 20, "strideup", "Payroll"],
  ["Programme delivery costs", "cogs", "Cost of sales", 21, "strideup", "Operations"],
  ["Payment processing fees", "cogs", "Cost of sales", 22, "strideup", "Operations"],

  ["Software & subscriptions", "opex", "Operating expenses", 30, "strideup", "Tech"],
  ["Marketing & advertising", "opex", "Operating expenses", 31, "strideup", "Marketing"],
  ["Salaries & wages", "opex", "Operating expenses", 32, "strideup", "Payroll"],
  ["Contractors (non-delivery)", "opex", "Operating expenses", 33, "strideup", "Payroll"],
  ["Rent & facilities", "opex", "Operating expenses", 35, "strideup", "Operations"],
  ["Training & development", "opex", "Operating expenses", 40, "strideup", "Payroll"],
  ["Office supplies", "opex", "Operating expenses", 41, "strideup", "Operations"],
  ["Other operating", "opex", "Operating expenses", 49, "strideup", "G&A"],
  ["Equipment & hardware", "capex", "Capital expenditure", 50, "strideup", "Tech"],
  ["Sales tax / VAT", "tax", "Tax", 60, "strideup", "G&A"],
  ["Corporation tax", "tax", "Tax", 61, "strideup", "G&A"],

  ["Equity investment", "capital", "Capital", 70, "strideup"],
  ["Director's loan in", "capital", "Capital", 71, "strideup"],
  ["Director's loan repaid", "capital", "Capital", 72, "strideup"],
  ["Owner draw", "capital", "Capital", 73, "strideup"],
  ["Grant received", "capital", "Capital", 74, "strideup"],
  ["Processor payout", "transfer", "Transfers", 80, "strideup"],

  // ── Shared ──
  ["Professional fees", "opex", "Operating expenses", 34, "both", "G&A"],
  ["Travel", "opex", "Operating expenses", 36, "both", "G&A"],
  ["Meals & entertainment", "opex", "Operating expenses", 37, "both", "G&A"],
  ["Telephone & internet", "opex", "Operating expenses", 38, "both", "Tech"],
  ["Insurance", "opex", "Operating expenses", 39, "both", "G&A"],
  ["Bank charges", "opex", "Operating expenses", 42, "both", "G&A"],
  ["Bank transfer", "transfer", "Transfers", 81, "both"],

  // ── Personal ──
  ["Rental income", "revenue", "Income", 110, "personal"],
  ["Salary & drawings", "revenue", "Income", 111, "personal"],
  ["Other personal income", "revenue", "Income", 119, "personal"],

  ["Rent or mortgage", "opex", "Living costs", 130, "personal"],
  ["Utilities", "opex", "Living costs", 131, "personal"],
  ["Groceries & household", "opex", "Living costs", 132, "personal"],
  ["Personal subscriptions", "opex", "Living costs", 133, "personal"],
  ["Transport & fuel", "opex", "Living costs", 134, "personal"],
  ["Healthcare", "opex", "Living costs", 135, "personal"],
  ["Education", "opex", "Living costs", 136, "personal"],
  // An EMI is two things: the interest is a cost, the principal is not.
  // Splitting them keeps a loan repayment out of the personal P&L.
  ["Loan interest", "opex", "Living costs", 137, "personal"],
  ["Other personal", "opex", "Living costs", 149, "personal"],

  ["Loan principal repaid", "capital", "Capital", 170, "personal"],
  ["Savings & investment", "capital", "Capital", 171, "personal"],
];

// ── Entities ─────────────────────────────────────────────────
// Two sets of books in one app. They share a login and a database and nothing
// else: no statement ever mixes them unless it shows them side by side.
export const ENTITIES = ["strideup", "personal"];
export const ENTITY_LABEL = { strideup: "StrideUp", personal: "Personal" };

// ── Migrations ───────────────────────────────────────────────
// Run after FIN_SCHEMA, each one independently and tolerant of already having
// been applied — the schema above is what a fresh database gets, these bring an
// existing one up to it. Failures are logged, never fatal.
export const FIN_MIGRATIONS = [
  `ALTER TABLE fin_entries      ADD COLUMN IF NOT EXISTS entity text NOT NULL DEFAULT 'strideup'`,
  `ALTER TABLE fin_documents    ADD COLUMN IF NOT EXISTS entity text NOT NULL DEFAULT 'strideup'`,
  `ALTER TABLE fin_invoices     ADD COLUMN IF NOT EXISTS entity text NOT NULL DEFAULT 'strideup'`,
  `ALTER TABLE fin_bank_txns    ADD COLUMN IF NOT EXISTS entity text NOT NULL DEFAULT 'strideup'`,
  `ALTER TABLE fin_rules        ADD COLUMN IF NOT EXISTS set_entity text`,
  `ALTER TABLE fin_categories   ADD COLUMN IF NOT EXISTS entity text NOT NULL DEFAULT 'strideup'`,
  // The five headings company spend is read under. Nothing recorded moves:
  // this labels the category, not the entry, so a closed month keeps every
  // value it closed with and only the heading above it changes.
  `ALTER TABLE fin_categories   ADD COLUMN IF NOT EXISTS spend_group text`,
  `ALTER TABLE fin_periods      ADD COLUMN IF NOT EXISTS entity text NOT NULL DEFAULT 'strideup'`,
  // Everything recorded before entities existed is StrideUp's.
  `UPDATE fin_entries   SET entity = 'strideup' WHERE entity IS NULL`,
  `UPDATE fin_documents SET entity = 'strideup' WHERE entity IS NULL`,
  `UPDATE fin_invoices  SET entity = 'strideup' WHERE entity IS NULL`,
  // Widen the period key so closing one set of books leaves the other open.
  `ALTER TABLE fin_periods DROP CONSTRAINT IF EXISTS fin_periods_pkey`,
  `ALTER TABLE fin_periods ADD PRIMARY KEY (period, entity)`,
  `CREATE INDEX IF NOT EXISTS idx_fin_entries_entity ON fin_entries(entity, period)`,
  `CREATE INDEX IF NOT EXISTS idx_fin_commitments_scope
     ON fin_commitments(entity, status, start_date)`,
  `CREATE INDEX IF NOT EXISTS idx_fin_commitment_payments_due
     ON fin_commitment_payments(due_date)`,
];

// How often a commitment recurs. "once" is a single dated payment — a
// milestone invoice, a deposit — which the schedule treats as a one-month
// commitment rather than a special case.
export const FREQUENCIES = ["once", "weekly", "monthly", "quarterly", "annual"];
export const FREQUENCY_LABEL = {
  once: "One-off", weekly: "Weekly", monthly: "Monthly",
  quarterly: "Quarterly", annual: "Annual",
};

// Months per occurrence. `weekly` is not a month multiple, so it is expanded
// by date rather than by this table.
export const FREQUENCY_MONTHS = { monthly: 1, quarterly: 3, annual: 12 };
