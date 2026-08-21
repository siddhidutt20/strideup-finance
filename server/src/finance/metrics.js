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
export async function categoryBreakdown(period, entity) {
  return (
    await all(
      `SELECT COALESCE(c.name, 'Uncategorised') AS name,
              ${KIND} AS kind,
              ${SIGNED} AS net,
              COUNT(*) AS n
         FROM fin_entries e
         LEFT JOIN fin_categories c ON c.id = e.category_id
        WHERE e.review_status <> 'rejected' AND e.period = ?${ENT(entity)}
        GROUP BY 1, 2
        ORDER BY ABS(${SIGNED}) DESC`,
      [period, ...ENT_ARG(entity)]
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
      if (settled?.has(occKey(k.id, occ.date))) continue;
      const amount = Number(k.base_amount_minor);
      if (k.direction === "in") committedIn += amount;
      else committedOut += amount;
      items.push({
        id: k.id, date: occ.date, direction: k.direction,
        description: k.description, counterparty: k.counterparty,
        categoryName: k.category_name, amount,
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

// paid — settled, and now a real ledger entry.
// waived — written off deliberately; it is not coming and is not a debt.
// overdue — the date has passed and nothing was recorded.
// due — still ahead.
export function statusOf(dueDate, asOf, settled) {
  if (settled?.status === "paid") return "paid";
  if (settled?.status === "waived") return "waived";
  return dueDate < asOf ? "overdue" : "due";
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
          return {
            date: o.date,
            status: statusOf(o.date, asOf, settled),
            paidDate: settled?.paidDate ?? null,
            amount: settled?.amount ?? Number(k.base_amount_minor),
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
