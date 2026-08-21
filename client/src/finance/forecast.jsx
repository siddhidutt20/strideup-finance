import { useMemo, useState } from "react";
import { Panel } from "./pieces.jsx";
import { api } from "../api.js";
import { monthLabel, today, CURRENCIES, ENTITY_LABEL } from "./format.js";

// ── Forecast ─────────────────────────────────────────────────
// Committed money only. Every figure here traces to something already agreed;
// nothing is extrapolated from how past months happened to go. That makes the
// projection deliberately incomplete, so the view has to say so out loud
// rather than let an incomplete line read as a complete one.

export const FREQ_LABEL = {
  once: "One-off", weekly: "Weekly", monthly: "Monthly",
  quarterly: "Quarterly", annual: "Annual",
};

const pct = (v) => (v == null ? null : Math.round(v * 100));

// ── The projected position ───────────────────────────────────
// Two claims of different strength on one axis, drawn so they can never be
// mistaken for each other: committed money is a solid line, the predicted
// total is dashed, and the range between the good and bad case is a band
// behind both. Dashed-means-estimated is the one convention people already
// read correctly without a caption.
function ProjectionChart({ months, money, prediction, scenario }) {
  const [hover, setHover] = useState(null);
  const predicting = prediction?.available && scenario !== "committed";
  const W = 780, H = 230, PAD_L = 8, PAD_R = 56, PAD_T = 18, PAD_B = 30;

  const vals = months.flatMap((m) =>
    predicting ? [m.closing, m.low, m.high, m.expected] : [m.closing]);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const span = hi - lo || 1;
  const plotH = H - PAD_T - PAD_B;
  const y = (v) => PAD_T + plotH * (1 - (v - lo) / span);
  const slot = (W - PAD_L - PAD_R) / Math.max(months.length - 1, 1);
  const x = (i) => PAD_L + i * slot;

  const path = (key) => months.map((m, i) => `${i ? "L" : "M"}${x(i)},${y(m[key])}`).join(" ");
  const band =
    `${months.map((m, i) => `${i ? "L" : "M"}${x(i)},${y(m.high)}`).join(" ")} ` +
    `${[...months].reverse().map((m, i) =>
        `L${x(months.length - 1 - i)},${y(m.low)}`).join(" ")} Z`;

  const zeroY = y(0);
  const crossesZero = lo < 0 && hi > 0;
  const last = months[months.length - 1];

  return (
    <div className="fin-chart fc-chart">
      <div className="fin-legend">
        <span><i className="fc-key-solid" />Committed</span>
        {predicting && <span><i className="fc-key-dash" />Expected total</span>}
        {predicting && <span><i className="fc-key-band" />Good / bad case</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="fin-svg" role="img"
           aria-label="Projected position: committed money, and the expected total with its range">
        <defs>
          <linearGradient id="fc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--fin-accent)" stopOpacity=".16" />
            <stop offset="100%" stopColor="var(--fin-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => (
          <line key={t} x1={PAD_L} x2={W - PAD_R} y1={PAD_T + plotH * t} y2={PAD_T + plotH * t}
                className="fin-grid-line" />
        ))}
        {crossesZero && (
          <>
            <line x1={PAD_L} x2={W - PAD_R} y1={zeroY} y2={zeroY} className="fc-zero" />
            <text x={PAD_L + 2} y={zeroY - 5} className="fc-zerolab">zero</text>
          </>
        )}
        {predicting && <path d={band} className="fc-band" />}
        <path d={`${path("closing")} L${x(months.length - 1)},${y(lo)} L${x(0)},${y(lo)} Z`}
              fill="url(#fc-fill)" />
        <path d={path("closing")} className="fc-line" />
        {predicting && <path d={path("expected")} className="fc-line-est" />}
        {months.map((m, i) => (
          <g key={m.period} onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)}>
            <rect x={x(i) - slot / 2} y="0" width={slot} height={H} fill="transparent" />
            <circle cx={x(i)} cy={y(m.closing)} r={hover?.period === m.period ? 6 : 4.5}
                    className={`fc-dot${m.closing < 0 ? " neg" : ""}`} />
            {predicting && (
              <circle cx={x(i)} cy={y(m.expected)} r={hover?.period === m.period ? 5 : 3.5}
                      className="fc-dot-est" />
            )}
            <text x={x(i)} y={H - 10} className={`fin-xlab${m.partial ? " now" : ""}`}>
              {monthLabel(m.period, true).split(" ")[0]}
            </text>
          </g>
        ))}
        {/* Direct labels on the end points, so the two headline figures are
            readable without hovering and without relying on colour. */}
        <text x={W - PAD_R + 5} y={y(last.closing) + 4}
              className={`fc-endlab${last.closing < 0 ? " neg" : ""}`}>
          {money.round(last.closing)}
        </text>
        {predicting && (
          <text x={W - PAD_R + 5} y={y(last.expected) + 4} className="fc-endlab est">
            {money.round(last.expected)}
          </text>
        )}
      </svg>
      <div className="fin-tip" aria-live="polite">
        {hover ? (
          <>
            <strong>{monthLabel(hover.period)}{hover.partial ? " (rest of month)" : ""}</strong>
            {hover.committedIn === 0 && hover.committedOut === 0 ? (
              <span className="fin-tip-idle">
                {hover.partial
                  ? "nothing further falls due this month"
                  : "nothing committed in this month"}
              </span>
            ) : (
              <>
                <span><i style={{ background: "var(--fin-in)" }} />in {money.exact(hover.committedIn)}</span>
                <span><i style={{ background: "var(--fin-out)" }} />out {money.exact(hover.committedOut)}</span>
              </>
            )}
            <span className="fin-tip-net">committed {money.exact(hover.closing)}</span>
            {predicting && (
              <span className="fin-tip-net">
                expected {money.exact(hover.expected)}
                {" "}({money.round(hover.low)}–{money.round(hover.high)})
              </span>
            )}
          </>
        ) : (
          <span className="fin-tip-idle">
            {predicting
              ? "Solid is committed. Dashed is committed plus an estimate of the rest."
              : "Hover a month for exact figures"}
          </span>
        )}
      </div>
    </div>
  );
}

