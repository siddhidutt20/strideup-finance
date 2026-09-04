import { useMemo, useState } from "react";
import { Panel } from "./pieces.jsx";
import { monthLabel } from "./format.js";

// ── The home page ────────────────────────────────────────────
// The first screen: where you stand, how this month compares with the last
// one, what is about to leave, where the money went, and what actually moved.
// Everything here is recorded or committed. The one planned figure — the
// budget strip at the foot — says it is a plan.

const pct = (v) => (v == null ? null : Math.round(v * 100));

export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

// A signed change against last month, drawn the same way everywhere: an
// arrow, a figure, and a colour that means "is this the direction you want".
// Spending up is not good news, so the caller says which way is good.
function Change({ value, goodWhen = "up", suffix = "from last month" }) {
  if (value == null || !Number.isFinite(value)) {
    return <em className="hm-flat">no month before to compare</em>;
  }
  const up = value >= 0;
  const good = goodWhen === "up" ? up : !up;
  return (
    <em className={`hm-change ${good ? "good" : "bad"}`}>
      {up ? "▲" : "▼"} {up ? "+" : "−"}{Math.abs(value * 100).toFixed(Math.abs(value) < 0.1 ? 1 : 0)}% {suffix}
    </em>
  );
}

const KPI_ICONS = {
  cash: <><rect x="2.5" y="5" width="15" height="11" rx="2.5" /><path d="M13 10.5h2.5" /></>,
  in: <><path d="M10 3.5v11" /><path d="M5.5 10 10 14.5 14.5 10" /></>,
  out: <><path d="M10 16.5v-11" /><path d="M5.5 10 10 5.5 14.5 10" /></>,
  saved: <><ellipse cx="10" cy="6" rx="6.5" ry="2.5" /><path d="M3.5 6v8c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V6" /><path d="M3.5 10.5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" /></>,
};

function KpiCard({ tone, icon, label, value, negative, children }) {
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

// ── Income against spending, by month ────────────────────────
// The same two series the rest of the app draws, in the same two colours, with
// a gutter so the size of a bar can be read without hovering it.
function HomeBars({ series, money, current }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...series.flatMap((m) => [m.revenue, m.expenses]));
  const W = 720, H = 210, PAD_B = 26, PAD_T = 12, PAD_L = 44;
  const plot = W - PAD_L;
  const slot = plot / Math.max(series.length, 1);
  const bw = Math.min(16, Math.max(5, slot / 2 - 4));
  const scale = (v) => ((H - PAD_B - PAD_T) * Math.max(0, v)) / max;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="hm-chart">
      <div className="fin-legend hm-legend">
        <span><i style={{ background: "var(--fin-in)" }} />Income</span>
        <span><i style={{ background: "var(--fin-out)" }} />Expenses</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="fin-svg" role="img"
           aria-label="Income and expenses by month">
        {ticks.map((t) => {
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
              <rect x={cx - bw - 1.5} y={H - PAD_B - scale(m.revenue)} width={bw}
                    height={scale(m.revenue)} rx="3" fill="var(--fin-in)" />
              <rect x={cx + 1.5} y={H - PAD_B - scale(m.expenses)} width={bw}
                    height={scale(m.expenses)} rx="3" fill="var(--fin-out)" />
              <text x={cx} y={H - 8}
                    className={`fin-xlab${m.period === current ? " now" : ""}`}>
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
            <span><i style={{ background: "var(--fin-in)" }} />{money.exact(hover.revenue)}</span>
            <span><i style={{ background: "var(--fin-out)" }} />{money.exact(hover.expenses)}</span>
            <span className="fin-tip-net">kept {money.exact(hover.net)}</span>
          </>
        ) : <span className="fin-tip-idle">Hover a month for exact figures</span>}
      </div>
    </div>
  );
}

