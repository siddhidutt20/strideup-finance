import { all, get } from "../db.js";
import { isoDate } from "../util.js";
import { FREQUENCY_MONTHS } from "./schema.js";

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

// ── Entity scoping ───────────────────────────────────────────
// "both" means show each side by side, never added together — a statement that
// sums a company and a person is a statement of nothing. So every query here
// answers for exactly one set of books; the route calls it twice for "both".
const ENT = (entity) => (entity && entity !== "both" ? " AND e.entity = ?" : "");
const ENT_ARG = (entity) => (entity && entity !== "both" ? [entity] : []);

export const monthStart = (d = new Date()) =>
  `${d.toISOString().slice(0, 7)}-01`;

export function addMonths(period, n) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.toISOString().slice(0, 7)}-01`;
}

// ── One month's profit and loss ──────────────────────────────
export async function periodSummary(period, entity) {
  const rows = await all(
    `SELECT ${KIND} AS kind, ${SIGNED} AS net, COUNT(*) AS n
       FROM fin_entries e
       LEFT JOIN fin_categories c ON c.id = e.category_id
      WHERE e.review_status <> 'rejected' AND e.period = ?${ENT(entity)}
      GROUP BY 1`,
    [period, ...ENT_ARG(entity)]
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
// ── Spend groups ─────────────────────────────────────────────
// Company money is read under five headings. They are a lens over the chart
// of accounts, not a replacement for it: the entry keeps the category it was
// coded to, `kind` still decides cost of sales from operating spend, and a
// closed month keeps every value it closed with. Only the heading changes.
//
// Categories with no group — revenue, capital, transfers, and the whole
// personal chart — are read under their own name, exactly as before.
export const SPEND_GROUPS = ["Payroll", "Tech", "Marketing", "Operations", "G&A"];

// Anything company spend that has no group of its own is general and
// administrative, which is what G&A means.
export function groupSpend(rows) {
  const byGroup = new Map();
  const ungrouped = [];
  for (const r of rows) {
    if (!r.group) { ungrouped.push(r); continue; }
    const cur = byGroup.get(r.group) ?? { name: r.group, total: 0, count: 0, parts: [] };
    cur.total += r.total;
    cur.count += r.count ?? 0;
    cur.parts.push({ name: r.name, total: r.total });
    byGroup.set(r.group, cur);
  }
  if (!byGroup.size) return rows;
  for (const r of ungrouped) {
    const cur = byGroup.get("G&A") ?? { name: "G&A", total: 0, count: 0, parts: [] };
    cur.total += r.total;
    cur.count += r.count ?? 0;
    cur.parts.push({ name: r.name, total: r.total });
    byGroup.set("G&A", cur);
  }
  for (const g of byGroup.values()) g.parts.sort((a, b) => b.total - a.total);
  return SPEND_GROUPS.filter((g) => byGroup.has(g)).map((g) => byGroup.get(g));
}

export async function categoryBreakdown(period, entity) {
  return (
    await all(
      `SELECT COALESCE(c.name, 'Uncategorised') AS name,
              c.spend_group AS grp,
              ${KIND} AS kind,
              ${SIGNED} AS net,
              COUNT(*) AS n
         FROM fin_entries e
         LEFT JOIN fin_categories c ON c.id = e.category_id
        WHERE e.review_status <> 'rejected' AND e.period = ?${ENT(entity)}
        GROUP BY 1, 2, 3
        ORDER BY ABS(${SIGNED}) DESC`,
      [period, ...ENT_ARG(entity)]
    )
  ).map((r) => ({
    name: r.name,
    group: r.grp ?? null,
    kind: r.kind,
    amount: Math.abs(Number(r.net)),
    direction: Number(r.net) >= 0 ? "in" : "out",
    count: Number(r.n),
  }));
}

// ── Trailing months, for the trend ───────────────────────────
export async function trend(months = 13, endPeriod = monthStart(), entity) {
  const from = addMonths(endPeriod, -(months - 1));
  const rows = await all(
    `SELECT e.period, ${KIND} AS kind, ${SIGNED} AS net
       FROM fin_entries e
       LEFT JOIN fin_categories c ON c.id = e.category_id
      WHERE e.review_status <> 'rejected' AND e.period >= ? AND e.period <= ?${ENT(entity)}
      GROUP BY 1, 2`,
    [from, endPeriod, ...ENT_ARG(entity)]
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
export async function cashPosition(entity) {
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
        AND COALESCE(c.kind, 'opex') <> 'transfer'${ENT(entity)}`,
    ENT_ARG(entity)
  );
  return { source: "recorded", amount: Number(rec?.net ?? 0) };
}

