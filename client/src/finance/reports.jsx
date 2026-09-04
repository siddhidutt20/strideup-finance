import { useState } from "react";
import { api } from "../api.js";
import { Panel } from "./pieces.jsx";
import { Disc } from "./glyphs.jsx";
import { segment, SLICE_COLOURS, OTHER_COLOUR } from "./spend.jsx";
import { monthLabel } from "./format.js";

// ── Reports ──────────────────────────────────────────────────
// Nothing new is measured here. Every figure is one another page already
// shows, arranged so a run of months can be read at once instead of a month
// at a time — and said in sentences underneath, so the reader is not left to
// do the comparison themselves.

const pct = (v) => (v == null ? null : Math.round(v * 100));

// One or two series of bars with a gutter, used for every chart on this page
// so a run of months always reads the same way.
function Bars({ series, keys, colours, labels, money, current }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...series.flatMap((m) => keys.map((k) => m[k])));
  const W = 640, H = 200, PAD_B = 26, PAD_T = 10, PAD_L = 46;
  const slot = (W - PAD_L) / Math.max(series.length, 1);
  const bw = keys.length > 1
    ? Math.min(18, Math.max(6, slot / 2 - 4))
    : Math.min(34, Math.max(8, slot * 0.5));
  const scale = (v) => ((H - PAD_B - PAD_T) * Math.max(0, v)) / max;
  return (
    <div className="rp-chart">
      {keys.length > 1 && (
        <div className="fin-legend">
          {keys.map((k, i) => (
            <span key={k}><i style={{ background: colours[i] }} />{labels[i]}</span>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="fin-svg" role="img"
           aria-label={labels.join(" and ") + " by month"}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = PAD_T + (H - PAD_B - PAD_T) * (1 - t);
          return (
            <g key={t}>
              <line x1={PAD_L} x2={W} y1={y} y2={y} className="fin-grid-line" />
              <text x={PAD_L - 8} y={y + 4} className="hm-ylab">{money.compact(max * t)}</text>
            </g>
          );
        })}
        {series.map((m, i) => {
          const cx = PAD_L + i * slot + slot / 2;
          return (
            <g key={m.period} onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)}>
              <rect x={PAD_L + i * slot} y="0" width={slot} height={H} fill="transparent" />
              {keys.map((k, j) => (
                <rect key={k}
                      x={keys.length > 1 ? cx + (j === 0 ? -bw - 1.5 : 1.5) : cx - bw / 2}
                      y={H - PAD_B - scale(m[k])} width={bw} height={scale(m[k])} rx="3"
                      fill={colours[j]} />
              ))}
              <text x={cx} y={H - 8} className={`fin-xlab${m.period === current ? " now" : ""}`}>
                {monthLabel(m.period, true).split(" ")[0]}
              </text>
            </g>
          );
        })}
        <line x1={PAD_L} x2={W} y1={H - PAD_B} y2={H - PAD_B} className="fin-axis" />
      </svg>
      <div className="fin-tip" aria-live="polite">
        {hover ? (
          <>
            <strong>{monthLabel(hover.period)}</strong>
            {keys.map((k, i) => (
              <span key={k}><i style={{ background: colours[i] }} />{money.exact(hover[k])}</span>
            ))}
          </>
        ) : <span className="fin-tip-idle">Hover a month for exact figures</span>}
      </div>
    </div>
  );
}

