import { useState } from "react";
import { fmtAmount, monthLabel } from "./format.js";

// `narrow` keeps a statement to a readable column rather than stranding it in
// a full-width panel with dead space beside it.
export function Panel({ id, title, sub, action, narrow, children }) {
  return (
    <section className={`fin-panel${narrow ? " fin-narrow" : ""}`} id={id}>
      {(title || sub || action) && (
        <div className="fin-panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <span>{sub}</span>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, delta, hint, tone, emphasis, invertDelta }) {
  const good = delta == null ? null : invertDelta ? delta <= 0 : delta >= 0;
  return (
    <div className={`fin-kpi${emphasis ? " emph" : ""}${tone ? ` t-${tone}` : ""}`}>
      <span className="fin-kpi-label">{label}</span>
      <strong className="fin-kpi-value">{value}</strong>
      {delta != null && Number.isFinite(delta) ? (
        <span className={`fin-kpi-delta ${good ? "up" : "down"}`}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}% vs last month
        </span>
      ) : (
        hint && <span className="fin-kpi-hint">{hint}</span>
      )}
    </div>
  );
}

// A bar is rounded at its data end and square where it meets the baseline,
// so the mark reads as growing from the axis rather than floating.
function barPath(x, y, w, h, r = 4) {
  const rr = Math.min(r, w / 2, Math.max(0, h));
  if (h <= 0.5) return "";
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} ` +
         `L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

// `only` draws a single series — used on the Revenue and Expenses views,
// where the other series would just be noise.
export function TrendChart({ series, money, current, only }) {
  const [hover, setHover] = useState(null);
  const keys = only ? [only] : ["revenue", "expenses"];
  const max = Math.max(1, ...series.flatMap((m) => keys.map((k) => m[k])));
  const W = 760, H = 190, PAD_B = 26, PAD_T = 10;
  const slot = W / Math.max(series.length, 1);
  const bw = only
    ? Math.min(30, Math.max(8, slot * 0.42))
    : Math.min(18, Math.max(6, slot / 2 - 3));
  const scale = (v) => ((H - PAD_B - PAD_T) * v) / max;
  const colour = { revenue: "var(--fin-in)", expenses: "var(--fin-out)" };

  return (
    <div className="fin-chart">
      {!only && (
        <div className="fin-legend">
          <span><i style={{ background: "var(--fin-in)" }} />Revenue</span>
          <span><i style={{ background: "var(--fin-out)" }} />Expenses</span>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="fin-svg" role="img"
           aria-label={only ? `${only} by month` : "Revenue and expenses by month"}>
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1="0" x2={W}
                y1={PAD_T + (H - PAD_B - PAD_T) * (1 - t)}
                y2={PAD_T + (H - PAD_B - PAD_T) * (1 - t)} className="fin-grid-line" />
        ))}
        {series.map((m, i) => {
          const cx = i * slot + slot / 2;
          return (
            <g key={m.period} onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)}>
              <rect x={i * slot} y="0" width={slot} height={H} fill="transparent" />
              {only ? (
                <path d={barPath(cx - bw / 2, H - PAD_B - scale(m[only]), bw, scale(m[only]))}
                      fill={colour[only]} />
              ) : (
                <>
                  <path d={barPath(cx - bw - 1, H - PAD_B - scale(m.revenue), bw, scale(m.revenue))}
                        fill="var(--fin-in)" />
                  <path d={barPath(cx + 1, H - PAD_B - scale(m.expenses), bw, scale(m.expenses))}
                        fill="var(--fin-out)" />
                </>
              )}
              <text x={cx} y={H - 8} className={`fin-xlab${m.period === current ? " now" : ""}`}>
                {monthLabel(m.period, true).split(" ")[0]}
              </text>
            </g>
          );
        })}
        <line x1="0" x2={W} y1={H - PAD_B} y2={H - PAD_B} className="fin-axis" />
      </svg>
      <div className="fin-tip" aria-live="polite">
        {hover ? (
          <>
            <strong>{monthLabel(hover.period)}</strong>
            {only ? (
              <span><i style={{ background: colour[only] }} />{money.exact(hover[only])}</span>
            ) : (
              <>
                <span><i style={{ background: "var(--fin-in)" }} />{money.exact(hover.revenue)}</span>
                <span><i style={{ background: "var(--fin-out)" }} />{money.exact(hover.expenses)}</span>
                <span className="fin-tip-net">net {money.exact(hover.net)}</span>
              </>
            )}
          </>
        ) : <span className="fin-tip-idle">Hover a month for exact figures</span>}
      </div>
    </div>
  );
}

