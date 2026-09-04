import { useMemo, useState } from "react";
import { api } from "../api.js";
import { Panel } from "./pieces.jsx";
import { Disc } from "./glyphs.jsx";
import { monthLabel } from "./format.js";
import { CommitmentForm } from "./forecast.jsx";

// ── A household's month ──────────────────────────────────────
// The same ledger, the same commitments and the same plan the business pages
// read, asked in the words somebody uses about their own money: how much of
// this month have I used, what is about to leave, and what keeps taking money
// every month whether I look or not.

const pct = (v) => (v == null ? null : Math.round(v * 100));

const FREQ = { once: "One-time", weekly: "Weekly", monthly: "Monthly",
               quarterly: "Quarterly", annual: "Yearly" };

const dayLabel = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

// A ring showing how much of the month's plan is gone. Not a donut of parts —
// one figure against one limit, which is the only thing this answers.
function UsedRing({ used, over }) {
  const p = Math.min(1, Math.max(0, used ?? 0));
  const R = 52, C = 2 * Math.PI * R;
  return (
    <svg viewBox="0 0 130 130" className="hh-ring" role="img"
         aria-label={`${pct(used) ?? 0}% of the budget used`}>
      <circle cx="65" cy="65" r={R} fill="none" strokeWidth="13"
              stroke="var(--fin-sunk)" />
      <circle cx="65" cy="65" r={R} fill="none" strokeWidth="13" strokeLinecap="round"
              stroke={over ? "var(--fin-out)" : "#1baf7a"}
              strokeDasharray={`${C * p} ${C}`}
              transform="rotate(-90 65 65)" />
      <text x="65" y="72" className="hh-ringfig">{pct(used) ?? "—"}%</text>
    </svg>
  );
}

// The bar takes its colour from how close to the limit it is, not from the
// category — the whole point of it is "am I about to run out".
function Bar({ used, over }) {
  const p = used ?? 0;
  const tone = over ? "over" : p >= 0.9 ? "hot" : p >= 0.7 ? "warm" : "ok";
  return (
    <span className="hh-bar">
      <i className={tone} style={{ width: `${Math.min(100, p * 100)}%` }} />
    </span>
  );
}

