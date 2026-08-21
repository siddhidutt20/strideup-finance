import { Panel, TrendChart, Receivables } from "./pieces.jsx";
import { SpendByCategory } from "./spend.jsx";
import { monthLabel } from "./format.js";

// ── Revenue and expenses ─────────────────────────────────────
// The same page twice, mirrored. Both answer: how much this month, how that
// compares, where it is concentrated, how much of it is locked in by an
// agreement, and what is coming next.
//
// Fixed against variable is the one classification here that is not a
// judgement call. Fixed means there is a commitment behind it — a contract, a
// retainer, a lease. Everything else is variable. A hand-maintained
// fixed/variable tag would be wrong within a month; this one is derived.

const pct = (v) => (v == null ? null : Math.round(v * 100));

function Delta({ change, invert }) {
  if (change == null) return <span className="sd-flat">no month before this</span>;
  const up = change > 0;
  const good = invert ? !up : up;
  if (Math.abs(change) < 0.005) return <span className="sd-flat">level with last month</span>;
  return (
    <span className={good ? "sd-up" : "sd-down"}>
      {up ? "▲" : "▼"} {Math.abs(Math.round(change * 100))}% vs last month
    </span>
  );
}

export function SideView({ sd, money, period, trend }) {
  const isIn = sd.direction === "in";
  const noun = isIn ? "Revenue" : "Expenses";

  return (
    <>
      <div className="fc-kpis sd-kpis">
        <article className="fc-kpi">
          <header><span>{noun} this month</span></header>
          <p className={`fin-fig ${isIn ? "fe-in" : "fe-out"}`}>{money.round(sd.thisMonth)}</p>
          <footer><Delta change={sd.change} invert={!isIn} /></footer>
        </article>
        <article className="fc-kpi">
          <header><span>Of that, against a contract</span></header>
          <p className="fin-fig">{money.round(sd.fixed)}</p>
          <footer>
            {sd.fixedShare == null
              ? "nothing recorded this month"
              : `${pct(sd.fixedShare)}% of what was recorded`}
          </footer>
        </article>
        <article className="fc-kpi">
          <header><span>Everything else</span></header>
          <p className="fin-fig">{money.round(sd.variable)}</p>
          <footer>recorded with no agreement behind it</footer>
        </article>
        <article className="fc-kpi">
          <header><span>Scheduled this month</span></header>
          <p className="fin-fig">{money.round(sd.scheduled)}</p>
          <footer>agreed for this month, still unrecorded</footer>
        </article>
        <article className="fc-kpi">
          <header><span>{isIn ? "Expected in" : "Due out"}, 30 days</span></header>
          <p className="fin-fig">{money.round(sd.expected.d30)}</p>
          <footer>committed, not yet {isIn ? "arrived" : "paid"}</footer>
        </article>
        <article className={`fc-kpi${sd.overdueTotal > 0 ? " warn" : ""}`}>
          <header><span>{isIn ? "Owed to you, late" : "Late to pay"}</span></header>
          <p className={`fin-fig${sd.overdueTotal > 0 ? " fe-out" : ""}`}>
            {money.round(sd.overdueTotal + (isIn ? (sd.receivables?.overdue ?? 0) : 0))}
          </p>
          <footer>
            {sd.overdue.length + (isIn ? (sd.receivables?.invoices ?? [])
              .filter((i) => i.daysOverdue > 0).length : 0)} past their date
          </footer>
        </article>
      </div>

      <Panel title={`${noun} by month`} sub="Thirteen months of what was recorded">
        <TrendChart series={trend} money={money} current={period}
                    only={isIn ? "revenue" : "expenses"} />
      </Panel>

      <div className="fin-twocol">
        <Panel title="Where it comes from" sub={`By category · ${monthLabel(period)}`}>
          <SpendByCategory rows={sd.categories} money={money} period={period}
                           total={sd.categoryTotal} />
        </Panel>
        <Panel title={isIn ? "By customer" : "By supplier"}
               sub={`${monthLabel(period)} · share of the month`}>
          {sd.parties.length === 0 ? (
            <p className="fc-none">Nothing recorded this month.</p>
          ) : (
            <div className="fin-tablewrap">
              <table className="fin-table sd-table">
                <thead>
                  <tr><th>{isIn ? "Customer" : "Supplier"}</th>
                      <th className="num">Amount</th><th className="num">Share</th></tr>
                </thead>
                <tbody>
                  {sd.parties.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td className={`num fin-fig ${isIn ? "fe-in" : "fe-out"}`}>
                        {money.exact(p.total)}
                      </td>
                      <td className="num">
                        <span className="sd-bar">
                          <i style={{ width: `${Math.max(2, pct(p.share))}%` }}
                             className={isIn ? "in" : "out"} />
                        </span>
                        {pct(p.share)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <div className="fin-twocol">
        <Panel title="Under agreement"
               sub={`${money.round(sd.recurringMonthly)} a month, recurring`}>
          {sd.recurring.length === 0 ? (
            <p className="fc-none">
              Nothing recurring is committed on this side. Contracts and retainers
              recorded on Vendor Management appear here.
            </p>
          ) : (
            <ul className="ch-costs">
              {sd.recurring.map((x, i) => (
                <li key={`${x.description}-${i}`}>
                  <span className="vm-what">
                    <b>{x.description}</b>
                    <em>{x.counterparty || x.categoryName || "uncategorised"} · {x.frequency}</em>
                  </span>
                  <b className={`fin-fig ${isIn ? "fe-in" : "fe-out"}`}>
                    {money.round(x.monthlyEquivalent)}
                  </b>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={isIn ? "Expected to arrive" : "Due to go out"}
               sub="Committed money, over three windows">
          <div className="sd-windows">
            {[["30 days", sd.expected.d30], ["60 days", sd.expected.d60],
              ["90 days", sd.expected.d90]].map(([label, v]) => (
              <div key={label}>
                <span>Next {label}</span>
                <strong className="fin-fig">{money.round(v)}</strong>
              </div>
            ))}
          </div>
          {sd.upcoming.length > 0 && (
            <ul className="ch-costs sd-upcoming">
              {sd.upcoming.map((u, i) => (
                <li key={`${u.commitmentId}-${u.date}-${i}`}>
                  <span className="vm-what">
                    <b>{u.description}</b>
                    <em>{u.counterparty || "no party"} · {u.date}</em>
                  </span>
                  <span className="vm-right">
                    <b className={`fin-fig ${isIn ? "fe-in" : "fe-out"}`}>{money.round(u.amount)}</b>
                    {u.status === "overdue" && <em className="vm-late">overdue</em>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="fc-note">
            These are dates that were agreed. Whether one has arrived is recorded on
            Vendor Management, and nothing here is counted as {isIn ? "revenue" : "paid"}
            until it is.
          </p>
        </Panel>
      </div>

      {isIn && sd.receivables && (
        <Panel title="Outstanding invoices" sub="Issued and not yet settled">
          <Receivables ar={sd.receivables} money={money} />
        </Panel>
      )}
    </>
  );
}
