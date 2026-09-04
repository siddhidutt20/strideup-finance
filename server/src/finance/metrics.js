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

// What the books held before a month opened, and how many entries exist at
// all. A month with nothing recorded in it is not an empty set of books: the
// position carries over from the month before, and the page has to say so
// rather than going blank.
export async function cashBefore(period, entity) {
  const r = await get(
    `SELECT COALESCE(${SIGNED}, 0) AS net
       FROM fin_entries e
       LEFT JOIN fin_categories c ON c.id = e.category_id
      WHERE e.review_status <> 'rejected'
        AND COALESCE(c.kind, 'opex') <> 'transfer'
        AND e.period < ?${ENT(entity)}`,
    [period, ...ENT_ARG(entity)]
  );
  return Number(r?.net ?? 0);
}

export async function entriesEver(entity) {
  const r = await get(
    `SELECT COUNT(*) AS n FROM fin_entries e
      WHERE e.review_status <> 'rejected'${ENT(entity)}`,
    ENT_ARG(entity)
  );
  return Number(r?.n ?? 0);
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
            STRING_AGG(k.id::text, ',') AS commitment_ids,
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
      // heading moves for all of them at once or not at all. Aggregated as
      // text rather than as an array: a bigint[] comes back from one driver as
      // a JS array and from another as the literal string "{20,23}", and the
      // second one threw where the first did not.
      commitmentIds: String(r.commitment_ids ?? "")
        .split(",").map(Number).filter(Number.isFinite),
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
    // Subtracting two dates in Postgres is already a count of days.
    `SELECT AVG(updated_at::date - issue_date) AS d,
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

  // Who the variable half actually went to. The same provable split as the
  // total — an entry posted from a commitment carries a dedup key saying so —
  // because listing every party under "everything else" put the contract
  // payments in both columns and made the two add up to twice the month.
  const variableParties = (
    await all(
      `SELECT COALESCE(p.name, 'Unattributed') AS name,
              SUM(e.base_amount_minor) AS total, COUNT(*) AS n
         FROM fin_entries e
         LEFT JOIN fin_counterparties p ON p.id = e.counterparty_id
        WHERE e.review_status <> 'rejected' AND e.period = ? AND e.direction = ?
          AND (e.dedup_key IS NULL OR e.dedup_key NOT LIKE 'commitment:%')${ENT(entity)}
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 10`,
      [period, direction, ...ENT_ARG(entity)]
    )
  ).map((r) => ({ name: r.name, total: Number(r.total), count: Number(r.n) }));

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

  // Thirteen months behind on what was recorded, then three ahead on what is
  // committed. Fixed and variable are split per month the same provable way
  // the current month is split, so the chart and the panel below it cannot
  // disagree.
  const recorded = await splitTrend(entity, direction, 13, thisPeriod, today);
  const ahead = committedTrend(commitments, settled, thisPeriod, 4, direction, asOf)
    .slice(1);
  const split = [...recorded, ...ahead];

  // The invoice book, and how it is performing. Money-out has no invoice book
  // of its own — a bill is somebody else's invoice — so this is null there.
  const invoices = isIn ? await invoiceTrend(entity, 13, thisPeriod) : null;
  const stats = isIn ? await invoiceStats(entity, period, today) : null;

  // The two headline categories, ranked, with what each did last month beside
  // it. Not a budget: there are no budgets, so there is no variance to show.
  const prevBreakdown = await categoryBreakdown(addMonths(period, -1), entity);
  const prevRows = prevBreakdown
    .filter((r) => kinds.includes(r.kind) && r.direction === direction)
    .map((r) => ({ name: r.name, group: r.group, total: r.amount, count: r.count }));
  const prevCats = isIn ? prevRows : groupSpend(prevRows);
  const prevByName = new Map(prevCats.map((c) => [c.name, c.total]));
  const ranked = categories.map((c) => {
    const before = prevByName.get(c.name) ?? 0;
    return {
      ...c,
      lastMonth: before,
      change: before ? (c.total - before) / before : null,
      share: categoryTotal ? c.total / categoryTotal : 0,
    };
  });

  // Burn: what the last three complete months actually averaged, and what next
  // month is already committed to. One is history, the other is agreement —
  // neither is a forecast of the whole month, and the page says so.
  const complete = recorded.filter((m) => m.period < thisPeriod).slice(-3);
  const averageMonth = complete.length
    ? Math.round(complete.reduce((t, m) => t + m.total, 0) / complete.length)
    : 0;
  const nextCommitted = ahead.length ? ahead[0].total : 0;

  return {
    entity, period, direction, asOf,
    split, invoices, stats,
    ranked,
    burn: {
      averageMonth,
      months: complete.length,
      nextCommitted,
      nextPeriod: addMonths(thisPeriod, 1),
      change: averageMonth ? (nextCommitted - averageMonth) / averageMonth : null,
    },
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
    fixed, variable, variableParties, scheduled,
    fixedShare: thisMonth ? fixed / thisMonth : null,
    recurring: recurring.slice(0, 8),
    recurringMonthly: recurring.reduce((t, r) => t + r.monthlyEquivalent, 0),
    // Still to come and already late are two different facts, and a panel
    // headed "the next 30 days" listing a payment from May is neither. They
    // are separated here rather than left to each page to filter.
    upcoming: upcoming.filter((u) => u.status !== "overdue").slice(0, 10),
    upcomingTotal: upcoming.filter((u) => u.status !== "overdue")
                           .reduce((t, u) => t + u.amount, 0),
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
  const [cash, summary, prev, recorded, breakdown, ar, cashDash, vendors,
         opening, everCount] =
    await Promise.all([
      cashPosition(entity),
      periodSummary(target, entity),
      periodSummary(addMonths(target, -1), entity),
      trend(13, target, entity),
      categoryBreakdown(target, entity),
      receivables(today, entity),
      cashDashboard(entity, 3, today),
      vendorManagement(entity, today, 30),
      cashBefore(target, entity),
      entriesEver(entity),
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
    // How many entries exist at all, in any month. The difference between
    // "this month is quiet" and "this book is empty" — the first must never
    // be shown as the second.
    entriesEver: everCount,
    // The position carried forward. A month opens where the one before it
    // closed; only the flows inside it start at zero. Nothing is copied —
    // the opening figure is the same ledger read up to a different date.
    carry: {
      openedFrom: addMonths(target, -1),
      opening,
      movement: summary.revenue - summary.expenses + summary.capital - summary.capex,
      recordedThisMonth: summary.entryCount,
    },
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

// ── Budgets, and actual against them ─────────────────────────
// A budget is a plan. It is never summed into a position, never counted as
// money, and never fills a gap in the ledger — it exists only so a month can
// be read against what it was meant to be. Every figure below keeps the two
// apart: `actual` comes from entries, `budget` from the plan, and `variance`
// is the difference with its own sign convention per direction.
export async function budgetsFor(entity, period) {
  return (
    await all(
      `SELECT b.category_id, b.amount_minor, b.note,
              c.name, c.kind, c.spend_group
         FROM fin_budgets b
         JOIN fin_categories c ON c.id = b.category_id
        WHERE b.period = ?${entity && entity !== "both" ? " AND b.entity = ?" : ""}`,
      entity && entity !== "both" ? [period, entity] : [period]
    )
  ).map((r) => ({
    categoryId: Number(r.category_id),
    amount: Number(r.amount_minor),
    note: r.note ?? null,
    name: r.name,
    kind: r.kind,
    group: r.spend_group ?? null,
  }));
}

// Spending less than planned is good; earning less than planned is not. One
// sign convention cannot serve both, so favourable is computed per direction
// rather than left to the reader to work out from a minus sign.
const favourable = (kind, actual, budget) =>
  kind === "revenue" ? actual >= budget : actual <= budget;

function line(name, kind, actual, budget, group = null) {
  const has = budget != null;
  return {
    name, kind, group,
    actual,
    budget: has ? budget : null,
    variance: has ? actual - budget : null,
    variancePct: has && budget !== 0 ? (actual - budget) / Math.abs(budget) : null,
    favourable: has ? favourable(kind, actual, budget) : null,
  };
}

// The statement, for one month or a run of them, with the plan beside it.
// `months` is how many periods ending at `period` to add together — 1 for the
// month, 3 for the quarter, and however many have elapsed for year to date.
export async function plStatement(entity, period, months = 1) {
  const periods = [];
  for (let i = months - 1; i >= 0; i--) periods.push(addMonths(period, -i));

  const parts = await Promise.all(periods.map((p) => profitAndLoss(p, entity)));
  const budgets = (await Promise.all(periods.map((p) => budgetsFor(entity, p)))).flat();

  // Actuals, added across the periods in view.
  const add = (pick) => parts.reduce((t, x) => t + pick(x), 0);
  const revenue = add((x) => x.revenue.total);
  const cogs = add((x) => x.cogs.total);
  const tax = add((x) => x.tax.total);

  // Operating expenses read under the five headings the rest of the app uses,
  // so a line here and the same line on the Expenses page cannot disagree.
  const opexRows = [];
  for (const x of parts) {
    for (const l of x.opex.lines) opexRows.push({ name: l.name, total: l.amount, count: 1 });
  }
  const byCat = new Map();
  for (const r of opexRows) {
    const cur = byCat.get(r.name) ?? { name: r.name, total: 0, count: 0, group: null };
    cur.total += r.total; cur.count += r.count;
    byCat.set(r.name, cur);
  }
  // The group each category belongs to, taken from the chart of accounts.
  const cats = await all("SELECT name, spend_group FROM fin_categories");
  const groupOf = new Map(cats.map((c) => [c.name, c.spend_group ?? null]));
  for (const r of byCat.values()) r.group = groupOf.get(r.name) ?? null;
  const opexGrouped = groupSpend([...byCat.values()].sort((a, b) => b.total - a.total));

  // The plan, aggregated the same way.
  // Once a plan exists for the period, a line left blank is a plan of zero —
  // you did not budget for it, so anything spent there is entirely over plan.
  // With no budget at all, every plan is null and the column stays empty
  // rather than claiming the whole month was unplanned.
  const anyPlan = budgets.length > 0;
  const planFor = (pred) => {
    if (!anyPlan) return null;
    return budgets.filter(pred).reduce((t, b) => t + b.amount, 0);
  };
  // A category with no spend group is its own heading. On the business chart
  // every operating category has one, so nothing changes there; on the personal
  // chart none do, and falling back to "G&A" collapsed rent, groceries, loan
  // interest and transport into a single line called general and
  // administrative — which is not a sentence anybody says about their own money.
  const opexPlanByGroup = new Map();
  for (const b of budgets.filter((x) => x.kind === "opex")) {
    const g = b.group ?? b.name;
    opexPlanByGroup.set(g, (opexPlanByGroup.get(g) ?? 0) + b.amount);
  }

  const revenuePlan = planFor((b) => b.kind === "revenue");
  const cogsPlan = planFor((b) => b.kind === "cogs");
  const taxPlan = planFor((b) => b.kind === "tax");

  const opexLines = opexGrouped.map((r) =>
    line(r.name, "opex", r.total,
         anyPlan ? (opexPlanByGroup.get(r.name) ?? 0) : null, r.name)
  );
  // A heading with a plan and nothing spent still belongs on the statement —
  // an untouched budget is exactly what someone opens this page to find.
  for (const [g, plan] of opexPlanByGroup) {
    if (!opexLines.some((l) => l.name === g)) opexLines.push(line(g, "opex", 0, plan, g));
  }
  opexLines.sort((a, b) => b.actual - a.actual || (b.budget ?? 0) - (a.budget ?? 0));

  const opexTotal = opexLines.reduce((t, l) => t + l.actual, 0);
  const opexPlan = anyPlan ? opexLines.reduce((t, l) => t + (l.budget ?? 0), 0) : null;

  const grossProfit = revenue - cogs;
  const grossPlan = revenuePlan != null && cogsPlan != null ? revenuePlan - cogsPlan : null;
  const operating = grossProfit - opexTotal;
  const operatingPlan = grossPlan != null && opexPlan != null ? grossPlan - opexPlan : null;
  const preTax = operating;
  const preTaxPlan = operatingPlan;
  const net = preTax - tax;
  const netPlan = preTaxPlan != null && taxPlan != null ? preTaxPlan - taxPlan : null;

  // A margin needs both halves. `null / x` is 0 in JavaScript, which quietly
  // turned "no plan" into "a planned margin of nought per cent".
  const pct = (n, d) => (n != null && d != null && d > 0 ? (n / d) * 100 : null);

  return {
    entity, period, months,
    periods,
    revenue: line("Revenue", "revenue", revenue, revenuePlan),
    cogs: line("Cost of revenue", "cogs", cogs, cogsPlan),
    grossProfit: line("Gross profit", "revenue", grossProfit, grossPlan),
    grossMargin: { actual: pct(grossProfit, revenue), budget: pct(grossPlan, revenuePlan) },
    opex: opexLines,
    opexTotal: line("Total operating expenses", "opex", opexTotal, opexPlan),
    operatingProfit: line("Operating profit", "revenue", operating, operatingPlan),
    operatingMargin: { actual: pct(operating, revenue), budget: pct(operatingPlan, revenuePlan) },
    tax: line("Tax", "tax", tax, taxPlan),
    preTax: line("Profit before tax", "revenue", preTax, preTaxPlan),
    netProfit: line("Net profit", "revenue", net, netPlan),
    netMargin: { actual: pct(net, revenue), budget: pct(netPlan, revenuePlan) },
    hasBudget: budgets.length > 0,
  };
}

// Twelve months of the four profit lines and the three margins, for the
// combo chart and the margin chart. Every figure is recorded — no month here
// is projected, because a P&L is a record of what happened.
export async function plTrend(entity, endPeriod, months = 12) {
  const periods = [];
  for (let i = months - 1; i >= 0; i--) periods.push(addMonths(endPeriod, -i));
  const parts = await Promise.all(periods.map((p) => profitAndLoss(p, entity)));
  return parts.map((x, i) => {
    const revenue = x.revenue.total;
    const gross = x.grossProfit;
    const operating = x.operatingProfit;
    const net = x.netProfit;
    const pct = (n) => (revenue > 0 ? (n / revenue) * 100 : null);
    return {
      period: periods[i], revenue, grossProfit: gross,
      operatingProfit: operating, netProfit: net,
      grossMargin: pct(gross), operatingMargin: pct(operating), netMargin: pct(net),
    };
  });
}

// The lines furthest from their plan, largest gap first. Only lines that have
// a plan can appear — a category with no budget has no variance, and guessing
// one would be inventing the number the whole panel is about.
export function topVariances(st, limit = 6) {
  return st.opex
    .filter((l) => l.budget != null)
    .map((l) => ({ ...l, size: Math.abs(l.variance) }))
    .sort((a, b) => b.size - a.size)
    .slice(0, limit);
}

// What the statement says, in sentences. Every line restates a figure that is
// visible on the same page — this is arithmetic with a vocabulary, not a
// model's opinion, which is why nothing here can say something the numbers do
// not. Three groups, matching how a board reads it.
export function plInsights(st, prev, trend, money) {
  const overall = [];
  const positives = [];
  const watch = [];
  const pctOf = (n, d) => (d ? Math.round((n / d) * 100) : null);
  const fmt = (v) => money(v);

  const revChange = prev?.revenue?.actual
    ? (st.revenue.actual - prev.revenue.actual) / Math.abs(prev.revenue.actual) : null;
  const netChange = prev?.netProfit?.actual
    ? (st.netProfit.actual - prev.netProfit.actual) / Math.abs(prev.netProfit.actual) : null;

  if (st.revenue.actual > 0) {
    overall.push(
      `Revenue of ${fmt(st.revenue.actual)}` +
      (revChange != null
        ? `, ${revChange >= 0 ? "up" : "down"} ${Math.abs(Math.round(revChange * 100))}% on the month before`
        : "") +
      (st.netMargin.actual != null
        ? `, at a ${Math.round(st.netMargin.actual)}% net margin.`
        : ".")
    );
  } else {
    overall.push(`No revenue is recorded for this period.`);
  }
  if (st.netProfit.actual < 0) {
    overall.push(`The period is at a loss of ${fmt(Math.abs(st.netProfit.actual))}.`);
  }

  if (revChange != null && revChange > 0.02) {
    positives.push(`Revenue grew ${Math.round(revChange * 100)}% on the month before.`);
  }
  if (st.grossMargin.actual != null && st.grossMargin.actual >= 60) {
    positives.push(`Gross margin is ${Math.round(st.grossMargin.actual)}%.`);
  }
  if (netChange != null && netChange > 0.02) {
    positives.push(`Net profit is up ${Math.round(netChange * 100)}% on the month before.`);
  }
  for (const l of st.opex.filter((x) => x.favourable === true && x.variance < 0).slice(0, 2)) {
    positives.push(`${l.name} came in ${fmt(Math.abs(l.variance))} under plan.`);
  }

  const over = st.opex.filter((l) => l.favourable === false)
                      .sort((a, b) => b.variance - a.variance);
  for (const l of over.slice(0, 3)) {
    watch.push(
      `${l.name} is ${fmt(l.variance)} over plan` +
      (l.variancePct != null ? ` (${Math.round(l.variancePct * 100)}%).` : ".")
    );
  }
  if (st.operatingMargin.actual != null && st.operatingMargin.actual < 0) {
    watch.push(`Operating margin is negative: costs exceed gross profit.`);
  }
  if (!st.hasBudget) {
    watch.push(`No budget is set for this period, so nothing here is measured against a plan.`);
  }
  const worst = [...(trend ?? [])].filter((m) => m.netMargin != null)
                                  .sort((a, b) => a.netMargin - b.netMargin)[0];
  if (worst && st.netMargin.actual != null && worst.period === st.period &&
      (trend?.length ?? 0) > 3) {
    watch.push(`This is the lowest net margin of the last ${trend.length} months.`);
  }
  return { overall, positives, watch, pctOf };
}

// ── The household view ───────────────────────────────────────
// A budget that is read as "how much of this month have I used", a bill list
// that is read as "what is about to leave", and the income behind it. Same
// figures the business pages use — the same ledger, the same commitments, the
// same plan — arranged the way somebody asks about their own money.
export async function householdMonth(entity, period, today = new Date()) {
  const [st, commitments, settled, breakdown, summary] = await Promise.all([
    plStatement(entity, period, 1),
    activeCommitments(entity),
    paymentMap(entity),
    categoryBreakdown(period, entity),
    periodSummary(period, entity),
  ]);

  // Budget against actual, per heading, with what is left. A heading with a
  // plan and nothing spent belongs here as much as one that is overspent —
  // an untouched budget is exactly what someone opens this page to find.
  const categories = st.opex.map((l) => ({
    name: l.name,
    budget: l.budget,
    spent: l.actual,
    remaining: l.budget == null ? null : l.budget - l.actual,
    usedPct: l.budget ? l.actual / l.budget : null,
    over: l.budget != null && l.actual > l.budget,
  }));
  const budgetTotal = st.opexTotal.budget;
  const spentTotal = st.opexTotal.actual;

  // What is agreed to leave, from today forward, and what has already gone.
  const asOf = isoDate(today);
  const thisPeriod = monthStart(today);
  const bills = [];
  for (let i = 0; i <= 1; i++) {
    const p = addMonths(thisPeriod, i);
    for (const k of commitments) {
      if (k.direction !== "out") continue;
      for (const occ of occurrencesIn(k, p)) {
        const rec = settled.get(occKey(k.id, occ.date));
        const status = statusOf(occ.date, asOf, rec);
        if (status === "paid" || status === "waived") continue;
        const days = Math.round((new Date(occ.date) - new Date(asOf)) / 86400000);
        if (days > 45) continue;
        bills.push({
          commitmentId: k.id, date: occ.date, days,
          name: k.counterparty || k.description,
          description: k.description,
          categoryName: k.category_name,
          amount: outstandingOn(Number(k.base_amount_minor), rec),
          frequency: k.frequency,
          status,
        });
      }
    }
  }
  bills.sort((a, b) => a.date.localeCompare(b.date));

  // Anything that recurs is a subscription in the sense that matters here:
  // it will take money again next month unless something is done about it.
  const perMonth = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, annual: 1 / 12 };
  const lastPaid = new Map();
  for (const [key, rec] of settled) {
    if (!rec?.paidDate) continue;
    const id = Number(String(key).split(":")[0]);
    const cur = lastPaid.get(id);
    if (!cur || rec.paidDate > cur) lastPaid.set(id, rec.paidDate);
  }
  const recurring = (direction) => commitments
    .filter((k) => k.direction === direction && k.frequency !== "once")
    .map((k) => ({
      id: Number(k.id),
      name: k.counterparty || k.description,
      description: k.description,
      categoryName: k.category_name,
      amount: Number(k.base_amount_minor),
      frequency: k.frequency,
      monthlyEquivalent: Math.round(Number(k.base_amount_minor) * (perMonth[k.frequency] ?? 1)),
      startDate: isoDate(k.start_date),
      endDate: k.end_date ? isoDate(k.end_date) : null,
      lastPaid: lastPaid.get(Number(k.id)) ? isoDate(lastPaid.get(Number(k.id))) : null,
    }))
    .sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);

  const subscriptions = recurring("out");
  const incomeSources = recurring("in");

  // One-off income recorded this month, so the income page shows what
  // actually arrived and not only what recurs.
  const incomeOther = breakdown
    .filter((r) => r.kind === "revenue" && r.direction === "in")
    .map((r) => ({ name: r.name, total: r.amount, count: r.count }));

  return {
    entity, period,
    income: {
      total: summary.revenue,
      sources: incomeSources,
      recurringMonthly: incomeSources.reduce((t, s) => t + s.monthlyEquivalent, 0),
      byCategory: incomeOther,
    },
    budget: {
      total: budgetTotal,
      spent: spentTotal,
      remaining: budgetTotal == null ? null : budgetTotal - spentTotal,
      usedPct: budgetTotal ? spentTotal / budgetTotal : null,
      categories,
      hasBudget: st.hasBudget,
    },
    bills: {
      upcoming: bills.filter((b) => b.status === "due"),
      overdue: bills.filter((b) => b.status === "overdue"),
      total: bills.reduce((t, b) => t + b.amount, 0),
    },
    subscriptions,
    subscriptionsMonthly: subscriptions.reduce((t, s) => t + s.monthlyEquivalent, 0),
    // Money in, money out, and what is left of the month — the three figures a
    // household actually asks for.
    savings: {
      income: summary.revenue,
      spent: summary.expenses,
      saved: summary.revenue - summary.expenses,
      rate: summary.revenue > 0 ? (summary.revenue - summary.expenses) / summary.revenue : null,
    },
  };
}

// ── The home page ────────────────────────────────────────────
// One call for the first screen a household sees: where it stands, how the
// month compares with the one before, what is about to leave, where the money
// went, and what actually moved. Every figure here is recorded or committed —
// nothing on this page is an estimate, and the one planned figure (the budget
// strip) is labelled as a plan.

// What this month moved, in cash terms. Transfers are excluded because moving
// money between your own pockets is not income and not spending.
async function cashMovement(entity, period) {
  const r = await get(
    `SELECT COALESCE(${SIGNED}, 0) AS net
       FROM fin_entries e
       LEFT JOIN fin_categories c ON c.id = e.category_id
      WHERE e.review_status <> 'rejected'
        AND COALESCE(c.kind, 'opex') <> 'transfer'
        AND e.period = ?${ENT(entity)}`,
    [period, ...ENT_ARG(entity)]
  );
  return Number(r?.net ?? 0);
}

// The last handful of things that actually happened, newest first. Not
// scoped to the month picker: "recent" means recent, and a quiet month should
// still show you the last thing you spent.
async function recentEntries(entity, limit = 6) {
  const rows = await all(
    `SELECT e.id, e.entry_date, e.direction, e.base_amount_minor, e.description,
            e.review_status, c.name AS category_name, p.name AS counterparty
       FROM fin_entries e
       LEFT JOIN fin_categories c ON c.id = e.category_id
       LEFT JOIN fin_counterparties p ON p.id = e.counterparty_id
      WHERE e.review_status <> 'rejected'${ENT(entity)}
      ORDER BY e.entry_date DESC, e.id DESC
      LIMIT ${Math.min(25, Math.max(1, limit))}`,
    ENT_ARG(entity)
  );
  return rows.map((r) => ({
    id: Number(r.id),
    date: isoDate(r.entry_date),
    direction: r.direction,
    amount: Number(r.base_amount_minor),
    name: r.counterparty || r.description || "—",
    description: r.description,
    categoryName: r.category_name || "Uncategorised",
    needsReview: r.review_status === "needs_review",
  }));
}

// A change against last month, as a fraction. Null when there is nothing to
// compare against — a first month has no trend, and 0 → anything is not a
// percentage.
const changeOn = (now, before) =>
  before ? (now - before) / Math.abs(before) : null;

// What the month says, in sentences, from figures already on the page. Every
// line is arithmetic on recorded rows — none of it is a model call.
function homeInsights(hh, prevSummary, spend, prevSpend, money) {
  const out = [];
  const s = hh.savings;

  // A month with nothing in it is a fact worth saying out loud — an empty
  // panel reads as a broken one.
  if (!s.income && !s.spent) {
    out.push({
      tone: "note",
      text: "Nothing is recorded for this month yet. The bills below are what is " +
            "agreed to leave, not what has gone.",
    });
  }

  // The heading that moved most against last month, either way.
  const before = new Map(prevSpend.map((r) => [r.name, r.amount]));
  const moved = spend
    .map((r) => ({ ...r, was: before.get(r.name) ?? 0 }))
    .filter((r) => r.was > 0)
    .map((r) => ({ ...r, change: (r.amount - r.was) / r.was }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
  if (moved && Math.abs(moved.change) >= 0.05) {
    out.push({
      tone: moved.change > 0 ? "down" : "up",
      text: `You spent ${Math.abs(Math.round(moved.change * 100))}% ` +
            `${moved.change > 0 ? "more" : "less"} on ${moved.name.toLowerCase()} this month.`,
    });
  }

  // The savings rate, against the month before.
  const prevRate = prevSummary.revenue > 0
    ? (prevSummary.revenue - prevSummary.expenses) / prevSummary.revenue : null;
  if (s.rate != null && s.rate < 0 && s.income > 0) {
    out.push({
      tone: "down",
      text: `You spent ${(s.spent / s.income).toFixed(1)}× what came in this month.`,
    });
  } else if (s.rate != null && prevRate != null && Math.abs(s.rate - prevRate) >= 0.01) {
    out.push({
      tone: s.rate >= prevRate ? "up" : "down",
      text: `Your savings rate ${s.rate >= prevRate ? "increased" : "fell"} from ` +
            `${Math.round(prevRate * 100)}% to ${Math.round(s.rate * 100)}%.`,
    });
  } else if (s.rate != null) {
    out.push({
      tone: s.rate >= 0 ? "up" : "down",
      text: `You are keeping ${Math.round(s.rate * 100)}% of what came in this month.`,
    });
  }

  // Subscriptions nothing has been paid against in a while. Same test the
  // Bills page uses, so the two pages never disagree.
  const stale = hh.subscriptions.filter(
    (x) => x.lastPaid && (Date.now() - new Date(x.lastPaid)) / (30 * 86400000) >= 2
  );
  if (stale.length) {
    out.push({
      tone: "note",
      text: `${stale.length} subscription${stale.length === 1 ? "" : "s"} ` +
            `${stale.length === 1 ? "has" : "haven't"} been paid in 2+ months` +
            ` — ${money(stale.reduce((t, x) => t + x.monthlyEquivalent, 0))} a month.`,
    });
  }

  if (hh.bills.overdue.length) {
    out.push({
      tone: "down",
      text: `${hh.bills.overdue.length} bill${hh.bills.overdue.length === 1 ? " is" : "s are"} ` +
            `past their date, worth ` +
            `${money(hh.bills.overdue.reduce((t, b) => t + b.amount, 0))}.`,
    });
  }

  const over = hh.budget.categories.filter((c) => c.over);
  if (over.length) {
    out.push({
      tone: "down",
      text: `${over.length} heading${over.length === 1 ? " is" : "s are"} over plan: ` +
            `${over.slice(0, 3).map((c) => c.name).join(", ")}.`,
    });
  } else if (!hh.budget.hasBudget) {
    out.push({
      tone: "note",
      text: "No budget is set for this month, so nothing here is measured against a plan.",
    });
  }

  return out.slice(0, 4);
}

export async function homeDashboard(entity, period, today = new Date(),
                                    money = (v) => String(v)) {
  const prevPeriod = addMonths(period, -1);
  const [hh, cash, movement, prevSummary, series, spendNow, spendBefore, recent, needsReview] =
    await Promise.all([
      householdMonth(entity, period, today),
      cashPosition(entity),
      cashMovement(entity, period),
      periodSummary(prevPeriod, entity),
      trend(13, period, entity),
      categoryBreakdown(period, entity),
      categoryBreakdown(prevPeriod, entity),
      recentEntries(entity, 6),
      reviewCount(entity),
    ]);

  const isSpend = (r) => ["cogs", "opex", "tax"].includes(r.kind) && r.direction === "out";
  const spend = spendNow.filter(isSpend);
  const spendTotal = spend.reduce((t, r) => t + r.amount, 0);

  // Four headings and everything else. Five tiles is what fits, and an
  // "Others" that says how many categories it folds is honest about it.
  const named = spend.slice(0, 4).map((r) => ({
    name: r.name, amount: r.amount, count: r.count,
    share: spendTotal ? r.amount / spendTotal : 0,
  }));
  const rest = spend.slice(4);
  const topCategories = rest.length
    ? [...named, {
        name: "Others", amount: rest.reduce((t, r) => t + r.amount, 0),
        count: rest.reduce((t, r) => t + r.count, 0),
        share: spendTotal ? rest.reduce((t, r) => t + r.amount, 0) / spendTotal : 0,
        folds: rest.length,
      }]
    : named;

  const s = hh.savings;
  const prevSaved = prevSummary.revenue - prevSummary.expenses;

  return {
    ...hh,
    // What you have, and what this month did to it. Without a bank feed this
    // is what has been recorded, which is a different claim from a balance —
    // so it is named for what it is.
    cash: {
      amount: cash.amount,
      source: cash.source,
      movement,
      // Only derivable from recorded rows; a bank balance carries no history
      // here, so it gets no comparison rather than a made-up one.
      change: cash.source === "recorded" ? changeOn(cash.amount, cash.amount - movement) : null,
    },
    previous: {
      period: prevPeriod,
      income: prevSummary.revenue,
      spent: prevSummary.expenses,
      saved: prevSaved,
    },
    change: {
      income: changeOn(s.income, prevSummary.revenue),
      spent: changeOn(s.spent, prevSummary.expenses),
      saved: changeOn(s.saved, prevSaved),
    },
    series,
    topCategories,
    spendTotal,
    recent,
    // What the bell counts: things that want a decision, not a notification
    // feed. Overdue bills and rows the reader has not confirmed.
    alerts: {
      overdue: hh.bills.overdue.length,
      needsReview,
      total: hh.bills.overdue.length + needsReview,
    },
    insights: homeInsights(hh, prevSummary, spend, spendBefore.filter(isSpend), money),
  };
}

// ── Income, as a household reads it ──────────────────────────
// Where the money comes from, how much of it arrived this month, and what
// keeps arriving without being asked. Three kinds of claim, kept apart: what
// was recorded, what recurs under a standing arrangement, and what has
// arrived without any arrangement behind it at all.

export async function incomeDashboard(entity, period, today = new Date()) {
  const prevPeriod = addMonths(period, -1);
  const [summary, prev, series, commitments, settled, breakdown] = await Promise.all([
    periodSummary(period, entity),
    periodSummary(prevPeriod, entity),
    trend(13, period, entity),
    activeCommitments(entity),
    paymentMap(entity),
    categoryBreakdown(period, entity),
  ]);

  const asOf = isoDate(today);
  const perMonth = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, annual: 1 / 12 };

  // When each standing arrangement last actually paid, from the payments
  // recorded against it — not from when it was supposed to.
  const lastPaid = new Map();
  for (const [key, rec] of settled) {
    if (!rec?.paidDate) continue;
    const id = Number(String(key).split(":")[0]);
    const cur = lastPaid.get(id);
    if (!cur || rec.paidDate > cur) lastPaid.set(id, rec.paidDate);
  }

  const incoming = commitments.filter((k) => k.direction === "in");
  const thisPeriod = monthStart(today);
  const sources = incoming.map((k) => {
    // The next date this is due, looking from today forward.
    let next = null;
    for (let i = 0; i <= 3 && !next; i++) {
      for (const occ of occurrencesIn(k, addMonths(thisPeriod, i))) {
        if (occ.date >= asOf) { next = occ.date; break; }
      }
    }
    // Dates this was due and nothing has been recorded against. Recording a
    // receipt has to happen against a date the schedule actually produces, so
    // the page offers those dates rather than a free-text box that can be
    // typed wrong.
    const openDates = [];
    for (let i = -6; i <= 1; i++) {
      for (const occ of occurrencesIn(k, addMonths(thisPeriod, i))) {
        if (settled.get(occKey(k.id, occ.date))) continue;
        openDates.push(occ.date);
      }
    }
    const ends = k.end_date ? isoDate(k.end_date) : null;
    return {
      id: Number(k.id),
      name: k.counterparty || k.description,
      description: k.description,
      type: k.category_name || "Uncategorised",
      frequency: k.frequency,
      amount: Number(k.base_amount_minor),
      monthlyEquivalent: Math.round(Number(k.base_amount_minor) * (perMonth[k.frequency] ?? 1)),
      startDate: isoDate(k.start_date),
      endDate: ends,
      lastReceived: lastPaid.get(Number(k.id)) ? isoDate(lastPaid.get(Number(k.id))) : null,
      nextDue: next,
      openDates: openDates.sort(),
      // The most recent date already past that nothing has been recorded for —
      // what somebody means when they say "mark it received".
      dueNow: openDates.filter((d) => d <= asOf).sort().at(-1) ?? null,
      // Still running, or finished. A source that ended is history, not income.
      active: !ends || ends >= asOf,
    };
  }).sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);

  // Money that arrived without a standing arrangement behind it. A commitment
  // payment carries the commitment's own dedup key, so anything without one is
  // either a one-off or a source nobody has set up yet.
  const loose = await all(
    `SELECT e.id, e.entry_date, e.base_amount_minor, e.description, e.dedup_key,
            c.id AS category_id, c.name AS category_name, p.name AS counterparty
       FROM fin_entries e
       LEFT JOIN fin_categories c ON c.id = e.category_id
       LEFT JOIN fin_counterparties p ON p.id = e.counterparty_id
      WHERE e.review_status <> 'rejected'
        AND e.direction = 'in'
        AND COALESCE(c.kind, 'revenue') <> 'transfer'
        AND e.dedup_key NOT LIKE 'commitment:%'
        AND e.entry_date >= ?${ENT(entity)}
      ORDER BY e.entry_date DESC, e.id DESC`,
    [isoDate(new Date(today.getTime() - 120 * 86400000)), ...ENT_ARG(entity)]
  );

  // A deposit is worth offering as a recurring source only if nothing already
  // covers it. Matched on who it came from, which is the only thing a person
  // would recognise.
  const known = new Set(
    incoming.map((k) => String(k.counterparty || k.description).trim().toLowerCase())
  );
  const byWho = new Map();
  for (const r of loose) {
    const who = String(r.counterparty || r.description || "").trim();
    if (!who || known.has(who.toLowerCase())) continue;
    const cur = byWho.get(who.toLowerCase());
    const row = {
      entryId: Number(r.id),
      who,
      date: isoDate(r.entry_date),
      amount: Number(r.base_amount_minor),
      description: r.description,
      // Carried through so a deposit turned into a standing arrangement keeps
      // the heading it was already coded to, rather than arriving uncategorised.
      categoryId: r.category_id ? Number(r.category_id) : null,
      categoryName: r.category_name || null,
    };
    if (!cur) byWho.set(who.toLowerCase(), { ...row, times: 1 });
    else cur.times += 1; // the newest is kept; the count says how often it came
  }
  const detected = [...byWho.values()].sort((a, b) => b.date.localeCompare(a.date));

  const change = prev.revenue ? (summary.revenue - prev.revenue) / Math.abs(prev.revenue) : null;

  return {
    entity, period,
    total: summary.revenue,
    previous: prev.revenue,
    change,
    // What arrives every month if nothing changes. A rate, not a total — it is
    // never added to what was recorded.
    recurringMonthly: sources.filter((s) => s.active)
                             .reduce((t, s) => t + s.monthlyEquivalent, 0),
    sources,
    // This month's income by category, as recorded.
    byCategory: breakdown
      .filter((r) => r.kind === "revenue" && r.direction === "in")
      .map((r) => ({ name: r.name, total: r.amount, count: r.count })),
    series: series.map((m) => ({ period: m.period, amount: m.revenue })),
    detected,
  };
}

// ── What you own and what you owe ────────────────────────────
// The ledger records money moving. It cannot say what a holding is worth
// today, because nothing here is connected to a bank or a broker — so every
// figure below is a valuation somebody entered, and carries the date they
// entered it for. A net worth with no date is a number, not a claim.

const HOLDING_KINDS = ["equity", "debt", "cash", "property", "gold", "other"];

export async function wealth(entity, today = new Date(), months = 12) {
  const asOf = isoDate(today);
  const rows = await all(
    `SELECT h.*, (SELECT MAX(as_of) FROM fin_holding_values v WHERE v.holding_id = h.id) AS latest
       FROM fin_holdings h
      WHERE 1=1${entity && entity !== "both" ? " AND h.entity = ?" : ""}
      ORDER BY h.side, ABS(h.base_value_minor) DESC`,
    entity && entity !== "both" ? [entity] : []
  );

  const shape = (r) => ({
    id: Number(r.id),
    side: r.side,
    name: r.name,
    kind: r.kind,
    currency: r.currency,
    value: Number(r.base_value_minor),
    valueAsWritten: Number(r.value_minor),
    cost: r.base_cost_minor == null ? null : Number(r.base_cost_minor),
    // Return is only meaningful where a cost was entered. No cost, no return —
    // not a zero, which would read as "it went nowhere".
    returnPct: r.base_cost_minor && Number(r.base_cost_minor) !== 0
      ? (Number(r.base_value_minor) - Number(r.base_cost_minor)) / Math.abs(Number(r.base_cost_minor))
      : null,
    ratePct: r.rate_pct == null ? null : Number(r.rate_pct),
    monthlyPayment: r.monthly_payment_minor == null ? null : Number(r.monthly_payment_minor),
    asOf: isoDate(r.as_of),
    // How long ago somebody last said what this was worth. A year-old
    // valuation is not wrong, but it is not today either.
    staleDays: Math.round((new Date(asOf) - new Date(isoDate(r.as_of))) / 86400000),
    note: r.note ?? null,
  });

  const assets = rows.filter((r) => r.side === "asset").map(shape);
  const liabilities = rows.filter((r) => r.side === "liability").map(shape);
  const totalAssets = assets.reduce((t, a) => t + a.value, 0);
  const totalLiabilities = liabilities.reduce((t, a) => t + a.value, 0);

  // Every valuation ever entered, folded into a month-end series so net worth
  // has a history. A month with no new valuation carries the last one — the
  // holding did not stop existing because nobody re-priced it.
  const hist = await all(
    `SELECT v.holding_id, v.as_of, v.base_value_minor, h.side
       FROM fin_holding_values v
       JOIN fin_holdings h ON h.id = v.holding_id
      WHERE 1=1${entity && entity !== "both" ? " AND h.entity = ?" : ""}
      ORDER BY v.as_of`,
    entity && entity !== "both" ? [entity] : []
  );
  const series = [];
  const running = new Map();
  const from = addMonths(monthStart(today), -(months - 1));
  const seen = [...hist].map((r) => ({ ...r, as_of: isoDate(r.as_of) }));
  for (let i = 0; i < months; i++) {
    const p = addMonths(from, i);
    const end = isoDate(new Date(Date.UTC(+p.slice(0, 4), +p.slice(5, 7), 0)));
    for (const r of seen) {
      if (r.as_of <= end) running.set(Number(r.holding_id), r);
    }
    let a = 0, l = 0;
    for (const r of running.values()) {
      if (r.side === "asset") a += Number(r.base_value_minor);
      else l += Number(r.base_value_minor);
    }
    series.push({ period: p, assets: a, liabilities: l, net: a - l });
  }

  // How the assets split. A slice per kind, largest first, so the allocation
  // is read the same way the spend groups are.
  const byKind = new Map();
  for (const a of assets) {
    const k = HOLDING_KINDS.includes(a.kind) ? a.kind : "other";
    byKind.set(k, (byKind.get(k) ?? 0) + a.value);
  }
  const allocation = [...byKind.entries()]
    .map(([kind, total]) => ({
      kind, total, share: totalAssets ? total / totalAssets : 0,
    }))
    .sort((x, y) => y.total - x.total);

  const priced = assets.filter((a) => a.cost != null);
  const costTotal = priced.reduce((t, a) => t + a.cost, 0);
  const pricedValue = priced.reduce((t, a) => t + a.value, 0);

  // A year ago, on the same carried-forward basis as the series.
  const yearAgo = series.length >= 13 ? series[series.length - 13] : series[0];

  return {
    entity, asOf,
    totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities,
    change: yearAgo && yearAgo.net
      ? (totalAssets - totalLiabilities - yearAgo.net) / Math.abs(yearAgo.net) : null,
    changeFrom: yearAgo?.period ?? null,
    assets, liabilities, allocation, series,
    // Only over the holdings that carry a cost. Averaging in the ones that do
    // not would be reporting a return on money nobody said they paid.
    performance: priced.length
      ? { cost: costTotal, value: pricedValue, count: priced.length,
          returnPct: costTotal ? (pricedValue - costTotal) / Math.abs(costTotal) : null }
      : null,
    // Debt, read the way somebody paying it reads it.
    debt: {
      total: totalLiabilities,
      monthlyPayment: liabilities.reduce((t, l) => t + (l.monthlyPayment ?? 0), 0),
      items: liabilities,
    },
    // A valuation nobody has touched in three months is worth saying so about.
    stale: [...assets, ...liabilities].filter((h) => h.staleDays >= 90).length,
  };
}

// ── What you are saving toward ───────────────────────────────
// A goal is a plan, like a budget. It is never summed into a position and
// never counted as money. What it adds is arithmetic against a date: what is
// left, how long there is, and what that works out to a month.
export async function goals(entity, today = new Date(), monthlySaving = null) {
  const asOf = isoDate(today);
  const rows = await all(
    `SELECT * FROM fin_goals
      WHERE status <> 'archived'${entity && entity !== "both" ? " AND entity = ?" : ""}
      ORDER BY (target_date IS NULL), target_date, id`,
    entity && entity !== "both" ? [entity] : []
  );

  const items = rows.map((r) => {
    const target = Number(r.base_target_minor);
    const saved = Number(r.base_saved_minor);
    const remaining = Math.max(0, target - saved);
    const date = r.target_date ? isoDate(r.target_date) : null;
    const days = date ? Math.round((new Date(date) - new Date(asOf)) / 86400000) : null;
    // Months left, never below one: "you need the whole thing this month" is
    // the honest answer when the date is next week, not a division by zero.
    const monthsLeft = days == null ? null : Math.max(1, Math.round(days / 30.44));
    return {
      id: Number(r.id),
      name: r.name,
      kind: r.kind,
      currency: r.currency,
      target, saved, remaining,
      targetAsWritten: Number(r.target_minor),
      progress: target ? Math.min(1, saved / target) : null,
      targetDate: date,
      daysLeft: days,
      monthsLeft,
      perMonth: monthsLeft ? Math.ceil(remaining / monthsLeft) : null,
      done: target > 0 && saved >= target,
      // Past its date and not there yet is a different thing from behind pace.
      overdue: days != null && days < 0 && saved < target,
      note: r.note ?? null,
    };
  });

  const open = items.filter((g) => !g.done);
  const needed = open.reduce((t, g) => t + (g.perMonth ?? 0), 0);

  return {
    entity, asOf,
    items,
    totalTarget: items.reduce((t, g) => t + g.target, 0),
    totalSaved: items.reduce((t, g) => t + g.saved, 0),
    // What every open goal together asks of a month, against what the months
    // have actually been keeping. Both are real; neither is a promise.
    neededPerMonth: needed,
    savingPerMonth: monthlySaving,
    shortfall: monthlySaving == null ? null : needed - Math.max(0, monthlySaving),
    // Soonest first, for the timeline.
    timeline: items.filter((g) => g.targetDate && !g.done)
                   .sort((a, b) => a.targetDate.localeCompare(b.targetDate)),
  };
}

// ── Reports ──────────────────────────────────────────────────
// Nothing new is measured here. Every figure is one the other pages already
// show, arranged so a run of months can be read at once instead of a month at
// a time — and said in sentences underneath, so the reader is not left to do
// the comparison themselves.
export async function reports(entity, period, months = 6, today = new Date(),
                              money = (v) => String(Math.round(v / 100))) {
  const [series, breakdown, summary, prev, hh, budgets] = await Promise.all([
    trend(13, period, entity),
    categoryBreakdown(period, entity),
    periodSummary(period, entity),
    periodSummary(addMonths(period, -1), entity),
    householdMonth(entity, period, today),
    budgetsFor(entity, period),
  ]);

  const window = series.slice(-months);
  const isSpend = (r) => ["cogs", "opex", "tax"].includes(r.kind) && r.direction === "out";
  const spend = breakdown.filter(isSpend);
  const spendTotal = spend.reduce((t, r) => t + r.amount, 0);

  // Four named headings and everything else, the same shape the home page
  // uses, so the two pages never disagree about what "Others" holds.
  const named = spend.slice(0, 5).map((r) => ({
    name: r.name, total: r.amount,
    share: spendTotal ? r.amount / spendTotal : 0,
  }));
  const rest = spend.slice(5);
  const byCategory = rest.length
    ? [...named, {
        name: "Others", total: rest.reduce((t, r) => t + r.amount, 0),
        share: spendTotal ? rest.reduce((t, r) => t + r.amount, 0) / spendTotal : 0,
        folds: rest.length,
      }]
    : named;

  const saved = summary.revenue - summary.expenses;
  const prevSaved = prev.revenue - prev.expenses;
  const rate = summary.revenue > 0 ? saved / summary.revenue : null;
  const prevRate = prev.revenue > 0 ? prevSaved / prev.revenue : null;

  // The months before this one, for "against your own average" — this month
  // is excluded because a month in progress is not comparable with finished
  // ones, and comparing it with itself proves nothing.
  const before = window.slice(0, -1);
  const avgSpend = before.length
    ? before.reduce((t, m) => t + m.expenses, 0) / before.length : null;
  const avgIn = before.length
    ? before.reduce((t, m) => t + m.revenue, 0) / before.length : null;

  const insights = [];
  const advice = [];

  if (avgSpend != null && summary.expenses > 0) {
    const d = (summary.expenses - avgSpend) / avgSpend;
    if (Math.abs(d) >= 0.05) {
      insights.push({
        tone: d < 0 ? "up" : "down",
        text: `You spent ${Math.abs(Math.round(d * 100))}% ${d < 0 ? "less" : "more"} ` +
              `than your ${before.length}-month average.`,
      });
    }
  }
  if (rate != null && prevRate != null && Math.abs(rate - prevRate) >= 0.01) {
    insights.push({
      tone: rate >= prevRate ? "up" : "down",
      text: `Your savings rate moved from ${Math.round(prevRate * 100)}% to ` +
            `${Math.round(rate * 100)}% on the month before.`,
    });
  }
  const biggest = spend[0];
  if (biggest && spendTotal) {
    insights.push({
      tone: "note",
      text: `${biggest.name} is your largest heading at ` +
            `${Math.round((biggest.amount / spendTotal) * 100)}% of what went out.`,
    });
  }
  if (hh.subscriptionsMonthly > 0 && spendTotal > 0) {
    insights.push({
      tone: "note",
      text: `Subscriptions are ${Math.round((hh.subscriptionsMonthly / spendTotal) * 100)}% ` +
            `of your spending — ${money(hh.subscriptionsMonthly)} a month.`,
    });
  }

  // Advice, only where the figures behind it are on this page. Nothing here
  // is a recommendation about money nobody has told the app about.
  const unusedSubs = hh.subscriptions.filter(
    (s) => s.lastPaid && (Date.now() - new Date(s.lastPaid)) / (30 * 86400000) >= 2
  );
  if (unusedSubs.length) {
    advice.push({
      text: `Nothing has been recorded against ${unusedSubs.length} subscription` +
            `${unusedSubs.length === 1 ? "" : "s"} for two months. Cancelling ` +
            `${unusedSubs.length === 1 ? "it" : "them"} would save ` +
            `${money(unusedSubs.reduce((t, s) => t + s.monthlyEquivalent, 0))} a month.`,
    });
  }
  const unplanned = hh.budget.categories.filter((c) => c.spent > 0 && !c.budget);
  if (unplanned.length) {
    advice.push({
      text: `${money(unplanned.reduce((t, c) => t + c.spent, 0))} went on ` +
            `${unplanned.map((c) => c.name).slice(0, 2).join(" and ")}` +
            `${unplanned.length > 2 ? " and others" : ""} with no limit set. ` +
            `A budget for ${unplanned.length === 1 ? "it" : "them"} would make the ` +
            `month measurable.`,
    });
  }
  if (avgSpend != null && avgSpend > 0) {
    advice.push({
      text: `Three to six months of your average spending is ` +
            `${money(avgSpend * 3)} to ${money(avgSpend * 6)}. That is the size an ` +
            `emergency fund is usually set to.`,
    });
  }
  const over = hh.budget.categories.filter((c) => c.over && c.budget > 0);
  if (over.length) {
    advice.push({
      text: `${over.map((c) => c.name).join(", ")} went over plan this month. ` +
            `Either the limit is wrong or the spending is — worth deciding which.`,
    });
  }

  return {
    entity, period, months,
    series: window,
    spending: { total: spendTotal, byCategory, average: avgSpend },
    income: { total: summary.revenue, average: avgIn,
              change: prev.revenue ? (summary.revenue - prev.revenue) / Math.abs(prev.revenue) : null },
    savings: { saved, rate, previousRate: prevRate,
               change: prevSaved ? (saved - prevSaved) / Math.abs(prevSaved) : null },
    budgetLines: budgets.length,
    insights, advice,
    // The months this report can be run for, newest first.
    available: series.filter((m) => m.revenue || m.expenses).map((m) => m.period).reverse(),
  };
}

// ── Spending, as a household reads it ────────────────────────
// The business Expenses page asks "where did the money go". A household asks
// two more things on top: how much of it was never really a choice, and how
// much is left once the unavoidable part has gone. Both need the same split —
// spending that a standing agreement caused, and spending that did not.

// Fixed is what an agreement caused: those rows carry the commitment's own
// dedup key. Everything else is variable. Nothing is guessed from the amount
// or the name — the ledger already knows which is which.
const FIXED_WHEN = "e.dedup_key LIKE 'commitment:%'";

async function fixedVariableTrend(entity, endPeriod, months = 13) {
  const from = addMonths(endPeriod, -(months - 1));
  const rows = await all(
    `SELECT e.period,
            ${FIXED_WHEN} AS fixed,
            SUM(e.base_amount_minor) AS total
       FROM fin_entries e
       LEFT JOIN fin_categories c ON c.id = e.category_id
      WHERE e.review_status <> 'rejected'
        AND e.direction = 'out'
        AND COALESCE(c.kind, 'opex') IN ('cogs','opex','tax')
        AND e.period >= ? AND e.period <= ?${ENT(entity)}
      GROUP BY 1, 2`,
    [from, endPeriod, ...ENT_ARG(entity)]
  );
  const buckets = new Map();
  for (let i = 0; i < months; i++) {
    const p = addMonths(from, i);
    buckets.set(p, { period: p, total: 0, fixed: 0, variable: 0 });
  }
  for (const r of rows) {
    const b = buckets.get(isoDate(r.period));
    if (!b) continue;
    const v = Number(r.total);
    b.total += v;
    if (r.fixed === true || r.fixed === "t" || r.fixed === 1) b.fixed += v;
    else b.variable += v;
  }
  return [...buckets.values()];
}

// Money that left with no agreement behind it. The mirror of the income
// detection: what has gone out more than once, from the same place, that
// nothing on the Bills page covers. Whether it should become a bill is a
// judgement, so the page offers and does not decide.
async function detectedSpending(entity, commitments, today) {
  const since = isoDate(new Date(today.getTime() - 180 * 86400000));
  const rows = await all(
    `SELECT e.id, e.entry_date, e.period, e.base_amount_minor, e.description,
            c.id AS category_id, c.name AS category_name, p.name AS counterparty
       FROM fin_entries e
       LEFT JOIN fin_categories c ON c.id = e.category_id
       LEFT JOIN fin_counterparties p ON p.id = e.counterparty_id
      WHERE e.review_status <> 'rejected'
        AND e.direction = 'out'
        AND COALESCE(c.kind, 'opex') IN ('cogs','opex','tax')
        AND e.dedup_key NOT LIKE 'commitment:%'
        AND e.entry_date >= ?${ENT(entity)}
      ORDER BY e.entry_date DESC`,
    [since, ...ENT_ARG(entity)]
  );

  const covered = new Set(
    commitments.filter((k) => k.direction === "out")
      .map((k) => String(k.counterparty || k.description).trim().toLowerCase())
  );

  const byWho = new Map();
  for (const r of rows) {
    const who = String(r.counterparty || r.description || "").trim();
    if (!who || covered.has(who.toLowerCase())) continue;
    const key = who.toLowerCase();
    const cur = byWho.get(key) ?? {
      who, months: new Set(), amounts: [], latest: null,
      categoryId: r.category_id ? Number(r.category_id) : null,
      categoryName: r.category_name || null,
      entryId: Number(r.id),
    };
    cur.months.add(isoDate(r.period));
    cur.amounts.push(Number(r.base_amount_minor));
    if (!cur.latest || isoDate(r.entry_date) > cur.latest) cur.latest = isoDate(r.entry_date);
    byWho.set(key, cur);
  }

  return [...byWho.values()]
    .map((x) => {
      const months = x.months.size;
      const typical = Math.round(x.amounts.reduce((t, v) => t + v, 0) / x.amounts.length);
      const spread = Math.max(...x.amounts) - Math.min(...x.amounts);
      return {
        entryId: x.entryId,
        who: x.who,
        months,
        times: x.amounts.length,
        typical,
        latest: x.latest,
        categoryId: x.categoryId,
        categoryName: x.categoryName,
        // What the pattern looks like, said as what was observed rather than
        // as a category the app has decided on. "Steady" only where the
        // amount barely moves — otherwise it is recurring but not fixed.
        looks: months < 2 ? "one-off"
          : spread <= Math.max(100, typical * 0.05) ? "steady"
          : "recurring",
      };
    })
    .filter((x) => x.months >= 2)
    .sort((a, b) => b.months - a.months || b.typical - a.typical);
}

export async function expensesDashboard(entity, period, today = new Date(),
                                        money = (v) => String(Math.round(v / 100))) {
  const [sd, hh, series, commitments, summary, prev] = await Promise.all([
    sideDetail(entity, period, "out", today),
    householdMonth(entity, period, today),
    fixedVariableTrend(entity, period, 13),
    activeCommitments(entity),
    periodSummary(period, entity),
    periodSummary(addMonths(period, -1), entity),
  ]);

  const detected = await detectedSpending(entity, commitments, today);

  const total = summary.expenses;
  const fixed = sd.fixed;
  const variable = sd.variable;
  const subs = hh.subscriptionsMonthly;
  const income = summary.revenue;

  // What is left, and what is left once only the unavoidable part has gone.
  // Two different questions, so two figures — the reference design showed one
  // label over the arithmetic for the other.
  const left = income - total;
  const afterFixed = income - fixed;

  // How much of the rest of the month a week is worth. Only answerable inside
  // the month you are in — a finished month has no weeks left to spread over.
  const thisPeriod = monthStart(today);
  const daysInMonth = new Date(Date.UTC(+period.slice(0, 4), +period.slice(5, 7), 0)).getUTCDate();
  const dayNow = Number(isoDate(today).slice(8, 10));
  const daysLeft = period === thisPeriod ? Math.max(1, daysInMonth - dayNow + 1) : null;
  const weekly = daysLeft && left > 0 ? Math.round((left / daysLeft) * 7) : null;

  const insights = [];
  const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : null);

  // The heading that moved most against last month.
  const top = sd.ranked.filter((c) => c.change != null)
                       .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
  if (top && Math.abs(top.change) >= 0.05) {
    insights.push({
      tone: top.change > 0 ? "down" : "up",
      text: `${top.name} is ${Math.abs(Math.round(top.change * 100))}% ` +
            `${top.change > 0 ? "higher" : "lower"} than last month ` +
            `(${money(Math.abs(top.total - top.lastMonth))} ${top.change > 0 ? "more" : "less"}).`,
    });
  }
  if (hh.subscriptions.length) {
    insights.push({
      tone: "note",
      text: `You have ${hh.subscriptions.length} recurring ` +
            `subscription${hh.subscriptions.length === 1 ? "" : "s"} costing ` +
            `${money(subs)} a month.`,
    });
  }
  // A heading on course to pass its limit, worked out from the pace so far.
  //
  // Only where a daily rate means anything. One rent payment on the 3rd is
  // not "spending at a rate" — extrapolating it says the month will hold ten
  // more rents. So the claim needs several separate payments behind it, and
  // enough of the month gone to have a rate at all.
  const counted = new Map(sd.categories.map((c) => [c.name, c.count ?? 0]));
  if (daysLeft && dayNow >= 7) {
    const pace = dayNow / daysInMonth;
    const heading = hh.budget.categories
      .filter((c) => c.budget > 0 && c.spent > 0 && (counted.get(c.name) ?? 0) >= 3)
      .map((c) => ({ ...c, projected: Math.round(c.spent / pace) }))
      .filter((c) => c.projected > c.budget && !c.over)
      .sort((a, b) => (b.projected - b.budget) - (a.projected - a.budget))[0];
    if (heading) {
      insights.push({
        tone: "warn",
        text: `At this pace ${heading.name.toLowerCase()} will pass its limit by ` +
              `${money(heading.projected - heading.budget)} this month.`,
      });
    }
  }
  const stale = hh.subscriptions.filter(
    (s) => s.lastPaid && (Date.now() - new Date(s.lastPaid)) / (30 * 86400000) >= 2
  );
  if (stale.length) {
    insights.push({
      tone: "up",
      text: `You could save ${money(stale.reduce((t, s) => t + s.monthlyEquivalent, 0))} ` +
            `a month by reviewing ${stale.length} subscription` +
            `${stale.length === 1 ? "" : "s"} nothing has been paid against in two months.`,
    });
  }
  const fixedBefore = series.length >= 2 ? series[series.length - 2].fixed : null;
  if (fixedBefore != null && fixed !== fixedBefore && fixedBefore > 0) {
    insights.push({
      tone: fixed > fixedBefore ? "down" : "up",
      text: `Your fixed spending ${fixed > fixedBefore ? "rose" : "fell"} by ` +
            `${money(Math.abs(fixed - fixedBefore))} this month.`,
    });
  }
  if (!insights.length && total > 0) {
    insights.push({
      tone: "note",
      text: `${money(total)} left this month across ${sd.categories.length} heading` +
            `${sd.categories.length === 1 ? "" : "s"}.`,
    });
  }

  return {
    entity, period,
    total,
    previous: prev.expenses,
    change: prev.expenses ? (total - prev.expenses) / Math.abs(prev.expenses) : null,
    // The three ways spending divides, and their shares of the month. Fixed
    // and variable are exclusive and add to the total; subscriptions are a
    // monthly rate that overlaps fixed, so it is never added to either.
    split: {
      fixed, variable,
      fixedShare: total ? fixed / total : null,
      variableShare: total ? variable / total : null,
      subscriptionsMonthly: subs,
      subscriptionCount: hh.subscriptions.length,
      subscriptionShare: total ? subs / total : null,
    },
    income,
    left,
    afterFixed,
    weekly,
    daysLeft,
    // What the plan says the month should leave, if there is a plan.
    plannedLeft: hh.budget.total == null ? null : income - hh.budget.total,
    categories: sd.categories,
    ranked: sd.ranked,
    parties: sd.parties,
    variableParties: sd.variableParties,
    recurring: hh.subscriptions,
    bills: hh.bills,
    budget: hh.budget,
    series,
    trend: sd.trend,
    detected,
    insights,
    pctOf,
  };
}
