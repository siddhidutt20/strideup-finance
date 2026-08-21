import { useState } from "react";
import { Panel } from "./pieces.jsx";
import { segment as seg } from "./spend.jsx";
import { monthLabel } from "./format.js";

// ── Cash flow and forecast ───────────────────────────────────
// Three kinds of figure share this page and must never be mistaken for each
// other: recorded money, which happened; committed money, which is agreed;
// and estimated money, which is neither. Recorded is solid, committed is
// solid ahead of today, estimated is dashed — and every table row that holds
// an estimate says so in the row label rather than in a footnote.

const TONE_ICON = { critical: "!", serious: "!", warning: "i", info: "i" };

function Spark({ series, tone = "in" }) {
  if (!series || series.length < 2) return null;
  const W = 78, H = 24, PAD = 2;
  const lo = Math.min(...series), hi = Math.max(...series);
  const span = hi - lo || 1;
  const x = (i) => PAD + (i * (W - PAD * 2)) / (series.length - 1);
  const y = (v) => PAD + (H - PAD * 2) * (1 - (v - lo) / span);
  const d = series.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  return (
    <svg className={`ch-spark s-${tone}`} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={`${d} L${x(series.length - 1)},${H} L${x(0)},${H} Z`} className="ch-sparkfill" />
      <path d={d} className="ch-sparkline" />
    </svg>
  );
}