// ── How the estimate was arrived at ──────────────────────────
// Shown in full, because an estimate whose method is hidden is indistinguishable
// from one that was made up.
function Method({ prediction, money }) {
  if (!prediction?.available) {
    return (
      <p className="fc-note">
        Nothing is predicted yet. That needs at least {prediction?.minimum ?? 3} complete
        months of trading to compare against, and there {prediction?.monthsUsed === 1
          ? "is 1" : `are ${prediction?.monthsUsed ?? 0}`}. Until then the projection shows
        committed money only.
      </p>
    );
  }
  const { monthsUsed, history } = prediction;
  const { in: i, out: o } = prediction.perMonth;
  return (
    <>
      <div className="fc-cov">
        <div className="fc-covrow">
          <div className="fc-covtop">
            <span>Uncontracted income, per month</span>
            <strong className="fin-fig">{money.round(i.mid)}</strong>
          </div>
          <p className="fc-covsub">
            Ranged {money.round(i.min)} to {money.round(i.max)} across the last{" "}
            {monthsUsed} months. The band on the chart uses {money.round(i.low)} to{" "}
            {money.round(i.high)}.
          </p>
        </div>
        <div className="fc-covrow">
          <div className="fc-covtop">
            <span>Uncommitted costs, per month</span>
            <strong className="fin-fig">{money.round(o.mid)}</strong>
          </div>
          <p className="fc-covsub">
            Ranged {money.round(o.min)} to {money.round(o.max)} across the same months.
          </p>
        </div>
      </div>

      <div className="fc-histwrap">
      <table className="fin-table fc-hist">
        <thead>
          <tr><th>Month</th><th className="num">Earned</th><th className="num">Under contract</th>
              <th className="num">The rest</th></tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.period}>
              <td>{monthLabel(h.period)}</td>
              <td className="num fin-fig">{money.round(h.revenue)}</td>
              <td className="num fin-fig">{money.round(h.revenue - h.uncontractedIn)}</td>
              <td className="num fin-fig">{money.round(h.uncontractedIn)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <p className="fc-note">
        The estimate is the middle month of those figures, not an average, so one
        exceptional month does not drag the whole projection with it. Money already
        under contract is subtracted before the estimate is taken — otherwise a
        signed retainer would be counted once as a commitment and again inside the
        history it is already part of. No trend is fitted: with {monthsUsed} months a
        slope is mostly noise, and a slope is the part you would act on.
      </p>
    </>
  );
}

