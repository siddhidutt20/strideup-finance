import { useMemo, useState } from "react";
import { api } from "../api.js";
import { Panel } from "./pieces.jsx";
import { Disc, CategoryPill } from "./glyphs.jsx";
import { segment, SLICE_COLOURS, OTHER_COLOUR } from "./spend.jsx";
import { monthLabel } from "./format.js";
import { TransactionsView } from "./transactions.jsx";

// ── Where the money went ─────────────────────────────────────
// A household asks two things a company does not: how much of this month's
// spending was never really a choice, and what is left once the unavoidable
// part has gone. Both rest on one split — spending a standing agreement
// caused, and spending that nothing caused but a decision. That split is read
// from the ledger, never guessed: a payment an agreement caused carries that
// agreement's own key.

const pct = (v) => (v == null ? null : Math.round(v * 100));

const dayLabel = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

const KPI_ICONS = {
  total: <><path d="M10 16.5v-11" /><path d="M5.5 10 10 5.5 14.5 10" /></>,
  fixed: <><rect x="4" y="8.5" width="12" height="8" rx="2" />
           <path d="M7 8.5V6.2a3 3 0 0 1 6 0v2.3" /></>,
  variable: <><rect x="2.5" y="5" width="15" height="11" rx="2.5" /><path d="M13 10.5h2.5" /></>,
  subs: <><path d="M4 10a6 6 0 0 1 10.2-4.2" /><path d="M16 10a6 6 0 0 1-10.2 4.2" />
          <path d="M14.5 2.8v3h-3" /><path d="M5.5 17.2v-3h3" /></>,
  left: <><ellipse cx="10" cy="6" rx="6.5" ry="2.5" />
          <path d="M3.5 6v8c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V6" />
          <path d="M3.5 10.5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" /></>,
};

function Kpi({ tone, icon, label, value, negative, children }) {
  return (
    <article className={`hm-kpi t-${tone}`}>
      <span className="hm-kpi-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" width="19" height="19" fill="none" stroke="currentColor"
             strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {KPI_ICONS[icon]}
        </svg>
      </span>
      <span className="hm-kpi-body">
        <span className="hm-kpi-label">{label}</span>
        <strong className={`hm-kpi-fig${negative ? " fe-out" : ""}`}>{value}</strong>
        {children}
      </span>
    </article>
  );
}

