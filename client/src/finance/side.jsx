import { Panel, Receivables, MultiLine } from "./pieces.jsx";
import { SpendByCategory } from "./spend.jsx";
import { monthLabel, today } from "./format.js";

// ── Revenue and expenses ─────────────────────────────────────
// The same page twice, mirrored, but not identical: money going out is a
// question about burn and what is owed, money coming in is a question about
// who has been billed and who has paid. Both answer how much this month, how
// that compares, where it is concentrated, how much is locked in by an
// agreement, and what lands next.
//
// Fixed against variable is the one classification here that is not a
// judgement call. Fixed means there is a commitment behind it — a contract, a
// retainer, a lease — proved by the dedup key the entry was posted under.
// Everything else is variable. A hand-maintained tag would be wrong within a
// month; this one is derived.

const pct = (v) => (v == null ? null : Math.round(v * 100));

function Delta({ change, invert, bare }) {
  if (change == null) {
    return <span className="sd-flat">{bare ? "—" : "no month before this"}</span>;
  }
  if (Math.abs(change) < 0.005) {
    return <span className="sd-flat">{bare ? "level" : "level with last month"}</span>;
  }
  const up = change > 0;
  const good = invert ? !up : up;
  return (
    <span className={good ? "sd-up" : "sd-down"}>
      {up ? "▲" : "▼"} {Math.abs(Math.round(change * 100))}%{bare ? "" : " vs last month"}
    </span>
  );
}

function Kpi({ label, value, foot, tone, warn }) {
  return (
    <article className={`fc-kpi${warn ? " warn" : ""}`}>
      <header><span>{label}</span></header>
      <p className={`fin-fig${tone ? ` ${tone}` : ""}`}>{value}</p>
      <footer>{foot}</footer>
    </article>
  );
}

