import { useState } from "react";
import { api } from "../api.js";
import { Panel } from "./pieces.jsx";
import { monthLabel } from "./format.js";

// ── A household's month ──────────────────────────────────────
// The same ledger, the same commitments and the same plan the business pages
// read, asked in the words somebody uses about their own money: how much of
// this month have I used, what is about to leave, and what keeps taking money
// every month whether I look or not.

const pct = (v) => (v == null ? null : Math.round(v * 100));

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

function Bar({ used, over }) {
  return (
    <span className="hh-bar">
      <i className={over ? "over" : ""} style={{ width: `${Math.min(100, (used ?? 0) * 100)}%` }} />
    </span>
  );
}

export function BudgetView({ hh, money, period, onEditBudget }) {
  const b = hh.budget;
  const s = hh.savings;
  return (
    <>
      <div className="fc-kpis hh-kpis">
        <article className="fc-kpi">
          <header><span>Money in</span></header>
          <p className="fin-fig fe-in">{money.round(s.income)}</p>
          <footer>recorded in {monthLabel(period, true)}</footer>
        </article>
        <article className="fc-kpi">
          <header><span>Money out</span></header>
          <p className="fin-fig fe-out">{money.round(s.spent)}</p>
          <footer>recorded in {monthLabel(period, true)}</footer>
        </article>
        <article className="fc-kpi">
          <header><span>Left over</span></header>
          <p className={`fin-fig${s.saved < 0 ? " fe-out" : ""}`}>{money.round(s.saved)}</p>
          <footer>
            {s.rate == null ? "nothing came in yet"
              : `${pct(s.rate)}% of what came in`}
          </footer>
        </article>
        <article className={`fc-kpi${b.remaining != null && b.remaining < 0 ? " warn" : ""}`}>
          <header><span>Budget left</span></header>
          <p className={`fin-fig${b.remaining != null && b.remaining < 0 ? " fe-out" : ""}`}>
            {b.total == null ? "—" : money.round(b.remaining)}
          </p>
          <footer>
            {b.total == null ? "no budget set for this month"
              : `of ${money.round(b.total)} planned`}
          </footer>
        </article>
      </div>

      <Panel title={`Budget · ${monthLabel(period)}`}
             sub={b.total == null
               ? "Nothing planned for this month yet"
               : `${money.round(b.spent)} of ${money.round(b.total)} spent`}
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
          <div className="hh-budget">
            <div className="hh-ringwrap">
              <UsedRing used={b.usedPct} over={b.remaining < 0} />
              <span className="hh-ringlabel">
                <b className="fin-fig">{money.round(b.remaining)}</b>
                {b.remaining < 0 ? "over the plan" : "left to spend"}
              </span>
            </div>
            <div className="fin-tablewrap">
              <table className="fin-table hh-table">
                <thead>
                  <tr><th>Heading</th><th className="num">Planned</th>
                      <th className="num">Spent</th><th className="num">Left</th>
                      <th>Used</th></tr>
                </thead>
                <tbody>
                  {b.categories.map((c) => (
                    <tr key={c.name} className={c.over ? "hh-over" : undefined}>
                      <td>{c.name}</td>
                      <td className="num fin-fig">
                        {c.budget == null ? <span className="fin-dash">—</span> : money.round(c.budget)}
                      </td>
                      <td className="num fin-fig">{money.round(c.spent)}</td>
                      <td className={`num fin-fig${c.over ? " fe-out" : ""}`}>
                        {c.remaining == null ? <span className="fin-dash">—</span>
                          : money.round(c.remaining)}
                      </td>
                      <td className="hh-barcell">
                        <Bar used={c.usedPct} over={c.over} />
                        <em>{c.usedPct == null ? "—" : `${pct(c.usedPct)}%`}</em>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>
    </>
  );
}

export function BillsView({ hh, money, period, onUpload, onGo }) {
  const bills = hh.bills;
  const subs = hh.subscriptions;
  const [tab, setTab] = useState("bills");
  const stale = (s) => {
    if (!s.lastPaid) return false;
    const months = (Date.now() - new Date(s.lastPaid)) / (30 * 86400000);
    return months >= 2;
  };
  const unused = subs.filter(stale);

  return (
    <>
      <div className="fc-kpis hh-kpis">
        <article className={`fc-kpi${bills.overdue.length ? " warn" : ""}`}>
          <header><span>Past its date</span></header>
          <p className={`fin-fig${bills.overdue.length ? " fe-out" : ""}`}>
            {money.round(bills.overdue.reduce((t, b) => t + b.amount, 0))}
          </p>
          <footer>{bills.overdue.length} bill{bills.overdue.length === 1 ? "" : "s"}</footer>
        </article>
        <article className="fc-kpi">
          <header><span>Due next</span></header>
          <p className="fin-fig">
            {money.round(bills.upcoming.reduce((t, b) => t + b.amount, 0))}
          </p>
          <footer>{bills.upcoming.length} coming up</footer>
        </article>
        <article className="fc-kpi">
          <header><span>Subscriptions</span></header>
          <p className="fin-fig">{money.round(hh.subscriptionsMonthly)}</p>
          <footer>a month, across {subs.length}</footer>
        </article>
        <article className={`fc-kpi${unused.length ? " warn" : ""}`}>
          <header><span>Not used lately</span></header>
          <p className="fin-fig">{unused.length}</p>
          <footer>
            {unused.length
              ? `${money.round(unused.reduce((t, s) => t + s.monthlyEquivalent, 0))} a month`
              : "everything has been paid recently"}
          </footer>
        </article>
      </div>

      <Panel title="Bills and subscriptions"
             sub="What is agreed to leave, and what keeps taking money every month"
             action={
               <span className="fin-scope">
                 <button className={tab === "bills" ? "on" : ""}
                         onClick={() => setTab("bills")}>Bills</button>
                 <button className={tab === "subs" ? "on" : ""}
                         onClick={() => setTab("subs")}>Subscriptions</button>
                 <a className="fin-link" href={api.finExportUrl()}>Export CSV</a>
                 <button className="fin-btn ghost" onClick={onUpload}>Upload a bill</button>
               </span>
             }>
        {tab === "bills" ? (
          [...bills.overdue, ...bills.upcoming].length === 0 ? (
            <p className="fc-none">
              Nothing is agreed to leave in the next six weeks. Upload a bill, or
              add it on the Payment schedule, and it appears here.
            </p>
          ) : (
            <div className="fin-tablewrap">
              <table className="fin-table hh-table">
                <thead>
                  <tr><th>Who</th><th>What</th><th>Due</th><th>Status</th>
                      <th className="num">Amount</th></tr>
                </thead>
                <tbody>
                  {[...bills.overdue, ...bills.upcoming].map((x, i) => (
                    <tr key={`${x.commitmentId}-${x.date}-${i}`}>
                      <td>{x.name}</td>
                      <td className="ct-what">{x.categoryName || x.description}</td>
                      <td className="fc-date">
                        {x.date}
                        <em className="hh-when">
                          {x.days < 0 ? `${Math.abs(x.days)} days late`
                            : x.days === 0 ? "today"
                            : `in ${x.days} day${x.days === 1 ? "" : "s"}`}
                        </em>
                      </td>
                      <td>
                        <span className={`vm-status s-${x.status}`}>
                          {x.status === "overdue" ? "Overdue" : "Due"}
                        </span>
                      </td>
                      <td className="num fin-fig fe-out">{money.exact(x.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : subs.length === 0 ? (
          <p className="fc-none">Nothing recurring is on the books.</p>
        ) : (
          <div className="fin-tablewrap">
            <table className="fin-table hh-table">
              <thead>
                <tr><th>What</th><th>How often</th><th>Last paid</th>
                    <th className="num">Each time</th><th className="num">A month</th></tr>
              </thead>
              <tbody>
                {subs.map((x) => (
                  <tr key={x.id} className={stale(x) ? "hh-stale" : undefined}>
                    <td>
                      {x.name}
                      {stale(x) && <span className="fc-dupetag">not paid in 2 months</span>}
                    </td>
                    <td>{x.frequency}</td>
                    <td className="fc-date">
                      {x.lastPaid || <span className="fin-dash">never recorded</span>}
                    </td>
                    <td className="num fin-fig">{money.exact(x.amount)}</td>
                    <td className="num fin-fig">{money.round(x.monthlyEquivalent)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td>Total</td><td /><td /><td />
                    <td className="num fin-fig">{money.round(hh.subscriptionsMonthly)}</td></tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="fc-note">
          A bill is what an agreement says will leave. It reaches the ledger, and
          your spending, when you record it as paid on the Payment schedule.
        </p>
      </Panel>

      <Panel title="Where the money comes from"
             sub={`${money.round(hh.income.recurringMonthly)} a month under a standing arrangement`}>
        {hh.income.sources.length === 0 ? (
          <p className="fc-none">
            Nothing recurring is recorded as coming in. Add a salary or a rent on
            the Forecast page and it appears here.
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
                    <td>{x.name}</td>
                    <td className="ct-what">{x.categoryName || x.description}</td>
                    <td>{x.frequency}</td>
                    <td className="num fin-fig fe-in">{money.exact(x.amount)}</td>
                    <td className="num fin-fig fe-in">{money.round(x.monthlyEquivalent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
