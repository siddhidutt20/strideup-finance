import { useMemo, useState } from "react";
import { api } from "../api.js";
import { Panel } from "./pieces.jsx";
import { Disc } from "./glyphs.jsx";
import { monthLabel } from "./format.js";
import { CommitmentForm } from "./forecast.jsx";

// ── Where the money comes from ───────────────────────────────
// Three kinds of claim, never added together: what was recorded this month,
// what keeps arriving under a standing arrangement, and what has arrived with
// no arrangement behind it at all. The last of those is the only thing on this
// page that asks you a question.

const pct = (v) => (v == null ? null : Math.round(v * 100));

const FREQ = { once: "One-time", weekly: "Weekly", monthly: "Monthly",
               quarterly: "Quarterly", annual: "Yearly" };

const dayLabel = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

// One series, one colour. Income has no counterpart on this page, so a legend
// would be a label for a thing there is only one of.
function IncomeBars({ series, money, current }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...series.map((m) => m.amount));
  const W = 420, H = 120, PAD_B = 20, PAD_T = 6;
  const slot = W / Math.max(series.length, 1);
  const bw = Math.min(26, Math.max(6, slot * 0.52));
  const scale = (v) => ((H - PAD_B - PAD_T) * Math.max(0, v)) / max;
  return (
    <div className="ic-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="fin-svg" role="img"
           aria-label="Income by month">
        {series.map((m, i) => {
          const cx = i * slot + slot / 2;
          const now = m.period === current;
          return (
            <g key={m.period} onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)}>
              <rect x={i * slot} y="0" width={slot} height={H} fill="transparent" />
              <rect x={cx - bw / 2} y={H - PAD_B - scale(m.amount)} width={bw}
                    height={scale(m.amount)} rx="3"
                    fill={now ? "#128a5e" : "#8fd3b4"} />
              <text x={cx} y={H - 6} className={`fin-xlab${now ? " now" : ""}`}>
                {monthLabel(m.period, true).split(" ")[0]}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="ic-tip" aria-live="polite">
        {hover ? <>{monthLabel(hover.period)}: <b>{money.exact(hover.amount)}</b></>
               : <span className="fin-tip-idle">Hover a month for the exact figure</span>}
      </p>
    </div>
  );
}

export function IncomeView({ inc, money, period, entity, categories, currency,
                            onChanged, onAdd, adding, onCloseAdd }) {
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState([]);
  const [recurring, setRecurring] = useState(null);
  const [span, setSpan] = useState("year");

  const series = useMemo(() => {
    if (span !== "year") return inc.series.slice(-12);
    const year = period.slice(0, 4);
    const inYear = inc.series.filter((m) => m.period.slice(0, 4) === year);
    return inYear.length ? inYear : inc.series.slice(-12);
  }, [inc.series, span, period]);

  const detected = inc.detected.filter((d) => !dismissed.includes(d.entryId));
  const first = detected[0];

  // Turning a deposit into a standing arrangement is the same thing the
  // Payment schedule does — one commitment, from the day it last arrived.
  async function makeRecurring(d, frequency) {
    setBusy(true);
    try {
      await api.addCommitment({
        entity, direction: "in", description: d.description || d.who,
        counterparty: d.who, amount: d.amount / 100, currency,
        categoryId: d.categoryId || undefined,
        frequency, startDate: d.date,
      });
      setRecurring(null);
      setDismissed((x) => [...x, d.entryId]);
      onChanged();
    } finally { setBusy(false); }
  }

  const active = inc.sources.filter((s) => s.active);
  const ended = inc.sources.filter((s) => !s.active);

  return (
    <div className="ic">
      <Panel title={`Total income · ${monthLabel(period)}`}
             action={
               <label className="hm-pick">
                 <span className="fin-sr">Range</span>
                 <select value={span} onChange={(e) => setSpan(e.target.value)}>
                   <option value="year">This year</option>
                   <option value="12">Last 12 months</option>
                 </select>
               </label>
             }>
        <div className="ic-top">
          <div className="ic-fig">
            <strong className="fin-fig">{money.round(inc.total)}</strong>
            {inc.change == null ? (
              <span className="ic-pill flat">
                {inc.previous ? "level with last month" : "no month before this to compare"}
              </span>
            ) : (
              <span className={`ic-pill ${inc.change >= 0 ? "up" : "down"}`}>
                {inc.change >= 0 ? "▲ +" : "▼ −"}{Math.abs(pct(inc.change))}% from last month
              </span>
            )}
            {inc.recurringMonthly > 0 && (
              <em className="ic-rate">
                {money.round(inc.recurringMonthly)} a month arrives under a standing
                arrangement — a rate, not part of the figure above.
              </em>
            )}
          </div>
          {series.some((m) => m.amount)
            ? <IncomeBars series={series} money={money} current={period} />
            : <p className="fc-none">Nothing recorded as income in this range.</p>}
        </div>
      </Panel>

      {first && (
        <div className="ic-detect">
          <span className="ic-detect-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor"
                 strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3M4.7 4.7l2 2M13.3 13.3l2 2M15.3 4.7l-2 2M6.7 13.3l-2 2" />
            </svg>
          </span>
          <span className="ic-detect-body">
            <b>Income with nothing set up behind it</b>
            <em>
              {money.round(first.amount)} from “{first.who}” on {dayLabel(first.date)}
              {first.times > 1 && ` — and ${first.times - 1} more like it`}. It is already
              counted above. Set it up as a standing arrangement and it will also
              show in your forecast and your bills.
              {detected.length > 1 && ` ${detected.length - 1} other deposit${detected.length === 2 ? "" : "s"} like this.`}
            </em>
          </span>
          {recurring === first.entryId ? (
            <span className="ic-detect-acts">
              {["weekly", "monthly", "quarterly", "annual"].map((f) => (
                <button key={f} className="fin-btn ghost" disabled={busy}
                        onClick={() => makeRecurring(first, f)}>{FREQ[f]}</button>
              ))}
              <button className="fin-btn ghost" onClick={() => setRecurring(null)}>Cancel</button>
            </span>
          ) : (
            <span className="ic-detect-acts">
              <button className="fin-btn go" onClick={() => setRecurring(first.entryId)}>
                Yes, set it up
              </button>
              <button className="fin-btn ghost"
                      onClick={() => setDismissed((x) => [...x, first.entryId])}>
                Dismiss
              </button>
            </span>
          )}
        </div>
      )}

      <Panel title="Income sources"
             sub={active.length
               ? `${money.round(inc.recurringMonthly)} a month, across ${active.length}`
               : "Nothing recurring is set up yet"}
             action={<button className="fin-btn" onClick={onAdd}>+ Add income</button>}>
        {inc.sources.length === 0 ? (
          <p className="fc-none">
            Nothing recurring is recorded as coming in. Add a salary, a rent or a
            retainer and it appears here, in your forecast and in what the month
            is expected to hold.
          </p>
        ) : (
          <div className="fin-tablewrap">
            <table className="fin-table ic-table">
              <thead>
                <tr><th>Source</th><th>Type</th><th>How often</th>
                    <th className="num">Amount</th><th>Last received</th><th>Next due</th></tr>
              </thead>
              <tbody>
                {[...active, ...ended].map((s) => (
                  <tr key={s.id} className={s.active ? undefined : "ic-ended"}>
                    <td>
                      <span className="ic-who">
                        <Disc name={s.type || s.name} />
                        <b>{s.name}</b>
                      </span>
                    </td>
                    <td>{s.type}</td>
                    <td>{FREQ[s.frequency] ?? s.frequency}</td>
                    <td className="num fin-fig fe-in">{money.exact(s.amount)}</td>
                    <td className="fc-date">
                      {s.lastReceived
                        ? dayLabel(s.lastReceived)
                        : <span className="fin-dash">never recorded</span>}
                    </td>
                    <td className="fc-date">
                      {s.active
                        ? (s.nextDue ? dayLabel(s.nextDue) : <span className="fin-dash">—</span>)
                        : <span className="ic-endtag">ended {dayLabel(s.endDate)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="fc-note">
          A source is an arrangement, not money. It reaches this month's total
          when a payment against it is actually recorded.
        </p>
      </Panel>

      {inc.byCategory.length > 0 && (
        <Panel title={`Recorded this month · ${monthLabel(period)}`}
               sub={`${money.round(inc.total)} across ${inc.byCategory.length} ` +
                    `heading${inc.byCategory.length === 1 ? "" : "s"}`}>
          <ul className="hm-cats">
            {inc.byCategory.map((c) => (
              <li key={c.name}>
                <Disc name={c.name} />
                <b className="hm-cat-name">{c.name}</b>
                <span className="fin-fig hm-cat-amt fe-in">{money.round(c.total)}</span>
                <em>{inc.total ? pct(c.total / inc.total) : 0}%</em>
                <span className="hm-cat-bar">
                  <i className="in" style={{ width: `${inc.total ? (c.total / inc.total) * 100 : 0}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {adding && (
        <div className="fin-modal" role="dialog" aria-label="Add an income source">
          <div className="fin-sheet">
            <header className="fin-sheethead">
              <h2>Add an income source</h2>
              <button className="fin-x" onClick={onCloseAdd} aria-label="Close">×</button>
            </header>
            <CommitmentForm entity={entity} categories={categories} currency={currency}
                            lockDirection="in" hideBooks
                            onAdded={() => { onCloseAdd(); onChanged(); }} />
          </div>
        </div>
      )}
    </div>
  );
}