// ── Money going out ──────────────────────────────────────────
function Expenses({ sd, money, period }) {
  const b = sd.burn;
  const bills = sd.overdue;
  const insights = expenseInsights(sd, money, period);

  return (
    <>
      <div className="fc-kpis sd-kpis">
        <Kpi label="Expenses recorded" tone="fe-out" value={money.round(sd.thisMonth)}
             foot={<Delta change={sd.change} invert />} />
        <Kpi label="Fixed, under agreement" value={money.round(sd.recurringMonthly)}
             foot="a month, recurring on signed terms" />
        <Kpi label="Variable this month" value={money.round(sd.variable)}
             foot={sd.thisMonth
               ? `${pct(1 - (sd.fixedShare ?? 0))}% of what was recorded`
               : "nothing recorded this month"} />
        <Kpi label="Due out, 30 days" value={money.round(sd.expected.d30)}
             foot="committed, not yet paid" />
        <Kpi label="Late to pay" warn={sd.overdueTotal > 0}
             tone={sd.overdueTotal > 0 ? "fe-out" : null}
             value={money.round(sd.overdueTotal)}
             foot={`${bills.length} past ${bills.length === 1 ? "its" : "their"} date`} />
      </div>

      <div className="ov-band">
        <Panel title="Expenses over time"
               sub="Thirteen months recorded, three months committed">
          {/* Total is drawn last and heavier: in a month where everything was
              variable the two lines sit exactly on top of each other, and
              whichever is drawn first disappears. */}
          <MultiLine points={sd.split} money={money} aheadFrom={firstAhead(sd.split)}
                     series={[
                       { key: "fixed", label: "Under agreement", colour: "#0FA3C7" },
                       { key: "variable", label: "Everything else", colour: "#eda100" },
                       { key: "total", label: "Total", colour: "#5B21B6", weight: 3 },
                     ]} />
        </Panel>
        <Panel title="Where it went" sub={`By category · ${monthLabel(period)}`}>
          <SpendByCategory rows={sd.categories} money={money} period={period}
                           total={sd.categoryTotal} />
        </Panel>
      </div>

      <div className="fin-twocol">
        <Panel title="Top categories" sub={`${monthLabel(period)}, against the month before`}>
          <Ranked rows={sd.ranked} money={money} total={sd.categoryTotal} invert />
          <p className="fc-note">
            There is no budget column because there are no budgets. Set them and
            this becomes budget against actual; until then, last month is the
            only honest comparison.
          </p>
        </Panel>
        <Panel title="Fixed against variable" sub={monthLabel(period)}>
          <div className="sd-fv">
            <div>
              <h5>Under agreement <b className="fin-fig">{money.round(sd.recurringMonthly)}</b></h5>
              {sd.recurring.length === 0 ? (
                <p className="fc-none">Nothing recurring is committed.</p>
              ) : (
                <ul className="ch-costs">
                  {sd.recurring.map((x, i) => (
                    <li key={`${x.description}-${i}`}>
                      <span className="vm-what">
                        <b>{x.counterparty || x.description}</b>
                        <em>{x.frequency}</em>
                      </span>
                      <b className="fin-fig">{money.round(x.monthlyEquivalent)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h5>Everything else <b className="fin-fig">{money.round(sd.variable)}</b></h5>
              {/* Only what no agreement covers. Listing every party here put
                  the contract payments in both columns. */}
              {sd.variableParties.length === 0 ? (
                <p className="fc-none">Everything recorded this month is under an agreement.</p>
              ) : (
                <ul className="ch-costs">
                  {sd.variableParties.map((p) => (
                    <li key={p.name}>
                      <span className="vm-what"><b>{p.name}</b>
                        <em>{p.count} entr{p.count === 1 ? "y" : "ies"}</em></span>
                      <b className="fin-fig">{money.round(p.total)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>
      </div>

      <div className="fin-twocol">
        <Panel title="Upcoming payments"
               sub={`${money.round(sd.upcomingTotal)} agreed in the next 30 days`}>
          <DueTable rows={sd.upcoming} money={money} money_out />
        </Panel>
        <Panel title="Late to pay"
               sub={bills.length
                 ? `${money.round(sd.overdueTotal)} past its agreed date`
                 : "Nothing is past its date"}>
          <DueTable rows={bills} money={money} money_out overdue />
        </Panel>
      </div>

      <div className="fin-twocol">
        <Panel title="What this says" sub="Read off the figures above, nothing modelled">
          {insights.length === 0 ? (
            <p className="fc-none">Nothing stands out this month.</p>
          ) : (
            <ul className="sd-insights">
              {insights.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          )}
        </Panel>
        <Panel title="Monthly burn" sub="What it has been, and what is already agreed">
          <div className="sd-windows">
            <div>
              <span>Average of {b.months} complete month{b.months === 1 ? "" : "s"}</span>
              <strong className="fin-fig">{money.round(b.averageMonth)}</strong>
            </div>
            <div>
              <span>Committed for {monthLabel(b.nextPeriod)}</span>
              <strong className="fin-fig">{money.round(b.nextCommitted)}</strong>
            </div>
          </div>
          <p className="fc-note">
            The average is what recent months actually spent. The figure beside it
            is only what is already agreed for next month — real spending will be
            higher wherever the month buys something no contract covers.
          </p>
        </Panel>
      </div>
    </>
  );
}

// ── Money coming in ──────────────────────────────────────────
function Revenue({ sd, money, period }) {
  const st = sd.stats ?? {};
  const ar = sd.receivables;
  const hasBook = (st.issued ?? 0) > 0 || (ar?.total ?? 0) > 0;
  const insights = revenueInsights(sd, money, period);
  // Invoiced and collected only mean anything where invoices are being kept.
  const points = sd.split.map((m, i) => ({
    ...m,
    invoiced: sd.invoices?.[i]?.invoiced ?? 0,
    collected: sd.invoices?.[i]?.collected ?? 0,
  }));

  return (
    <>
      <div className="fc-kpis sd-kpis">
        <Kpi label="Revenue recorded" tone="fe-in" value={money.round(sd.thisMonth)}
             foot={<Delta change={sd.change} />} />
        <Kpi label="Invoiced this month" value={money.round(st.invoicedTotal ?? 0)}
             foot={st.issued
               ? `${st.issued} invoice${st.issued === 1 ? "" : "s"} raised`
               : "no invoices raised"} />
        <Kpi label="Outstanding" value={money.round(ar?.total ?? 0)}
             foot="issued and not yet settled" />
        <Kpi label="Overdue" warn={(ar?.overdue ?? 0) > 0}
             tone={(ar?.overdue ?? 0) > 0 ? "fe-out" : null}
             value={money.round(ar?.overdue ?? 0)}
             foot={`${(ar?.invoices ?? []).filter((i) => i.daysOverdue > 0).length} past their date`} />
        <Kpi label="Expected in, 30 days" value={money.round(sd.expected.d30)}
             foot="under contract, not yet arrived" />
      </div>

      <Panel title="Revenue and collections"
             sub="Thirteen months recorded, three months under contract">
        <MultiLine points={points} money={money} aheadFrom={firstAhead(sd.split)}
                   height={230}
                   series={hasBook
                     ? [{ key: "total", label: "Recorded" },
                        { key: "invoiced", label: "Invoiced" },
                        { key: "collected", label: "Collected" }]
                     : [{ key: "total", label: "Recorded" }]} />
        {!hasBook && (
          <p className="fc-note">
            Invoiced and collected are not drawn because no invoices are on file.
            Raise one with New invoice and both lines appear.
          </p>
        )}
      </Panel>

      <div className="fc-kpis sd-stats">
        <Kpi label="Invoices issued" value={st.issued ?? 0}
             foot={st.issuedBefore != null
               ? `${st.issuedBefore} the month before`
               : "—"} />
        <Kpi label="Average invoice" value={money.round(st.averageValue ?? 0)}
             foot={st.issued ? `across ${st.issued} raised` : "none raised"} />
        <Kpi label="Collection rate"
             value={st.collectionRate == null ? "—" : `${pct(st.collectionRate)}%`}
             foot={st.collectionRate == null
               ? "nothing invoiced this month"
               : "of this month's invoices, settled"} />
        <Kpi label="Days to collect"
             value={st.daysToCollect == null ? "—" : `${st.daysToCollect}`}
             foot={st.daysToCollect == null
               ? "no invoice settled yet"
               : `mean over ${st.daysToCollectFrom} settled`} />
        <Kpi label="Under contract" value={money.round(sd.recurringMonthly)}
             foot="a month, recurring on signed terms" />
      </div>

      <div className="fin-twocol">
        <Panel title="Outstanding invoices" sub="Issued and not yet settled">
          {ar && ar.total > 0
            ? <Receivables ar={ar} money={money} />
            : <p className="fc-none">Nothing outstanding.</p>}
        </Panel>
        <Panel title="By customer" sub={`${monthLabel(period)} · share of the month`}>
          <PartyTable rows={sd.parties} money={money} label="Customer" isIn />
        </Panel>
      </div>

      <div className="fin-twocol">
        <Panel title="Where it comes from" sub={`By category · ${monthLabel(period)}`}>
          <SpendByCategory rows={sd.categories} money={money} period={period}
                           total={sd.categoryTotal} />
        </Panel>
        <Panel title="Expected to arrive" sub="Under contract, over three windows">
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
                    <b>{u.counterparty || u.description}</b>
                    <em>{u.date}</em>
                  </span>
                  <span className="vm-right">
                    <b className="fin-fig fe-in">{money.round(u.amount)}</b>
                    {u.status === "overdue" && <em className="vm-late">overdue</em>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="fc-note">
            These are dates that were agreed, not a likelihood of collection.
            There is no probability model behind them, so none is shown — an
            agreed date is a fact, a 70% chance would be a guess.
          </p>
        </Panel>
      </div>

      <Panel title="What this says" sub="Read off the figures above, nothing modelled">
        {insights.length === 0 ? (
          <p className="fc-none">Nothing stands out this month.</p>
        ) : (
          <ul className="sd-insights">{insights.map((t, i) => <li key={i}>{t}</li>)}</ul>
        )}
      </Panel>
    </>
  );
}

// ── Shared pieces ────────────────────────────────────────────
const firstAhead = (rows) => rows.find((r) => r.ahead)?.period ?? null;

function Ranked({ rows, money, total, invert }) {
  if (!rows.length) return <p className="fc-none">Nothing recorded this month.</p>;
  return (
    <div className="fin-tablewrap">
      <table className="fin-table sd-table">
        <thead>
          <tr><th>Category</th><th className="num">This month</th>
              <th className="num">Last month</th><th className="num">Change</th>
              <th className="num">Share</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td className="num fin-fig">{money.round(r.total)}</td>
              <td className="num fin-fig sd-was">{money.round(r.lastMonth)}</td>
              <td className="num"><Delta change={r.change} invert={invert} bare /></td>
              <td className="num">{pct(r.share)}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td>Total</td>
              <td className="num fin-fig">{money.round(total)}</td>
              <td /><td /><td className="num">100%</td></tr>
        </tfoot>
      </table>
    </div>
  );
}

function PartyTable({ rows, money, label, isIn }) {
  if (!rows.length) return <p className="fc-none">Nothing recorded this month.</p>;
  return (
    <div className="fin-tablewrap">
      <table className="fin-table sd-table">
        <thead>
          <tr><th>{label}</th><th className="num">Amount</th><th className="num">Share</th></tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.name}>
              <td>{p.name}</td>
              <td className={`num fin-fig ${isIn ? "fe-in" : "fe-out"}`}>{money.exact(p.total)}</td>
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
  );
}

function DueTable({ rows, money, overdue }) {
  if (!rows.length) {
    return <p className="fc-none">
      {overdue ? "Nothing is past its agreed date." : "Nothing falls due in the next 30 days."}
    </p>;
  }
  const days = (d) => Math.round((new Date(today()) - new Date(d)) / 86400000);
  return (
    <div className="fin-tablewrap">
      <table className="fin-table sd-table">
        <thead>
          <tr><th>Who</th><th>What</th><th>Due</th>
              <th className="num">{overdue ? "Late by" : "Amount"}</th>
              {overdue && <th className="num">Amount</th>}</tr>
        </thead>
        <tbody>
          {rows.map((u, i) => (
            <tr key={`${u.commitmentId}-${u.date}-${i}`}>
              <td>{u.counterparty || u.vendor || "—"}</td>
              <td className="ct-what">{u.description}</td>
              <td className="fc-date">{u.date}</td>
              {overdue ? (
                <>
                  <td className="num fe-out">{days(u.date)} days</td>
                  <td className="num fin-fig fe-out">{money.exact(u.amount)}</td>
                </>
              ) : (
                <td className="num fin-fig fe-out">{money.exact(u.amount)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Every line here restates a figure already on the page. None of it is a
// prediction and none of it needs a model — an insight you cannot check
// against the numbers above it is decoration.
function expenseInsights(sd, money, period) {
  const out = [];
  const top = sd.ranked[0];
  if (top) {
    out.push(`${top.name} is the largest heading this month at ${money.round(top.total)}, ` +
             `${pct(top.share)}% of everything recorded.`);
  }
  const jumped = sd.ranked.filter((r) => r.change != null && r.change > 0.2)
                          .sort((a, b) => b.change - a.change)[0];
  if (jumped) {
    out.push(`${jumped.name} is up ${pct(jumped.change)}% on last month — ` +
             `${money.round(jumped.lastMonth)} to ${money.round(jumped.total)}.`);
  }
  if (sd.expected.d30 > 0) {
    out.push(`${money.round(sd.expected.d30)} is agreed to go out in the next 30 days.`);
  }
  if (sd.overdueTotal > 0) {
    out.push(`${money.round(sd.overdueTotal)} is past its agreed date across ` +
             `${sd.overdue.length} payment${sd.overdue.length === 1 ? "" : "s"}.`);
  }
  if (sd.burn.averageMonth && sd.thisMonth > sd.burn.averageMonth * 1.15) {
    out.push(`${monthLabel(period)} is running above the ${money.round(sd.burn.averageMonth)} ` +
             `average of the last ${sd.burn.months} complete months.`);
  }
  return out;
}

function revenueInsights(sd, money, period) {
  const out = [];
  const st = sd.stats ?? {};
  if (sd.change != null && Math.abs(sd.change) >= 0.05) {
    out.push(`Revenue is ${sd.change > 0 ? "up" : "down"} ${Math.abs(pct(sd.change))}% ` +
             `on last month.`);
  }
  const top = sd.parties[0];
  if (top && sd.parties.length > 1) {
    out.push(`${top.name} is ${pct(top.share)}% of the month — the largest single customer.`);
  }
  if ((sd.receivables?.overdue ?? 0) > 0) {
    out.push(`${money.round(sd.receivables.overdue)} of invoiced revenue is past its due date.`);
  }
  if (st.collectionRate != null && st.collectionRate < 0.9 && st.invoicedTotal > 0) {
    out.push(`${pct(st.collectionRate)}% of what was invoiced this month has been collected.`);
  }
  if (sd.expected.d30 > 0) {
    out.push(`${money.round(sd.expected.d30)} is contracted to arrive in the next 30 days.`);
  }
  if (sd.recurringMonthly > 0 && sd.thisMonth > 0) {
    out.push(`${money.round(sd.recurringMonthly)} a month is under a recurring agreement — ` +
             `${pct(Math.min(1, sd.recurringMonthly / sd.thisMonth))}% of this month's revenue.`);
  }
  return out;
}

export function SideView({ sd, money, period }) {
  return sd.direction === "in"
    ? <Revenue sd={sd} money={money} period={period} />
    : <Expenses sd={sd} money={money} period={period} />;
}
