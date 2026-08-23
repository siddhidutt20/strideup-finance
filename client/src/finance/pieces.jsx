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
  // A month past today has recorded nothing; its bar is what is committed to
  // move in it. Hollow rather than solid, so the two are never read as one
  // kind of claim — the same grammar the forecast lines use.
  const anyAhead = series.some((m) => m.committed);
  const bar = (m, c) => (m.committed
    ? { fill: c, fillOpacity: 0.16, stroke: c, strokeWidth: 1.5, strokeDasharray: "3 2" }
    : { fill: c });

  return (
    <div className="fin-chart">
      {!only && (
        <div className="fin-legend">
          <span><i style={{ background: "var(--fin-in)" }} />Revenue</span>
          <span><i style={{ background: "var(--fin-out)" }} />Expenses</span>
          {anyAhead && <span><i className="fin-key-ahead" />Committed, not yet recorded</span>}
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
                      {...bar(m, colour[only])} />
              ) : (
                <>
                  <path d={barPath(cx - bw - 1, H - PAD_B - scale(m.revenue), bw, scale(m.revenue))}
                        {...bar(m, "var(--fin-in)")} />
                  <path d={barPath(cx + 1, H - PAD_B - scale(m.expenses), bw, scale(m.expenses))}
                        {...bar(m, "var(--fin-out)")} />
                </>
              )}
              <text x={cx} y={H - 8}
                    className={`fin-xlab${m.period === current ? " now" : ""}${m.committed ? " ahead" : ""}`}>
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
            {hover.committed && <span className="fin-tip-ahead">committed, not recorded</span>}
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

// ── Several series over the same months ──────────────────────
// Recorded months are solid with filled dots; months past today carry what is
// committed and are drawn dashed with hollow dots, split by a marked divider.
// The two are the same line because they are the same measure, and they are
// drawn differently because one happened and the other is only agreed.
//
// Colours: #5B21B6 / #0FA3C7 / #eda100 — worst all-pairs ΔE 21.4 under
// protanopia, 28.8 under normal vision. The legend labels every series, which
// is the relief the two lightest hues need on a light surface.
export const LINE_COLOURS = ["#5B21B6", "#0FA3C7", "#eda100"];

export function MultiLine({ points, series, money, aheadFrom, height = 210 }) {
  const [hover, setHover] = useState(null);
  const W = 780, H = height, L = 52, R = 10, T = 14, B = 30;
  const n = points.length;
  if (!n) return <p className="fc-none">Nothing to plot yet.</p>;

  const vals = points.flatMap((p) => series.map((s) => p[s.key])).filter((v) => v != null);
  const hi = Math.max(1, ...vals);
  // A margin can be negative, and a scale that starts at zero draws that
  // month below the axis and off the chart. The floor follows the data.
  const lo = Math.min(0, ...vals);
  // A round ceiling, so the gridline labels are numbers a person would say.
  const step = Math.pow(10, Math.floor(Math.log10(Math.max(1, hi - lo))));
  const top = Math.ceil(hi / step) * step || 1;
  const bottom = lo < 0 ? -(Math.ceil(Math.abs(lo) / step) * step) : 0;
  const span = top - bottom || 1;
  const x = (i) => L + (n === 1 ? (W - L - R) / 2 : ((W - L - R) * i) / (n - 1));
  const y = (v) => T + (H - T - B) * (1 - ((v ?? 0) - bottom) / span);

  const aheadIdx = aheadFrom == null ? n : points.findIndex((p) => p.period === aheadFrom);
  const cut = aheadIdx < 0 ? n : aheadIdx;
  const path = (key, from, to) =>
    points.slice(from, to)
          .map((p, i) => (p[key] == null ? null : `${x(from + i)},${y(p[key])}`))
          .filter(Boolean)
          .map((pt, i) => `${i ? "L" : "M"}${pt}`)
          .join(" ");

  return (
    <div className="fin-chart">
      <div className="fin-legend">
        {series.map((s, i) => (
          <span key={s.key}>
            <i className="ml-key" style={{ background: s.colour ?? LINE_COLOURS[i] }} />
            {s.label}
          </span>
        ))}
        {cut < n && <span><i className="ml-key ahead" />Committed, not yet recorded</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="fin-svg ml-svg" role="img"
           aria-label={series.map((s) => s.label).join(", ") + " by month"}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const v = bottom + span * t;
          return (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="fin-grid-line" />
              <text x={L - 8} y={y(v) + 3.5} className="ml-ylab">
                {money.compact ? money.compact(v) : Math.round(v / 100)}
              </text>
            </g>
          );
        })}
        {bottom < 0 && <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="fin-axis" />}
        {cut > 0 && cut < n && (
          <>
            <line x1={x(cut - 1)} x2={x(cut - 1)} y1={T} y2={H - B} className="ml-divide" />
            <text x={x(cut - 1) - 6} y={T + 8} className="ml-band" textAnchor="end">Recorded</text>
            <text x={x(cut - 1) + 6} y={T + 8} className="ml-band">Committed</text>
          </>
        )}
        {series.map((s, si) => {
          const c = s.colour ?? LINE_COLOURS[si];
          return (
            <g key={s.key}>
              <path d={path(s.key, 0, cut)} fill="none" stroke={c} strokeWidth={s.weight ?? 2.2}
                    strokeLinejoin="round" strokeLinecap="round" />
              {cut > 0 && cut < n && (
                <path d={path(s.key, cut - 1, n)} fill="none" stroke={c}
                      strokeWidth={s.weight ?? 2.2}
                      strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
              )}
              {points.map((p, i) => (p[s.key] == null ? null : (
                <circle key={p.period} cx={x(i)} cy={y(p[s.key])} r={hover === i ? 4.5 : 3}
                        fill={i >= cut ? "var(--fin-surface)" : c} stroke={c} strokeWidth="1.8" />
              )))}
            </g>
          );
        })}
        {points.map((p, i) => (
          <rect key={p.period} x={x(i) - (W - L - R) / (2 * Math.max(n - 1, 1))} y={0}
                width={(W - L - R) / Math.max(n - 1, 1)} height={H} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
        {points.map((p, i) => (
          (n <= 8 || i % Math.ceil(n / 8) === 0 || i === n - 1) ? (
            <text key={`l-${p.period}`} x={x(i)} y={H - 10}
                  className={`fin-xlab${i >= cut ? " ahead" : ""}`}>
              {monthLabel(p.period, true).split(" ")[0]}
            </text>
          ) : null
        ))}
      </svg>
      <div className="fin-tip" aria-live="polite">
        {hover != null ? (
          <>
            <strong>{monthLabel(points[hover].period)}</strong>
            {series.map((s, si) => (
              <span key={s.key}>
                <i style={{ background: s.colour ?? LINE_COLOURS[si] }} />
                {points[hover][s.key] == null ? "—" : money.exact(points[hover][s.key])}
              </span>
            ))}
            {hover >= cut && <span className="fin-tip-ahead">committed, not recorded</span>}
          </>
        ) : <span className="fin-tip-idle">Hover a month for exact figures</span>}
      </div>
    </div>
  );
}

// ── Bars and a line, on two axes ─────────────────────────────
// Money on the left, a percentage on the right. Two axes on one chart is
// normally a way to imply a relationship that isn't there; it earns its place
// here because margin IS the ratio of two of the bars, so the reader is meant
// to read them together. The right axis is labelled and the line is the only
// thing on it.
//
// Colours: #2a78d6 / #1baf7a / #eda100 / #008300 for the bars and #4a3aa7 for
// the line — worst all-pairs ΔE 9.1 under protanopia, 15.6 under normal
// vision. The legend names every series, which is the relief the two lightest
// bars need on a light surface.
export const COMBO_COLOURS = ["#2a78d6", "#1baf7a", "#eda100", "#008300"];
export const COMBO_LINE = "#4a3aa7";

export function ComboChart({ points, bars, line, money, height = 250 }) {
  const [hover, setHover] = useState(null);
  const W = 760, H = height, L = 56, R = 46, T = 16, B = 30;
  const n = points.length;
  if (!n) return <p className="fc-none">Nothing to plot yet.</p>;

  const vals = points.flatMap((p) => bars.map((b) => p[b.key] ?? 0));
  const hi = Math.max(1, ...vals);
  const lo = Math.min(0, ...vals);
  const step = Math.pow(10, Math.floor(Math.log10(Math.max(1, hi))));
  const top = Math.ceil(hi / step) * step || 1;
  const bottom = lo < 0 ? -(Math.ceil(Math.abs(lo) / step) * step) : 0;
  const span = top - bottom || 1;

  const pcts = points.map((p) => p[line.key]).filter((v) => v != null);
  const pHi = Math.max(10, ...pcts.map((v) => Math.ceil(v / 10) * 10));
  const pLo = Math.min(0, ...pcts.map((v) => Math.floor(v / 10) * 10));
  const pSpan = pHi - pLo || 1;

  const slot = (W - L - R) / n;
  const bw = Math.max(3, Math.min(11, (slot - 8) / bars.length));
  const y = (v) => T + (H - T - B) * (1 - (v - bottom) / span);
  const yp = (v) => T + (H - T - B) * (1 - (v - pLo) / pSpan);
  const cx = (i) => L + slot * i + slot / 2;

  const linePath = points
    .map((p, i) => (p[line.key] == null ? null : `${i ? "L" : "M"}${cx(i)},${yp(p[line.key])}`))
    .filter(Boolean).join(" ").replace(/^L/, "M");

  return (
    <div className="fin-chart">
      <div className="fin-legend">
        {bars.map((b, i) => (
          <span key={b.key}><i className="ml-key" style={{ background: COMBO_COLOURS[i] }} />{b.label}</span>
        ))}
        <span><i className="ml-key cb-line" />{line.label}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="fin-svg ml-svg" role="img"
           aria-label={`${bars.map((b) => b.label).join(", ")} and ${line.label} by month`}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const v = bottom + span * t;
          return (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="fin-grid-line" />
              <text x={L - 8} y={y(v) + 3.5} className="ml-ylab">{money.compact(v)}</text>
              <text x={W - R + 8} y={yp(pLo + pSpan * t) + 3.5} className="ml-ylab cb-right">
                {Math.round(pLo + pSpan * t)}%
              </text>
            </g>
          );
        })}
        {bottom < 0 && (
          <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="fin-axis" />
        )}
        {points.map((p, i) => (
          <g key={p.period} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={L + slot * i} y={0} width={slot} height={H}
                  fill={hover === i ? "var(--fin-sunk)" : "transparent"} />
            {bars.map((b, bi) => {
              const v = p[b.key] ?? 0;
              const x = cx(i) - (bars.length * bw) / 2 + bi * bw;
              const top0 = y(Math.max(0, v));
              const h = Math.abs(y(v) - y(0));
              return <rect key={b.key} x={x + 0.5} y={top0} width={Math.max(2, bw - 1)}
                           height={Math.max(1, h)} fill={COMBO_COLOURS[bi]} rx="1.5" />;
            })}
          </g>
        ))}
        <path d={linePath} fill="none" stroke={COMBO_LINE} strokeWidth="2.2"
              strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (p[line.key] == null ? null : (
          <circle key={`d-${p.period}`} cx={cx(i)} cy={yp(p[line.key])}
                  r={hover === i ? 4 : 2.8} fill="var(--fin-surface)"
                  stroke={COMBO_LINE} strokeWidth="1.8" />
        )))}
        {points.map((p, i) => (
          (n <= 12 || i % 2 === 0) ? (
            <text key={`l-${p.period}`} x={cx(i)} y={H - 10} className="fin-xlab">
              {monthLabel(p.period, true).replace(" ", " '").slice(0, 6)}
            </text>
          ) : null
        ))}
      </svg>
      <div className="fin-tip" aria-live="polite">
        {hover != null ? (
          <>
            <strong>{monthLabel(points[hover].period)}</strong>
            {bars.map((b, bi) => (
              <span key={b.key}>
                <i style={{ background: COMBO_COLOURS[bi] }} />
                {money.exact(points[hover][b.key] ?? 0)}
              </span>
            ))}
            <span><i style={{ background: COMBO_LINE }} />
              {points[hover][line.key] == null ? "—" : `${Math.round(points[hover][line.key])}%`}
            </span>
          </>
        ) : <span className="fin-tip-idle">Hover a month for exact figures</span>}
      </div>
    </div>
  );
}