// ── Committed in and out, month by month ─────────────────────
function CommittedBars({ months, money }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...months.flatMap((m) => [m.committedIn, m.committedOut]));
  const W = 780, H = 170, PAD_B = 28, PAD_T = 8;
  const slot = W / Math.max(months.length, 1);
  const bw = Math.min(18, Math.max(6, slot / 2 - 4));
  const h = (v) => ((H - PAD_B - PAD_T) * v) / max;
  const bar = (bx, by, w, hh) => {
    const r = Math.min(4, w / 2, hh);
    return hh <= 0 ? "" :
      `M${bx},${by + hh} L${bx},${by + r} Q${bx},${by} ${bx + r},${by}
       L${bx + w - r},${by} Q${bx + w},${by} ${bx + w},${by + r} L${bx + w},${by + hh} Z`;
  };

  return (
    <div className="fin-chart">
      <div className="fin-legend">
        <span><i style={{ background: "var(--fin-in)" }} />Committed in</span>
        <span><i style={{ background: "var(--fin-out)" }} />Committed out</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="fin-svg" role="img"
           aria-label="Committed money in and out by month">
        {[0.5, 1].map((t) => (
          <line key={t} x1="0" x2={W} y1={PAD_T + (H - PAD_B - PAD_T) * (1 - t)}
                y2={PAD_T + (H - PAD_B - PAD_T) * (1 - t)} className="fin-grid-line" />
        ))}
        {months.map((m, i) => {
          const cx = i * slot + slot / 2;
          return (
            <g key={m.period} onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)}>
              <rect x={i * slot} y="0" width={slot} height={H} fill="transparent" />
              <path d={bar(cx - bw - 1, H - PAD_B - h(m.committedIn), bw, h(m.committedIn))}
                    fill="var(--fin-in)" />
              <path d={bar(cx + 1, H - PAD_B - h(m.committedOut), bw, h(m.committedOut))}
                    fill="var(--fin-out)" />
              <text x={cx} y={H - 9} className={`fin-xlab${m.partial ? " now" : ""}`}>
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
            <span><i style={{ background: "var(--fin-in)" }} />{money.exact(hover.committedIn)}</span>
            <span><i style={{ background: "var(--fin-out)" }} />{money.exact(hover.committedOut)}</span>
          </>
        ) : <span className="fin-tip-idle">Hover a month for exact figures</span>}
      </div>
    </div>
  );
}

// ── What the projection leaves out ───────────────────────────
// The most important panel on the page. A committed-only forecast for a
// business that bills without contracts shows every cost and almost no
// income; without this the chart above reads as a death sentence.
function Coverage({ coverage, money }) {
  const c = coverage;
  if (!c || !c.monthsOfHistory) {
    return (
      <p className="fc-note">
        There are not yet three complete months to compare against, so there is
        no way to say how much of a typical month this covers.
      </p>
    );
  }
  const rows = [
    { label: "Income under contract", got: c.committedRevenue, avg: c.avgRevenue,
      share: c.revenueCovered, tone: "in" },
    { label: "Costs under commitment", got: c.committedCosts, avg: c.avgExpenses,
      share: c.costsCovered, tone: "out" },
  ];
  return (
    <>
      <div className="fc-cov">
        {rows.map((r) => (
          <div className="fc-covrow" key={r.label}>
            <div className="fc-covtop">
              <span>{r.label}</span>
              <strong>{r.share == null ? "—" : `${pct(r.share)}%`}</strong>
            </div>
            <div className="fc-covbar">
              <span className={`fc-covfill ${r.tone}`}
                    style={{ width: `${Math.min(100, pct(r.share) ?? 0)}%` }} />
            </div>
            <p className="fc-covsub">
              {money.round(r.got)} committed each month against {money.round(r.avg)} in a
              typical recent month.
            </p>
          </div>
        ))}
      </div>
      <p className="fc-note">
        The comparison figure is what the last {c.monthsOfHistory} complete{" "}
        {c.monthsOfHistory === 1 ? "month" : "months"} actually did. It is history, not a
        forecast, and none of it is added to the projection above — money that is not
        contracted is left out rather than guessed at.
      </p>
    </>
  );
}

