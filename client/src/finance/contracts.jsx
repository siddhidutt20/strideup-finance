import { useState } from "react";
import { Panel } from "./pieces.jsx";
import { api } from "../api.js";
import { monthLabel, today } from "./format.js";

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

function Cell({ row, cell, money, onToggle, busy }) {
  if (!cell.occurrences.length) return <td className="ct-cell empty"><span>—</span></td>;
  return (
    <td className="ct-cell">
      {cell.occurrences.map((o) => (
        <button key={o.date} className={`ct-chip ${o.status}`} disabled={busy}
                title={o.status === "paid"
                  ? `Recorded as paid ${o.paidDate || o.date} — click to undo`
                  : `Due ${o.date} — click to record it as paid`}
                onClick={() => onToggle(row, o)}>
          <i aria-hidden="true" />
          <span className="ct-chipamt">{money.round(o.amount)}</span>
          <em>{LABEL[o.status]}</em>
        </button>
      ))}
    </td>
  );
}

export function ContractsView({ sched, money, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ask, setAsk] = useState(null);

  const toggle = async (row, occ) => {
    setError("");
    if (occ.status === "paid") {
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

  return (
    <>
      <div className="fc-kpis">
        <article className="fc-kpi">
          <header><span>Arrived this month</span></header>
          <p className="fin-fig fe-in">{money.round(t.paidIn)}</p>
          <footer>from contracts, recorded in the ledger</footer>
        </article>
        <article className="fc-kpi">
          <header><span>Still due this month</span></header>
          <p className="fin-fig">{money.round(t.dueIn)}</p>
          <footer>agreed, not yet arrived</footer>
        </article>
        <article className={`fc-kpi${(t.overdueIn + arrears.in) > 0 ? " warn" : ""}`}>
          <header><span>Late</span></header>
          <p className={`fin-fig${(t.overdueIn + arrears.in) > 0 ? " fe-out" : ""}`}>
            {money.round(t.overdueIn + arrears.in)}
          </p>
          <footer>past its date with nothing recorded</footer>
        </article>
        <article className="fc-kpi">
          <header><span>Going out this month</span></header>
          <p className="fin-fig fe-out">{money.round(t.dueOut + t.overdueOut)}</p>
          <footer>{money.round(t.paidOut)} already paid</footer>
        </article>
      </div>

      {error && <div className="fin-error">{error}</div>}

      <Panel title="Contracts and commitments"
             sub="Every agreed payment, month by month. Click a cell to record that it arrived.">
        {sched.rows.length === 0 ? (
          <p className="fc-none">
            Nothing committed yet. Add a contract, a retainer, a rent or an EMI on
            the Forecast page and it appears here.
          </p>
        ) : (
          <div className="fin-tablewrap">
            <table className="fin-table ct-table">
              <thead>
                <tr>
                  <th className="ct-who">Contract</th>
                  {sched.periods.map((p) => (
                    <th key={p} className={`num${p === sched.period ? " now" : ""}`}>
                      {monthLabel(p, true)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sched.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="ct-who">
                      {row.months.every((m) => !m.occurrences.length) && (
                        <span className="ct-outside">nothing due in these months</span>
                      )}
                      <span className={`fc-dir ${row.direction}`}>
                        {row.direction === "in" ? "In" : "Out"}
                      </span>
                      {row.description}
                      <span className="fc-cat">
                        {row.counterparty || "no party recorded"} · {money.exact(row.amount)}
                      </span>
                    </td>
                    {row.months.map((cell) => (
                      <Cell key={cell.period} row={row} cell={cell} money={money}
                            onToggle={toggle} busy={busy} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="fc-note">
          A contract is agreed the day it is signed, owed on each due date, and
          yours when it arrives. Recording a payment here writes it into the ledger
          for the month it actually arrived — which is what moves your revenue, your
          cash and your P&L. Until then it stays committed and counts toward none of
          them.
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