function Donut({ rows, money, total }) {
  const [hover, setHover] = useState(null);
  const clean = rows.filter((r) => r.total > 0);
  if (!clean.length) return <p className="fc-none">Nothing recorded as spending this month.</p>;
  // Five named slices and one rolled-up rest, which takes the dedicated grey
  // rather than repeating a hue.
  const named = clean.slice(0, SLICE_COLOURS.length);
  const rest = clean.slice(SLICE_COLOURS.length);
  const shown = rest.length
    ? [...named, { name: "Others", total: rest.reduce((t, r) => t + r.total, 0),
                   share: rest.reduce((t, r) => t + r.share, 0), folds: rest.length }]
    : named;
  let at = 0, hue = 0;
  const slices = shown.map((r) => {
    const from = at;
    at += (r.total / total) * 360;
    const rolled = r.folds != null;
    return { ...r, from, to: at,
             colour: rolled ? OTHER_COLOUR : SLICE_COLOURS[hue++ % SLICE_COLOURS.length] };
  });
  return (
    <div className="we-alloc">
      <div className="sp-donut">
        <svg viewBox="0 0 200 200" role="img" aria-label="Spending by heading">
          {slices.length === 1 ? (
            <circle cx="100" cy="100" r="70" fill="none" strokeWidth="30" stroke={slices[0].colour} />
          ) : slices.map((s) => (
            <path key={s.name} d={segment(100, 100, 85, 55, s.from + 1, s.to - 1)}
                  fill={s.colour} opacity={hover && hover !== s.name ? 0.35 : 1}
                  onMouseEnter={() => setHover(s.name)} onMouseLeave={() => setHover(null)} />
          ))}
          <text x="100" y="96" className="sp-donutfig">{money.compact(total)}</text>
          <text x="100" y="116" className="sp-donutsub">total out</text>
        </svg>
      </div>
      <ul className="we-legend">
        {slices.map((s) => (
          <li key={s.name} onMouseEnter={() => setHover(s.name)} onMouseLeave={() => setHover(null)}>
            <i style={{ background: s.colour }} aria-hidden="true" />
            <span title={s.folds ? `${s.folds} more headings` : undefined}>{s.name}</span>
            <b className="fin-fig">{money.round(s.total)}</b>
            <em>{pct(s.share)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Four series over the same months. Lines rather than bars: the question here
// is which way each is going, not what any one month held.
function SplitLines({ series, money, current }) {
  const [hover, setHover] = useState(null);
  const KEYS = [["total", "Total", "#D43081"], ["fixed", "Fixed", "#2a78d6"],
                ["variable", "Variable", "#eda100"], ["subs", "Subscriptions", "#4a3aa7"]];
  const max = Math.max(1, ...series.flatMap((m) => KEYS.map(([k]) => m[k] ?? 0)));
  const W = 640, H = 220, PAD_B = 26, PAD_T = 12, PAD_L = 46;
  const x = (i) => PAD_L + ((W - PAD_L) * i) / Math.max(1, series.length - 1);
  const y = (v) => PAD_T + (H - PAD_B - PAD_T) * (1 - (v ?? 0) / max);
  return (
    <div className="rp-chart">
      <div className="fin-legend">
        {KEYS.map(([k, l, c]) => <span key={k}><i style={{ background: c }} />{l}</span>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="fin-svg" role="img"
           aria-label="Total, fixed, variable and subscription spending by month">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const yy = PAD_T + (H - PAD_B - PAD_T) * (1 - t);
          return (
            <g key={t}>
              <line x1={PAD_L} x2={W} y1={yy} y2={yy} className="fin-grid-line" />
              <text x={PAD_L - 8} y={yy + 4} className="hm-ylab">{money.compact(max * t)}</text>
            </g>
          );
        })}
        {KEYS.map(([k, , c]) => (
          <path key={k} fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round"
                strokeLinecap="round"
                d={series.map((m, i) => `${i ? "L" : "M"}${x(i)},${y(m[k])}`).join(" ")} />
        ))}
        {series.map((m, i) => (
          <g key={m.period} onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)}>
            <rect x={x(i) - 14} y="0" width="28" height={H} fill="transparent" />
            {hover?.period === m.period && KEYS.map(([k, , c]) => (
              <circle key={k} cx={x(i)} cy={y(m[k])} r="3.6" fill={c} stroke="#fff" strokeWidth="1.6" />
            ))}
            <text x={x(i)} y={H - 8} className={`fin-xlab${m.period === current ? " now" : ""}`}>
              {monthLabel(m.period, true).split(" ")[0]}
            </text>
          </g>
        ))}
        <line x1={PAD_L} x2={W} y1={H - PAD_B} y2={H - PAD_B} className="fin-axis" />
      </svg>
      <div className="fin-tip" aria-live="polite">
        {hover ? (
          <>
            <strong>{monthLabel(hover.period)}</strong>
            {KEYS.map(([k, l, c]) => (
              <span key={k}><i style={{ background: c }} />{money.round(hover[k])}</span>
            ))}
          </>
        ) : <span className="fin-tip-idle">Hover a month for exact figures</span>}
      </div>
    </div>
  );
}

const INS_ICON = {
  up: <path d="M4 12.5 8 8.5l2.5 2.5L16 5.5" />,
  down: <path d="M4 5.5 8 9.5l2.5-2.5L16 12.5" />,
  warn: <><path d="M10 3.5 17.5 16.5h-15Z" /><path d="M10 8.5v3.2" /><path d="M10 14v.2" /></>,
  note: <><circle cx="10" cy="10" r="7.2" /><path d="M10 13.5V9.5" /><path d="M10 6.8v.2" /></>,
};

const TABS = [["overview", "Overview"], ["transactions", "Transactions"],
              ["categories", "Categories"], ["fixed", "Fixed & recurring"],
              ["variable", "Variable"], ["trends", "Trends"]];

export function ExpensesView({ ex, money, period, entity, categories, currency,
                               onGo, onChanged, onAdd }) {
  const [tab, setTab] = useState("overview");
  const [setting, setSetting] = useState(null);
  const s = ex.split;

  const series = useMemo(
    () => ex.series.slice(-6).map((m) => ({ ...m, subs: s.subscriptionsMonthly })),
    [ex.series, s.subscriptionsMonthly]
  );

  return (
    <div className="ex">
      <div className="hh-tabs">
        <span className="fin-scope hh-tabrow">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </span>
        <span className="fin-scope">
          <a className="fin-link" href={api.finExportUrl()}>Export CSV</a>
          <button className="fin-btn" onClick={onAdd}>+ Add expense</button>
        </span>
      </div>

      {tab === "overview" && (
        <>
          <div className="ex-kpis">
            <Kpi tone="out" icon="total" label={`Spent in ${monthLabel(period, true)}`}
                 value={money.round(ex.total)}>
              {ex.change == null ? (
                <em className="hm-flat">no month before this to compare</em>
              ) : (
                <em className={`hm-change ${ex.change <= 0 ? "good" : "bad"}`}>
                  {ex.change >= 0 ? "▲ +" : "▼ −"}{Math.abs(pct(ex.change))}% from last month
                </em>
              )}
            </Kpi>
            <Kpi tone="cash" icon="fixed" label="Under an agreement"
                 value={money.round(s.fixed)}>
              <em className="hm-flat">
                {s.fixedShare == null ? "nothing recorded" : `${pct(s.fixedShare)}% of the month`}
              </em>
            </Kpi>
            <Kpi tone="save" icon="variable" label="Everything else"
                 value={money.round(s.variable)}>
              <em className="hm-flat">
                {s.variableShare == null ? "nothing recorded" : `${pct(s.variableShare)}% of the month`}
              </em>
            </Kpi>
            <Kpi tone="in" icon="subs" label="Subscriptions"
                 value={money.round(s.subscriptionsMonthly)}>
              <em className="hm-flat">
                {s.subscriptionCount} recurring, a month
              </em>
            </Kpi>
            <Kpi tone="in" icon="left" label="Left this month"
                 value={money.round(ex.left)} negative={ex.left < 0}>
              <em className="hm-flat">
                {money.round(ex.income)} in, {money.round(ex.total)} out
              </em>
            </Kpi>
          </div>

          <div className="ex-row-a">
            <Panel title="Where it went" sub={`${monthLabel(period)} · ${money.round(ex.total)}`}>
              <Donut rows={ex.categories} money={money} total={ex.total} />
            </Panel>

            <Panel title="Agreed against decided"
                   sub="What a standing agreement caused, and what did not">
              <ul className="ex-split">
                {[["Under an agreement", s.fixed, s.fixedShare, "#2a78d6"],
                  ["Everything else", s.variable, s.variableShare, "#eda100"]].map(
                  ([label, v, share, c]) => (
                    <li key={label}>
                      <span className="ex-split-head">
                        <b>{label}</b>
                        <em className="fin-fig">{money.round(v)}</em>
                      </span>
                      <span className="hh-bar">
                        <i style={{ width: `${(share ?? 0) * 100}%`, background: c }} />
                      </span>
                      <span className="ex-split-pct">{pct(share) ?? 0}%</span>
                    </li>
                  ))}
                <li className="ex-split-aside">
                  <span className="ex-split-head">
                    <b>Subscriptions</b>
                    <em className="fin-fig">{money.round(s.subscriptionsMonthly)}</em>
                  </span>
                  <span className="hh-bar">
                    <i style={{ width: `${Math.min(100, (s.subscriptionShare ?? 0) * 100)}%`,
                                background: "#4a3aa7" }} />
                  </span>
                  <span className="ex-split-pct">{pct(s.subscriptionShare) ?? 0}%</span>
                </li>
              </ul>
              <p className="fc-note">
                The first two are exclusive and add to the month. Subscriptions
                are a monthly rate that mostly sits inside the first, so it is
                shown beside them and never added to either.
              </p>
              {s.fixedShare != null && s.fixedShare >= 0.5 && (
                <div className="hh-note warn ex-tip">
                  <span className="hh-note-icon" aria-hidden="true">
                    <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor"
                         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 16.5h4" />
                      <path d="M7 13a5 5 0 1 1 6 0c-.6.5-1 1.1-1 1.8h-4c0-.7-.4-1.3-1-1.8Z" />
                    </svg>
                  </span>
                  <span className="hh-note-body">
                    <b>{pct(s.fixedShare)}% of this month was under an agreement.</b>
                    <em>
                      That part does not move when you decide to spend less. The
                      Bills page is where it changes.
                    </em>
                  </span>
                  <button className="fin-link" onClick={() => onGo("bills")}>Open Bills →</button>
                </div>
              )}
            </Panel>

            <Panel title="What the figures say"
                   sub="Arithmetic on your own entries"
                   action={<button className="fin-link" onClick={() => onGo("reports")}>
                     See all →
                   </button>}>
              <ul className="hm-insights">
                {ex.insights.map((x, i) => (
                  <li key={i}>
                    <span className={`hm-ins-icon t-${x.tone}`} aria-hidden="true">
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor"
                           strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        {INS_ICON[x.tone] ?? INS_ICON.note}
                      </svg>
                    </span>
                    {x.text}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <div className="ex-row-b">
            <Panel title="Spending, month by month"
                   sub="Total, and the two halves it divides into">
              <SplitLines series={series} money={money} current={period} />
              <p className="fc-note">
                The subscription line is a rate, not what each month recorded —
                it is what your standing subscriptions cost per month as they
                stand today.
              </p>
            </Panel>

            <Panel title="Against the plan"
                   sub={ex.budget.total == null ? "No budget set for this month" : undefined}
                   action={<button className="fin-link" onClick={() => onGo("budget")}>
                     Open Budget →
                   </button>}>
              {ex.budget.total == null ? (
                <p className="fc-none">
                  Set what the month is meant to cost and every heading gains a
                  limit and a bar.
                </p>
              ) : (
                /* A list, not a table. In a panel this narrow a table's
                   minimum column widths win and the last column is cut off;
                   a two-line row flexes to whatever space there is. */
                <ul className="ex-plan">
                  {ex.budget.categories.map((c) => (
                    <li key={c.name}
                        className={c.over && c.budget > 0 ? "over"
                          : c.spent > 0 && !c.budget ? "unplanned" : undefined}>
                      <Disc name={c.name} size="sm" />
                      <b className="ex-plan-name">{c.name}</b>
                      <span className="ex-plan-fig">
                        <b className="fin-fig">{money.round(c.spent)}</b>
                        <em>{c.budget > 0 ? `of ${money.round(c.budget)}` : "no limit set"}</em>
                      </span>
                      {c.budget > 0 ? (
                        <span className="ex-planbar">
                          <span className="hh-bar">
                            <i className={c.over ? "over" : c.usedPct >= 0.9 ? "hot"
                              : c.usedPct >= 0.7 ? "warm" : ""}
                               style={{ width: `${Math.min(100, (c.usedPct ?? 0) * 100)}%` }} />
                          </span>
                          <em className={c.over ? "fe-out" : undefined}>{pct(c.usedPct)}%</em>
                        </span>
                      ) : <span className="ex-planbar" />}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Going out with nothing set up"
                   sub="Seen in more than one month, and no agreement covers it"
                   action={<button className="fin-link" onClick={() => onGo("bills")}>
                     Open Bills →
                   </button>}>
              {ex.detected.length === 0 ? (
                <p className="fc-none">
                  Nothing is leaving repeatedly without a bill behind it. Anything
                  that starts to will show up here.
                </p>
              ) : (
                <div className="fin-tablewrap">
                  <table className="fin-table ex-detect">
                    <thead>
                      <tr><th>Who</th><th className="num">Typically</th>
                          <th>Pattern</th><th aria-label="Set up" /></tr>
                    </thead>
                    <tbody>
                      {ex.detected.slice(0, 6).map((d) => (
                        <tr key={d.entryId}>
                          <td>
                            <span className="ic-who">
                              <Disc name={d.categoryName || d.who} size="sm" />
                              <b>{d.who}</b>
                            </span>
                          </td>
                          <td className="num fin-fig fe-out">{money.round(d.typical)}</td>
                          <td>
                            <span className={`ex-looks l-${d.looks}`}>
                              {d.looks === "steady" ? "Same amount" : "Varies"}
                            </span>
                            <em className="ex-seen">{d.months} months, {d.times} times</em>
                          </td>
                          <td className="ic-editcell">
                            <button className="fin-btn ghost sm" onClick={() => setSetting(d)}>
                              Set up as a bill
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="fc-note">
                Nothing here has been categorised for you. It is money that has
                left more than once from the same place with no agreement behind
                it — whether that should become a bill is your call.
              </p>
            </Panel>
          </div>

          <section className="fin-panel ex-glance">
            <span className="ex-glance-lead">
              <b>Your month at a glance</b>
              <em>What came in, what had to go, and what that leaves.</em>
            </span>
            <span className="ex-sum">
              <span><b className="fin-fig fe-in">{money.round(ex.income)}</b><em>came in</em></span>
              <i aria-hidden="true">−</i>
              <span><b className="fin-fig">{money.round(s.fixed)}</b><em>under agreement</em></span>
              <i aria-hidden="true">−</i>
              <span><b className="fin-fig">{money.round(s.variable)}</b><em>everything else</em></span>
              <i aria-hidden="true">=</i>
              <span className="ex-sum-out">
                <b className={`fin-fig${ex.left < 0 ? " fe-out" : ""}`}>{money.round(ex.left)}</b>
                <em>left</em>
              </span>
            </span>
            {ex.weekly != null && (
              <span className="ex-glance-side">
                <b className="fin-fig">{money.round(ex.weekly)}</b>
                <em>a week for the {ex.daysLeft} days left, if nothing else comes in</em>
              </span>
            )}
          </section>
        </>
      )}

      {tab === "transactions" && (
        <TransactionsView entity={entity} categories={categories} money={money}
                          fixedDirection="out" onAdd={onAdd} onChanged={onChanged} />
      )}

      {tab === "categories" && (
        <Panel title="Every heading, largest first"
               sub={`${monthLabel(period)} · ${money.round(ex.total)} across ${ex.ranked.length}`}>
          {ex.ranked.length === 0 ? (
            <p className="fc-none">Nothing recorded as spending this month.</p>
          ) : (
            <div className="fin-tablewrap">
              <table className="fin-table hh-table">
                <thead>
                  <tr><th>Heading</th><th className="num">This month</th>
                      <th className="num">Last month</th><th className="num">Change</th>
                      <th>Share</th></tr>
                </thead>
                <tbody>
                  {ex.ranked.map((c) => (
                    <tr key={c.name}>
                      <td>
                        <span className="ic-who">
                          <Disc name={c.name} size="sm" /><b>{c.name}</b>
                        </span>
                      </td>
                      <td className="num fin-fig fe-out">{money.round(c.total)}</td>
                      <td className="num fin-fig">
                        {c.lastMonth ? money.round(c.lastMonth) : <span className="fin-dash">—</span>}
                      </td>
                      <td className={`num${c.change == null ? "" : c.change > 0 ? " fe-out" : " fe-good"}`}>
                        {c.change == null ? <span className="fin-dash">new</span>
                          : `${c.change >= 0 ? "+" : "−"}${Math.abs(pct(c.change))}%`}
                      </td>
                      <td className="hh-barcell">
                        <span className="hh-bar">
                          <i style={{ width: `${c.share * 100}%` }} />
                        </span>
                        <em>{pct(c.share)}%</em>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {tab === "fixed" && (
        <>
          <Panel title="What an agreement caused"
                 sub={`${money.round(s.fixed)} of ${money.round(ex.total)} this month`}
                 action={<button className="fin-link" onClick={() => onGo("bills")}>
                   Open Bills →
                 </button>}>
            {ex.recurring.length === 0 ? (
              <p className="fc-none">
                Nothing recurring is on the books. Add a bill and what it costs
                shows here.
              </p>
            ) : (
              <div className="fin-tablewrap">
                <table className="fin-table hh-table">
                  <thead>
                    <tr><th>What</th><th>How often</th><th className="num">Each time</th>
                        <th className="num">A month</th><th>Last paid</th></tr>
                  </thead>
                  <tbody>
                    {ex.recurring.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <span className="ic-who">
                            <Disc name={r.categoryName || r.name} size="sm" /><b>{r.name}</b>
                          </span>
                        </td>
                        <td>{r.frequency}</td>
                        <td className="num fin-fig fe-out">{money.exact(r.amount)}</td>
                        <td className="num fin-fig">{money.round(r.monthlyEquivalent)}</td>
                        <td className="fc-date">
                          {dayLabel(r.lastPaid) ?? <span className="fin-dash">never recorded</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td>Total</td><td /><td />
                        <td className="num fin-fig">{money.round(s.subscriptionsMonthly)}</td><td /></tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Panel>
          <Panel title="Falling due soon"
                 sub={ex.bills.total ? `${money.round(ex.bills.total)} agreed to leave` : undefined}>
            {[...ex.bills.overdue, ...ex.bills.upcoming].length === 0 ? (
              <p className="fc-none">Nothing is agreed to leave in the next six weeks.</p>
            ) : (
              <ul className="hm-bills">
                {[...ex.bills.overdue, ...ex.bills.upcoming].map((x, i) => (
                  <li key={`${x.commitmentId}-${x.date}-${i}`}>
                    <Disc name={x.categoryName || x.name} />
                    <span className="hm-bill-who">
                      <b>{x.name}</b><em>{dayLabel(x.date)}</em>
                    </span>
                    <span className="fin-fig hm-bill-amt">{money.round(x.amount)}</span>
                    <span className={`hm-when${x.days < 0 ? " late" : x.days <= 3 ? " soon" : ""}`}>
                      {x.days < 0 ? `${Math.abs(x.days)} days late`
                        : x.days === 0 ? "today" : `${x.days} days left`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}

      {tab === "variable" && (
        <Panel title="Spending nothing had agreed"
               sub={`${money.round(s.variable)} this month, across ${ex.variableParties?.length ?? 0}`}>
          {!ex.variableParties?.length ? (
            <p className="fc-none">
              Everything recorded this month was under a standing agreement.
            </p>
          ) : (
            <div className="fin-tablewrap">
              <table className="fin-table hh-table">
                <thead>
                  <tr><th>Who</th><th className="num">This month</th>
                      <th className="num">Times</th><th>Share of what was decided</th></tr>
                </thead>
                <tbody>
                  {ex.variableParties.map((p) => (
                    <tr key={p.name}>
                      <td><span className="ic-who"><Disc name={p.name} size="sm" /><b>{p.name}</b></span></td>
                      <td className="num fin-fig fe-out">{money.round(p.total ?? p.amount)}</td>
                      <td className="num">{p.count ?? <span className="fin-dash">—</span>}</td>
                      <td className="hh-barcell">
                        <span className="hh-bar">
                          <i style={{ width: `${s.variable ? ((p.total ?? p.amount) / s.variable) * 100 : 0}%` }} />
                        </span>
                        <em>{s.variable ? pct((p.total ?? p.amount) / s.variable) : 0}%</em>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="fc-note">
            This is the part of the month that moves when you decide it should.
            The rest needs an agreement changed, not a decision made.
          </p>
        </Panel>
      )}

      {tab === "trends" && (
        <>
          <Panel title="Thirteen months" sub="Total, and the two halves it divides into">
            <SplitLines series={ex.series.map((m) => ({ ...m, subs: s.subscriptionsMonthly }))}
                        money={money} current={period} />
          </Panel>
          <Panel title="The same figures, exactly">
            <div className="fin-tablewrap">
              <table className="fin-table we-table">
                <thead>
                  <tr><th>Month</th><th className="num">Total out</th>
                      <th className="num">Under agreement</th><th className="num">Everything else</th>
                      <th className="num">Agreed share</th></tr>
                </thead>
                <tbody>
                  {[...ex.series].reverse().filter((m) => m.total).map((m) => (
                    <tr key={m.period}>
                      <td>{monthLabel(m.period)}</td>
                      <td className="num fin-fig fe-out">{money.round(m.total)}</td>
                      <td className="num fin-fig">{money.round(m.fixed)}</td>
                      <td className="num fin-fig">{money.round(m.variable)}</td>
                      <td className="num">{m.total ? `${Math.round((m.fixed / m.total) * 100)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {setting && (
        <SetUpAsBill detected={setting} entity={entity} currency={currency}
                     money={money}
                     onClose={() => setSetting(null)}
                     onSaved={() => { setSetting(null); onChanged(); }} />
      )}
    </div>
  );
}

// Turning something that keeps leaving into an agreement. The same thing the
// Income page does for a deposit, in the other direction — and it writes a
// real commitment rather than a note.
function SetUpAsBill({ detected, entity, currency, money, onClose, onSaved }) {
  const [frequency, setFrequency] = useState("monthly");
  const [amount, setAmount] = useState(String(detected.typical / 100));
  const [startDate, setStartDate] = useState(detected.latest);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api.addCommitment({
        entity, direction: "out", description: detected.who, counterparty: detected.who,
        categoryId: detected.categoryId || undefined,
        amount: Number(amount), currency, frequency, startDate,
      });
      onSaved();
    } catch (err) {
      setMsg(err.message || "Could not set that up.");
    } finally { setBusy(false); }
  }

  return (
    <div className="fin-modal" role="dialog" aria-label="Set this up as a bill">
      <div className="fin-sheet">
        <header className="fin-sheethead">
          <h2>Set up “{detected.who}” as a bill</h2>
          <button className="fin-x" onClick={onClose} aria-label="Close">×</button>
        </header>
        <form className="fin-form" onSubmit={save}>
          <p className="fin-help wide">
            {money.round(detected.typical)} has left {detected.times} times across{" "}
            {detected.months} months, most recently on {dayLabel(detected.latest)}.
            Setting it up means it shows on Bills and in what the month is
            expected to hold. Nothing already recorded changes.
          </p>
          <label><span>How often</span>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              {[["weekly", "Weekly"], ["monthly", "Monthly"],
                ["quarterly", "Quarterly"], ["annual", "Yearly"]].map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label><span>Amount each time</span>
            <input type="number" step="0.01" min="0.01" value={amount}
                   onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label><span>First payment</span>
            <input type="date" value={startDate}
                   onChange={(e) => setStartDate(e.target.value)} required />
          </label>
          {msg && <p className="fin-error wide">{msg}</p>}
          <div className="fin-formacts wide">
            <span className="ic-spacer" />
            <button type="button" className="fin-btn ghost" onClick={onClose}>Cancel</button>
            <button className="fin-btn" disabled={busy}>
              {busy ? "Setting up…" : "Set it up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