// Burn excludes capital events — otherwise an investment round reads as
// profit and runway becomes fiction.
export async function burnAndRunway(cashMinor, entity) {
  const t = await trend(4, monthStart(), entity);
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
export async function receivables(today = new Date(), entity) {
  const scoped = entity && entity !== "both" ? " AND entity = ?" : "";
  const rows = await all(
    `SELECT id, customer, issue_date, due_date, currency, url, status, entity,
            (amount_minor - paid_minor) AS outstanding
       FROM fin_invoices
      WHERE status NOT IN ('paid', 'void', 'written_off')
        AND (amount_minor - paid_minor) > 0${scoped}
      ORDER BY due_date NULLS LAST`,
    entity && entity !== "both" ? [entity] : []
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
      entity: r.entity,
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
export async function capitalPosition(entity) {
  const rows = await all(
    `SELECT c.name, ${SIGNED} AS net
       FROM fin_entries e
       JOIN fin_categories c ON c.id = e.category_id
      WHERE e.review_status <> 'rejected' AND c.kind = 'capital'${ENT(entity)}
      GROUP BY 1
      ORDER BY 1`,
    ENT_ARG(entity)
  );
  const items = rows.map((r) => ({ name: r.name, amount: Number(r.net) }));
  return { items, netCapital: items.reduce((s, i) => s + i.amount, 0) };
}

export async function reviewCount(entity) {
  const scoped = entity && entity !== "both" ? " AND entity = ?" : "";
  const r = await get(
    `SELECT COUNT(*) AS n FROM fin_entries
      WHERE review_status = 'needs_review'${scoped}`,
    entity && entity !== "both" ? [entity] : []
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
export async function profitAndLoss(period, entity) {
  const rows = await all(
    `SELECT COALESCE(c.name, 'Uncategorised') AS name,
            ${KIND} AS kind,
            ${SIGNED_E} AS net
       FROM fin_entries e
       LEFT JOIN fin_categories c ON c.id = e.category_id
      WHERE e.review_status <> 'rejected' AND e.period = ?${ENT(entity)}
      GROUP BY 1, 2
      ORDER BY ABS(${SIGNED_E}) DESC`,
    [period, ...ENT_ARG(entity)]
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
export async function cashflow(period, entity) {
  const before = await get(
    `SELECT COALESCE(${SIGNED_E}, 0) AS net
       FROM fin_entries e
       LEFT JOIN fin_categories c ON c.id = e.category_id
      WHERE e.review_status <> 'rejected' AND e.period < ?
        AND COALESCE(c.kind, 'opex') <> 'transfer'${ENT(entity)}`,
    [period, ...ENT_ARG(entity)]
  );
  const rows = await all(
    `SELECT ${KIND} AS kind, ${SIGNED_E} AS net
       FROM fin_entries e
       LEFT JOIN fin_categories c ON c.id = e.category_id
      WHERE e.review_status <> 'rejected' AND e.period = ?${ENT(entity)}
      GROUP BY 1`,
    [period, ...ENT_ARG(entity)]
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
export async function byCounterparty(period, direction, limit = 12, entity) {
  return (
    await all(
      `SELECT COALESCE(p.name, 'Unattributed') AS name,
              SUM(e.base_amount_minor) AS total,
              COUNT(*) AS n
         FROM fin_entries e
         LEFT JOIN fin_counterparties p ON p.id = e.counterparty_id
        WHERE e.review_status <> 'rejected' AND e.period = ? AND e.direction = ?${ENT(entity)}
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT ${Number(limit)}`,
      [period, direction, ...ENT_ARG(entity)]
    )
  ).map((r) => ({ name: r.name, amount: Number(r.total), count: Number(r.n) }));
}

// ── Commitments and the forecast ─────────────────────────────
// A forecast here is not a prediction. It is the arithmetic of money already
// agreed: retainers, subscriptions, EMIs, rental agreements, signed client
// contracts. Nothing is extrapolated from past months, because a trend line
// through three months of invoices is a guess wearing a suit.
//
// The consequence is that the projection is *incomplete on purpose*. Revenue
// that has not been contracted does not appear. That is the honest shape of
// the question "what do I already owe and what am I already owed", and the
// view says so plainly rather than quietly filling the gap.

const lastDayOf = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

// The occurrence date inside a given month, clamped so a commitment due on
// the 31st still lands in February rather than silently skipping it.
function occurrenceDate(period, dayOfMonth) {
  const [y, m] = period.split("-").map(Number);
  const day = Math.min(dayOfMonth || 1, lastDayOf(y, m - 1));
  return `${period.slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

// Does a commitment fall due in this month, and how many times?
// Monthly, quarterly and annual are aligned to the start date, so a quarterly
// retainer beginning in February falls in May, August and November — not on
// calendar quarters it was never agreed to.
export function occurrencesIn(commitment, period) {
  const start = isoDate(commitment.start_date);
  const end = commitment.end_date ? isoDate(commitment.end_date) : null;
  const startPeriod = `${start.slice(0, 7)}-01`;
  const endPeriod = end ? `${end.slice(0, 7)}-01` : null;

  if (period < startPeriod) return [];
  if (endPeriod && period > endPeriod) return [];

  const freq = commitment.frequency;
  const day = commitment.day_of_month || Number(start.slice(8, 10));

  if (freq === "once") {
    return period === startPeriod ? [{ date: start }] : [];
  }

  if (freq === "weekly") {
    // Expanded by date. Jumped straight to the first occurrence inside the
    // month rather than walked from the start date — a two-year-old weekly
    // commitment would otherwise cost a hundred iterations per month queried.
    const out = [];
    const [y, m] = period.split("-").map(Number);
    const monthEnd = `${period.slice(0, 7)}-${String(lastDayOf(y, m - 1)).padStart(2, "0")}`;
    const startMs = Date.parse(`${start}T00:00:00Z`);
    const firstMs = Date.parse(`${period}T00:00:00Z`);
    const week = 7 * 86400000;
    const skipped = Math.max(0, Math.ceil((firstMs - startMs) / week));
    for (let ms = startMs + skipped * week; ; ms += week) {
      const iso = isoDate(new Date(ms));
      if (iso > monthEnd) break;
      if (iso >= period && (!end || iso <= end)) out.push({ date: iso });
    }
    return out;
  }

  const step = FREQUENCY_MONTHS[freq] ?? 1;
  const monthsApart =
    (Number(period.slice(0, 4)) - Number(startPeriod.slice(0, 4))) * 12 +
    (Number(period.slice(5, 7)) - Number(startPeriod.slice(5, 7)));
  if (monthsApart % step !== 0) return [];

  const date = occurrenceDate(period, day);
  if (end && date > end) return [];
  return [{ date }];
}

export async function activeCommitments(entity) {
  return await all(
    `SELECT k.*, c.name AS category_name, c.kind AS category_kind,
            c.spend_group AS category_group,
            p.name AS counterparty
       FROM fin_commitments k
       LEFT JOIN fin_categories c     ON c.id = k.category_id
       LEFT JOIN fin_counterparties p ON p.id = k.counterparty_id
      WHERE k.status = 'active'${entity && entity !== "both" ? " AND k.entity = ?" : ""}
      ORDER BY k.direction DESC, k.base_amount_minor DESC`,
    entity && entity !== "both" ? [entity] : []
  );
}

// What a single month already owes and is already owed.
//
// `settled` is the payment map. An occurrence that has been marked paid is a
// real ledger entry now, so it must not also be counted as money still to
// come — that would show it twice, once in the recorded position and again as
// a future commitment. Waived ones are dropped for the same reason in reverse:
// they are not arriving at all.
export function commitmentsForMonth(commitments, period, afterDate = null, settled = null) {
  let committedIn = 0, committedOut = 0;
  const items = [];
  for (const k of commitments) {
    for (const occ of occurrencesIn(k, period)) {
      if (afterDate && occ.date <= afterDate) continue; // already in the ledger
      const rec = settled?.get(occKey(k.id, occ.date));
      // A part payment leaves the rest still owed, so it is not skipped — only
      // the portion that actually arrived is taken out.
      const amount = outstandingOn(Number(k.base_amount_minor), rec);
      if (amount <= 0) continue;
      if (k.direction === "in") committedIn += amount;
      else committedOut += amount;
      items.push({
        id: k.id, date: occ.date, direction: k.direction,
        description: k.description, counterparty: k.counterparty,
        categoryName: k.category_name, categoryGroup: k.category_group, amount,
        currency: k.currency, amountMinor: Number(k.amount_minor),
        frequency: k.frequency,
      });
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  return { committedIn, committedOut, items };
}

// ── The projection ───────────────────────────────────────────
// Starts from the position recorded today, adds only what is committed, and
// reports separately how much of it is actually known. `months` counts whole
// months *after* the current one; the current month is returned as a partial
// with only its remaining commitments applied.
export async function forecast(entity, months = 6, today = new Date()) {
  const asOf = isoDate(today);
  const thisPeriod = monthStart(today);
  const commitments = await activeCommitments(entity);
  const cash = await cashPosition(entity);
  const settled = await paymentMap(entity);
  const est = await uncontractedHistory(entity, commitments, today);

  // Three running positions, not one. `committed` counts only money already
  // agreed; `expected`, `low` and `high` add an estimate of the uncontracted
  // side on top. They are kept apart all the way to the chart so that the
  // certain part is never silently blended into the guessed part.
  const rest = commitmentsForMonth(commitments, thisPeriod, asOf, settled);
  const run = {
    committed: cash.amount + rest.committedIn - rest.committedOut,
  };
  // The remainder of the current month is prorated: two thirds through August,
  // only a third of a typical month's uncontracted trade is still to come.
  const daysInMonth = new Date(Date.UTC(
    Number(thisPeriod.slice(0, 4)), Number(thisPeriod.slice(5, 7)), 0)).getUTCDate();
  const leftOfMonth = Math.max(0, (daysInMonth - Number(asOf.slice(8, 10))) / daysInMonth);

  const scenario = (net, mult = 1) => (est.available ? net * mult : 0);
  run.expected = run.committed +
    scenario(est.available ? est.in.mid - est.out.mid : 0, leftOfMonth);
  run.low = run.committed +
    scenario(est.available ? est.in.low - est.out.high : 0, leftOfMonth);
  run.high = run.committed +
    scenario(est.available ? est.in.high - est.out.low : 0, leftOfMonth);

  const rows = [{
    period: thisPeriod,
    partial: true,
    asOf,
    opening: cash.amount,
    committedIn: rest.committedIn,
    committedOut: rest.committedOut,
    movement: rest.committedIn - rest.committedOut,
    closing: run.committed,
    predictedIn: est.available ? est.in.mid * leftOfMonth : 0,
    predictedOut: est.available ? est.out.mid * leftOfMonth : 0,
    expected: run.expected, low: run.low, high: run.high,
    items: rest.items,
  }];

  for (let i = 1; i <= months; i++) {
    const period = addMonths(thisPeriod, i);
    const m = commitmentsForMonth(commitments, period, null, settled);
    const opening = run.committed;
    run.committed += m.committedIn - m.committedOut;
    const flow = m.committedIn - m.committedOut;
    run.expected += flow + (est.available ? est.in.mid - est.out.mid : 0);
    run.low += flow + (est.available ? est.in.low - est.out.high : 0);
    run.high += flow + (est.available ? est.in.high - est.out.low : 0);
    rows.push({
      period, partial: false, opening,
      committedIn: m.committedIn, committedOut: m.committedOut,
      movement: flow,
      closing: run.committed,
      predictedIn: est.available ? est.in.mid : 0,
      predictedOut: est.available ? est.out.mid : 0,
      expected: run.expected, low: run.low, high: run.high,
      items: m.items,
    });
  }

  return {
    entity,
    asOf,
    openingSource: cash.source,
    opening: cash.amount,
    months: rows,
    coverage: await coverage(entity, rows, today),
    prediction: {
      available: est.available,
      monthsUsed: est.monthsUsed,
      minimum: est.minimum,
      method: "median of recent months, with the quartile spread as the range",
      perMonth: est.available
        ? { in: est.in, out: est.out }
        : null,
      history: est.months,
    },
  };
}

// ── How much of the picture is actually committed ────────────
// Without this the projection is easy to misread. If a business bills monthly
// against no signed contract, a committed-only view shows the costs and none
// of the income, and looks like a company two months from death.
//
// So: state what the last three complete months actually did, label it as
// history, and let the reader do the comparison themselves. This is not added
// to the projection and is never presented as a future figure.
async function coverage(entity, rows, today) {
  const t = await trend(4, monthStart(today), entity);
  const closed = t.slice(0, 3);
  const n = closed.length || 1;
  const avgRevenue = closed.reduce((s, m) => s + m.revenue, 0) / n;
  const avgExpenses = closed.reduce((s, m) => s + m.expenses, 0) / n;

  // A whole month ahead, so the partial current month does not understate it.
  const nextFull = rows[1] ?? rows[0];
  const committedRevenue = nextFull.committedIn;
  const committedCosts = nextFull.committedOut;

  return {
    monthsOfHistory: closed.length,
    avgRevenue, avgExpenses,
    committedRevenue, committedCosts,
    // Share of a typical month's income that is under contract. Null when
    // there is no history to compare against — an honest "unknown" beats 0%.
    revenueCovered: avgRevenue > 0 ? committedRevenue / avgRevenue : null,
    costsCovered: avgExpenses > 0 ? committedCosts / avgExpenses : null,
  };
}

// ── What is due soon ─────────────────────────────────────────
// Two different kinds of certainty, kept apart on purpose.
//
// Committed payments are *scheduled*: the date is known because it was
// agreed. Whether one has actually been paid is not known here — matching a
// payment to a commitment is a separate job — so nothing in this list is
// called paid or unpaid, only due on a date.
//
// Receivables are *outstanding*: a real invoice with a real balance, where
// overdue is a fact rather than an inference.
export async function dueSoon(entity, days = 30, today = new Date()) {
  const asOf = isoDate(today);
  const horizon = isoDate(new Date(today.getTime() + days * 86400000));
  const commitments = await activeCommitments(entity);
  const settled = await paymentMap(entity);

  // Looks back as well as forward. Something that fell due last month and was
  // never recorded is the most important thing on this list, and a window that
  // only looked forward would hide it.
  const thisPeriod = monthStart(today);
  const periods = [];
  for (let i = -3; i <= 2; i++) periods.push(addMonths(thisPeriod, i));

  const upcoming = [];
  for (const period of periods) {
    for (const k of commitments) {
      for (const occ of occurrencesIn(k, period)) {
        if (occ.date > horizon) continue;
        const s = settled.get(occKey(k.id, occ.date));
        const status = statusOf(occ.date, asOf, s);
        if (status === "paid" || status === "waived") continue;
        upcoming.push({
          commitmentId: Number(k.id),
          entity: k.entity,
          date: occ.date,
          status,
          direction: k.direction,
          description: k.description,
          counterparty: k.counterparty,
          categoryName: k.category_name,
          amount: Number(k.base_amount_minor),
          currency: k.currency,
          amountMinor: Number(k.amount_minor),
          frequency: k.frequency,
          daysAway: Math.round((Date.parse(occ.date) - Date.parse(asOf)) / 86400000),
        });
      }
    }
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  const payable = upcoming.filter((u) => u.direction === "out");
  const incoming = upcoming.filter((u) => u.direction === "in");
  const ar = await receivables(today, entity);
  const sum = (xs) => xs.reduce((t, u) => t + u.amount, 0);

  return {
    asOf, days, horizon,
    payable, incoming,
    payableTotal: sum(payable), incomingTotal: sum(incoming),
    overduePayable: sum(payable.filter((u) => u.status === "overdue")),
    overdueIncoming: sum(incoming.filter((u) => u.status === "overdue")),
    receivables: ar,
  };
}

// ── Predicting the part that is not contracted ───────────────
// Contracted money is arithmetic. Everything else — the B2C side, the work
// that recurs without a signature — can only be estimated from what actually
// happened, and an estimate is a different kind of claim. So it is computed
// separately, carried separately, and drawn separately (dashed, with a band).
//
// The method is deliberately dull and explainable: the median of recent
// months, with the observed spread as the range. Not a regression — fitting a
// trend line to six noisy points manufactures a slope out of nothing, and the
// slope is the part people would act on.

const quantile = (sorted, q) => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

// At least this many complete months before anything is predicted. Below it
// the honest output is "not enough history", not a number with a wide band.
export const MIN_HISTORY = 3;
const LOOKBACK = 6;

export async function uncontractedHistory(entity, commitments, today = new Date()) {
  const thisPeriod = monthStart(today);
  const series = await trend(13, thisPeriod, entity);

  // Drop the current month (incomplete) and any leading months from before
  // there was a business to record.
  const complete = series.slice(0, -1);
  const firstReal = complete.findIndex((m) => m.revenue || m.expenses);
  const usable = firstReal < 0 ? [] : complete.slice(firstReal).slice(-LOOKBACK);

  // What each of those months earned and spent *beyond* what was committed.
  // Subtracting the committed part is what stops a signed contract from being
  // counted twice: once as a commitment and again inside the historical
  // average that the commitment already contributed to.
  const months = usable.map((m) => {
    // Deliberately the schedule, not the payment record. The question here is
    // how much of that month was under contract, which the schedule answers
    // whether or not that particular payment was marked off on time.
    const c = commitmentsForMonth(commitments, m.period);
    return {
      period: m.period,
      revenue: m.revenue,
      expenses: m.expenses,
      uncontractedIn: Math.max(0, m.revenue - c.committedIn),
      uncontractedOut: Math.max(0, m.expenses - c.committedOut),
    };
  });

  if (months.length < MIN_HISTORY) {
    return { available: false, months, monthsUsed: months.length, minimum: MIN_HISTORY };
  }

  const ins = months.map((m) => m.uncontractedIn).sort((a, b) => a - b);
  const outs = months.map((m) => m.uncontractedOut).sort((a, b) => a - b);

  return {
    available: true,
    months,
    monthsUsed: months.length,
    minimum: MIN_HISTORY,
    in: { low: quantile(ins, 0.25), mid: quantile(ins, 0.5), high: quantile(ins, 0.75),
          min: ins[0], max: ins[ins.length - 1] },
    out: { low: quantile(outs, 0.25), mid: quantile(outs, 0.5), high: quantile(outs, 0.75),
           min: outs[0], max: outs[outs.length - 1] },
  };
}

// ── Settled occurrences ──────────────────────────────────────
// Keyed by commitment and due date, which is how an occurrence is identified
// everywhere — the schedule itself is computed, so there is no occurrence id
// to refer to.
export const occKey = (commitmentId, dueDate) => `${commitmentId}:${isoDate(dueDate)}`;

export async function paymentMap(entity) {
  const rows = await all(
    `SELECT p.commitment_id, p.due_date, p.paid_date, p.status, p.entry_id,
            p.amount_minor, p.base_amount_minor, p.matched_by
       FROM fin_commitment_payments p
       JOIN fin_commitments k ON k.id = p.commitment_id
      ${entity && entity !== "both" ? "WHERE k.entity = ?" : ""}`,
    entity && entity !== "both" ? [entity] : []
  );
  const m = new Map();
  for (const r of rows) {
    m.set(occKey(r.commitment_id, r.due_date), {
      dueDate: isoDate(r.due_date),
      paidDate: r.paid_date ? isoDate(r.paid_date) : null,
      status: r.status,
      entryId: r.entry_id == null ? null : Number(r.entry_id),
      amount: r.base_amount_minor == null ? null : Number(r.base_amount_minor),
      matchedBy: r.matched_by,
    });
  }
  return m;
}

// paid — settled in full, and now a real ledger entry.
// partial — some of it arrived; the remainder is still owed and still counts
//   as committed, which is why it cannot simply be treated as paid.
// waived — written off deliberately; it is not coming and is not a debt.
// overdue — the date has passed and nothing was recorded.
// due — still ahead.
export function statusOf(dueDate, asOf, settled) {
  if (settled?.status === "paid") return "paid";
  if (settled?.status === "partial") return "partial";
  if (settled?.status === "waived") return "waived";
  return dueDate < asOf ? "overdue" : "due";
}

// What is still owed on an occurrence, given whatever has been recorded
// against it. Full payment and a waiver both leave nothing; a part payment
// leaves the difference.
export function outstandingOn(scheduledMinor, settled) {
  if (!settled) return scheduledMinor;
  if (settled.status === "paid" || settled.status === "waived") return 0;
  if (settled.status === "partial") {
    return Math.max(0, scheduledMinor - (settled.amount ?? 0));
  }
  return scheduledMinor;
}

// ── The contract schedule ────────────────────────────────────
// One row per commitment, one cell per month, for the grid that answers
// "which of these has actually paid this month".
// The window reaches far enough ahead to cover a contract's later
// installments — a service agreement paid half on signature and half on
// completion six months later is the normal case, and a row whose only other
// payment sits past the last column reads as an empty row rather than a
// scheduled one.
export async function contractSchedule(entity, monthsBack = 2, monthsAhead = 9, today = new Date()) {
  const asOf = isoDate(today);
  const commitments = await activeCommitments(entity);
  const paid = await paymentMap(entity);
  const start = addMonths(monthStart(today), -monthsBack);
  const periods = [];
  for (let i = 0; i <= monthsBack + monthsAhead; i++) periods.push(addMonths(start, i));

  const rows = commitments.map((k) => {
    const cells = periods.map((period) => {
      const occs = occurrencesIn(k, period);
      if (!occs.length) return { period, occurrences: [] };
      return {
        period,
        occurrences: occs.map((o) => {
          const settled = paid.get(occKey(k.id, o.date));
          const scheduled = Number(k.base_amount_minor);
          return {
            date: o.date,
            status: statusOf(o.date, asOf, settled),
            paidDate: settled?.paidDate ?? null,
            scheduled,
            paid: settled?.amount ?? 0,
            outstanding: outstandingOn(scheduled, settled),
            amount: settled?.amount ?? scheduled,
            matchedBy: settled?.matchedBy ?? null,
          };
        }),
      };
    });
    return {
      id: Number(k.id),
      entity: k.entity,
      direction: k.direction,
      description: k.description,
      counterparty: k.counterparty,
      categoryName: k.category_name,
      amount: Number(k.base_amount_minor),
      amountMinor: Number(k.amount_minor),
      currency: k.currency,
      frequency: k.frequency,
      startDate: isoDate(k.start_date),
      endDate: k.end_date ? isoDate(k.end_date) : null,
      months: cells,
    };
  });

  // Totals for the month in view, split by what is actually known.
  const thisPeriod = monthStart(today);
  const tally = { dueIn: 0, dueOut: 0, paidIn: 0, paidOut: 0, overdueIn: 0, overdueOut: 0 };
  for (const r of rows) {
    const cell = r.months.find((m) => m.period === thisPeriod);
    for (const o of cell?.occurrences ?? []) {
      const dir = r.direction === "in" ? "In" : "Out";
      if (o.status === "paid") tally[`paid${dir}`] += o.amount;
      else if (o.status === "overdue") tally[`overdue${dir}`] += o.amount;
      else if (o.status === "due") tally[`due${dir}`] += o.amount;
    }
  }
  // Everything still owed from before this month, unpaid.
  let arrearsIn = 0, arrearsOut = 0;
  for (const r of rows) {
    for (const m of r.months) {
      if (m.period >= thisPeriod) continue;
      for (const o of m.occurrences) {
        if (o.status !== "overdue") continue;
        if (r.direction === "in") arrearsIn += o.amount; else arrearsOut += o.amount;
      }
    }
  }

  return { entity, asOf, period: thisPeriod, periods, rows, tally,
           arrears: { in: arrearsIn, out: arrearsOut } };
}

// Committed movement accumulated across whole months, from `fromPeriod`
// inclusive to `toPeriod` exclusive. This is what makes a month several ahead
// open at the right figure: without it, November would open at whatever is
// recorded today, as though September's contract payment had never arrived.
//
// The first month counts only what is still to come inside it — anything
// earlier in that month has either already been recorded or is genuinely
// missed, and either way is not still on its way.
export function committedRunUp(commitments, settled, fromPeriod, toPeriod, asOf) {
  let total = 0;
  let p = fromPeriod;
  let guard = 0;
  while (p < toPeriod && guard++ < 240) {
    const m = commitmentsForMonth(commitments, p, p === fromPeriod ? asOf : null, settled);
    total += m.committedIn - m.committedOut;
    p = addMonths(p, 1);
  }
  return total;
}

// ── Vendor management ────────────────────────────────────────
// Everything the page needs in one call: who you deal with, which way the
// money goes with each of them, what has been settled, what is late, and
// which agreements are about to run out.
//
// "Vendor" here means any party on a commitment, in either direction. A
// university paying you and a landlord you pay are the same kind of record —
// a relationship with a schedule attached — and splitting them into two
// concepts would mean maintaining the same thing twice.

const YEAR_START = (today) => `${today.toISOString().slice(0, 4)}-01-01`;

export async function vendorManagement(entity, today = new Date(), horizonDays = 30) {
  const asOf = isoDate(today);
  const yearStart = YEAR_START(today);
  const horizon = isoDate(new Date(today.getTime() + horizonDays * 86400000));
  const commitments = await activeCommitments(entity);
  const settled = await paymentMap(entity);

  // Two years of occurrences either side is enough to answer "what is next",
  // "what is late" and "what has been settled this year" without walking a
  // schedule that may be open-ended.
  const thisPeriod = monthStart(today);
  const periods = [];
  for (let i = -18; i <= 18; i++) periods.push(addMonths(thisPeriod, i));

  const vendors = new Map();
  const tally = { paid: 0, partial: 0, unpaid: 0, overdue: 0 };
  const pending = [];

  for (const k of commitments) {
    const name = k.counterparty || "Unattributed";
    const key = `${name}::${k.entity}`;
    if (!vendors.has(key)) {
      vendors.set(key, {
        name, entity: k.entity, contracts: 0, directions: new Set(),
        categories: new Set(), currencies: new Set(),
        paidThisYear: 0, outstanding: 0, overdue: 0,
        next: null, lastPaid: null, endsOn: null, fromContract: false,
      });
    }
    const v = vendors.get(key);
    v.contracts += 1;
    v.directions.add(k.direction);
    if (k.category_name) v.categories.add(k.category_name);
    v.currencies.add(k.currency);
    if (k.source === "contract") v.fromContract = true;
    const end = k.end_date ? isoDate(k.end_date) : null;
    if (end && (!v.endsOn || end < v.endsOn)) v.endsOn = end;

    for (const period of periods) {
      for (const occ of occurrencesIn(k, period)) {
        const rec = settled.get(occKey(k.id, occ.date));
        const status = statusOf(occ.date, asOf, rec);
        const scheduled = Number(k.base_amount_minor);
        const owed = outstandingOn(scheduled, rec);

        if (status === "paid" || status === "partial") {
          const got = rec?.amount ?? scheduled;
          if ((rec?.paidDate ?? occ.date) >= yearStart) v.paidThisYear += got;
          if (!v.lastPaid || (rec?.paidDate ?? occ.date) > v.lastPaid) {
            v.lastPaid = rec?.paidDate ?? occ.date;
          }
          if (status === "paid") tally.paid += got; else tally.partial += got;
        }
        if (owed > 0) {
          v.outstanding += owed;
          if (occ.date < asOf) { v.overdue += owed; tally.overdue += owed; }
          else tally.unpaid += owed;
          if (!v.next || occ.date < v.next.date) {
            v.next = { date: occ.date, amount: owed, direction: k.direction, status };
          }
          if (occ.date <= horizon) {
            pending.push({
              commitmentId: Number(k.id), vendor: name, entity: k.entity,
              description: k.description, date: occ.date, amount: owed,
              scheduled, direction: k.direction, status,
              daysAway: Math.round((Date.parse(occ.date) - Date.parse(asOf)) / 86400000),
            });
          }
        }
      }
    }
  }

  pending.sort((a, b) => a.date.localeCompare(b.date));

  const rows = [...vendors.values()]
    .map((v) => ({
      ...v,
      relationship:
        v.directions.size > 1 ? "both" : v.directions.has("in") ? "in" : "out",
      directions: undefined,
      categories: [...v.categories],
      currencies: [...v.currencies],
      daysToEnd: v.endsOn
        ? Math.round((Date.parse(v.endsOn) - Date.parse(asOf)) / 86400000)
        : null,
    }))
    .sort((a, b) => (b.outstanding + b.paidThisYear) - (a.outstanding + a.paidThisYear));

  const expiring = rows
    .filter((v) => v.daysToEnd != null && v.daysToEnd >= 0 && v.daysToEnd <= 90)
    .sort((a, b) => a.daysToEnd - b.daysToEnd);

  return {
    entity, asOf, horizonDays, yearStart,
    vendors: rows,
    pending: pending.slice(0, 40),
    expiring,
    tally,
    totals: {
      vendors: rows.length,
      contracts: commitments.length,
      // Split, because "38 payments pending" reads as a full inbox while
      // "12 of them are already late" is the part that needs acting on. Rolled
      // together, months of arrears hide inside a figure labelled "next 30 days".
      pendingCount: pending.length,
      pendingAmount: pending.reduce((t, p) => t + p.amount, 0),
      dueCount: pending.filter((p) => p.status !== "overdue").length,
      dueAmount: pending.filter((p) => p.status !== "overdue")
                        .reduce((t, p) => t + p.amount, 0),
      overdueCount: pending.filter((p) => p.status === "overdue").length,
      overdueAmount: pending.filter((p) => p.status === "overdue")
                            .reduce((t, p) => t + p.amount, 0),
      paidInYear: rows.filter((v) => v.relationship !== "out")
                      .reduce((t, v) => t + v.paidThisYear, 0),
      paidOutYear: rows.filter((v) => v.relationship === "out")
                       .reduce((t, v) => t + v.paidThisYear, 0),
    },
  };
}

// ── The contract folder ──────────────────────────────────────
// Every document that produced a schedule, grouped by the month it was filed
// under, so the agreements themselves can be found rather than only their
// consequences.
export async function contractLibrary(entity) {
  const rows = await all(
    `SELECT d.id, d.filename, d.mime, d.byte_size, d.received_at,
            MIN(k.start_date) AS first_due, MAX(COALESCE(k.end_date, k.start_date)) AS last_due,
            COUNT(k.id) AS installments,
            SUM(k.base_amount_minor) AS total,
            MIN(k.direction) AS direction, MIN(k.entity) AS entity,
            MIN(p.name) AS counterparty, MIN(c.name) AS category_name,
            MIN(c.id) AS category_id,
            ARRAY_AGG(k.id) AS commitment_ids,
            BOOL_OR(k.review_status = 'needs_review') AS flagged
       FROM fin_commitments k
       JOIN fin_documents d ON d.id = k.document_id
       LEFT JOIN fin_counterparties p ON p.id = k.counterparty_id
       LEFT JOIN fin_categories c ON c.id = k.category_id
      WHERE k.source = 'contract'${entity && entity !== "both" ? " AND k.entity = ?" : ""}
      GROUP BY d.id, d.filename, d.mime, d.byte_size, d.received_at
      ORDER BY MIN(k.start_date) DESC`,
    entity && entity !== "both" ? [entity] : []
  );

  const byMonth = new Map();
  for (const r of rows) {
    const first = isoDate(r.first_due);
    const period = `${first.slice(0, 7)}-01`;
    if (!byMonth.has(period)) byMonth.set(period, { period, contracts: [] });
    byMonth.get(period).contracts.push({
      documentId: Number(r.id),
      filename: r.filename,
      mime: r.mime,
      bytes: Number(r.byte_size),
      receivedAt: r.received_at,
      firstDue: first,
      lastDue: isoDate(r.last_due),
      installments: Number(r.installments),
      total: Number(r.total),
      direction: r.direction,
      entity: r.entity,
      counterparty: r.counterparty,
      categoryName: r.category_name,
      categoryId: r.category_id == null ? null : Number(r.category_id),
      // Every payment under one agreement is the same kind of spend, so the
      // heading moves for all of them at once or not at all.
      commitmentIds: (r.commitment_ids ?? []).map(Number),
      flagged: r.flagged === true,
    });
  }
  return { months: [...byMonth.values()], count: rows.length };
}

// ── The cash flow dashboard ──────────────────────────────────
// One call behind the whole page. It answers four questions in order: where
// the cash is, where it is heading, what is going to hurt, and what the
// projection is actually built on.
//
// The distinction that runs through all of it: recorded money is fact,
// committed money is agreed, estimated money is neither. They are computed
// separately and stay labelled apart the whole way to the screen.
export async function cashDashboard(entity, months = 3, today = new Date()) {
  const asOf = isoDate(today);
  const thisPeriod = monthStart(today);
  const fc = await forecast(entity, Math.max(months, 6), today);
  const cash = await cashPosition(entity);
  const history = await trend(13, thisPeriod, entity);
  const commitments = await activeCommitments(entity);
  const settled = await paymentMap(entity);
  const due = await dueSoon(entity, 30, today);
  const ar = await receivables(today, entity);

  const window = fc.months.slice(0, months + 1);
  const inflow = window.reduce((t, m) => t + m.committedIn + (m.predictedIn ?? 0), 0);
  const outflow = window.reduce((t, m) => t + m.committedOut + (m.predictedOut ?? 0), 0);

  // Thirty days out, prorated across whichever months it spans.
  const in30 = isoDate(new Date(today.getTime() + 30 * 86400000));
  let committed30 = 0;
  for (const period of [thisPeriod, addMonths(thisPeriod, 1), addMonths(thisPeriod, 2)]) {
    for (const k of commitments) {
      for (const occ of occurrencesIn(k, period)) {
        if (occ.date <= asOf || occ.date > in30) continue;
        const owed = outstandingOn(Number(k.base_amount_minor), settled.get(occKey(k.id, occ.date)));
        committed30 += k.direction === "in" ? owed : -owed;
      }
    }
  }

  // ── Runway, three ways ───────────────────────────────────
  // Burn from recorded months is what has actually been happening; the
  // scenarios come from the same spread the projection uses, so best and
  // worst are the quartiles of real months rather than invented multipliers.
  const burn = await burnAndRunway(cash.amount, entity);
  const est = fc.prediction;
  const monthlyNet = (i, o) => o - i;
  const scenarios = est?.available
    ? {
        expected: monthlyNet(est.perMonth.in.mid, est.perMonth.out.mid),
        best: monthlyNet(est.perMonth.in.high, est.perMonth.out.low),
        worst: monthlyNet(est.perMonth.in.low, est.perMonth.out.high),
      }
    : null;
  const runwayOf = (netBurn) =>
    netBurn > 0 ? cash.amount / netBurn : null;
  // A runway of null means two different things and they must not look alike:
  // either nothing is being burned, in which case there is no runway to run
  // out of, or there is not enough history to say. `burning` separates them.
  const runway = {
    current: burn.runwayMonths,
    monthlyBurn: burn.monthlyBurn,
    burning: burn.monthlyBurn > 0,
    best: scenarios ? runwayOf(scenarios.best) : null,
    expected: scenarios ? runwayOf(scenarios.expected) : null,
    worst: scenarios ? runwayOf(scenarios.worst) : null,
    // Monthly net under each case: negative is money coming in, not going out.
    scenarios,
    available: !!scenarios,
    // How many complete months it takes before best and worst mean anything.
    minimumMonths: MIN_HISTORY,
    monthsOfHistory: est?.monthsUsed ?? 0,
  };

  // ── Where the projection crosses zero ────────────────────
  const crossing = (key) => fc.months.find((m) => m[key] < 0)?.period ?? null;
  const belowZero = {
    committed: crossing("closing"),
    expected: est?.available ? crossing("expected") : null,
    worst: est?.available ? crossing("low") : null,
  };

  // ── What is going to hurt ────────────────────────────────
  // Real conditions only. Nothing here is a placeholder that always fires.
  const alerts = [];
  if (runway.current != null && runway.current < 3) {
    alerts.push({
      kind: "runway", tone: "critical",
      title: "Less than three months of runway",
      detail: `At ${(runway.monthlyBurn / 100).toFixed(0)} a month of net burn, ` +
              `what is recorded lasts about ${runway.current.toFixed(1)} months.`,
    });
  }
  if (belowZero.committed) {
    alerts.push({
      kind: "zero", tone: "critical",
      title: `Committed money runs out in ${belowZero.committed.slice(0, 7)}`,
      detail: "On agreed payments alone the position goes below zero that month.",
    });
  } else if (belowZero.expected) {
    alerts.push({
      kind: "zero", tone: "serious",
      title: `Expected case goes below zero in ${belowZero.expected.slice(0, 7)}`,
      detail: "That half of the projection is an estimate, not a certainty.",
    });
  }
  const biggest = [...due.payable].sort((a, b) => b.amount - a.amount)[0];
  if (biggest) {
    // Whether it is late is the date, not the status — a part payment sits at
    // status "partial" while its due date is months gone, and reading only the
    // status produced "due in -20 days".
    const late = biggest.daysAway < 0;
    const when = late
      ? `${Math.abs(biggest.daysAway)} day${Math.abs(biggest.daysAway) === 1 ? "" : "s"} ago`
      : biggest.daysAway === 0 ? "today" : `in ${biggest.daysAway} days`;
    alerts.push({
      kind: "payment", tone: late ? "serious" : "warning",
      title: late
        ? `${biggest.description} was due ${when}`
        : `Large payment due ${when}`,
      detail: `${(biggest.amount / 100).toLocaleString()} to ` +
              `${biggest.counterparty || "an unrecorded party"}, dated ${biggest.date}` +
              `${biggest.status === "partial" ? " — part paid, this is the remainder" : ""}.`,
      amount: biggest.amount,
    });
  }
  const ending = commitments
    .filter((k) => k.end_date)
    .map((k) => ({ k, end: isoDate(k.end_date) }))
    .filter((x) => x.end >= asOf &&
      Math.round((Date.parse(x.end) - Date.parse(asOf)) / 86400000) <= 60)
    .sort((a, b) => a.end.localeCompare(b.end))[0];
  if (ending) {
    alerts.push({
      kind: "contract", tone: "warning",
      title: "An agreement is ending soon",
      detail: `${ending.k.description} ends ${ending.end}.`,
    });
  }
  if (ar.overdue > 0) {
    alerts.push({
      kind: "receivable", tone: "serious",
      title: `${ar.invoices.filter((i) => i.daysOverdue > 0).length} invoices overdue`,
      detail: `${(ar.overdue / 100).toLocaleString()} is past its due date.`,
      amount: ar.overdue,
    });
  }

  // ── The breakdown table ──────────────────────────────────
  // Committed and estimated stay in separate rows. Adding them into one
  // "inflow" line would make an agreed payment and a guess look alike.
  const columns = fc.months.slice(0, months + 1).map((m) => m.period);
  const pick = (period, key) => fc.months.find((m) => m.period === period)?.[key] ?? 0;
  const sum = (key) => columns.reduce((t, p) => t + pick(p, key), 0);
  const breakdown = {
    columns,
    rows: [
      { label: "Committed in", kind: "in", group: "in",
        values: columns.map((p) => pick(p, "committedIn")), total: sum("committedIn") },
      ...(est?.available ? [{
        label: "Estimated in", kind: "in", group: "in", estimated: true,
        values: columns.map((p) => pick(p, "predictedIn")), total: sum("predictedIn") }] : []),
      { label: "Committed out", kind: "out", group: "out",
        values: columns.map((p) => pick(p, "committedOut")), total: sum("committedOut") },
      ...(est?.available ? [{
        label: "Estimated out", kind: "out", group: "out", estimated: true,
        values: columns.map((p) => pick(p, "predictedOut")), total: sum("predictedOut") }] : []),
    ],
    net: columns.map((p) => {
      const m = fc.months.find((x) => x.period === p);
      return (m.committedIn + (m.predictedIn ?? 0)) - (m.committedOut + (m.predictedOut ?? 0));
    }),
  };
  breakdown.netTotal = breakdown.net.reduce((a, b) => a + b, 0);

  // ── The largest recurring costs ──────────────────────────
  const recurring = commitments
    .filter((k) => k.direction === "out" && k.frequency !== "once")
    .map((k) => {
      const perMonth = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, annual: 1 / 12 };
      return {
        description: k.description,
        counterparty: k.counterparty,
        categoryName: k.category_name,
        frequency: k.frequency,
        amount: Number(k.base_amount_minor),
        monthlyEquivalent: Math.round(Number(k.base_amount_minor) * (perMonth[k.frequency] ?? 1)),
      };
    })
    .sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
  const recurringTotal = recurring.reduce((t, r) => t + r.monthlyEquivalent, 0);

  return {
    entity, asOf, months,
    cash, history, forecast: fc,
    inflow, outflow, net: inflow - outflow,
    committed30, projected30: cash.amount + committed30,
    runway, belowZero, alerts, breakdown,
    recurring: recurring.slice(0, 8), recurringTotal,
    upcoming: due.payable.concat(due.incoming)
      .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8),
    receivables: ar,
    prediction: est,
  };
}

// ── One side of the ledger, in detail ────────────────────────
// Revenue and expenses ask the same questions in mirror image: how much this
// month, how it compares, what is still owed, what is coming, where it is
// concentrated, and how much of it is locked in. One function answers both
// rather than two that drift apart.
//
// "Fixed" here means committed — there is an agreement behind it. "Variable"
// is everything else that actually happened. That is a real distinction this
// system can prove, unlike a fixed/variable tag someone would have to
// maintain by hand and would stop trusting within a month.
// ── The two detail pages ─────────────────────────────────────
// What each month actually did, split the way the page reads it. Fixed is what
// came out of an agreement — provable from the dedup key an entry carries when
// it was posted from a commitment — and variable is the rest. Months still
// ahead have recorded nothing and carry what is committed instead, flagged so
// the chart can draw them as the different claim they are.
async function splitTrend(entity, direction, months, endPeriod, today) {
  const from = addMonths(endPeriod, -(months - 1));
  const rows = await all(
    `SELECT e.period,
            COALESCE(SUM(e.base_amount_minor), 0) AS total,
            COALESCE(SUM(CASE WHEN e.dedup_key LIKE 'commitment:%'
                              THEN e.base_amount_minor ELSE 0 END), 0) AS fixed
       FROM fin_entries e
      WHERE e.review_status <> 'rejected' AND e.direction = ?
        AND e.period >= ? AND e.period <= ?${ENT(entity)}
      GROUP BY 1`,
    [direction, from, endPeriod, ...ENT_ARG(entity)]
  );
  const byPeriod = new Map(rows.map((r) => [isoDate(r.period), r]));
  const out = [];
  for (let i = 0; i < months; i++) {
    const period = addMonths(from, i);
    const r = byPeriod.get(period);
    const total = Number(r?.total ?? 0);
    const fixed = Number(r?.fixed ?? 0);
    out.push({ period, total, fixed, variable: Math.max(0, total - fixed), ahead: false });
  }
  return out;
}

// The committed path forward, on the same shape as the recorded months so one
// chart can carry both.
function committedTrend(commitments, settled, fromPeriod, months, direction, asOf) {
  const out = [];
  for (let i = 0; i < months; i++) {
    const period = addMonths(fromPeriod, i);
    const c = commitmentsForMonth(commitments, period, i === 0 ? asOf : null, settled);
    const total = direction === "in" ? c.committedIn : c.committedOut;
    out.push({ period, total, fixed: total, variable: 0, ahead: true });
  }
  return out;
}

// What the invoice book says, month by month: raised, settled, and what that
// leaves outstanding. Only meaningful on the money-in side.
async function invoiceTrend(entity, months, endPeriod) {
  const from = addMonths(endPeriod, -(months - 1));
  const rows = await all(
    `SELECT date_trunc('month', issue_date)::date AS period,
            COALESCE(SUM(amount_minor), 0) AS invoiced,
            COALESCE(SUM(paid_minor), 0) AS collected,
            COUNT(*) AS n
       FROM fin_invoices
      WHERE issue_date >= ? AND issue_date < (?::date + interval '1 month')
        ${entity && entity !== "both" ? "AND entity = ?" : ""}
      GROUP BY 1`,
    entity && entity !== "both" ? [from, endPeriod, entity] : [from, endPeriod]
  );
  const byPeriod = new Map(rows.map((r) => [isoDate(r.period), r]));
  const out = [];
  for (let i = 0; i < months; i++) {
    const period = addMonths(from, i);
    const r = byPeriod.get(period);
    const invoiced = Number(r?.invoiced ?? 0);
    const collected = Number(r?.collected ?? 0);
    out.push({
      period, invoiced, collected,
      outstanding: Math.max(0, invoiced - collected),
      count: Number(r?.n ?? 0),
    });
  }
  return out;
}

// How the invoice book is performing. Every figure here is a count or a mean
// over invoices actually on file — none of it is modelled.
async function invoiceStats(entity, period, today) {
  const next = addMonths(period, 1);
  const ent = entity && entity !== "both" ? "AND entity = ?" : "";
  const args = (a) => (entity && entity !== "both" ? [...a, entity] : a);
  const issued = await get(
    `SELECT COUNT(*) AS n, COALESCE(SUM(amount_minor),0) AS total,
            COALESCE(SUM(paid_minor),0) AS paid
       FROM fin_invoices WHERE issue_date >= ? AND issue_date < ? ${ent}`,
    args([period, next])
  );
  const prev = await get(
    `SELECT COUNT(*) AS n FROM fin_invoices
      WHERE issue_date >= ? AND issue_date < ? ${ent}`,
    args([addMonths(period, -1), period])
  );
  // Days to collect is only answerable for invoices that were actually
  // settled; an unpaid one has no collection date to measure to.
  const days = await get(
    `SELECT AVG(EXTRACT(EPOCH FROM (updated_at::date - issue_date)) / 86400) AS d,
            COUNT(*) AS n
       FROM fin_invoices
      WHERE paid_minor >= amount_minor AND amount_minor > 0
        AND updated_at::date >= issue_date ${ent}`,
    args([])
  );
  const n = Number(issued?.n ?? 0);
  const total = Number(issued?.total ?? 0);
  const paid = Number(issued?.paid ?? 0);
  return {
    issued: n,
    issuedBefore: Number(prev?.n ?? 0),
    invoicedTotal: total,
    averageValue: n ? Math.round(total / n) : 0,
    collectionRate: total ? paid / total : null,
    daysToCollect: days?.n > 0 && days?.d != null ? Math.round(Number(days.d)) : null,
    daysToCollectFrom: Number(days?.n ?? 0),
  };
}

export async function sideDetail(entity, period, direction, today = new Date()) {
  const asOf = isoDate(today);
  const isIn = direction === "in";
  const kinds = isIn ? ["revenue"] : ["cogs", "opex", "tax", "capex"];

  const [breakdown, byParty, series, prev, summary] = await Promise.all([
    categoryBreakdown(period, entity),
    byCounterparty(period, direction, 20, entity),
    trend(13, monthStart(today), entity),
    periodSummary(addMonths(period, -1), entity),
    periodSummary(period, entity),
  ]);

  const rows = breakdown
    .filter((r) => kinds.includes(r.kind) && r.direction === direction)
    .map((r) => ({ name: r.name, group: r.group, total: r.amount, count: r.count }));
  // Money going out is read under the five spend headings; money coming in
  // keeps its own revenue lines, which is what a revenue page is for.
  const categories = isIn ? rows : groupSpend(rows);
  const categoryTotal = categories.reduce((t, c) => t + c.total, 0);

  const thisMonth = isIn ? summary.revenue : summary.expenses;
  const lastMonth = isIn ? prev.revenue : prev.expenses;

  // What is committed to arrive or leave, over three windows.
  const commitments = await activeCommitments(entity);
  const settled = await paymentMap(entity);
  const thisPeriod = monthStart(today);
  const windowTotal = (days) => {
    const until = isoDate(new Date(today.getTime() + days * 86400000));
    let total = 0;
    for (let i = 0; i <= 4; i++) {
      for (const k of commitments) {
        if (k.direction !== direction) continue;
        for (const occ of occurrencesIn(k, addMonths(thisPeriod, i))) {
          if (occ.date <= asOf || occ.date > until) continue;
          total += outstandingOn(Number(k.base_amount_minor), settled.get(occKey(k.id, occ.date)));
        }
      }
    }
    return total;
  };

  // Fixed against variable, of what actually happened this month.
  //
  // The split has to come from recorded entries, not from the schedule.
  // Comparing what was *scheduled* against what was *recorded* and calling the
  // remainder variable gives nonsense the moment a scheduled payment has not
  // been marked as arrived: committed comes out larger than the month itself
  // and variable clamps to zero. An entry that came from a commitment carries
  // a dedup key saying so, which is the only provable version of this split.
  const linked = await get(
    `SELECT COALESCE(SUM(e.base_amount_minor), 0) AS total
       FROM fin_entries e
      WHERE e.review_status <> 'rejected' AND e.period = ?
        AND e.direction = ? AND e.dedup_key LIKE 'commitment:%'${ENT(entity)}`,
    [period, direction, ...ENT_ARG(entity)]
  );
  const fixed = Number(linked?.total ?? 0);
  const variable = Math.max(0, thisMonth - fixed);

  // What the schedule said should happen this month, recorded or not. Kept
  // separate from the above because it answers a different question.
  const monthCommitted = commitmentsForMonth(commitments, period, null, settled);
  const scheduled = isIn ? monthCommitted.committedIn : monthCommitted.committedOut;

  const recurring = commitments
    .filter((k) => k.direction === direction && k.frequency !== "once")
    .map((k) => {
      const perMonth = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, annual: 1 / 12 };
      return {
        description: k.description,
        counterparty: k.counterparty,
        categoryName: k.category_name,
        frequency: k.frequency,
        monthlyEquivalent: Math.round(Number(k.base_amount_minor) * (perMonth[k.frequency] ?? 1)),
      };
    })
    .sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);

  const due = await dueSoon(entity, 30, today);
  const upcoming = (isIn ? due.incoming : due.payable);

  return {
    entity, period, direction, asOf,
    thisMonth, lastMonth,
    change: lastMonth ? (thisMonth - lastMonth) / Math.abs(lastMonth) : null,
    categories: categories.map((c) => ({
      ...c, share: categoryTotal ? c.total / categoryTotal : 0,
    })),
    categoryTotal,
    // byCounterparty calls the figure `amount`. Reading `p.total` here gave
    // every supplier NaN, which the page rendered as $0.00 with a blank share
    // — a month of real payments shown as nothing paid to anyone.
    parties: byParty.map((p) => ({
      ...p, total: p.amount,
      share: categoryTotal ? p.amount / categoryTotal : 0,
    })),
    trend: series.map((m) => ({
      period: m.period, value: isIn ? m.revenue : m.expenses,
    })),
    expected: { d30: windowTotal(30), d60: windowTotal(60), d90: windowTotal(90) },
    fixed, variable, scheduled,
    fixedShare: thisMonth ? fixed / thisMonth : null,
    recurring: recurring.slice(0, 8),
    recurringMonthly: recurring.reduce((t, r) => t + r.monthlyEquivalent, 0),
    upcoming: upcoming.slice(0, 8),
    upcomingTotal: upcoming.reduce((t, u) => t + u.amount, 0),
    overdue: upcoming.filter((u) => u.status === "overdue"),
    overdueTotal: upcoming.filter((u) => u.status === "overdue")
                          .reduce((t, u) => t + u.amount, 0),
    receivables: isIn ? await receivables(today, entity) : null,
  };
}

// ── The overview ─────────────────────────────────────────────
// The cockpit. Everything on it exists elsewhere in more detail; this is the
// one page that answers "how are we doing" without asking a follow-up.
//
// It is assembled from the same functions the detail pages use rather than
// its own queries, so a figure here and the figure you reach by clicking
// through cannot disagree.
// The trend chart ends on the month being read, not on the month we are in.
// Months already past are what they recorded; months still ahead have recorded
// nothing, so they carry what is committed instead and are marked as such —
// the chart draws them differently, because they are a different claim.
export function trendAhead(series, commitments, settled, thisPeriod) {
  return series.map((m) => {
    if (m.period <= thisPeriod) return { ...m, committed: false };
    const c = commitmentsForMonth(commitments, m.period, null, settled);
    return {
      period: m.period, revenue: c.committedIn, expenses: c.committedOut,
      net: c.committedIn - c.committedOut, committed: true,
    };
  });
}

// What a month still ahead is already committed to do: where it opens once
// everything agreed between now and then has moved, what is agreed to move
// inside it, and where that leaves it. Every figure here is committed, never
// recorded — the opening carries the recorded position forward through the
// committed path rather than restating it.
export function projectedMonth(commitments, settled, period, thisPeriod, cash, asOf) {
  const c = commitmentsForMonth(commitments, period, null, settled);
  const runUp = committedRunUp(commitments, settled, thisPeriod, period, asOf);
  const opening = cash.amount + runUp;

  // The same grouping the recorded month uses, so the category chart reads
  // the same way whichever month is open.
  const byName = new Map();
  for (const it of c.items) {
    if (it.direction !== "out") continue;
    const name = it.categoryName || "Uncategorised";
    const cur = byName.get(name) ?? { name, group: it.categoryGroup ?? null, total: 0, count: 0 };
    cur.total += it.amount; cur.count += 1;
    byName.set(name, cur);
  }
  const byCategory = groupSpend(
    [...byName.values()].sort((a, b) => b.total - a.total)
  );

  return {
    period, opening, runUp,
    committedIn: c.committedIn,
    committedOut: c.committedOut,
    movement: c.committedIn - c.committedOut,
    closing: opening + c.committedIn - c.committedOut,
    byCategory,
    categoryTotal: byCategory.reduce((t, r) => t + r.total, 0),
    items: c.items.map((it) => ({
      commitmentId: it.id, date: it.date, vendor: it.counterparty,
      description: it.description, direction: it.direction,
      categoryName: it.categoryName, amount: it.amount, status: "due",
    })),
  };
}

export async function overviewDashboard(entity, today = new Date(), period = null) {
  const thisPeriod = monthStart(today);
  // The overview answers "how are we doing" for whichever month is open, not
  // only for the month we happen to be in. A month still ahead has nothing
  // recorded against it, so it is answered from what is committed instead —
  // kept in its own block so an agreed figure is never read as a recorded one.
  const target = period && period !== thisPeriod ? period : thisPeriod;
  const ahead = target > thisPeriod;
  const asOf = isoDate(today);
  const [cash, summary, prev, recorded, breakdown, ar, cashDash, vendors] =
    await Promise.all([
      cashPosition(entity),
      periodSummary(target, entity),
      periodSummary(addMonths(target, -1), entity),
      trend(13, target, entity),
      categoryBreakdown(target, entity),
      receivables(today, entity),
      cashDashboard(entity, 3, today),
      vendorManagement(entity, today, 30),
    ]);

  // Read once and used twice: the month's own projection, and the months past
  // today inside the trend window.
  const commitments = ahead ? await activeCommitments(entity) : null;
  const settled = ahead ? await paymentMap(entity) : null;
  const series = ahead
    ? trendAhead(recorded, commitments, settled, thisPeriod)
    : recorded.map((m) => ({ ...m, committed: false }));

  const pctChange = (now, before) =>
    before ? (now - before) / Math.abs(before) : null;

  // Fixed is what recurs under an agreement; variable is what the month
  // actually spent beyond that. Both are monthly-equivalent so they add up.
  const fixedMonthly = cashDash.recurringTotal;
  const recent = series.slice(0, -1).slice(-3);
  const avgSpend = recent.length
    ? recent.reduce((t, m) => t + m.expenses, 0) / recent.length : 0;
  const variableMonthly = Math.max(0, avgSpend - fixedMonthly);

  const expenses = groupSpend(
    breakdown
      .filter((r) => ["cogs", "opex", "tax"].includes(r.kind) && r.direction === "out")
      .map((r) => ({ name: r.name, group: r.group, total: r.amount, count: r.count }))
  );
  const expenseTotal = expenses.reduce((t, e) => t + e.total, 0);

  // Ninety days out on the committed path, plus the estimate where there is
  // enough history for one.
  const ninety = cashDash.forecast.months[3] ?? cashDash.forecast.months.at(-1);

  return {
    entity, asOf, period: target, thisPeriod, ahead,
    projected: ahead
      ? projectedMonth(commitments, settled, target, thisPeriod, cash, asOf)
      : null,
    cash,
    revenue: summary.revenue, expenses: summary.expenses, net: summary.net,
    revenueChange: pctChange(summary.revenue, prev.revenue),
    expensesChange: pctChange(summary.expenses, prev.expenses),
    netChange: pctChange(summary.net, prev.net),
    expectedIn90: ninety ? ninety.closing : cash.amount,
    expectedIn90Expected: ninety?.expected ?? null,
    runway: cashDash.runway,
    alerts: cashDash.alerts,
    trend: series,
    forecast: cashDash.forecast,
    expensesByCategory: expenses,
    expenseTotal,
    receivables: ar,
    burn: { fixedMonthly, variableMonthly, total: fixedMonthly + variableMonthly,
            recentMonths: recent.length },
    upcoming: vendors.pending.slice(0, 6),
    upcomingTotal: vendors.totals.pendingAmount,
    needsReview: await reviewCount(entity),
  };
}