export function CategoryBars({ rows, money, empty = "Nothing recorded this month." }) {
  if (!rows?.length) return <p className="fin-none">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.amount), 1);
  return (
    <ul className="fin-cats">
      {rows.map((r) => (
        <li key={r.name + r.kind}>
          <span className="fc-name" title={r.name}>{r.name}</span>
          <span className="fc-track">
            <span className="fc-fill" style={{
              width: `${Math.max(2, (r.amount / max) * 100)}%`,
              background: r.direction === "in" ? "var(--fin-in)" : "var(--fin-out)",
            }} />
          </span>
          <span className="fc-val">{money.round(r.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

// Who money came from, or went to.
export function Ranked({ rows, money, tone = "out", empty }) {
  if (!rows?.length) return <p className="fin-none">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.amount), 1);
  return (
    <ul className="rk">
      {rows.map((r) => (
        <li key={r.name}>
          <span className="rk-name" title={r.name}>
            {r.name}
            <em>{r.count} {r.count === 1 ? "entry" : "entries"}</em>
          </span>
          <span className="rk-track">
            <span className="rk-fill" style={{
              width: `${Math.max(2, (r.amount / max) * 100)}%`,
              background: tone === "in" ? "var(--fin-in)" : "var(--fin-out)",
            }} />
          </span>
          <span className="rk-val">{money.round(r.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Receivables({ ar, money }) {
  if (!ar?.total) return <p className="fin-none">Nothing outstanding. Everything is paid.</p>;
  const buckets = [
    ["Current", ar.buckets.current, "var(--fin-in)"],
    ["1–30 days", ar.buckets.d1_30, "#EE93BC"],
    ["31–60 days", ar.buckets.d31_60, "#DD5590"],
    ["61–90 days", ar.buckets.d61_90, "#D43081"],
    ["90+ days", ar.buckets.d90plus, "#9E245F"],
  ];
  const max = Math.max(...buckets.map((b) => b[1]), 1);
  return (
    <>
      <ul className="fin-cats fin-aging">
        {buckets.map(([label, amount, color]) => (
          <li key={label}>
            <span className="fc-name">{label}</span>
            <span className="fc-track">
              <span className="fc-fill" style={{
                width: `${Math.max(amount ? 2 : 0, (amount / max) * 100)}%`, background: color }} />
            </span>
            <span className="fc-val">{amount ? money.round(amount) : "—"}</span>
          </li>
        ))}
      </ul>
      {ar.invoices.length > 0 && (
        <ul className="fin-invoices">
          {ar.invoices.map((inv) => (
            <li key={inv.id}>
              <span>{inv.customer}</span>
              <span className={inv.daysOverdue > 0 ? "od" : ""}>
                {inv.daysOverdue > 0 ? `${inv.daysOverdue}d overdue` : `due ${inv.dueDate || "—"}`}
              </span>
              <strong>{fmtAmount(money.currency, inv.outstanding)}</strong>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function CapitalList({ capital, money }) {
  if (!capital?.items?.length) {
    return <p className="fin-none">No capital events yet — no investment, loans or draws recorded.</p>;
  }
  return (
    <>
      <ul className="fin-invoices">
        {capital.items.map((i) => (
          <li key={i.name}><span>{i.name}</span><span /><strong>{money.exact(i.amount)}</strong></li>
        ))}
      </ul>
      <p className="fin-total">Net capital {money.exact(capital.netCapital)}</p>
    </>
  );
}