// ── The forecast line ────────────────────────────────────────
// Recorded months to the left of today, projected months to the right, with
// the divider drawn so the join is visible. The reference this follows keeps
// them on one continuous line; separating them at "today" is the whole point.
function CashLine({ history, months, money, prediction, scenario }) {
  const [hover, setHover] = useState(null);
  const predicting = prediction?.available && scenario !== "committed";

  // Recorded position at the end of each past month, walked backwards from
  // where the projection starts. The current month's own activity comes off
  // first: months[0].opening is the position as it stands today, which
  // includes what this month has already done, so plotting it against last
  // month would put this month's takings on the wrong point.
  const past = [];
  let running = months[0].opening;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.period > months[0].period) continue;
    const net = h.revenue - h.expenses;
    if (h.period === months[0].period) { running -= net; continue; }
    past.unshift({ period: h.period, value: running, recorded: true });
    running -= net;
  }
  const trimmed = past.slice(-6);
  const ahead = months.map((m) => ({
    period: m.period, value: m.closing,
    expected: predicting ? m.expected : null,
    low: m.low, high: m.high, recorded: false,
    committedIn: m.committedIn, committedOut: m.committedOut,
  }));
  const all = [...trimmed, ...ahead];
  if (all.length < 2) return <p className="fc-none">Not enough months to draw yet.</p>;

  const W = 780, H = 240, PAD_L = 8, PAD_R = 62, PAD_T = 18, PAD_B = 30;
  const vals = all.flatMap((p) =>
    [p.value, predicting && p.expected != null ? p.expected : null,
     predicting && !p.recorded ? p.low : null, predicting && !p.recorded ? p.high : null]
      .filter((v) => v != null));
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const span = hi - lo || 1;
  const plotH = H - PAD_T - PAD_B;
  const y = (v) => PAD_T + plotH * (1 - (v - lo) / span);
  const slot = (W - PAD_L - PAD_R) / (all.length - 1);
  const x = (i) => PAD_L + i * slot;
  const splitAt = trimmed.length ? trimmed.length - 1 : 0;

  const line = (pts, from) =>
    pts.map((p, i) => `${i ? "L" : "M"}${x(from + i)},${y(p)}`).join(" ");
  const recordedPts = all.slice(0, splitAt + 1).map((p) => p.value);
  const aheadPts = all.slice(splitAt).map((p) => p.value);
  const expectedPts = predicting ? all.slice(splitAt).map((p) => p.expected ?? p.value) : [];
  const band = predicting
    ? `${all.slice(splitAt).map((p, i) => `${i ? "L" : "M"}${x(splitAt + i)},${y(p.high ?? p.value)}`).join(" ")} ` +
      `${[...all.slice(splitAt)].reverse().map((p, i) =>
          `L${x(all.length - 1 - i)},${y(p.low ?? p.value)}`).join(" ")} Z`
    : null;

  const last = all[all.length - 1];
  const zeroY = y(0), crossesZero = lo < 0 && hi > 0;

  return (
    <div className="fin-chart fc-chart">
      <div className="fin-legend">
        <span><i className="ch-key-rec" />Recorded</span>
        <span><i className="fc-key-solid" />Committed</span>
        {predicting && <span><i className="fc-key-dash" />Expected</span>}
        {predicting && <span><i className="fc-key-band" />Good / bad case</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="fin-svg" role="img"
           aria-label="Cash position: recorded months, then committed and expected">
        <defs>
          <linearGradient id="ch-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--fin-accent)" stopOpacity=".15" />
            <stop offset="100%" stopColor="var(--fin-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => (
          <line key={t} x1={PAD_L} x2={W - PAD_R} y1={PAD_T + plotH * t}
                y2={PAD_T + plotH * t} className="fin-grid-line" />
        ))}
        {crossesZero && (
          <>
            <line x1={PAD_L} x2={W - PAD_R} y1={zeroY} y2={zeroY} className="fc-zero" />
            <text x={PAD_L + 2} y={zeroY - 5} className="fc-zerolab">zero</text>
          </>
        )}
        {band && <path d={band} className="fc-band" />}
        <path d={`${line(aheadPts, splitAt)} L${x(all.length - 1)},${y(lo)} L${x(splitAt)},${y(lo)} Z`}
              fill="url(#ch-fill)" />
        {trimmed.length > 0 && <path d={line(recordedPts, 0)} className="ch-line-rec" />}
        <path d={line(aheadPts, splitAt)} className="fc-line" />
        {predicting && <path d={line(expectedPts, splitAt)} className="fc-line-est" />}
        {/* The boundary between what happened and what is only agreed. It sits
            between the last complete month and the first projected one — not
            on either — because that is where the claim actually changes. */}
        {trimmed.length > 0 && (
          <>
            <line x1={x(splitAt) + slot / 2} x2={x(splitAt) + slot / 2}
                  y1={PAD_T - 6} y2={H - PAD_B} className="ch-today" />
            <text x={x(splitAt) + slot / 2 - 8} y={PAD_T - 9}
                  className="ch-todaylab" textAnchor="end">recorded</text>
            <text x={x(splitAt) + slot / 2 + 8} y={PAD_T - 9}
                  className="ch-todaylab" textAnchor="start">projected</text>
          </>
        )}
        {all.map((p, i) => (
          <g key={p.period} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)}>
            <rect x={x(i) - slot / 2} y="0" width={slot} height={H} fill="transparent" />
            <circle cx={x(i)} cy={y(p.value)} r={hover?.period === p.period ? 6 : 4}
                    className={p.recorded ? "ch-dot-rec" : `fc-dot${p.value < 0 ? " neg" : ""}`} />
            <text x={x(i)} y={H - 10}
                  className={`fin-xlab${i === splitAt ? " now" : ""}`}>
              {monthLabel(p.period, true).split(" ")[0]}
            </text>
          </g>
        ))}
        <text x={W - PAD_R + 5} y={y(last.value) + 4}
              className={`fc-endlab${last.value < 0 ? " neg" : ""}`}>
          {money.round(last.value)}
        </text>
        {predicting && last.expected != null && Math.abs(y(last.expected) - y(last.value)) > 13 && (
          <text x={W - PAD_R + 5} y={y(last.expected) + 4} className="fc-endlab est">
            {money.round(last.expected)}
          </text>
        )}
      </svg>
      <div className="fin-tip" aria-live="polite">
        {hover ? (
          <>
            <strong>{monthLabel(hover.period)}</strong>
            {hover.recorded ? (
              <span className="fin-tip-net">recorded {money.exact(hover.value)}</span>
            ) : (
              <>
                <span><i style={{ background: "var(--fin-in)" }} />in {money.exact(hover.committedIn)}</span>
                <span><i style={{ background: "var(--fin-out)" }} />out {money.exact(hover.committedOut)}</span>
                <span className="fin-tip-net">committed {money.exact(hover.value)}</span>
                {predicting && hover.expected != null && (
                  <span className="fin-tip-net">expected {money.exact(hover.expected)}</span>
                )}
              </>
            )}
          </>
        ) : (
          <span className="fin-tip-idle">
            Left of the marker is recorded. Right of it is agreed, or estimated.
          </span>
        )}
      </div>
    </div>
  );
}

