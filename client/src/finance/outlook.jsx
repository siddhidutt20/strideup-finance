import { Panel, Stat, MultiLine } from "./pieces.jsx";
import { monthLabel } from "./format.js";

// ── What the next few months look like ───────────────────────
// Everything on this page comes from agreements that already exist. Nothing is
// predicted, nothing is a trend line through last year's spending: if it is
// drawn here, something in the ledger says it is going to happen. That is a
// narrower claim than most forecasts make, and the reason it is worth reading.
//
// The one number that is not a certainty is the estimate of everything else —
// the shopping and the petrol that no agreement covers. It is kept on its own
// line and labelled, never folded into the committed figure.

const FREQ = {
  weekly: "every week", monthly: "every month",
  quarterly: "every quarter", annual: "once a year", once: "one off",
};

function Repeats({ rows, money, empty }) {
  if (!rows.length) return <p className="fc-none">{empty}</p>;
  return (
    <ul className="ol-list">
      {rows.map((r) => (
        <li key={r.id}>
          <span className="ol-what">
            <b>{r.description}</b>
            <em>
              {r.counterparty ? `${r.counterparty} · ` : ""}
              {FREQ[r.frequency] ?? r.frequency}
              {r.endDate && ` · ends ${monthLabel(`${r.endDate.slice(0, 7)}-01`, true)}`}
            </em>
          </span>
          <span className="ol-amt">
            <b className={r.direction === "in" ? "fe-in" : "fe-out"}>
              {money.round(r.perMonth)}
            </b>
            {/* A quarterly bill is a monthly problem three months at a time.
                Where the two differ, say both — otherwise the column looks
                like it disagrees with the bill. */}
            {r.perMonth !== r.amount && (
              <em>{money.round(r.amount)} {FREQ[r.frequency] ?? r.frequency}</em>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function OutlookView({ ol, money, period, onGo }) {
  const rows = ol.months ?? [];
  const last = rows[rows.length - 1];
  const rep = ol.repeating;
  const est = ol.prediction?.available;

  const points = rows.map((m) => ({
    period: m.period,
    balance: m.closing,
    ...(est ? { expected: m.expected } : {}),
  }));

  return (
    <div className="ol">
      <div className="fc-kpis ol-kpis">
        <Stat tone="cash" icon="cash" label="Cash today" value={money.round(ol.opening)}
              negative={ol.opening < 0}>
          {ol.openingSource === "bank" ? "from your bank feed" : "everything recorded so far"}
        </Stat>
        <Stat tone="in" icon="in" label="Arrives every month" value={money.round(rep.inPerMonth)}>
          {rep.in.length
            ? `${rep.in.length} standing arrangement${rep.in.length === 1 ? "" : "s"}`
            : "nothing arrives on a schedule"}
        </Stat>
        <Stat tone="out" icon="out" label="Leaves every month" value={money.round(rep.outPerMonth)}
              negative>
          {rep.out.length
            ? `${rep.out.length} bill${rep.out.length === 1 ? "" : "s"} and subscription${rep.out.length === 1 ? "" : "s"}`
            : "nothing leaves on a schedule"}
        </Stat>
        <Stat tone="save" icon="net" label={`Where you land, ${monthLabel(ol.lastPeriod, true)}`}
              value={money.round(last?.closing ?? ol.opening)}
              negative={(last?.closing ?? 0) < 0}>
          {rep.netPerMonth >= 0
            ? `${money.round(rep.netPerMonth)} a month spare, on what is agreed`
            : `${money.round(Math.abs(rep.netPerMonth))} a month short, on what is agreed`}
        </Stat>
      </div>

      <div className="ov-band">
        <Panel title="What you are left with, month by month"
               sub={`${monthLabel(rows[0]?.period ?? period)} to ${monthLabel(ol.lastPeriod)} — agreed money only`}>
          <MultiLine points={points} money={money} aheadFrom={null} height={230}
                     series={[
                       { key: "balance", label: "On what is agreed", colour: "#5B21B6" },
                       ...(est ? [{ key: "expected", label: "With everything else estimated",
                                    colour: "#0A7E96" }] : []),
                     ]} />
          <p className="fc-note">
            Only money an agreement already commits. Everyday spending that no bill
            covers is not in the purple line
            {est ? " — the teal one adds an estimate of it from your own recent months." : "."}
          </p>
        </Panel>

        <div className="ov-stack">
          <Panel title="When something stops"
                 sub={ol.ending.length
                   ? `${money.round(ol.endingFrees)} a month comes back`
                   : "Nothing ends in this window"}>
            {ol.ending.length === 0 ? (
              <p className="fc-none">
                Every agreement runs past {monthLabel(ol.lastPeriod)}. Give a bill an
                end date and the month it stops shows up here.
              </p>
            ) : (
              <ul className="ol-ends">
                {ol.ending.map((r) => (
                  <li key={r.id}>
                    <span>
                      <b>{r.description}</b>
                      <em>last payment {monthLabel(`${r.endDate.slice(0, 7)}-01`)}</em>
                    </span>
                    <b className="fe-good">+{money.round(r.perMonth)}<i>/mo</i></b>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {ol.loanPayments.length > 0 && (
            <Panel title="Loan payments on record"
                   sub={`${money.round(ol.loanPaymentTotal)} a month`}
                   action={<button className="fin-link" onClick={() => onGo("wealth")}>
                     Open Wealth →
                   </button>}>
              <ul className="ol-ends">
                {ol.loanPayments.map((d) => (
                  <li key={d.id}>
                    <span>
                      <b>{d.name}</b>
                      <em>{d.ratePct != null ? `${d.ratePct}% · ` : ""}
                        {money.round(d.balance)} still owed</em>
                    </span>
                    <b className="fe-out">{money.round(d.monthlyPayment)}<i>/mo</i></b>
                  </li>
                ))}
              </ul>
              {/* A payment written against a debt says what you intend to pay.
                  A bill says what leaves and when. Only the second can be put
                  on a month, so only the second is projected — and guessing
                  that a loan and a bill of the same size are the same thing
                  would count it twice. */}
              <p className="fc-note">
                These are not in the projection above. A figure on a debt says what
                you plan to pay; a bill says what leaves and when. Add each one under
                <b> Bills</b> to see it land in a month.
              </p>
            </Panel>
          )}
        </div>
      </div>

      <div className="ov-band3">
        <Panel title="Month by month" sub="What is agreed to move, and where it leaves you">
          <div className="fin-tablewrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">In</th>
                  <th className="num">Out</th>
                  <th className="num">Left</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.period}>
                    <td>
                      {monthLabel(m.period, true)}
                      {m.partial && <em className="ol-part"> rest of the month</em>}
                    </td>
                    <td className="num fin-fig fe-in">{money.round(m.committedIn)}</td>
                    <td className="num fin-fig fe-out">{money.round(m.committedOut)}</td>
                    <td className={`num fin-fig${m.closing < 0 ? " fe-out" : ""}`}>
                      {money.round(m.closing)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="What repeats" sub="Every standing agreement, as a monthly figure"
               action={<button className="fin-link" onClick={() => onGo("bills")}>
                 Open Bills →
               </button>}>
          <Repeats rows={[...rep.out, ...rep.in]} money={money}
                   empty="Nothing repeats yet. Add a bill or a subscription and this fills in." />
        </Panel>
      </div>
    </div>
  );
}
