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
     sort     integer NOT NULL DEFAULT 100
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
     period    date PRIMARY KEY,
     status    text NOT NULL DEFAULT 'open',
     closed_at timestamptz
   )`,
];

// ── Chart of accounts ────────────────────────────────────────
// Deliberately small. Twenty-odd categories everyone understands beat eighty
// that get miscoded; they are cheap to add later and expensive to merge.
export const FIN_CATEGORIES = [
  ["Programme revenue", "revenue", "Revenue", 10],
  ["Coaching revenue", "revenue", "Revenue", 11],
  ["Other income", "revenue", "Revenue", 19],

  ["Coach & contractor fees", "cogs", "Cost of sales", 20],
  ["Programme delivery costs", "cogs", "Cost of sales", 21],
  ["Payment processing fees", "cogs", "Cost of sales", 22],

  ["Software & subscriptions", "opex", "Operating expenses", 30],
  ["Marketing & advertising", "opex", "Operating expenses", 31],
  ["Salaries & wages", "opex", "Operating expenses", 32],
  ["Contractors (non-delivery)", "opex", "Operating expenses", 33],
  ["Professional fees", "opex", "Operating expenses", 34],
  ["Rent & facilities", "opex", "Operating expenses", 35],
  ["Travel", "opex", "Operating expenses", 36],
  ["Meals & entertainment", "opex", "Operating expenses", 37],
  ["Telephone & internet", "opex", "Operating expenses", 38],
  ["Insurance", "opex", "Operating expenses", 39],
  ["Training & development", "opex", "Operating expenses", 40],
  ["Office supplies", "opex", "Operating expenses", 41],
  ["Bank charges", "opex", "Operating expenses", 42],
  ["Other operating", "opex", "Operating expenses", 49],

  ["Equipment & hardware", "capex", "Capital expenditure", 50],

  ["Sales tax / VAT", "tax", "Tax", 60],
  ["Corporation tax", "tax", "Tax", 61],

  ["Equity investment", "capital", "Capital", 70],
  ["Director's loan in", "capital", "Capital", 71],
  ["Director's loan repaid", "capital", "Capital", 72],
  ["Owner draw", "capital", "Capital", 73],
  ["Grant received", "capital", "Capital", 74],

  ["Processor payout", "transfer", "Transfers", 80],
  ["Bank transfer", "transfer", "Transfers", 81],
];