// Where the next few months' money comes from and goes to. Committed and
// estimated stay as separate slices rather than being merged into "inflow" —
// an agreed payment and an estimate are not interchangeable, and a donut that
// blends them would be the one place on this page that pretends they are.
const SUMMARY_COLOUR = ["#2a78d6", "#eb6834", "#1baf7a", "#4a3aa7"];

function Summary({ breakdown, money, months }) {
  const [hover, setHover] = useState(null);
  const parts = breakdown.rows
    .map((r, i) => ({ key: r.label, label: r.label, value: r.total,
                      colour: SUMMARY_COLOUR[i % SUMMARY_COLOUR.length], group: r.group }))
    .filter((p) => p.value > 0);
  const total = parts.reduce((t, p) => t + p.value, 0);
  if (!total) return <p className="fc-none">Nothing committed or estimated in this window.</p>;

  const S = 190, C = S / 2, R = 84, RI = 56, GAP = parts.length > 1 ? 2 : 0;
  let angle = 0;
  const arcs = parts.map((p) => {
    const sweep = (p.value / total) * 360;
    const from = angle + GAP / 2, to = angle + sweep - GAP / 2;
    angle += sweep;
    return { ...p, from, to: Math.max(from + 0.4, to), share: p.value / total };
  });
  const focus = hover ? arcs.find((a) => a.key === hover) : null;
  const net = breakdown.netTotal;

  return (
    <div className="ch-summary">
      <div className="sp-donut">
        <svg viewBox={`0 0 ${S} ${S}`} role="img"
             aria-label={`Money in and out over the next ${months} months`}>
          {arcs.map((a) => (
            <path key={a.key} d={seg(C, C, focus?.key === a.key ? R + 4 : R, RI, a.from, a.to)}
                  fill={a.colour} className="sp-seg"
                  onMouseEnter={() => setHover(a.key)} onMouseLeave={() => setHover(null)} />
          ))}
          <text x={C} y={C - 4} className={`sp-centre-fig${net < 0 ? " neg" : ""}`}>
            {money.round(focus ? focus.value : net)}
          </text>
          <text x={C} y={C + 16} className="sp-centre-lab">
            {focus ? `${Math.round(focus.share * 100)}% of the window` : "net movement"}
          </text>
        </svg>
      </div>
      <ul className="sp-list">
        {arcs.map((a) => (
          <li key={a.key} className={hover === a.key ? "on" : ""}
              onMouseEnter={() => setHover(a.key)} onMouseLeave={() => setHover(null)}>
            <i style={{ background: a.colour }} aria-hidden="true" />
            <span className="sp-name">{a.label}</span>
            <span className="sp-share">{Math.round(a.share * 100)}%</span>
            <span className="sp-amt fin-fig">{money.round(a.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Alerts({ alerts }) {
  if (!alerts.length) {
    return (
      <p className="fc-none">
        Nothing is flagged. No month goes below zero on what is agreed, no large
        payment is late, and no agreement ends in the next two months.
      </p>
    );
  }
  return (
    <ul className="ch-alerts">
      {alerts.map((a, i) => (
        <li key={`${a.kind}-${i}`} className={`t-${a.tone}`}>
          <span className="ch-alerticon" aria-hidden="true">{TONE_ICON[a.tone] || "i"}</span>
          <span className="ch-alerttext">
            <b>{a.title}</b>
            <em>{a.detail}</em>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Breakdown({ breakdown, money }) {
  const { columns, rows, net, netTotal } = breakdown;
  return (
    <div className="fin-tablewrap">
      <table className="fin-table ch-table">
        <thead>
          <tr>
            <th>Category</th>
            {columns.map((c) => <th key={c} className="num">{monthLabel(c, true)}</th>)}
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className={r.estimated ? "ch-est" : ""}>
              <td>
                <span className={`ch-dot ${r.group}`} aria-hidden="true" />
                {r.label}
                {r.estimated && <em> — an estimate</em>}
              </td>
              {r.values.map((v, i) => (
                <td key={i} className={`num fin-fig ${r.group === "in" ? "fe-in" : "fe-out"}`}>
                  {r.group === "in" ? "+" : "−"}{money.round(v)}
                </td>
              ))}
              <td className={`num fin-fig ${r.group === "in" ? "fe-in" : "fe-out"}`}>
                {r.group === "in" ? "+" : "−"}{money.round(r.total)}
              </td>
            </tr>
          ))}
          <tr className="ch-net">
            <td>Net movement</td>
            {net.map((v, i) => (
              <td key={i} className={`num fin-fig${v < 0 ? " fe-out" : ""}`}>{money.round(v)}</td>
            ))}
            <td className={`num fin-fig${netTotal < 0 ? " fe-out" : ""}`}>{money.round(netTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const runwayText = (r, months) =>
  months == null ? "—" : `${months.toFixed(1)} mo`;

export function CashView({ ch, money, period, onGo }) {
  const [scenario, setScenario] = useState("expected");
  const canPredict = ch.prediction?.available;
  const showing = canPredict ? scenario : "committed";
  const r = ch.runway;
  const trend = ch.history.slice(-7);

  return (
    <>
      <div className="fc-kpis ch-kpis">
        <article className="fc-kpi">
          <header><span>Cash today</span></header>
          <p className="fin-fig">{money.exact(ch.cash.amount)}</p>
          <footer>{ch.cash.source === "bank" ? "from your bank feed" : "everything recorded so far"}</footer>
          <Spark series={trend.map((m) => m.revenue - m.expenses)} tone="in" />
        </article>
        <article className="fc-kpi">
          <header><span>Projected, 30 days</span></header>
          <p className={`fin-fig${ch.projected30 < 0 ? " fe-out" : ""}`}>{money.round(ch.projected30)}</p>
          <footer>on {ch.forecast.months[1]?.period ?? "next month"}</footer>
          <Spark series={ch.forecast.months.map((m) => m.closing)} tone="accent" />
        </article>
        <article className="fc-kpi">
          <header><span>Net, 30 days</span></header>
          <p className={`fin-fig${ch.committed30 < 0 ? " fe-out" : " fe-in"}`}>
            {ch.committed30 >= 0 ? "+" : "−"}{money.round(Math.abs(ch.committed30))}
          </p>
          <footer>committed to move, either way</footer>
        </article>
        <article className="fc-kpi">
          <header><span>Total in, {ch.months} months</span></header>
          <p className="fin-fig fe-in">{money.round(ch.inflow)}</p>
          <footer>committed and estimated</footer>
          <Spark series={trend.map((m) => m.revenue)} tone="in" />
        </article>
        <article className="fc-kpi">
          <header><span>Total out, {ch.months} months</span></header>
          <p className="fin-fig fe-out">{money.round(ch.outflow)}</p>
          <footer>committed and estimated</footer>
          <Spark series={trend.map((m) => m.expenses)} tone="out" />
        </article>
        <article className={`fc-kpi${r.burning && r.current != null && r.current < 3 ? " warn" : ""}`}>
          <header><span>Runway</span></header>
          <p className="fin-fig">{r.burning ? runwayText(r, r.current) : "—"}</p>
          <footer>
            {r.burning
              ? `${money.round(r.monthlyBurn)} a month of net burn`
              : "not burning — recorded months are net positive"}
          </footer>
        </article>
      </div>

      <div className="ch-band">
        <Panel
          title="Cash position"
          sub="Recorded months, then what is agreed and what is estimated"
          action={canPredict && (
            <div className="fc-scen" role="group" aria-label="Which projection">
              <button className={scenario === "committed" ? "on" : ""}
                      onClick={() => setScenario("committed")}>Committed only</button>
              <button className={scenario === "expected" ? "on" : ""}
                      onClick={() => setScenario("expected")}>Expected</button>
            </div>
          )}>
          <CashLine history={ch.history} months={ch.forecast.months} money={money}
                    prediction={ch.prediction} scenario={showing} />
          {ch.belowZero.committed && (
            <p className="fc-flag">
              On agreed payments alone the position goes below zero in{" "}
              <strong>{monthLabel(ch.belowZero.committed)}</strong>. That is arithmetic —
              income you have not contracted is not in that line.
            </p>
          )}
        </Panel>

        <Panel title="Summary" sub={`Next ${ch.months} months`}>
          <Summary breakdown={ch.breakdown} money={money} months={ch.months} />
        </Panel>

        <Panel title="Key alerts" sub="Conditions that are true right now">
          <Alerts alerts={ch.alerts} />
        </Panel>
      </div>

      <div className="ch-band2">
        <Panel title="Month by month"
               sub="Committed and estimated kept apart — different claims">
          <Breakdown breakdown={ch.breakdown} money={money} />
        </Panel>

        <Panel title="Runway"
               sub={r.burning ? "How long the position lasts" : "Monthly net under each case"}>
          {/* A dash means one of two different things, and a panel of three
              dashes above a note explaining only one of them is why this read
              as broken. Each box now says which applies to it. */}
          <div className="ch-runway">
            {/* Current is measured, not estimated, so it never lacks history —
               a zero burn is the reason it is blank, and it says so. */}
            {[["Worst", r.worst, r.scenarios?.worst],
              ["Current", r.current, r.monthlyBurn],
              ["Best", r.best, r.scenarios?.best]].map(([label, months, net]) => (
              <div key={label}>
                <span>{label}</span>
                <strong className="fin-fig">
                  {months != null ? runwayText(r, months) : "—"}
                </strong>
                <em className={net != null && net > 0 ? "fe-out" : net != null ? "fe-in" : ""}>
                  {months != null
                    ? `${money.round(Math.abs(net ?? r.monthlyBurn))} a month out`
                    : net == null
                      ? `needs ${r.minimumMonths ?? 3} complete months`
                      : net > 0
                        ? `−${money.round(net)} a month`
                        : net === 0
                          ? "nothing being burned"
                          : `+${money.round(Math.abs(net))} a month — not burning`}
                </em>
              </div>
            ))}
          </div>
          <p className="fc-note">
            {!r.available
              ? `Best and worst come from the spread of recent complete months, and ` +
                `there are not yet ${r.minimumMonths ?? 3} of them. Rather than fill ` +
                `the gap with a guess, they stay blank until there is something to ` +
                `measure.`
              : r.burning
                ? "Best and worst are the quartiles of what recent months actually did — not multipliers on a guess."
                : "Recorded months are net positive, so nothing is being burned and there is no runway to run out of. The monthly figures are what each case would do."}
          </p>
        </Panel>
      </div>

      <div className="fin-twocol">
        <Panel title="Largest recurring costs"
               sub={`${money.round(ch.recurringTotal)} a month across everything committed`}>
          {ch.recurring.length === 0 ? (
            <p className="fc-none">Nothing recurring is committed yet.</p>
          ) : (
            <ul className="ch-costs">
              {ch.recurring.map((x, i) => (
                <li key={`${x.description}-${i}`}>
                  <span className="vm-what">
                    <b>{x.description}</b>
                    <em>{x.counterparty || x.categoryName || "uncategorised"} · {x.frequency}</em>
                  </span>
                  <b className="fin-fig fe-out">{money.round(x.monthlyEquivalent)}</b>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Upcoming payments" sub="The next 30 days, either direction">
          {ch.upcoming.length === 0 ? (
            <p className="fc-none">Nothing falls due in the next 30 days.</p>
          ) : (
            <ul className="ch-costs">
              {ch.upcoming.map((u, i) => (
                <li key={`${u.commitmentId}-${u.date}-${i}`}>
                  <span className="vm-what">
                    <b>{u.description}</b>
                    <em>{u.counterparty || "no party"} · {u.date}</em>
                  </span>
                  <b className={`fin-fig ${u.direction === "in" ? "fe-in" : "fe-out"}`}>
                    {u.direction === "in" ? "+" : "−"}{money.round(u.amount)}
                  </b>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
