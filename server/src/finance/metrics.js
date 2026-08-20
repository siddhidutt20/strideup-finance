import { all, get } from "../db.js";
import { isoDate } from "../util.js";

// ── Metric definitions ───────────────────────────────────────
// Every figure the dashboard shows is defined here, in SQL, in version
// control. "What counts as revenue" has one answer that can be reviewed in a
// pull request rather than living in a spreadsheet cell.
//
// Entries that have not been categorised yet still count toward totals —
// they are flagged, not excluded — so the headline numbers are always
// complete. Rejected entries are the only ones ever left out.

const SIGNED = `SUM(CASE WHEN e.direction = 'in'
                        THEN e.base_amount_minor
                        ELSE -e.base_amount_minor END)`;

// Uncategorised rows are bucketed by direction so nothing goes missing.
const KIND = `COALESCE(c.kind, CASE WHEN e.direction = 'in' THEN 'revenue' ELSE 'opex' END)`;

export const monthStart = (d = new Date()) =>
  `${d.toISOString().slice(0, 7)}-01`;

export function addMonths(period, n) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.toISOString().slice(0, 7)}-01`;
}

// ── One month's profit and loss ──────────────────────────────
export async function periodSummary(period) {
  const rows = await all(
    `SELECT ${KIND} AS kind, ${SIGNED} AS net, COUNT(*) AS n
       FROM fin_entries e
       LEFT JOIN fin_categories c ON c.id = e.category_id
      WHERE e.review_status <> 'rejected' AND e.period = ?
      GROUP BY 1`,
    [period]
  );
  const by = {};
  for (const r of rows) by[r.kind] = Number(r.net);

  const revenue = by.revenue ?? 0;
  // Expense kinds come back negative because the money went out.
  const cogs = -(by.cogs ?? 0);
  const opex = -(by.opex ?? 0);
  const tax = -(by.tax ?? 0);
  const capex = -(by.capex ?? 0);
  const capital = by.capital ?? 0;

  const expenses = cogs + opex + tax;
  return {
    period,
    revenue,
    cogs,
    opex,
    tax,
    capex,
    capital,
    expenses,
    grossProfit: revenue - cogs,
    grossMarginPct: revenue > 0 ? ((revenue - cogs) / revenue) * 100 : null,
    net: revenue - expenses,
    entryCount: rows.reduce((s, r) => s + Number(r.n), 0),
  };
}

// ── Where the month's money went, by category ────────────────
export async function categoryBreakdown(period) {
  return (
    await all(
      `SELECT COALESCE(c.name, 'Uncategorised') AS name,
              ${KIND} AS kind,
              ${SIGNED} AS net,
              COUNT(*) AS n
         FROM fin_entries e
         LEFT JOIN fin_categories c ON c.id = e.category_id
        WHERE e.review_status <> 'rejected' AND e.period = ?
        GROUP BY 1, 2
        ORDER BY ABS(${SIGNED}) DESC`,
      [period]
    )
  ).map((r) => ({
    name: r.name,
    kind: r.kind,
    amount: Math.abs(Number(r.net)),
    direction: Number(r.net) >= 0 ? "in" : "out",
    count: Number(r.n),
  }));
}

// ── Trailing months, for the trend ───────────────────────────
export async function trend(months = 13, endPeriod = monthStart()) {
  const from = addMonths(endPeriod, -(months - 1));
  const rows = await all(
    `SELECT e.period, ${KIND} AS kind, ${SIGNED} AS net
       FROM fin_entries e
       LEFT JOIN fin_categories c ON c.id = e.category_id
      WHERE e.review_status <> 'rejected' AND e.period >= ? AND e.period <= ?
      GROUP BY 1, 2`,
    [from, endPeriod]
  );

  const buckets = new Map();
  for (let i = 0; i < months; i++) {
    const p = addMonths(from, i);
    buckets.set(p, { period: p, revenue: 0, expenses: 0, net: 0 });
  }
  for (const r of rows) {
    const b = buckets.get(isoDate(r.period));
    if (!b) continue;
    const net = Number(r.net);
    if (r.kind === "revenue") b.revenue += net;
    else if (["cogs", "opex", "tax"].includes(r.kind)) b.expenses += -net;
  }
  for (const b of buckets.values()) b.net = b.revenue - b.expenses;
  return [...buckets.values()];
}

// ── Cash ─────────────────────────────────────────────────────
// With a bank feed connected the balance is the bank's. Without one, the
// best available figure is what has been recorded — which is a different
// claim, so it is labelled differently.
export async function cashPosition() {
  const bank = await get(
    "SELECT COUNT(*) AS n, COALESCE(SUM(amount_minor), 0) AS bal FROM fin_bank_txns"
  );
  if (Number(bank?.n ?? 0) > 0) {
    return { source: "bank", amount: Number(bank.bal) };
  }
  const rec = await get(
    `SELECT COALESCE(${SIGNED}, 0) AS net
       FROM fin_entries e
       LEFT JOIN fin_categories c ON c.id = e.category_id
      WHERE e.review_status <> 'rejected'
        AND COALESCE(c.kind, 'opex') <> 'transfer'`
  );
  return { source: "recorded", amount: Number(rec?.net ?? 0) };
}

// Burn excludes capital events — otherwise an investment round reads as
// profit and runway becomes fiction.
export async function burnAndRunway(cashMinor) {
  const t = await trend(4);
  const closed = t.slice(0, 3); // the three complete months before this one
  const netBurn =
    closed.reduce((s, m) => s + (m.expenses - m.revenue), 0) / (closed.length || 1);
  const monthlyBurn = Math.max(0, netBurn);
  return {
    monthlyBurn,
    runwayMonths: monthlyBurn > 0 ? cashMinor / monthlyBurn : null,
  };
}

// ── Outstanding payments ─────────────────────────────────────
export async function receivables(today = new Date()) {
  const rows = await all(
    `SELECT id, customer, issue_date, due_date, currency, url, status,
            (amount_minor - paid_minor) AS outstanding
       FROM fin_invoices
      WHERE status NOT IN ('paid', 'void', 'written_off')
        AND (amount_minor - paid_minor) > 0
      ORDER BY due_date NULLS LAST`
  );
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  const now = today.getTime();
  const invoices = rows.map((r) => {
    const out = Number(r.outstanding);
    const due = r.due_date ? new Date(r.due_date).getTime() : null;
    const daysOverdue = due ? Math.floor((now - due) / 86400000) : 0;
    if (daysOverdue <= 0) buckets.current += out;
    else if (daysOverdue <= 30) buckets.d1_30 += out;
    else if (daysOverdue <= 60) buckets.d31_60 += out;
    else if (daysOverdue <= 90) buckets.d61_90 += out;
    else buckets.d90plus += out;
    return {
      id: Number(r.id),
      customer: r.customer,
      issueDate: isoDate(r.issue_date),
      dueDate: isoDate(r.due_date),
      status: r.status,
      url: r.url,
      outstanding: out,
      daysOverdue: Math.max(0, daysOverdue),
    };
  });
  const total = Object.values(buckets).reduce((a, b) => a + b, 0);
  return {
    total,
    overdue: total - buckets.current,
    buckets,
    invoices: invoices.slice(0, 50),
  };
}

// ── Capital position ─────────────────────────────────────────
export async function capitalPosition() {
  const rows = await all(
    `SELECT c.name, ${SIGNED} AS net
       FROM fin_entries e
       JOIN fin_categories c ON c.id = e.category_id
      WHERE e.review_status <> 'rejected' AND c.kind = 'capital'
      GROUP BY 1
      ORDER BY 1`
  );
  const items = rows.map((r) => ({ name: r.name, amount: Number(r.net) }));
  return { items, netCapital: items.reduce((s, i) => s + i.amount, 0) };
}

export async function reviewCount() {
  const r = await get(
    "SELECT COUNT(*) AS n FROM fin_entries WHERE review_status = 'needs_review'"
  );
  return Number(r?.n ?? 0);
}

// ── Statements ───────────────────────────────────────────────
// The dashboard answers "how is this month going". These answer the
// questions you ask afterwards: where the money came from, where it went,
// what it added up to, and what actually moved through the bank.

const SIGNED_E = SIGNED;

// A profit and loss statement, in the order an accountant reads one:
// revenue, cost of sales, gross profit, operating expenses, operating
// profit, tax, net.
export async function profitAndLoss(period) {
  const rows = await all(
    `SELECT COALESCE(c.name, 'Uncategorised') AS name,
            ${KIND} AS kind,
            ${SIGNED_E} AS net
       FROM fin_entries e
       LEFT JOIN fin_categories c ON c.id = e.category_id
      WHERE e.review_status <> 'rejected' AND e.period = ?
      GROUP BY 1, 2
      ORDER BY ABS(${SIGNED_E}) DESC`,
    [period]
  );

  const section = (kind, flip) => {
    const lines = rows
      .filter((r) => r.kind === kind)
      .map((r) => ({ name: r.name, amount: flip ? -Number(r.net) : Number(r.net) }))
      .filter((l) => l.amount !== 0);
    return { lines, total: lines.reduce((s, l) => s + l.amount, 0) };
  };

  const revenue = section("revenue", false);
  const cogs = section("cogs", true);
  const opex = section("opex", true);
  const tax = section("tax", true);

  const grossProfit = revenue.total - cogs.total;
  const operatingProfit = grossProfit - opex.total;
  return {
    period,
    revenue, cogs, opex, tax,
    grossProfit,
    grossMarginPct: revenue.total > 0 ? (grossProfit / revenue.total) * 100 : null,
    operatingProfit,
    netProfit: operatingProfit - tax.total,
  };
}

// Cash flow, direct method. Opening is everything recorded before this month;
// capital is shown on its own line because it is not trading income and
// folding it in would make a funding round look like a good month.
export async function cashflow(period) {
  const before = await get(
    `SELECT COALESCE(${SIGNED_E}, 0) AS net
       FROM fin_entries e
       LEFT JOIN fin_categories c ON c.id = e.category_id
      WHERE e.review_status <> 'rejected' AND e.period < ?
        AND COALESCE(c.kind, 'opex') <> 'transfer'`,
    [period]
  );
  const rows = await all(
    `SELECT ${KIND} AS kind, ${SIGNED_E} AS net
       FROM fin_entries e
       LEFT JOIN fin_categories c ON c.id = e.category_id
      WHERE e.review_status <> 'rejected' AND e.period = ?
      GROUP BY 1`,
    [period]
  );
  const by = {};
  for (const r of rows) by[r.kind] = Number(r.net);

  const opening = Number(before?.net ?? 0);
  const operatingIn = by.revenue ?? 0;
  const operatingOut = -((by.cogs ?? 0) + (by.opex ?? 0) + (by.tax ?? 0));
  const capital = by.capital ?? 0;
  const capex = -(by.capex ?? 0);
  const movement = operatingIn - operatingOut - capex + capital;

  return {
    period, opening, operatingIn, operatingOut, capex, capital,
    movement, closing: opening + movement,
  };
}

// Who the money came from, and who it went to.
export async function byCounterparty(period, direction, limit = 12) {
  return (
    await all(
      `SELECT COALESCE(p.name, 'Unattributed') AS name,
              SUM(e.base_amount_minor) AS total,
              COUNT(*) AS n
         FROM fin_entries e
         LEFT JOIN fin_counterparties p ON p.id = e.counterparty_id
        WHERE e.review_status <> 'rejected' AND e.period = ? AND e.direction = ?
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT ${Number(limit)}`,
      [period, direction]
    )
  ).map((r) => ({ name: r.name, amount: Number(r.total), count: Number(r.n) }));
}
