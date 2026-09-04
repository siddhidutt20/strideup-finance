import { useMemo, useState } from "react";
import { api } from "../api.js";
import { Panel } from "./pieces.jsx";
import { Disc } from "./glyphs.jsx";
import { segment, SLICE_COLOURS, OTHER_COLOUR } from "./spend.jsx";
import { monthLabel, CURRENCIES } from "./format.js";

// ── What you own and what you owe ────────────────────────────
// The one page the ledger cannot answer on its own. The ledger records money
// moving; it does not know what a holding is worth today, and nothing here is
// connected to a bank or a broker. So every figure on this page is a
// valuation somebody entered, and the date they entered it for travels with
// it — a net worth with no date is a number, not a claim.

const pct = (v) => (v == null ? null : Math.round(v * 100));

const KIND_LABEL = {
  equity: "Equity", debt: "Debt", cash: "Cash & savings",
  property: "Property", gold: "Gold", other: "Other",
};
const KINDS = Object.keys(KIND_LABEL);

const dayLabel = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

// Net worth over time. One line, and it may go below zero — owing more than
// you own is a real position, not a floor to clamp at.
function NetLine({ series, money, height = 210 }) {
  const [hover, setHover] = useState(null);
  const W = 760, PAD_B = 26, PAD_T = 12, PAD_L = 52;
  const H = height;
  const vals = series.map((m) => m.net);
  // Round the ends out to something a person would write down. An axis
  // labelled 987.5 is arithmetically right and unreadable.
  const nice = (v, up) => {
    if (!v) return 0;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v))));
    const step = mag / 2;
    return (up ? Math.ceil(v / step) : Math.floor(v / step)) * step;
  };
  const hi = nice(Math.max(0, ...vals), true);
  const lo = nice(Math.min(0, ...vals), false);
  const span = hi - lo || 1;
  const x = (i) => PAD_L + ((W - PAD_L) * i) / Math.max(1, series.length - 1);
  const y = (v) => PAD_T + (H - PAD_B - PAD_T) * (1 - (v - lo) / span);
  const line = series.map((m, i) => `${i ? "L" : "M"}${x(i)},${y(m.net)}`).join(" ");
  const area = `${line} L${x(series.length - 1)},${y(lo)} L${x(0)},${y(lo)} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + span * t);

  return (
    <div className="we-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="fin-svg" role="img"
           aria-label="Net worth by month">
        <defs>
          <linearGradient id="we-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1baf7a" stopOpacity=".22" />
            <stop offset="100%" stopColor="#1baf7a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={W} y1={y(v)} y2={y(v)} className="fin-grid-line" />
            <text x={PAD_L - 8} y={y(v) + 4} className="hm-ylab">{money.compact(v)}</text>
          </g>
        ))}
        {lo < 0 && <line x1={PAD_L} x2={W} y1={y(0)} y2={y(0)} className="fin-axis" />}
        <path d={area} fill="url(#we-fill)" />
        <path d={line} fill="none" stroke="#128a5e" strokeWidth="2.2"
              strokeLinejoin="round" strokeLinecap="round" />
        {series.map((m, i) => (
          <g key={m.period} onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)}>
            <rect x={x(i) - 14} y="0" width="28" height={H} fill="transparent" />
            {hover?.period === m.period &&
              <circle cx={x(i)} cy={y(m.net)} r="4.5" fill="#128a5e" stroke="#fff" strokeWidth="2" />}
            {i % Math.ceil(series.length / 12) === 0 && (
              <text x={x(i)} y={H - 8} className="fin-xlab">
                {monthLabel(m.period, true).split(" ")[0]}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="fin-tip" aria-live="polite">
        {hover ? (
          <>
            <strong>{monthLabel(hover.period)}</strong>
            <span>net {money.exact(hover.net)}</span>
            <span className="fin-tip-net">
              {money.exact(hover.assets)} owned − {money.exact(hover.liabilities)} owed
            </span>
          </>
        ) : <span className="fin-tip-idle">Hover a month for exact figures</span>}
      </div>
    </div>
  );
}

function Allocation({ rows, money, total }) {
  const [hover, setHover] = useState(null);
  const clean = rows.filter((r) => r.total > 0);
  if (!clean.length) return <p className="fc-none">Nothing is recorded as an asset yet.</p>;
  let at = 0;
  let hue = 0;
  const slices = clean.map((r) => {
    const from = at;
    at += (r.total / total) * 360;
    const colour = r.kind === "other"
      ? OTHER_COLOUR : SLICE_COLOURS[hue++ % SLICE_COLOURS.length];
    return { ...r, from, to: at, colour };
  });
  return (
    <div className="we-alloc">
      <div className="sp-donut">
        <svg viewBox="0 0 200 200" role="img" aria-label="Assets by kind">
          {slices.length === 1 ? (
            <circle cx="100" cy="100" r="70" fill="none" strokeWidth="30"
                    stroke={slices[0].colour} />
          ) : slices.map((s) => (
            <path key={s.kind} d={segment(100, 100, 85, 55, s.from + 1, s.to - 1)}
                  fill={s.colour} opacity={hover && hover !== s.kind ? 0.35 : 1}
                  onMouseEnter={() => setHover(s.kind)} onMouseLeave={() => setHover(null)} />
          ))}
          <text x="100" y="96" className="sp-donutfig">{money.compact(total)}</text>
          <text x="100" y="116" className="sp-donutsub">total assets</text>
        </svg>
      </div>
      <ul className="we-legend">
        {slices.map((s) => (
          <li key={s.kind} onMouseEnter={() => setHover(s.kind)} onMouseLeave={() => setHover(null)}>
            <i style={{ background: s.colour }} aria-hidden="true" />
            <span>{KIND_LABEL[s.kind] ?? s.kind}</span>
            <b className="fin-fig">{money.round(s.total)}</b>
            <em>{pct(s.share)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HoldingForm({ holding, side, entity, currency, onClose, onSaved }) {
  const editing = !!holding;
  const [f, setF] = useState({
    side: holding?.side ?? side ?? "asset",
    name: holding?.name ?? "",
    kind: holding?.kind ?? (side === "liability" ? "debt" : "equity"),
    currency: holding?.currency ?? currency,
    value: holding ? String(holding.valueAsWritten / 100) : "",
    cost: holding?.cost != null ? String(holding.cost / 100) : "",
    ratePct: holding?.ratePct != null ? String(holding.ratePct) : "",
    monthlyPayment: holding?.monthlyPayment != null ? String(holding.monthlyPayment / 100) : "",
    asOf: holding?.asOf ?? new Date().toISOString().slice(0, 10),
    note: holding?.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const isDebt = f.side === "liability";

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const body = {
      entity, side: f.side, name: f.name.trim(), kind: f.kind, currency: f.currency,
      value: Number(f.value), asOf: f.asOf, note: f.note.trim() || null,
      cost: !isDebt && f.cost !== "" ? Number(f.cost) : null,
      ratePct: isDebt && f.ratePct !== "" ? Number(f.ratePct) : null,
      monthlyPayment: isDebt && f.monthlyPayment !== "" ? Number(f.monthlyPayment) : null,
    };
    try {
      if (editing) await api.updateHolding(holding.id, body);
      else await api.addHolding(body);
      onSaved();
    } catch (err) {
      setMsg(err.message || "Could not save that.");
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true);
    try { await api.deleteHolding(holding.id); onSaved(); }
    catch (err) { setMsg(err.message || "Could not remove that."); }
    finally { setBusy(false); }
  }

  return (
    <div className="fin-modal" role="dialog" aria-label={editing ? "Edit this holding" : "Add a holding"}>
      <div className="fin-sheet">
        <header className="fin-sheethead">
          <h2>{editing ? `Edit “${holding.name}”` : isDebt ? "Add something you owe" : "Add something you own"}</h2>
          <button className="fin-x" onClick={onClose} aria-label="Close">×</button>
        </header>
        <form className="fin-form" onSubmit={save}>
          <label><span>Which</span>
            <select value={f.side}
                    onChange={(e) => setF((x) => ({ ...x, side: e.target.value,
                      kind: e.target.value === "liability" ? "debt" : "equity" }))}>
              <option value="asset">Something I own</option>
              <option value="liability">Something I owe</option>
            </select>
          </label>
          <label><span>Kind</span>
            <select value={f.kind} onChange={set("kind")}>
              {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <label className="wide"><span>What it is</span>
            <input value={f.name} onChange={set("name")} required maxLength={140}
                   placeholder={isDebt ? "Education loan" : "SBI Bluechip Fund"} />
          </label>
          <label><span>{isDebt ? "Outstanding now" : "Worth now"}</span>
            <input type="number" step="0.01" min="0" value={f.value}
                   onChange={set("value")} required />
          </label>
          <label><span>Currency</span>
            <select value={f.currency} onChange={set("currency")}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          {isDebt ? (
            <>
              <label><span>Interest rate</span>
                <input type="number" step="0.01" min="0" max="200" value={f.ratePct}
                       onChange={set("ratePct")} placeholder="9.5" />
                <em className="fin-hint">Per cent a year. Optional.</em>
              </label>
              <label><span>Paying each month</span>
                <input type="number" step="0.01" min="0" value={f.monthlyPayment}
                       onChange={set("monthlyPayment")} />
              </label>
            </>
          ) : (
            <label><span>What you paid for it</span>
              <input type="number" step="0.01" min="0" value={f.cost}
                     onChange={set("cost")} />
              <em className="fin-hint">
                Optional. With it, this page can show a return; without it, it
                shows the value and says nothing about how it got there.
              </em>
            </label>
          )}
          <label><span>Figure is as at</span>
            <input type="date" value={f.asOf} onChange={set("asOf")} required />
            <em className="fin-hint">
              Nothing here is connected to a bank or a broker, so this is the
              date you are saying the figure was true for. Every one you enter
              is kept, which is what makes the net-worth line real.
            </em>
          </label>
          <label className="wide"><span>Note</span>
            <input value={f.note} onChange={set("note")} maxLength={300} />
          </label>
          {msg && <p className="fin-error wide">{msg}</p>}
          <div className="fin-formacts wide">
            {editing && (confirming ? (
              <>
                <span className="ic-confirm">
                  Remove “{holding.name}” and every valuation recorded for it?
                </span>
                <button type="button" className="fin-btn ghost danger" disabled={busy}
                        onClick={remove}>Yes, remove it</button>
                <button type="button" className="fin-btn ghost"
                        onClick={() => setConfirming(false)}>Keep it</button>
              </>
            ) : (
              <button type="button" className="fin-btn ghost danger"
                      onClick={() => setConfirming(true)}>Remove</button>
            ))}
            {!confirming && (
              <>
                <span className="ic-spacer" />
                <button type="button" className="fin-btn ghost" onClick={onClose}>Cancel</button>
                <button className="fin-btn" disabled={busy}>
                  {busy ? "Saving…" : editing ? "Save changes" : "Add it"}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function HoldingTable({ rows, money, showReturn, showDebt, onEdit, empty }) {
  if (!rows.length) return <p className="fc-none">{empty}</p>;
  return (
    <div className="fin-tablewrap">
      <table className="fin-table we-table">
        <thead>
          <tr>
            <th>Name</th><th>Kind</th>
            <th className="num">{showDebt ? "Outstanding" : "Value now"}</th>
            {showReturn && <><th className="num">Paid</th><th className="num">Return</th></>}
            {showDebt && <><th className="num">Rate</th><th className="num">A month</th></>}
            <th>As at</th><th aria-label="Edit" />
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.id}>
              <td>
                <span className="ic-who">
                  <Disc name={h.kind === "cash" ? "cash savings" : h.name} size="sm" />
                  <b>{h.name}</b>
                </span>
              </td>
              <td>{KIND_LABEL[h.kind] ?? h.kind}</td>
              <td className={`num fin-fig${showDebt ? " fe-out" : ""}`}>{money.round(h.value)}</td>
              {showReturn && (
                <>
                  <td className="num fin-fig">
                    {h.cost == null ? <span className="fin-dash">—</span> : money.round(h.cost)}
                  </td>
                  <td className={`num fin-fig${h.returnPct == null ? "" : h.returnPct >= 0 ? " fe-good" : " fe-out"}`}>
                    {h.returnPct == null ? <span className="fin-dash">not said</span>
                      : `${h.returnPct >= 0 ? "+" : "−"}${Math.abs(h.returnPct * 100).toFixed(1)}%`}
                  </td>
                </>
              )}
              {showDebt && (
                <>
                  <td className="num">{h.ratePct == null ? <span className="fin-dash">—</span> : `${h.ratePct}%`}</td>
                  <td className="num fin-fig">
                    {h.monthlyPayment == null ? <span className="fin-dash">—</span>
                      : money.round(h.monthlyPayment)}
                  </td>
                </>
              )}
              <td className="fc-date">
                {dayLabel(h.asOf)}
                {h.staleDays >= 90 && (
                  <em className="we-stale">{Math.round(h.staleDays / 30)} months ago</em>
                )}
              </td>
              <td className="ic-editcell">
                <button className="fin-btn ghost sm" onClick={() => onEdit(h)}>Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABS = [["overview", "Overview"], ["investments", "Investments"],
              ["net", "Net worth"], ["allocation", "Asset allocation"]];

export function WealthView({ we, money, entity, currency, onChanged }) {
  const [tab, setTab] = useState("overview");
  const [span, setSpan] = useState("12");
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(null);

  const series = useMemo(() => {
    const n = span === "all" ? we.series.length : Number(span);
    return we.series.slice(-n);
  }, [we.series, span]);

  const cash = we.assets.filter((a) => a.kind === "cash");
  const invested = we.assets.filter((a) => ["equity", "debt", "gold"].includes(a.kind));
  const other = we.assets.filter((a) => ["property", "other"].includes(a.kind));
  const sum = (rows) => rows.reduce((t, a) => t + a.value, 0);
  const empty = we.assets.length === 0 && we.liabilities.length === 0;

  return (
    <div className="we">
      <div className="hh-tabs">
        <span className="fin-scope hh-tabrow">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </span>
        <span className="fin-scope">
          <button className="fin-btn ghost" onClick={() => setAdding("liability")}>
            + Something I owe
          </button>
          <button className="fin-btn" onClick={() => setAdding("asset")}>
            + Something I own
          </button>
        </span>
      </div>

      {empty ? (
        <Panel title="Nothing recorded yet">
          <p className="fc-none">
            This is the one page your ledger cannot fill in by itself. It records
            money moving; it does not know what your investments, your property
            or your loans are worth today, and nothing here is connected to a
            bank or a broker.
            <br /><br />
            Add what you own and what you owe, each with the date its figure is
            true for. Every figure you enter is kept, so the net-worth line
            builds itself as you go.
          </p>
        </Panel>
      ) : (
        <>
          {tab === "overview" && (
            <>
              <div className="we-kpis">
                <article className="hm-kpi t-in">
                  <span className="hm-kpi-body">
                    <span className="hm-kpi-label">Your net worth</span>
                    <strong className={`hm-kpi-fig${we.netWorth < 0 ? " fe-out" : ""}`}>
                      {money.round(we.netWorth)}
                    </strong>
                    {we.change == null ? (
                      <em className="hm-flat">
                        no earlier valuation to compare with
                      </em>
                    ) : (
                      <em className={`hm-change ${we.change >= 0 ? "good" : "bad"}`}>
                        {we.change >= 0 ? "▲ +" : "▼ −"}{Math.abs(pct(we.change))}% since{" "}
                        {monthLabel(we.changeFrom, true)}
                      </em>
                    )}
                  </span>
                </article>
                <article className="hm-kpi t-cash">
                  <span className="hm-kpi-body">
                    <span className="hm-kpi-label">Total assets</span>
                    <strong className="hm-kpi-fig">{money.round(we.totalAssets)}</strong>
                    <em className="hm-flat">{we.assets.length} recorded</em>
                  </span>
                </article>
                <article className="hm-kpi t-out">
                  <span className="hm-kpi-body">
                    <span className="hm-kpi-label">Total liabilities</span>
                    <strong className="hm-kpi-fig fe-out">{money.round(we.totalLiabilities)}</strong>
                    <em className="hm-flat">
                      {we.debt.monthlyPayment
                        ? `${money.round(we.debt.monthlyPayment)} a month`
                        : `${we.liabilities.length} recorded`}
                    </em>
                  </span>
                </article>
                <article className="hm-kpi t-save">
                  <span className="hm-kpi-body">
                    <span className="hm-kpi-label">Return on what you paid</span>
                    <strong className="hm-kpi-fig">
                      {we.performance?.returnPct == null ? "—"
                        : `${we.performance.returnPct >= 0 ? "+" : "−"}${Math.abs(we.performance.returnPct * 100).toFixed(1)}%`}
                    </strong>
                    <em className="hm-flat">
                      {we.performance
                        ? `across ${we.performance.count} holding${we.performance.count === 1 ? "" : "s"} with a cost`
                        : "no cost entered on anything yet"}
                    </em>
                  </span>
                </article>
              </div>

              <Panel title="Net worth over time"
                     sub="Every valuation you have entered, carried forward month by month"
                     action={
                       <span className="fin-scope">
                         {[["3", "3M"], ["6", "6M"], ["12", "1Y"], ["all", "All"]].map(([v, l]) => (
                           <button key={v} className={span === v ? "on" : ""}
                                   onClick={() => setSpan(v)}>{l}</button>
                         ))}
                       </span>
                     }>
                <NetLine series={series} money={money} />
              </Panel>

              <div className="we-split">
                {[["Invested", invested], ["Cash & savings", cash], ["Other assets", other]]
                  .map(([label, rows]) => (
                    <article key={label} className="fin-panel we-tile">
                      <span className="hm-kpi-label">{label}</span>
                      <strong className="fin-fig">{money.round(sum(rows))}</strong>
                      <em>
                        {we.totalAssets
                          ? `${pct(sum(rows) / we.totalAssets)}% of what you own`
                          : "nothing recorded"}
                      </em>
                    </article>
                  ))}
              </div>

              {we.stale > 0 && (
                <div className="hh-note warn">
                  <span className="hh-note-icon" aria-hidden="true">
                    <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor"
                         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="10" cy="10" r="7.5" /><path d="M10 6v4.5l3 1.8" />
                    </svg>
                  </span>
                  <span className="hh-note-body">
                    <b>
                      {we.stale} figure{we.stale === 1 ? "" : "s"} here{" "}
                      {we.stale === 1 ? "is" : "are"} more than three months old.
                    </b>
                    <em>
                      Not wrong, but not today either. Nothing re-prices itself —
                      open one and put in what it is worth now.
                    </em>
                  </span>
                </div>
              )}
            </>
          )}

          {tab === "investments" && (
            <Panel title="What you own"
                   sub={`${money.round(we.totalAssets)} across ${we.assets.length}`}
                   action={<button className="fin-btn ghost" onClick={() => setAdding("asset")}>
                     + Add
                   </button>}>
              <HoldingTable rows={we.assets} money={money} showReturn onEdit={setEditing}
                            empty="Nothing is recorded as an asset yet." />
              <p className="fc-note">
                Return compares what a holding is worth now with what you said
                you paid. Anything with no cost entered says so rather than
                showing a zero, which would read as "it went nowhere".
              </p>
            </Panel>
          )}

          {tab === "net" && (
            <>
              <Panel title="What you owe"
                     sub={we.debt.monthlyPayment
                       ? `${money.round(we.debt.total)} outstanding, ${money.round(we.debt.monthlyPayment)} a month`
                       : `${money.round(we.debt.total)} outstanding`}
                     action={<button className="fin-btn ghost" onClick={() => setAdding("liability")}>
                       + Add
                     </button>}>
                <HoldingTable rows={we.liabilities} money={money} showDebt onEdit={setEditing}
                              empty="Nothing is recorded as a liability." />
              </Panel>
              <Panel title="Net worth, month by month"
                     sub="What you owned less what you owed, at each month end">
                <div className="fin-tablewrap">
                  <table className="fin-table we-table">
                    <thead>
                      <tr><th>Month</th><th className="num">Owned</th>
                          <th className="num">Owed</th><th className="num">Net</th></tr>
                    </thead>
                    <tbody>
                      {[...we.series].reverse().filter((m) => m.assets || m.liabilities).map((m) => (
                        <tr key={m.period}>
                          <td>{monthLabel(m.period)}</td>
                          <td className="num fin-fig">{money.round(m.assets)}</td>
                          <td className="num fin-fig fe-out">{money.round(m.liabilities)}</td>
                          <td className={`num fin-fig${m.net < 0 ? " fe-out" : ""}`}>
                            {money.round(m.net)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          )}

          {tab === "allocation" && (
            <Panel title="How your assets split"
                   sub={`${money.round(we.totalAssets)} across ${we.allocation.length} kind${we.allocation.length === 1 ? "" : "s"}`}>
              <Allocation rows={we.allocation} money={money} total={we.totalAssets} />
              <p className="fc-note">
                Every slice is one of the kinds you chose when you entered a
                holding. Nothing is inferred — the app does not know what a fund
                holds, only what you called it.
              </p>
            </Panel>
          )}
        </>
      )}

      {(adding || editing) && (
        <HoldingForm holding={editing} side={adding} entity={entity} currency={currency}
                     onClose={() => { setAdding(null); setEditing(null); }}
                     onSaved={() => { setAdding(null); setEditing(null); onChanged(); }} />
      )}
    </div>
  );
}
