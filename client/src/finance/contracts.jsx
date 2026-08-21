import { useState } from "react";
import { Panel } from "./pieces.jsx";
import { api } from "../api.js";
import { monthLabel, today } from "./format.js";
import { FREQ_LABEL } from "./forecast.jsx";

// ── Contracts ────────────────────────────────────────────────
// One row per commitment, one cell per month, so the question "has this
// client actually paid this month" is answered by looking rather than by
// reconciling.
//
// The important thing this view does is keep three states apart that are easy
// to blur together: agreed, owed, and arrived. A contract is agreed the day it
// is signed; a payment is owed on its due date; the money is only yours when
// it arrives. Marking a cell paid is what moves it from the second to the
// third — and that is the click that writes a real ledger entry.

const LABEL = { paid: "Paid", due: "Due", overdue: "Overdue", waived: "Waived" };


export function ContractsView({ sched, money, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ask, setAsk] = useState(null);

  const toggle = async (row, occ) => {
    setError("");
    if (occ.status === "paid" || occ.status === "partial") {
      setBusy(true);
      try { await api.unmarkPaid(row.id, occ.date); onChange(); }
      catch (e) { setError(e.message || "Could not undo that."); }
      finally { setBusy(false); }
      return;
    }
    // Ask for the date and amount, because "it arrived" is rarely exactly the
    // due date and is not always exactly the amount.
    setAsk({ row, occ, paidDate: occ.date > today() ? today() : occ.date,
             amount: (occ.amount / 100).toFixed(2) });
  };

  const confirm = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api.markPaid(ask.row.id, {
        dueDate: ask.occ.date,
        paidDate: ask.paidDate,
        amount: Number(ask.amount),
      });
      setAsk(null); onChange();
    } catch (err) {
      setError(err.message || "Could not record that.");
    } finally { setBusy(false); }
  };

  const t = sched.tally;
  const arrears = sched.arrears;
  // Late is this month's missed dates plus everything still unpaid from before
  // it. Arrears on the money-out side were computed and never shown.
  const lateIn = sched.tally.overdueIn + arrears.in;
  const lateOut = sched.tally.overdueOut + arrears.out;

  // One line per payment falling due in the month being looked at. A contract
  // with twelve monthly installments has exactly one line here, not twelve —
  // the month picker is what answers "and what about July".
  const focus = sched.focus || sched.period;
  const rows = [];
  for (const row of sched.rows) {
    const cell = row.months.find((m) => m.period === focus);
    if (!cell) continue;
    const name = row.counterparty || "Unattributed";
    // Strip the party name the ingest prefixes onto each commitment, so the
    // line reads "Monthly platform fee" beside a column that already says who.
    const label = row.description.startsWith(`${name} — `)
      ? row.description.slice(name.length + 3)
      : row.description;
    for (const occ of cell.occurrences) rows.push({ ...row, label, occ });
  }
  rows.sort((a, b) =>
    a.occ.date.localeCompare(b.occ.date) || a.label.localeCompare(b.label));

  return (
    <>
      {/* Six figures, three a side. The row used to read arrived / still due /
          late / going out, where the first three counted only money coming IN
          and the fourth quietly folded an overdue payment in with the ones
          still ahead. A payment you are late paying showed as $0 late while
          the table beside it said Overdue, and arrears you owed from earlier
          months appeared nowhere at all. Each side now says the same three
          things, and says which side it means. */}
      <div className="fc-kpis ct-kpis">
        <article className="fc-kpi">
          <header><span>Arrived this month</span></header>
          <p className="fin-fig fe-in">{money.round(t.paidIn)}</p>
          <footer>from contracts, recorded in the ledger</footer>
        </article>
        <article className="fc-kpi">
          <header><span>Still to arrive</span></header>
          <p className="fin-fig">{money.round(t.dueIn)}</p>
          <footer>owed to you, date not reached</footer>
        </article>
        <article className={`fc-kpi${lateIn > 0 ? " warn" : ""}`}>
          <header><span>Late to arrive</span></header>
          <p className={`fin-fig${lateIn > 0 ? " fe-out" : ""}`}>{money.round(lateIn)}</p>
          <footer>
            owed to you, past its date
            {arrears.in > 0 && ` · ${money.round(arrears.in)} from earlier months`}
          </footer>
        </article>
        <article className="fc-kpi">
          <header><span>Paid out this month</span></header>
          <p className="fin-fig fe-out">{money.round(t.paidOut)}</p>
          <footer>settled against a contract</footer>
        </article>
        <article className="fc-kpi">
          <header><span>Still to pay</span></header>
          <p className="fin-fig">{money.round(t.dueOut)}</p>
          <footer>you owe it, date not reached</footer>
        </article>
        <article className={`fc-kpi${lateOut > 0 ? " warn" : ""}`}>
          <header><span>Late to pay</span></header>
          <p className={`fin-fig${lateOut > 0 ? " fe-out" : ""}`}>{money.round(lateOut)}</p>
          <footer>
            you owe it, past its date
            {arrears.out > 0 && ` · ${money.round(arrears.out)} from earlier months`}
          </footer>
        </article>
      </div>

      {error && <div className="fin-error">{error}</div>}

      <Panel title={`Due in ${monthLabel(sched.focus || sched.period)}`}
             sub="Click a payment to record that it arrived">
        {rows.length === 0 ? (
          <p className="fc-none">
            Nothing falls due in {monthLabel(sched.focus || sched.period)}. Use the
            month picker to look at another month.
          </p>
        ) : (
          <div className="fin-tablewrap">
            <table className="fin-table ct-month">
              <thead>
                <tr>
                  <th>Party</th><th>What</th><th>Due</th><th>Status</th>
                  <th className="num">Amount</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.id}-${r.occ.date}`}>
                    <td>
                      <span className={`fc-dir ${r.direction}`}>
                        {r.direction === "in" ? "In" : "Out"}
                      </span>
                      {r.counterparty || "Unattributed"}
                    </td>
                    <td className="ct-what">{r.label}</td>
                    <td className="fc-date">{r.occ.date}</td>
                    <td>
                      <span className={`vm-status s-${r.occ.status}`}>
                        {LABEL[r.occ.status]}
                      </span>
                      {r.occ.status === "partial" && (
                        <em className="ct-part">
                          {money.round(r.occ.paid)} of {money.round(r.occ.scheduled)}
                        </em>
                      )}
                    </td>
                    <td className={`num fin-fig ${r.direction === "in" ? "fe-in" : "fe-out"}`}>
                      {money.exact(r.occ.status === "paid" ? r.occ.paid : r.occ.outstanding)}
                    </td>
                    <td className="iv-actions">
                      <button className="vm-rec" disabled={busy}
                              onClick={() => toggle(r, r.occ)}>
                        {r.occ.status === "paid" || r.occ.status === "partial"
                          ? "Undo" : "Record"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="fc-note">
          A contract is agreed the day it is signed, owed on each due date, and yours
          when it arrives. Recording a payment here writes it into the ledger for the
          month it actually arrived — which is what moves your revenue, your cash and
          your P&L. Until then it stays committed and counts toward none of them.
        </p>
      </Panel>

      {ask && (
        <div className="ct-modal" role="dialog" aria-modal="true" aria-label="Record a payment">
          <form className="ct-dialog" onSubmit={confirm}>
            <h3>Record this as arrived</h3>
            <p className="ct-dialogsub">
              {ask.row.description}
              {ask.row.counterparty ? ` · ${ask.row.counterparty}` : ""} · due {ask.occ.date}
            </p>
            <label>
              <span>When did it arrive</span>
              <input type="date" value={ask.paidDate} required
                     onChange={(e) => setAsk((a) => ({ ...a, paidDate: e.target.value }))} />
            </label>
            <label>
              <span>How much actually arrived</span>
              <input type="number" step="0.01" min="0.01" value={ask.amount} required
                     onChange={(e) => setAsk((a) => ({ ...a, amount: e.target.value }))} />
            </label>
            <p className="ct-dialognote">
              This writes a {ask.row.direction === "in" ? "revenue" : "an expense"} entry
              dated {ask.paidDate}. If that month is closed it posts to the open month
              as an adjustment instead.
            </p>
            <div className="ct-dialogactions">
              <button type="button" className="fin-btn ghost" onClick={() => setAsk(null)}>
                Cancel
              </button>
              <button className="fin-btn" disabled={busy}>
                {busy ? "Recording…" : "It arrived"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