// ── Category glyphs ──────────────────────────────────────────
// A picture is faster to scan than a word, but only if it is the right
// picture. Anything that is not recognised keeps its initial rather than
// being given a symbol that means something else.
const GLYPHS = [
  [/food|grocer|dining|restaurant|eat|cafe|coffee/i,
   <><path d="M5 3v7a2 2 0 0 0 4 0V3" /><path d="M7 10v7" /><path d="M14.5 3c-1.4 1.2-2 3-2 5s.6 2.5 2 2.5V17" /></>],
  [/shop|retail|cloth|amazon|store|purchase/i,
   <><path d="M4 6.5h12l-1 10.5H5Z" /><path d="M7.5 6.5V5a2.5 2.5 0 0 1 5 0v1.5" /></>],
  [/transport|travel|fuel|petrol|car|uber|taxi|train/i,
   <><path d="M3.5 12.5h13l-1.2-4.2A2 2 0 0 0 13.4 7H6.6a2 2 0 0 0-1.9 1.3Z" /><path d="M3.5 12.5v3h2.5v-3" /><path d="M14 12.5v3h2.5v-3" /></>],
  [/rent|home|house|mortgage|utilit|electric|water/i,
   <><path d="M3.5 9 10 3.5 16.5 9" /><path d="M5.5 8.5V16h9V8.5" /></>],
  [/health|medic|doctor|pharma|insur/i,
   <><path d="M10 4v12" /><path d="M4 10h12" /></>],
  [/tech|software|subscription|phone|internet|netflix|stream/i,
   <><rect x="3" y="4.5" width="14" height="9" rx="1.6" /><path d="M7 16.5h6" /></>],
  [/other/i,
   <><circle cx="6" cy="6" r="2" /><circle cx="14" cy="6" r="2" /><circle cx="6" cy="14" r="2" /><circle cx="14" cy="14" r="2" /></>],
];

function Glyph({ name }) {
  const hit = GLYPHS.find(([re]) => re.test(name));
  if (!hit) return <b>{String(name).trim().charAt(0).toUpperCase()}</b>;
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor"
         strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {hit[1]}
    </svg>
  );
}

const INSIGHT_ICON = {
  up: <path d="M4 12.5 8 8.5l2.5 2.5L16 5.5" />,
  down: <path d="M4 5.5 8 9.5l2.5-2.5L16 12.5" />,
  note: <><rect x="3.5" y="4" width="13" height="12.5" rx="2" /><path d="M3.5 8h13" /><path d="M7 2.5v3" /><path d="M13 2.5v3" /></>,
};

