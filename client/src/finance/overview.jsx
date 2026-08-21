import { Panel, TrendChart, Receivables } from "./pieces.jsx";
import { SpendByCategory } from "./spend.jsx";
import { monthLabel } from "./format.js";

// ── The overview ─────────────────────────────────────────────
// Everything here exists in more detail elsewhere. This page answers "how
// are we doing" without a follow-up question, and every figure is computed
// by the same function the detail page uses — so clicking through can never
// show you a different number for the same thing.

const pct = (v) => (v == null ? null : Math.round(v * 100));

function Change({ v, invert }) {
  if (v == null) return <span className="sd-flat">no month before this</span>;
  if (Math.abs(v) < 0.005) return <span className="sd-flat">level with last month</span>;
  const up = v > 0, good = invert ? !up : up;
  return (
    <span className={good ? "sd-up" : "sd-down"}>
      {up ? "▲" : "▼"} {Math.abs(pct(v))}% vs last month
    </span>
  );
}

function Alerts({ alerts, onGo }) {
  if (!alerts.length) {
    return (
      <p className="fc-none">
        Nothing is flagged. No month goes below zero on what is agreed, no large
        payment is late, and no agreement ends in the next two months.
      </p>
    );
  }
  const goes = { runway: "cashflow", zero: "forecast", payment: "vendors",
                 contract: "vendors", receivable: "revenue" };
  const label = { runway: "Cash flow", zero: "Forecast", payment: "Vendors",
                  contract: "Vendors", receivable: "Revenue" };
  return (
    <ul className="ch-alerts">
      {alerts.map((a, i) => (
        <li key={`${a.kind}-${i}`} className={`t-${a.tone}`}>
          <span className="ch-alerticon" aria-hidden="true">
            {a.tone === "warning" ? "i" : "!"}
          </span>
          <span className="ch-alerttext">
            <b>{a.title}</b>
            <em>{a.detail}</em>
          </span>
          <button className="vm-rec" onClick={() => onGo(goes[a.kind] || "cashflow")}>
            {label[a.kind] || "Look"}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Ageing({ ar, money }) {
  const b = ar.buckets;
  const bands = [
    ["Current", b.current, "ag-ok"],
    ["1–30 days", b.d1_30, "ag-warn"],
    ["31–60 days", b.d31_60, "ag-bad"],
    ["61–90 days", b.d61_90, "ag-bad"],
    ["90+ days", b.d90plus, "ag-worst"],
  ].filter(([, v]) => v > 0);
  if (!ar.total) return <p className="fc-none">Nothing outstanding.</p>;
  return (
    <>
      <div className="ov-bar" role="img" aria-label="Outstanding by age">
        {bands.map(([label, v, cls]) => (
          <span key={label} className={cls} title={`${label}: ${money.round(v)}`}
                style={{ flexGrow: v }} />
        ))}
      </div>
      <ul className="ov-ageing">
        {bands.map(([label, v, cls]) => (
          <li key={label}>
            <i className={cls} aria-hidden="true" />
            <span>{label}</span>
            <b className="fin-fig">{money.round(v)}</b>
            <em>{pct(v / ar.total)}%</em>
          </li>
        ))}
      </ul>
    </>
  );
}

export function OverviewDash({ ov, money, period, onGo }) {
  const r = ov.runway;
  const trend = ov.trend.slice(-7);

  return (
    <>
      <div className="fc-kpis ov-kpis">
        <article className="fc-kpi">
          <header><span>Cash today</span></header>
          <p className="fin-fig">{money.round(ov.cash.amount)}</p>
          <footer>{ov.cash.source === "bank" ? "from your bank feed" : "everything recorded"}</footer>
        </article>
        <article className="fc-kpi">
          <header><span>Revenue this month</span></header>
          <p className="fin-fig fe-in">{money.round(ov.revenue)}</p>
          <footer><Change v={ov.revenueChange} /></footer>
        </article>
        <article className="fc-kpi">
          <header><span>Expenses this month</span></header>
          <p className="fin-fig fe-out">{money.round(ov.expenses)}</p>
          <footer><Change v={ov.expensesChange} invert /></footer>
        </article>
        <article className="fc-kpi">
          <header><span>Net this month</span></header>
          <p className={`fin-fig${ov.net < 0 ? " fe-out" : ""}`}>{money.round(ov.net)}</p>
          <footer><Change v={ov.netChange} /></footer>
        </article>
        <article className="fc-kpi">
          <header><span>Committed, 90 days</span></header>
          <p className={`fin-fig${ov.expectedIn90 < 0 ? " fe-out" : ""}`}>
            {money.round(ov.expectedIn90)}
          </p>
          <footer>
            {ov.expectedIn90Expected != null
              ? `${money.round(ov.expectedIn90Expected)} with the estimate`
              : "agreed money only"}
          </footer>
        </article>
        <article className={`fc-kpi${r.burning && r.current != null && r.current < 3 ? " warn" : ""}`}>
          <header><span>Runway</span></header>
          <p className="fin-fig">
            {r.burning && r.current != null ? `${r.current.toFixed(1)} mo` : "—"}
          </p>
          <footer>
            {r.burning ? `${money.round(r.monthlyBurn)} a month of net burn`
                       : "not burning"}
          </footer>
        </article>
      </div>

      <div className="ov-band">
        <Panel title="Cash, recorded and committed"
               sub="Thirteen months behind, and what is agreed ahead">
          <TrendChart series={trend} money={money} current={period} />
        </Panel>
        <Panel title="Needs attention" sub="Conditions that are true right now">
          <Alerts alerts={ov.alerts} onGo={onGo} />
        </Panel>
      </div>

      <div className="ov-band3">
        <Panel title="Where the money went" sub={`Expenses · ${monthLabel(period)}`}>
          <SpendByCategory rows={ov.expensesByCategory} money={money} period={period}
                           total={ov.expenseTotal} />
        </Panel>
        <Panel title="Outstanding" sub="Invoices raised and not yet settled">
          <div className="ov-quad">
            <div><span>Total</span><b className="fin-fig">{money.round(ov.receivables.total)}</b></div>
            <div><span>Overdue</span>
              <b className={`fin-fig${ov.receivables.overdue > 0 ? " fe-out" : ""}`}>
                {money.round(ov.receivables.overdue)}
              </b></div>
          </div>
          <Ageing ar={ov.receivables} money={money} />
        </Panel>
        <Panel title="Monthly burn" sub={`Averaged over ${ov.burn.recentMonths} complete months`}>
          <div className="ov-quad">
            <div><span>Under agreement</span>
              <b className="fin-fig">{money.round(ov.burn.fixedMonthly)}</b></div>
            <div><span>Everything else</span>
              <b className="fin-fig">{money.round(ov.burn.variableMonthly)}</b></div>
            <div className="ov-quad-total"><span>Total each month</span>
              <b className="fin-fig">{money.round(ov.burn.total)}</b></div>
          </div>
          <p className="fc-note">
            The committed part is what recurs under an agreement. The rest is what
            recent months actually spent beyond it — an average, not a promise.
          </p>
        </Panel>
      </div>

      <Panel title="Coming up" sub={`${money.round(ov.upcomingTotal)} due in the next 30 days`}>
        {ov.upcoming.length === 0 ? (
          <p className="fc-none">Nothing falls due in the next 30 days.</p>
        ) : (
          <div className="fin-tablewrap">
            <table className="fin-table">
              <thead>
                <tr><th>Party</th><th>What</th><th>Due</th><th>Status</th>
                    <th className="num">Amount</th></tr>
              </thead>
              <tbody>
                {ov.upcoming.map((u, i) => (
                  <tr key={`${u.commitmentId}-${u.date}-${i}`}>
                    <td>
                      <span className={`fc-dir ${u.direction}`}>
                        {u.direction === "in" ? "In" : "Out"}
                      </span>
                      {u.vendor}
                    </td>
                    <td className="ct-what">{u.description}</td>
                    <td className="fc-date">{u.date}</td>
                    <td><span className={`vm-status s-${u.status}`}>
                      {u.status === "overdue" ? "Overdue" : "Due"}
                    </span></td>
                    <td className={`num fin-fig ${u.direction === "in" ? "fe-in" : "fe-out"}`}>
                      {money.exact(u.amount)}
                    </td>
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