// ── The commitments themselves ───────────────────────────────
function CommitmentList({ commitments, money, onChange, busy }) {
  if (!commitments.length) {
    return (
      <p className="fc-none">
        Nothing committed yet. Add a rent, an EMI, a subscription or a signed
        retainer below and the projection fills in.
      </p>
    );
  }
  return (
    <div className="fin-tablewrap">
      <table className="fin-table fc-table">
        <thead>
          <tr>
            <th>What</th><th>Who</th><th>How often</th><th>From</th><th>Until</th>
            <th className="num">Each time</th><th />
          </tr>
        </thead>
        <tbody>
          {commitments.map((k) => (
            <tr key={k.id}>
              <td>
                <span className={`fc-dir ${k.direction}`}>{k.direction === "in" ? "In" : "Out"}</span>
                {k.description}
                {k.categoryName && <span className="fc-cat">{k.categoryName}</span>}
              </td>
              <td className="fc-who">{k.counterparty || "—"}</td>
              <td>{FREQ_LABEL[k.frequency]}</td>
              <td className="fc-date">{k.startDate}</td>
              <td className="fc-date">{k.endDate || <span className="fc-open">open-ended</span>}</td>
              <td className={`num fin-fig ${k.direction === "in" ? "fe-in" : "fe-out"}`}>
                {k.direction === "in" ? "+" : "−"}{money.exact(k.baseAmountMinor)}
              </td>
              <td>
                <button className="fin-x" disabled={busy} title="Remove this commitment"
                        onClick={() => onChange(k.id)}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddCommitment({ entity, categories, currency, onAdded }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const blank = {
    entity, direction: "out", description: "", counterparty: "", categoryId: "",
    amount: "", currency, frequency: "monthly", startDate: today(), endDate: "",
  };
  const [form, setForm] = useState(blank);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const usable = useMemo(
    () => categories.filter(
      (c) => (!c.entity || c.entity === "both" || c.entity === form.entity) &&
             (form.direction === "in" ? c.kind === "revenue" || c.kind === "capital"
                                      : c.kind !== "revenue")
    ),
    [categories, form.entity, form.direction]
  );

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api.addCommitment({
        entity: form.entity, direction: form.direction,
        description: form.description, counterparty: form.counterparty || undefined,
        categoryId: form.categoryId || undefined, amount: Number(form.amount),
        currency: form.currency, frequency: form.frequency,
        startDate: form.startDate, endDate: form.endDate || null,
      });
      setForm({ ...blank, entity: form.entity, direction: form.direction });
      setMsg({ ok: true, text: "Committed. The projection has been updated." });
      onAdded();
    } catch (err) {
      setMsg({ ok: false, text: err.message || "Could not save that." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fin-manual">
      <div className="fin-manual-head">
        <div>
          <strong>Commit something</strong>
          <span>A rent, an EMI, a subscription, a signed retainer</span>
        </div>
        <button className="fin-link asbtn" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Add one"}
        </button>
      </div>
      {open && (
        <form className="fin-form" onSubmit={submit}>
          <label><span>Books</span>
            <select value={form.entity}
                    onChange={(e) => setForm((f) => ({ ...f, entity: e.target.value, categoryId: "" }))}>
              <option value="strideup">StrideUp</option>
              <option value="personal">Personal</option>
            </select>
          </label>
          <label><span>Direction</span>
            <select value={form.direction}
                    onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value, categoryId: "" }))}>
              <option value="out">Money out</option>
              <option value="in">Money in</option>
            </select>
          </label>
          <label className="wide"><span>What is it</span>
            <input value={form.description} onChange={set("description")}
                   placeholder="Home loan EMI" required maxLength={200} />
          </label>
          <label><span>Who</span>
            <input value={form.counterparty} onChange={set("counterparty")}
                   placeholder="HDFC Bank" maxLength={120} />
          </label>
          <label><span>Amount each time</span>
            <input type="number" step="0.01" min="0.01" value={form.amount}
                   onChange={set("amount")} required />
          </label>
          <label><span>Currency</span>
            <select value={form.currency} onChange={set("currency")}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label><span>How often</span>
            <select value={form.frequency} onChange={set("frequency")}>
              {Object.entries(FREQ_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label><span>Category</span>
            <select value={form.categoryId} onChange={set("categoryId")}>
              <option value="">Uncategorised</option>
              {usable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label><span>First payment</span>
            <input type="date" value={form.startDate} onChange={set("startDate")} required />
          </label>
          <label><span>Until <em>(blank = open-ended)</em></span>
            <input type="date" value={form.endDate} onChange={set("endDate")} min={form.startDate} />
          </label>
          <div className="fin-form-actions">
            <button className="fin-btn" disabled={busy}>{busy ? "Saving…" : "Commit it"}</button>
            {msg && <span className={msg.ok ? "fin-ok" : "fin-error"}>{msg.text}</span>}
          </div>
        </form>
      )}
    </div>
  );
}

// ── The view ─────────────────────────────────────────────────
export function ForecastView({ fc, commitments, money, categories, entity, onChange }) {
  const [busy, setBusy] = useState(false);
  const [scenario, setScenario] = useState("expected");
  const remove = async (id) => {
    setBusy(true);
    try { await api.deleteCommitment(id); onChange(); }
    finally { setBusy(false); }
  };

  const pred = fc.prediction;
  const canPredict = pred?.available;
  const showing = canPredict ? scenario : "committed";
  const horizon = fc.months[fc.months.length - 1];
  const totalIn = fc.months.reduce((s, m) => s + m.committedIn, 0);
  const totalOut = fc.months.reduce((s, m) => s + m.committedOut, 0);
  const headline = showing === "committed" ? horizon.closing : horizon.expected;

  // The first month the position is projected below zero. Reported against
  // whichever scenario is being shown, and named as such.
  const firstNegative = fc.months.find(
    (m) => (showing === "committed" ? m.closing : m.expected) < 0
  );

  // Nothing committed at all is the most common reason this page looks empty,
  // and a flat line with a column of zeroes does not explain itself.
  const nothingCommitted = !commitments.length;

  return (
    <>
      {nothingCommitted && (
        <div className="fc-empty">
          <strong>No commitments recorded yet</strong>
          <p>
            This page projects money that has already been agreed — retainers,
            subscriptions, rent, loan payments, signed client contracts. You have
            none on file, so there is nothing to project and the line simply holds
            at today's position.
          </p>
          <p>
            Add one below, or drop a signed contract into Revenue or Expenses and
            its payment schedule is read off it automatically.
          </p>
        </div>
      )}
      <div className="fc-kpis">
        <article className="fc-kpi">
          <header><span>Position today</span></header>
          <p className="fin-fig">{money.exact(fc.opening)}</p>
          <footer>{fc.openingSource === "bank" ? "from your bank feed" : "everything recorded so far"}</footer>
        </article>
        <article className="fc-kpi">
          <header><span>Committed in</span></header>
          <p className="fin-fig fe-in">{money.round(totalIn)}</p>
          <footer>agreed, over {fc.months.length - 1} months</footer>
        </article>
        <article className="fc-kpi">
          <header><span>Committed out</span></header>
          <p className="fin-fig fe-out">{money.round(totalOut)}</p>
          <footer>agreed, over {fc.months.length - 1} months</footer>
        </article>
        <article className={`fc-kpi${headline < 0 ? " warn" : ""}`}>
          <header><span>{monthLabel(horizon.period, true)}</span></header>
          <p className={`fin-fig${headline < 0 ? " fe-out" : ""}`}>{money.round(headline)}</p>
          <footer>
            {showing === "committed"
              ? "committed money only"
              : `expected · ${money.round(horizon.low)}–${money.round(horizon.high)}`}
          </footer>
        </article>
      </div>

      <Panel
        title="Projected position"
        sub={showing === "committed"
          ? "Today's position, plus only what is already agreed"
          : "Committed money, plus an estimate of what is not under contract"}
        action={canPredict && (
          <div className="fc-scen" role="group" aria-label="Which projection">
            <button className={scenario === "committed" ? "on" : ""}
                    onClick={() => setScenario("committed")}>Committed only</button>
            <button className={scenario === "expected" ? "on" : ""}
                    onClick={() => setScenario("expected")}>Expected</button>
          </div>
        )}>
        <ProjectionChart months={fc.months} money={money}
                         prediction={pred} scenario={showing} />
        {firstNegative && (
          <p className="fc-flag">
            {showing === "committed" ? (
              <>On committed money alone this goes below zero in{" "}
              <strong>{monthLabel(firstNegative.period)}</strong>. That is arithmetic, not a
              prediction — income you have not contracted is not counted in that line.</>
            ) : (
              <>On the expected case this goes below zero in{" "}
              <strong>{monthLabel(firstNegative.period)}</strong>. That half of the line is an
              estimate from {pred.monthsUsed} months of trading, not a certainty.</>
            )}
          </p>
        )}
      </Panel>

      <Panel title="What is already agreed" sub="Committed money in and out, month by month">
        <CommittedBars months={fc.months} money={money} />
      </Panel>

      <Panel title="How the estimate is made"
             sub="What the uncontracted side of the business has actually done">
        <Method prediction={pred} money={money} />
      </Panel>

      <Panel title="How much of the picture is contracted"
             sub="Committed money against what recent months actually did">
        <Coverage coverage={fc.coverage} money={money} />
      </Panel>

      <Panel title="Commitments" sub="Everything the committed line is built from">
        <CommitmentList commitments={commitments} money={money} onChange={remove} busy={busy} />
      </Panel>

      <AddCommitment entity={entity === "both" ? "strideup" : entity}
                     categories={categories} currency={money.currency} onAdded={onChange} />
    </>
  );
}