export function BudgetView({ hh, money, period, onEditBudget, onGo }) {
  const b = hh.budget;
  const s = hh.savings;
  // Two different things get called "over": a limit you exceeded, and money
  // spent where you set no limit at all. Only the first has a percentage —
  // dividing by a budget of zero is how a page ends up saying "Infinity%".
  const over = b.categories.filter((c) => c.over && c.budget > 0)
                           .sort((a, c) => (c.spent - c.budget) - (a.spent - a.budget));
  const unplanned = b.categories.filter((c) => c.spent > 0 && !c.budget);
  const worst = over[0];
  const tight = b.categories
    .filter((c) => !c.over && c.usedPct != null && c.usedPct >= 0.9)
    .sort((a, c) => c.usedPct - a.usedPct)[0];

  return (
    <div className="hh">
      <Panel title="Budget overview"
             sub={b.total == null ? "Nothing planned for this month yet" : undefined}
             action={
               <span className="fin-scope">
                 <a className="fin-link" href={api.finExportUrl()}>Export CSV</a>
                 <button className="fin-btn ghost" onClick={onEditBudget}>
                   {b.hasBudget ? "Edit budget" : "Set a budget"}
                 </button>
               </span>
             }>
        {b.total == null ? (
          <p className="fc-none">
            Set what the month is meant to cost and every heading below gains a
            limit, a bar and a figure for what is left.
          </p>
        ) : (
          <div className="hh-overview">
            <UsedRing used={b.usedPct} over={b.remaining < 0} />
            <div className="hh-ovfig">
              <strong className="fin-fig">{money.round(b.spent)}</strong>
              <em>of {money.round(b.total)} spent</em>
            </div>
            <div className="hh-ovsplit" aria-hidden="true" />
            <div className="hh-ovfig">
              <strong className={`fin-fig${b.remaining < 0 ? " fe-out" : " fe-good"}`}>
                {money.round(Math.abs(b.remaining))}
              </strong>
              <em>{b.remaining < 0 ? "over the plan" : "remaining"}</em>
            </div>
            <div className="hh-ovfig">
              <strong className={`fin-fig${s.saved < 0 ? " fe-out" : ""}`}>
                {money.round(s.saved)}
              </strong>
              <em>{s.rate == null ? "nothing came in yet" : `kept — ${pct(s.rate)}% of what came in`}</em>
            </div>
          </div>
        )}
      </Panel>

      {b.total != null && (
        <Panel title="Budget by category"
               sub={`${b.categories.length} heading${b.categories.length === 1 ? "" : "s"} · ${monthLabel(period)}`}>
          <div className="fin-tablewrap">
            <table className="fin-table hh-table">
              <thead>
                <tr><th>Category</th><th className="num">Budget</th>
                    <th className="num">Spent</th><th className="num">Remaining</th>
                    <th>Progress</th></tr>
              </thead>
              <tbody>
                {b.categories.map((c) => (
                  <tr key={c.name}
                      className={c.over && c.budget > 0 ? "hh-over"
                        : c.spent > 0 && !c.budget ? "hh-unplanned" : undefined}>
                    <td>
                      <span className="ic-who">
                        <Disc name={c.name} size="sm" />
                        <b>{c.name}</b>
                      </span>
                    </td>
                    <td className="num fin-fig">
                      {c.budget == null ? <span className="fin-dash">—</span> : money.round(c.budget)}
                    </td>
                    <td className="num fin-fig">{money.round(c.spent)}</td>
                    <td className={`num fin-fig${c.over ? " fe-out" : " fe-good"}`}>
                      {c.remaining == null ? <span className="fin-dash">—</span>
                        : c.remaining < 0 ? `−${money.round(-c.remaining)}`
                        : money.round(c.remaining)}
                    </td>
                    <td className="hh-barcell">
                      {c.budget > 0 ? (
                        <>
                          <Bar used={c.usedPct} over={c.over} />
                          <em>{pct(c.usedPct)}%</em>
                        </>
                      ) : (
                        <em className="hh-noplan">no limit set</em>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num fin-fig">{money.round(b.total)}</td>
                  <td className="num fin-fig">{money.round(b.spent)}</td>
                  <td className={`num fin-fig${b.remaining < 0 ? " fe-out" : ""}`}>
                    {b.remaining < 0 ? `−${money.round(-b.remaining)}` : money.round(b.remaining)}
                  </td>
                  <td className="hh-barcell">
                    <Bar used={b.usedPct} over={b.remaining < 0} />
                    <em>{pct(b.usedPct) ?? "—"}%</em>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>
      )}

      {b.total != null && (worst || unplanned.length || tight) && (
        <div className={`hh-note${worst ? " warn" : ""}`}>
          <span className="hh-note-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor"
                 strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 16.5h4" /><path d="M7 13a5 5 0 1 1 6 0c-.6.5-1 1.1-1 1.8h-4c0-.7-.4-1.3-1-1.8Z" />
            </svg>
          </span>
          <span className="hh-note-body">
            {worst ? (
              <>
                <b>
                  You are {pct((worst.spent - worst.budget) / worst.budget)}% over budget
                  on {worst.name.toLowerCase()}.
                </b>
                <em>
                  {money.round(worst.spent - worst.budget)} more than planned
                  {over.length > 1 &&
                    `, and ${over.length - 1} other heading${over.length === 2 ? " is" : "s are"} over too`}.
                  {unplanned.length > 0 &&
                    ` ${money.round(unplanned.reduce((t, c) => t + c.spent, 0))} also went on ` +
                    `${unplanned.length} heading${unplanned.length === 1 ? "" : "s"} with no plan set.`}
                  {" "}Worth adjusting next month's limits.
                </em>
              </>
            ) : unplanned.length ? (
              <>
                <b>
                  {money.round(unplanned.reduce((t, c) => t + c.spent, 0))} went on
                  {" "}{unplanned.length} heading{unplanned.length === 1 ? "" : "s"} with
                  nothing planned for {unplanned.length === 1 ? "it" : "them"}.
                </b>
                <em>
                  {unplanned.slice(0, 3).map((c) => c.name).join(", ")}
                  {unplanned.length > 3 && ` and ${unplanned.length - 3} more`}.
                  Give {unplanned.length === 1 ? "it" : "them"} a limit and the month
                  starts measuring against something.
                </em>
              </>
            ) : (
              <>
                <b>{tight.name} is at {pct(tight.usedPct)}% of its limit.</b>
                <em>{money.round(tight.remaining)} left before it goes over.</em>
              </>
            )}
          </span>
          <button className="fin-link" onClick={() => onGo("expenses")}>View insights →</button>
        </div>
      )}
    </div>
  );
}

// ── Bills and subscriptions ──────────────────────────────────
const stale = (s) => {
  if (!s.lastPaid) return false;
  return (Date.now() - new Date(s.lastPaid)) / (30 * 86400000) >= 2;
};

// A month laid out as a month. Which days money leaves is a spatial question,
// and a table is the wrong shape for it.
function BillCalendar({ bills, money, period }) {
  const [y, m] = period.split("-").map(Number);
  const firstDay = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const byDay = new Map();
  for (const b of bills) {
    if (!b.date.startsWith(period.slice(0, 7))) continue;
    const d = Number(b.date.slice(8, 10));
    byDay.set(d, [...(byDay.get(d) ?? []), b]);
  }
  const cells = [...Array(firstDay).fill(null), ...Array(days).keys()].map(
    (v, i) => (i < firstDay ? null : v + 1)
  );
  return (
    <div className="hh-cal">
      <div className="hh-calhead">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="hh-calgrid">
        {cells.map((d, i) => {
          const on = d ? byDay.get(d) : null;
          const late = on?.some((b) => b.status === "overdue");
          return (
            <div key={i} className={`hh-cell${d ? "" : " empty"}${on ? " has" : ""}${late ? " late" : ""}`}>
              {d && <b>{d}</b>}
              {on?.map((b, j) => (
                <span key={j} className="hh-calbill" title={`${b.name} — ${money.exact(b.amount)}`}>
                  {b.name}
                  <em>{money.round(b.amount)}</em>
                </span>
              ))}
            </div>
          );
        })}
      </div>
      {bills.filter((b) => b.date.startsWith(period.slice(0, 7))).length === 0 && (
        <p className="fc-none">Nothing falls due in {monthLabel(period)}.</p>
      )}
    </div>
  );
}

export function BillsView({ hh, money, period, entity, categories, currency,
                           onUpload, onGo, onChanged, adding, onAdd, onCloseAdd }) {
  const bills = hh.bills;
  const subs = hh.subscriptions;
  const [tab, setTab] = useState("bills");
  const unused = subs.filter(stale);
  const all = useMemo(() => [...bills.overdue, ...bills.upcoming], [bills]);
  const clear = bills.overdue.length === 0;

  return (
    <div className="hh">
      <div className="hh-tabs">
        <span className="fin-scope hh-tabrow">
          <button className={tab === "bills" ? "on" : ""} onClick={() => setTab("bills")}>
            Upcoming bills
          </button>
          <button className={tab === "subs" ? "on" : ""} onClick={() => setTab("subs")}>
            Subscriptions
          </button>
          <button className={tab === "cal" ? "on" : ""} onClick={() => setTab("cal")}>
            Calendar
          </button>
        </span>
        <span className="fin-scope">
          <a className="fin-link" href={api.finExportUrl()}>Export CSV</a>
          <button className="fin-btn ghost" onClick={onUpload}>Upload a bill</button>
          <button className="fin-btn" onClick={onAdd}>+ Add bill</button>
        </span>
      </div>

      {tab === "bills" && (
        <Panel title="Upcoming bills"
               sub={all.length
                 ? `${money.round(bills.total)} agreed to leave in the next six weeks`
                 : undefined}
               action={<button className="fin-link" onClick={() => setTab("cal")}>
                 View calendar →
               </button>}>
          {all.length === 0 ? (
            <p className="fc-none">
              Nothing is agreed to leave in the next six weeks. Upload a bill, or
              add one above, and it appears here.
            </p>
          ) : (
            <div className="fin-tablewrap">
              <table className="fin-table hh-table">
                <thead>
                  <tr><th>Name</th><th className="num">Amount</th><th>Due date</th>
                      <th>How often</th><th>Last paid</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {all.map((x, i) => (
                    <tr key={`${x.commitmentId}-${x.date}-${i}`}>
                      <td>
                        <span className="ic-who">
                          <Disc name={x.categoryName || x.name} size="sm" />
                          <b>{x.name}</b>
                        </span>
                      </td>
                      <td className="num fin-fig fe-out">{money.exact(x.amount)}</td>
                      <td className="fc-date">
                        {dayLabel(x.date)}
                        <em className="hh-when">
                          {x.days < 0 ? `${Math.abs(x.days)} days late`
                            : x.days === 0 ? "today"
                            : `in ${x.days} day${x.days === 1 ? "" : "s"}`}
                        </em>
                      </td>
                      <td>{FREQ[x.frequency] ?? x.frequency}</td>
                      <td className="fc-date">
                        {lastPaidOf(subs, x) ?? <span className="fin-dash">never recorded</span>}
                      </td>
                      <td>
                        <span className={`vm-status s-${x.status}`}>
                          {x.status === "overdue" ? "Overdue" : "Upcoming"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="fc-note">
            A bill is what an agreement says will leave. It reaches the ledger,
            and your spending, when you record it as paid on the Payment schedule.
          </p>
        </Panel>
      )}

      {tab === "subs" && (
        <Panel title="Subscriptions"
               sub={subs.length
                 ? `${money.round(hh.subscriptionsMonthly)} a month, across ${subs.length}`
                 : undefined}
               action={<button className="fin-link" onClick={() => onGo("contracts")}>
                 Manage subscriptions →
               </button>}>
          {subs.length === 0 ? (
            <p className="fc-none">Nothing recurring is on the books.</p>
          ) : (
            <div className="fin-tablewrap">
              <table className="fin-table hh-table">
                <thead>
                  <tr><th>Name</th><th className="num">Amount</th><th>How often</th>
                      <th>Status</th><th>Last paid</th><th className="num">A month</th></tr>
                </thead>
                <tbody>
                  {subs.map((x) => (
                    <tr key={x.id} className={stale(x) ? "hh-stale" : undefined}>
                      <td>
                        <span className="ic-who">
                          <Disc name={x.categoryName || x.name} size="sm" />
                          <b>{x.name}</b>
                        </span>
                      </td>
                      <td className="num fin-fig fe-out">{money.exact(x.amount)}</td>
                      <td>{FREQ[x.frequency] ?? x.frequency}</td>
                      <td>
                        <span className={`hh-live ${stale(x) ? "cold" : "on"}`}>
                          {stale(x) ? "Not paid lately" : "Active"}
                        </span>
                      </td>
                      <td className="fc-date">
                        {dayLabel(x.lastPaid) ?? <span className="fin-dash">never recorded</span>}
                      </td>
                      <td className="num fin-fig">{money.round(x.monthlyEquivalent)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td>Total</td><td /><td /><td /><td />
                      <td className="num fin-fig">{money.round(hh.subscriptionsMonthly)}</td></tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="fc-note">
            "Not paid lately" means nothing has been recorded against it for two
            months. It does not mean it has stopped taking money — only that
            nothing here says it did.
          </p>
        </Panel>
      )}

      {tab === "cal" && (
        <Panel title={`Calendar · ${monthLabel(period)}`}
               sub="Every agreed payment, on the day it falls">
          <BillCalendar bills={all} money={money} period={period} />
        </Panel>
      )}

      <div className={`hh-note${clear ? " good" : " warn"}`}>
        <span className="hh-note-icon" aria-hidden="true">
          {clear ? (
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor"
                 strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10" cy="10" r="7.5" /><path d="M6.5 10.2l2.4 2.4 4.6-4.9" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor"
                 strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10" cy="10" r="7.5" /><path d="M10 6v5" /><path d="M10 13.8v.2" />
            </svg>
          )}
        </span>
        <span className="hh-note-body">
          {clear ? (
            <>
              <b>All bills are on track.</b>
              <em>
                {bills.upcoming.length
                  ? `${bills.upcoming.length} coming up, worth ${money.round(bills.upcoming.reduce((t, x) => t + x.amount, 0))}.`
                  : "Nothing is agreed to leave in the next six weeks."}
                {unused.length > 0 &&
                  ` ${unused.length} subscription${unused.length === 1 ? "" : "s"} has not been paid in two months — ${money.round(unused.reduce((t, s) => t + s.monthlyEquivalent, 0))} a month.`}
              </em>
            </>
          ) : (
            <>
              <b>
                {bills.overdue.length} bill{bills.overdue.length === 1 ? " is" : "s are"} past
                their date.
              </b>
              <em>
                {money.round(bills.overdue.reduce((t, x) => t + x.amount, 0))} outstanding.
                Record them as paid on the Payment schedule, or change the agreement.
              </em>
            </>
          )}
        </span>
        <button className="fin-link" onClick={() => onGo("contracts")}>
          Payment schedule →
        </button>
      </div>

      <Panel title="Where the money comes from"
             sub={`${money.round(hh.income.recurringMonthly)} a month under a standing arrangement`}
             action={<button className="fin-link" onClick={() => onGo("revenue")}>
               Open Income →
             </button>}>
        {hh.income.sources.length === 0 ? (
          <p className="fc-none">
            Nothing recurring is recorded as coming in. Add a salary or a rent on
            the Income page and it appears here.
          </p>
        ) : (
          <div className="fin-tablewrap">
            <table className="fin-table hh-table">
              <thead>
                <tr><th>Source</th><th>What</th><th>How often</th>
                    <th className="num">Each time</th><th className="num">A month</th></tr>
              </thead>
              <tbody>
                {hh.income.sources.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <span className="ic-who">
                        <Disc name={x.categoryName || x.name} size="sm" />
                        <b>{x.name}</b>
                      </span>
                    </td>
                    <td className="ct-what">{x.categoryName || x.description}</td>
                    <td>{FREQ[x.frequency] ?? x.frequency}</td>
                    <td className="num fin-fig fe-in">{money.exact(x.amount)}</td>
                    <td className="num fin-fig fe-in">{money.round(x.monthlyEquivalent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {adding && (
        <div className="fin-modal" role="dialog" aria-label="Add a bill">
          <div className="fin-sheet">
            <header className="fin-sheethead">
              <h2>Add a bill</h2>
              <button className="fin-x" onClick={onCloseAdd} aria-label="Close">×</button>
            </header>
            <CommitmentForm entity={entity} categories={categories} currency={currency}
                            lockDirection="out" hideBooks
                            onAdded={() => { onCloseAdd(); onChanged(); }} />
          </div>
        </div>
      )}
    </div>
  );
}

// A bill row knows its commitment; the subscription list knows when that
// commitment last actually paid. Same figure, read from the one place that
// has it, so the two tabs cannot disagree.
function lastPaidOf(subs, bill) {
  const s = subs.find((x) => x.id === bill.commitmentId);
  return s?.lastPaid ? dayLabel(s.lastPaid) : null;
}