export function HomeView({ home, money, period, owner, onGo, onEditBudget,
                          onUpload, onAdd }) {
  const [span, setSpan] = useState("year");
  const s = home.savings;
  const b = home.budget;
  const bills = [...home.bills.overdue, ...home.bills.upcoming].slice(0, 4);

  // "This year" is January to the month on the picker. "Last 12 months" is the
  // twelve that ended with it. Both end where you are looking, so the chart
  // never contradicts the figures above it.
  const series = useMemo(() => {
    if (span !== "year") return home.series.slice(-12);
    const year = period.slice(0, 4);
    const inYear = home.series.filter((m) => m.period.slice(0, 4) === year);
    return inYear.length ? inYear : home.series.slice(-12);
  }, [home.series, span, period]);

  // Whether the month is going well, said in one line rather than left for the
  // reader to work out from four cards.
  const ok = s.saved >= 0 && !home.bills.overdue.length && !b.categories.some((c) => c.over);
  const standing = ok
    ? { title: "Stay on track,", line: "you're doing great!" }
    : s.saved < 0
      ? { title: "More went out", line: "than came in this month." }
      : home.bills.overdue.length
        ? { title: "Something is late.", line: `${home.bills.overdue.length} bill${home.bills.overdue.length === 1 ? "" : "s"} past their date.` }
        : { title: "Watch the plan —", line: "some headings are over." };

  return (
    <div className="hm">
      <div className="hm-kpis">
        <KpiCard tone="cash" icon="cash" label="Total cash" value={money.round(home.cash.amount)}
                 negative={home.cash.amount < 0}>
          {/* Cash is an all-time position; what changed is what this month
              moved, against where the month opened. Said as "this month" so
              it is never read as a comparison of two balances. */}
          <Change value={home.cash.change} goodWhen="up"
                  suffix={`over ${monthLabel(period, true)}`} />
        </KpiCard>
        <KpiCard tone="in" icon="in" label={`${monthLabel(period, true)} income`}
                 value={money.round(s.income)}>
          <Change value={home.change.income} goodWhen="up" />
        </KpiCard>
        <KpiCard tone="out" icon="out" label={`${monthLabel(period, true)} spending`}
                 value={money.round(s.spent)}>
          <Change value={home.change.spent} goodWhen="down" />
        </KpiCard>
        <KpiCard tone="save" icon="saved" label="Kept this month"
                 value={money.round(s.saved)} negative={s.saved < 0}>
          <em className="hm-flat">
            {s.rate == null ? "nothing came in yet" : `${pct(s.rate)}% of what came in`}
          </em>
        </KpiCard>
      </div>

      <div className="hm-row hm-row-a">
        <Panel title="Income vs expenses"
               sub={`${monthLabel(series[0]?.period ?? period, true)} to ${monthLabel(period, true)}`}
               action={
                 <label className="hm-pick">
                   <span className="fin-sr">Range</span>
                   <select value={span} onChange={(e) => setSpan(e.target.value)}>
                     <option value="year">This year</option>
                     <option value="12">Last 12 months</option>
                   </select>
                 </label>
               }>
          {series.some((m) => m.revenue || m.expenses)
            ? <HomeBars series={series} money={money} current={period} />
            : <p className="fc-none">Nothing is recorded in this range yet.</p>}
        </Panel>

        <Panel title="Upcoming bills"
               sub={home.bills.total ? `${money.round(home.bills.total)} agreed to leave` : undefined}
               action={<button className="fin-link" onClick={() => onGo("bills")}>View all →</button>}>
          {bills.length === 0 ? (
            <p className="fc-none">
              Nothing is agreed to leave in the next six weeks. Upload a bill and it
              appears here.
            </p>
          ) : (
            <ul className="hm-bills">
              {bills.map((x, i) => (
                <li key={`${x.commitmentId}-${x.date}-${i}`}>
                  <span className="hm-disc" aria-hidden="true"><Glyph name={x.categoryName || x.name} /></span>
                  <span className="hm-bill-who">
                    <b>{x.name}</b>
                    <em>{new Date(x.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</em>
                  </span>
                  <span className="fin-fig hm-bill-amt">{money.round(x.amount)}</span>
                  <span className={`hm-when${x.days < 0 ? " late" : x.days <= 3 ? " soon" : ""}`}>
                    {x.days < 0 ? `${Math.abs(x.days)} days late`
                      : x.days === 0 ? "today"
                      : `${x.days} day${x.days === 1 ? "" : "s"} left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <section className="fin-panel hm-standing">
          <div className="hm-standing-art" aria-hidden="true">
            <svg viewBox="0 0 200 120" preserveAspectRatio="none">
              <path d="M0 120 L52 30 L84 76 L112 40 L150 92 L200 48 L200 120Z"
                    fill="#C9B7EE" opacity=".62" />
              <path d="M52 30 L70 55 L58 58 L44 52Z" fill="#ffffff" opacity=".8" />
              <path d="M112 40 L126 60 L116 63 L104 57Z" fill="#ffffff" opacity=".8" />
              <path d="M0 120 L38 62 L74 100 L108 68 L142 110 L200 74 L200 120Z"
                    fill="#F0B9D4" opacity=".5" />
              <path d="M0 120 L30 92 L66 116 L104 96 L146 120 L200 100 L200 120Z"
                    fill="#ffffff" opacity=".62" />
            </svg>
          </div>
          <div className="hm-standing-body">
            <h2>{standing.title}<br />{standing.line}</h2>
            <button className="hm-standing-go" onClick={() => onGo("budget")}
                    aria-label="Open the budget">→</button>
            <hr />
            <p className="hm-quote">“Discipline today<br />builds freedom tomorrow.”</p>
          </div>
        </section>
      </div>

      <div className="hm-row hm-row-b">
        <Panel title={`Top spending (${monthLabel(period, true)})`}
               sub={home.spendTotal ? money.round(home.spendTotal) + " out" : undefined}
               action={<button className="fin-link" onClick={() => onGo("expenses")}>See details →</button>}>
          {home.topCategories.length === 0 ? (
            <p className="fc-none">Nothing has been recorded as spending this month.</p>
          ) : (
            <ul className="hm-cats">
              {home.topCategories.map((c) => (
                <li key={c.name}>
                  <span className="hm-disc" aria-hidden="true"><Glyph name={c.name} /></span>
                  <b className="hm-cat-name" title={c.folds ? `${c.folds} more categories` : undefined}>
                    {c.name}
                  </b>
                  <span className="fin-fig hm-cat-amt">{money.round(c.amount)}</span>
                  <em>{pct(c.share)}%</em>
                  <span className="hm-cat-bar"><i style={{ width: `${Math.min(100, c.share * 100)}%` }} /></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Insights for you"
               action={<button className="fin-link" onClick={() => onGo("expenses")}>
                 View detailed report →
               </button>}>
          {home.insights.length === 0 ? (
            <p className="fc-none">
              Record a second month and this fills up — every line here compares
              this month with the one before it.
            </p>
          ) : (
            <ul className="hm-insights">
              {home.insights.map((x, i) => (
                <li key={i}>
                  <span className={`hm-ins-icon t-${x.tone}`} aria-hidden="true">
                    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor"
                         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      {INSIGHT_ICON[x.tone] ?? INSIGHT_ICON.note}
                    </svg>
                  </span>
                  {x.text}
                </li>
              ))}
            </ul>
          )}
          <p className="fc-note">
            Worked out from your own recorded entries — arithmetic, not a guess.
          </p>
        </Panel>

        <Panel title="Recent transactions"
               action={<button className="fin-link" onClick={() => onGo("ledger")}>View all →</button>}>
          {home.recent.length === 0 ? (
            <p className="fc-none">
              Nothing is recorded yet. Upload a bill or add an entry and it lands here.
            </p>
          ) : (
            <ul className="hm-recent">
              {home.recent.map((r) => (
                <li key={r.id}>
                  <em className="hm-rec-date">
                    {new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </em>
                  <span className="hm-disc sm" aria-hidden="true"><Glyph name={r.categoryName || r.name} /></span>
                  <b className="hm-rec-who">
                    {r.name}
                    {r.needsReview && <span className="fc-dupetag">needs a look</span>}
                  </b>
                  <span className="hm-rec-cat">{r.categoryName}</span>
                  <span className={`fin-fig hm-rec-amt ${r.direction === "in" ? "fe-in" : "fe-out"}`}>
                    {r.direction === "in" ? "+" : "−"} {money.round(r.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* The plan, at the foot, kept apart from everything above it: a budget
          is what you meant to do, not what happened, and it is never added
          into a position. */}
      <section className="fin-panel hm-plan">
        <span className="hm-plan-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor"
               strokeWidth="1.6"><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3.2" /></svg>
        </span>
        <span className="hm-plan-what">
          <em>Your {monthLabel(period)} plan</em>
          <b>{b.total == null ? "No budget set yet" : `Spend under ${money.round(b.total)}`}</b>
        </span>
        {b.total == null ? (
          <>
            <p className="hm-plan-none">
              Set what the month is meant to cost and this strip tracks it against
              what you have actually spent.
            </p>
            <button className="fin-btn" onClick={onEditBudget}>Set a budget</button>
          </>
        ) : (
          <>
            <span className="hm-plan-bar">
              <i className={b.remaining < 0 ? "over" : ""}
                 style={{ width: `${Math.min(100, (b.usedPct ?? 0) * 100)}%` }} />
            </span>
            <span className="hm-plan-fig">
              <b className="fin-fig">{money.round(b.spent)} / {money.round(b.total)}</b>
              <em className={b.remaining < 0 ? "over" : ""}>{pct(b.usedPct) ?? 0}% used</em>
            </span>
            <button className="fin-link" onClick={() => onGo("budget")}>View budget →</button>
            <span className={`hm-plan-tag${b.remaining < 0 ? " over" : ""}`}>
              {b.remaining < 0
                ? `${money.round(-b.remaining)} over the plan`
                : `${money.round(b.remaining)} left to spend`}
            </span>
          </>
        )}
      </section>

      <p className="fc-note hm-foot">
        Totals count everything recorded and not rejected. Bills are what an
        agreement says will leave — they reach your spending when you record them
        as paid. Total cash is what has been recorded here, not a bank balance.
        {" "}
        <button className="fin-link" onClick={onUpload}>Upload a bill</button>
        {" · "}
        <button className="fin-link" onClick={onAdd}>Add a transaction</button>
      </p>
    </div>
  );
}