function Donut({ rows, money, total }) {
  const [hover, setHover] = useState(null);
  const clean = rows.filter((r) => r.total > 0);
  if (!clean.length) return <p className="fc-none">Nothing recorded as spending this month.</p>;
  let at = 0;
  let hue = 0;
  const slices = clean.map((r) => {
    const from = at;
    at += (r.total / total) * 360;
    // The rolled-up slice takes the grey, and does not consume a hue — so
    // five named categories still get five distinct colours.
    const rolled = r.folds != null || /^others?$/i.test(r.name);
    const colour = rolled ? OTHER_COLOUR : SLICE_COLOURS[hue++ % SLICE_COLOURS.length];
    return { ...r, from, to: at, colour };
  });
  return (
    <div className="we-alloc">
      <div className="sp-donut">
        <svg viewBox="0 0 200 200" role="img" aria-label="Spending by category">
          {slices.length === 1 ? (
            <circle cx="100" cy="100" r="70" fill="none" strokeWidth="30" stroke={slices[0].colour} />
          ) : slices.map((s) => (
            <path key={s.name} d={segment(100, 100, 85, 55, s.from + 1, s.to - 1)}
                  fill={s.colour} opacity={hover && hover !== s.name ? 0.35 : 1}
                  onMouseEnter={() => setHover(s.name)} onMouseLeave={() => setHover(null)} />
          ))}
          <text x="100" y="96" className="sp-donutfig">{money.compact(total)}</text>
          <text x="100" y="116" className="sp-donutsub">total</text>
        </svg>
      </div>
      <ul className="we-legend">
        {slices.map((s) => (
          <li key={s.name} onMouseEnter={() => setHover(s.name)} onMouseLeave={() => setHover(null)}>
            <i style={{ background: s.colour }} aria-hidden="true" />
            <span title={s.folds ? `${s.folds} more categories` : undefined}>{s.name}</span>
            <b className="fin-fig">{money.round(s.total)}</b>
            <em>{pct(s.share)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Ring({ value, label }) {
  const p = Math.min(1, Math.max(0, value ?? 0));
  const R = 52, C = 2 * Math.PI * R;
  return (
    <svg viewBox="0 0 130 130" className="hh-ring" role="img"
         aria-label={`${pct(value) ?? 0}% ${label}`}>
      <circle cx="65" cy="65" r={R} fill="none" strokeWidth="13" stroke="var(--fin-sunk)" />
      <circle cx="65" cy="65" r={R} fill="none" strokeWidth="13" strokeLinecap="round"
              stroke={(value ?? 0) < 0 ? "var(--fin-out)" : "#1baf7a"}
              strokeDasharray={`${C * p} ${C}`} transform="rotate(-90 65 65)" />
      <text x="65" y="72" className="hh-ringfig">{pct(value) ?? "—"}%</text>
    </svg>
  );
}

const ICON = {
  up: <path d="M4 12.5 8 8.5l2.5 2.5L16 5.5" />,
  down: <path d="M4 5.5 8 9.5l2.5-2.5L16 12.5" />,
  note: <><circle cx="10" cy="10" r="7.2" /><path d="M10 13.5V9.5" /><path d="M10 6.8v.2" /></>,
};

const TABS = [["spending", "Spending"], ["income", "Income"], ["savings", "Savings"],
              ["trends", "Trends"], ["monthly", "Monthly report"]];

export function ReportsView({ rp, money, period, months, onMonths, onPeriod }) {
  const [tab, setTab] = useState("spending");
  const nothing = !rp.spending.total && !rp.income.total;

  return (
    <div className="rp">
      <div className="hh-tabs">
        <span className="fin-scope hh-tabrow">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </span>
        <label className="hm-pick">
          <span className="fin-sr">How many months</span>
          <select value={months} onChange={(e) => onMonths(Number(e.target.value))}>
            {[3, 6, 12, 24].map((n) => <option key={n} value={n}>Last {n} months</option>)}
          </select>
        </label>
      </div>

      {nothing && (
        <Panel title={`Nothing recorded in ${monthLabel(period)}`}>
          <p className="fc-none">
            Every figure on this page comes from what has been recorded. Pick a
            month with entries in it, or add some, and the charts fill in.
          </p>
        </Panel>
      )}

      {tab === "spending" && (
        <div className="rp-row">
          <Panel title="Spending, month by month"
                 sub={rp.spending.average != null
                   ? `${money.round(rp.spending.average)} a month on average before this one`
                   : undefined}>
            <Bars series={rp.series} keys={["expenses"]} colours={["#4a3aa7"]}
                  labels={["Spending"]} money={money} current={period} />
          </Panel>
          <Panel title={`Where it went · ${monthLabel(period, true)}`}
                 sub={`${money.round(rp.spending.total)} out`}>
            <Donut rows={rp.spending.byCategory} money={money} total={rp.spending.total} />
          </Panel>
        </div>
      )}

      {tab === "income" && (
        <div className="rp-row">
          <Panel title="Income against spending"
                 sub={`The last ${rp.series.length} months`}>
            <Bars series={rp.series} keys={["revenue", "expenses"]}
                  colours={["#1baf7a", "#D43081"]} labels={["Income", "Spending"]}
                  money={money} current={period} />
          </Panel>
          <Panel title={`Income · ${monthLabel(period, true)}`}>
            <div className="rp-fig">
              <strong className="fin-fig fe-in">{money.round(rp.income.total)}</strong>
              {rp.income.change == null ? (
                <em>no month before this to compare with</em>
              ) : (
                <span className={`ic-pill ${rp.income.change >= 0 ? "up" : "down"}`}>
                  {rp.income.change >= 0 ? "▲ +" : "▼ −"}
                  {Math.abs(pct(rp.income.change))}% from last month
                </span>
              )}
              {rp.income.average != null && (
                <em>{money.round(rp.income.average)} a month on average before this one</em>
              )}
            </div>
          </Panel>
        </div>
      )}

      {tab === "savings" && (
        <div className="rp-row">
          <Panel title={`What you kept · ${monthLabel(period)}`}>
            <div className="rp-savings">
              <Ring value={rp.savings.rate} label="of what came in was kept" />
              <div className="rp-fig">
                <strong className={`fin-fig${rp.savings.saved < 0 ? " fe-out" : ""}`}>
                  {money.round(rp.savings.saved)}
                </strong>
                <em>
                  {rp.savings.rate == null
                    ? "nothing came in this month"
                    : `${pct(rp.savings.rate)}% of what came in`}
                </em>
                {rp.savings.previousRate != null && rp.savings.rate != null && (
                  <span className={`ic-pill ${rp.savings.rate >= rp.savings.previousRate ? "up" : "down"}`}>
                    {pct(rp.savings.previousRate)}% last month
                  </span>
                )}
              </div>
            </div>
          </Panel>
          <Panel title="Kept, month by month"
                 sub="Income less spending, as recorded">
            <Bars series={rp.series.map((m) => ({ ...m, kept: Math.max(0, m.revenue - m.expenses) }))}
                  keys={["kept"]} colours={["#1baf7a"]} labels={["Kept"]}
                  money={money} current={period} />
            <p className="fc-note">
              A month that spent more than it took in shows as nothing kept
              rather than as a bar below the line — the figure above is the one
              that carries the sign.
            </p>
          </Panel>
        </div>
      )}

      {tab === "trends" && (
        <>
          <Panel title="Income and spending together"
                 sub={`The last ${rp.series.length} months, as recorded`}>
            <Bars series={rp.series} keys={["revenue", "expenses"]}
                  colours={["#1baf7a", "#D43081"]} labels={["Income", "Spending"]}
                  money={money} current={period} />
          </Panel>
          <Panel title="Month by month" sub="The same figures, exactly">
            <div className="fin-tablewrap">
              <table className="fin-table we-table">
                <thead>
                  <tr><th>Month</th><th className="num">In</th><th className="num">Out</th>
                      <th className="num">Kept</th><th className="num">Rate</th></tr>
                </thead>
                <tbody>
                  {[...rp.series].reverse().map((m) => {
                    const kept = m.revenue - m.expenses;
                    return (
                      <tr key={m.period}>
                        <td>{monthLabel(m.period)}</td>
                        <td className="num fin-fig fe-in">{money.round(m.revenue)}</td>
                        <td className="num fin-fig fe-out">{money.round(m.expenses)}</td>
                        <td className={`num fin-fig${kept < 0 ? " fe-out" : ""}`}>{money.round(kept)}</td>
                        <td className="num">
                          {m.revenue > 0 ? `${Math.round((kept / m.revenue) * 100)}%`
                            : <span className="fin-dash">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {tab === "monthly" && (
        <div className="rp-row">
          <Panel title="Every month with something in it"
                 sub="Open one and the whole page moves to it">
            {rp.available.length === 0 ? (
              <p className="fc-none">Nothing has been recorded in any month yet.</p>
            ) : (
              <ul className="rp-months">
                {rp.available.map((p) => (
                  <li key={p}>
                    <Disc name="report" size="sm" />
                    <b>{monthLabel(p)}</b>
                    <button className="fin-link" onClick={() => onPeriod(p)}>
                      {p === period ? "Showing" : "View report →"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Take it with you">
            <ul className="rp-export">
              <li>
                <Disc name="report" size="sm" />
                <span><b>Every entry, as a spreadsheet</b>
                  <em>CSV — opens in Excel, Numbers or Sheets, with a link to
                    each document it came from.</em></span>
                <a className="fin-btn ghost" href={api.finExportUrl()}>Export CSV</a>
              </li>
            </ul>
            <p className="fc-note">
              There is no PDF and no emailed monthly report yet. Both are real
              work rather than a button — a PDF needs a layout of its own, and
              sending mail needs a mail service this app is not connected to.
              Say the word and they go on the list.
            </p>
          </Panel>
        </div>
      )}

      <div className="rp-row">
        <Panel title="What the figures say"
               sub="Arithmetic on your own entries — not a model call">
          {rp.insights.length === 0 ? (
            <p className="fc-none">
              Record a second month and this fills up — every line compares this
              month with what came before it.
            </p>
          ) : (
            <ul className="hm-insights">
              {rp.insights.map((x, i) => (
                <li key={i}>
                  <span className={`hm-ins-icon t-${x.tone}`} aria-hidden="true">
                    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor"
                         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      {ICON[x.tone] ?? ICON.note}
                    </svg>
                  </span>
                  {x.text}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Worth doing something about"
               sub="Only where the figures behind it are on this page">
          {rp.advice.length === 0 ? (
            <p className="fc-none">Nothing here needs a decision this month.</p>
          ) : (
            <ul className="hm-insights">
              {rp.advice.map((x, i) => (
                <li key={i}>
                  <span className="hm-ins-icon t-note" aria-hidden="true">
                    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor"
                         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 16.5h4" />
                      <path d="M7 13a5 5 0 1 1 6 0c-.6.5-1 1.1-1 1.8h-4c0-.7-.4-1.3-1-1.8Z" />
                    </svg>
                  </span>
                  {x.text}
                </li>
              ))}
            </ul>
          )}
          <p className="fc-note">
            Nothing here is advice about your circumstances. Each line is a
            figure from this page and what follows from it arithmetically.
          </p>
        </Panel>
      </div>
    </div>
  );
}
