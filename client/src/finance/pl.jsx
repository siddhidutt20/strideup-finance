import { useMemo, useState } from "react";
import { api } from "../api.js";
import { Panel, ComboChart, MultiLine } from "./pieces.jsx";
import { SpendByCategory } from "./spend.jsx";
import { monthLabel, majorOf, SPEND_GROUPS } from "./format.js";

// ── Profit and loss ──────────────────────────────────────────
// The statement, the plan beside it, and what the two together say.
//
// The plan is the only thing on this page that is not a fact, and it is kept
// visibly apart for that reason: budget figures sit in their own column, are
// never added into any position, and every variance says which way is good —
// spending under plan is favourable, earning under plan is not, and one sign
// convention cannot serve both.

const pct = (v, digits = 0) => (v == null ? null : v.toFixed(digits));

function Money({ v, money, dash = "—" }) {
  if (v == null) return <span className="fin-dash">{dash}</span>;
  return <>{money.round(v)}</>;
}

function Variance({ line, money }) {
  if (line.budget == null) return <span className="fin-dash">—</span>;
  if (line.variance === 0) return <span className="sd-flat">on plan</span>;
  const good = line.favourable;
  return (
    <span className={good ? "sd-up" : "sd-down"}>
      {line.variance > 0 ? "+" : "−"}{money.round(Math.abs(line.variance))}
    </span>
  );
}

function VsPlan({ line }) {
  if (line.budget == null || line.variancePct == null) {
    return <span className="fin-dash">—</span>;
  }
  const good = line.favourable;
  return (
    <span className={good ? "sd-up" : "sd-down"}>
      {line.variancePct > 0 ? "▲" : "▼"} {Math.abs(Math.round(line.variancePct * 100))}%
    </span>
  );
}

function Row({ line, money, level = "", label }) {
  return (
    <tr className={level}>
      <td>{label ?? line.name}</td>
      <td className="num fin-fig"><Money v={line.actual} money={money} /></td>
      <td className="num fin-fig pl-plan"><Money v={line.budget} money={money} /></td>
      <td className="num"><Variance line={line} money={money} /></td>
      <td className="num"><VsPlan line={line} /></td>
    </tr>
  );
}

function MarginRow({ label, m }) {
  return (
    <tr className="pl-sub">
      <td>{label}</td>
      <td className="num">{m.actual == null ? <span className="fin-dash">—</span> : `${pct(m.actual)}%`}</td>
      <td className="num pl-plan">{m.budget == null ? <span className="fin-dash">—</span> : `${pct(m.budget)}%`}</td>
      <td className="num"><span className="fin-dash">—</span></td>
      <td className="num"><span className="fin-dash">—</span></td>
    </tr>
  );
}

const SPANS = [["month", "Month"], ["quarter", "Quarter"], ["ytd", "YTD"]];

function Kpi({ label, value, foot }) {
  return (
    <article className="fc-kpi">
      <header><span>{label}</span></header>
      <p className="fin-fig">{value}</p>
      <footer>{foot}</footer>
    </article>
  );
}

function Change({ now, before, unit = "%", points }) {
  if (before == null || now == null) return <span className="sd-flat">no period to compare</span>;
  if (points) {
    const d = now - before;
    if (Math.abs(d) < 0.05) return <span className="sd-flat">level with the comparison</span>;
    return (
      <span className={d > 0 ? "sd-up" : "sd-down"}>
        {d > 0 ? "▲" : "▼"} {Math.abs(d).toFixed(1)}pp vs the comparison
      </span>
    );
  }
  if (!before) return <span className="sd-flat">nothing to compare against</span>;
  const c = (now - before) / Math.abs(before);
  if (Math.abs(c) < 0.005) return <span className="sd-flat">level with the comparison</span>;
  return (
    <span className={c > 0 ? "sd-up" : "sd-down"}>
      {c > 0 ? "▲" : "▼"} {Math.abs(Math.round(c * 100))}{unit} vs the comparison
    </span>
  );
}

// A sparkline of the last twelve months of one line, so a headline figure
// carries the shape that produced it.
function Spark({ series, colour = "var(--fin-accent)" }) {
  const vals = series.filter((v) => v != null);
  if (vals.length < 2) return null;
  const hi = Math.max(...vals), lo = Math.min(...vals, 0);
  const span = hi - lo || 1;
  const d = vals.map((v, i) =>
    `${i ? "L" : "M"}${(i / (vals.length - 1)) * 100},${20 - ((v - lo) / span) * 18}`).join(" ");
  return (
    <svg className="pl-spark" viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke={colour} strokeWidth="1.6"
            strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// The twelve months before this one, to compare against. Any of them: a board
// asks "against last month" as often as "against the same month last year".
function compareOptions(period) {
  const out = [];
  for (let i = 1; i <= 12; i++) {
    const d = new Date(Date.UTC(+period.slice(0, 4), +period.slice(5, 7) - 1 - i, 1));
    out.push(d.toISOString().slice(0, 8) + "01");
  }
  return out;
}

export function PlView({ pl, money, period, span, compare, onSpan, onCompare, categories,
                        entity, onBudgetSaved }) {
  const st = pl.statement;
  const prev = pl.previous;
  const t = pl.trend;
  const [editing, setEditing] = useState(false);

  const spark = (key) => t.map((m) => m[key]);

  return (
    <>
      <div className="pl-controls">
        <label className="pl-compare">
          <span>Compare with</span>
          <select value={compare} onChange={(e) => onCompare(e.target.value)}>
            {compareOptions(period).map((p) => (
              <option key={p} value={p}>{monthLabel(p)}</option>
            ))}
          </select>
        </label>
        <a className="fin-btn ghost" href={api.finExportUrl()}
           title="Every ledger entry behind this statement, as a spreadsheet">
          Export the ledger
        </a>
      </div>

      <div className="fc-kpis pl-kpis">
        <article className="fc-kpi">
          <header><span>Revenue</span></header>
          <p className="fin-fig fe-in">{money.round(st.revenue.actual)}</p>
          <footer><Change now={st.revenue.actual} before={prev.revenue.actual} /></footer>
          <Spark series={spark("revenue")} colour="#2a78d6" />
        </article>
        <article className="fc-kpi">
          <header><span>Gross profit</span></header>
          <p className="fin-fig">{money.round(st.grossProfit.actual)}</p>
          <footer><Change now={st.grossProfit.actual} before={prev.grossProfit.actual} /></footer>
          <Spark series={spark("grossProfit")} colour="#1baf7a" />
        </article>
        <article className="fc-kpi">
          <header><span>Gross margin</span></header>
          <p className="fin-fig">
            {st.grossMargin.actual == null ? "—" : `${pct(st.grossMargin.actual)}%`}
          </p>
          <footer><Change now={st.grossMargin.actual} before={prev.grossMargin.actual} points /></footer>
          <Spark series={spark("grossMargin")} colour="#1baf7a" />
        </article>
        <article className="fc-kpi">
          <header><span>Operating profit</span></header>
          <p className={`fin-fig${st.operatingProfit.actual < 0 ? " fe-out" : ""}`}>
            {money.round(st.operatingProfit.actual)}
          </p>
          <footer><Change now={st.operatingProfit.actual} before={prev.operatingProfit.actual} /></footer>
          <Spark series={spark("operatingProfit")} colour="#eda100" />
        </article>
        <article className="fc-kpi">
          <header><span>Net profit</span></header>
          <p className={`fin-fig${st.netProfit.actual < 0 ? " fe-out" : ""}`}>
            {money.round(st.netProfit.actual)}
          </p>
          <footer><Change now={st.netProfit.actual} before={prev.netProfit.actual} /></footer>
          <Spark series={spark("netProfit")} colour="#008300" />
        </article>
        <article className="fc-kpi">
          <header><span>Net margin</span></header>
          <p className={`fin-fig${(st.netMargin.actual ?? 0) < 0 ? " fe-out" : ""}`}>
            {st.netMargin.actual == null ? "—" : `${pct(st.netMargin.actual)}%`}
          </p>
          <footer><Change now={st.netMargin.actual} before={prev.netMargin.actual} points /></footer>
          <Spark series={spark("netMargin")} colour="#4a3aa7" />
        </article>
      </div>

      <div className="pl-band">
        <Panel title="Profit and loss statement"
               sub={span === "month" ? monthLabel(period)
                 : span === "quarter" ? `Three months to ${monthLabel(period)}`
                 : `Year to date, to ${monthLabel(period)}`}
               action={
                 <span className="fin-scope">
                   {SPANS.map(([v, l]) => (
                     <button key={v} className={span === v ? "on" : ""}
                             onClick={() => onSpan(v)}>{l}</button>
                   ))}
                 </span>
               }>
          <div className="fin-tablewrap">
            <table className="fin-table pl-table">
              <thead>
                <tr><th>Line</th><th className="num">Actual</th>
                    <th className="num pl-plan">Plan</th>
                    <th className="num">Variance</th><th className="num">vs plan</th></tr>
              </thead>
              <tbody>
                <Row line={st.revenue} money={money} level="pl-strong" />
                <Row line={st.cogs} money={money} />
                <Row line={st.grossProfit} money={money} level="pl-total" />
                <MarginRow label="Gross margin" m={st.grossMargin} />
                <tr className="pl-head"><td colSpan={5}>Operating expenses</td></tr>
                {st.opex.length === 0 ? (
                  <tr><td colSpan={5} className="fin-dash">Nothing recorded</td></tr>
                ) : st.opex.map((l) => <Row key={l.name} line={l} money={money} />)}
                <Row line={st.opexTotal} money={money} level="pl-total" />
                <Row line={st.operatingProfit} money={money} level="pl-total" />
                <MarginRow label="Operating margin" m={st.operatingMargin} />
                <Row line={st.tax} money={money} />
                <Row line={st.netProfit} money={money} level="pl-net" />
                <MarginRow label="Net margin" m={st.netMargin} />
              </tbody>
            </table>
          </div>
          {!st.hasBudget && (
            <p className="fc-note">
              No plan is set for this period, so the plan column is empty and
              nothing has a variance.{" "}
              <button className="fin-link asbtn" onClick={() => setEditing(true)}>
                Set a budget
              </button>{" "}
              and every figure here gains one.
            </p>
          )}
        </Panel>

        <Panel title="Profitability trend" sub="Twelve months, as recorded">
          <ComboChart points={t} money={money}
                      bars={[
                        { key: "revenue", label: "Revenue" },
                        { key: "grossProfit", label: "Gross profit" },
                        { key: "operatingProfit", label: "Operating profit" },
                        { key: "netProfit", label: "Net profit" },
                      ]}
                      line={{ key: "netMargin", label: "Net margin (%)" }} />
        </Panel>
      </div>

      <div className="fin-twocol">
        <Panel title="Revenue by line" sub={monthLabel(period)}>
          <SpendByCategory rows={pl.revenueMix} money={money} period={period}
                           total={pl.revenueMix.reduce((s, r) => s + r.total, 0)} />
        </Panel>
        <Panel title="Expenses by category" sub={monthLabel(period)}>
          <SpendByCategory rows={pl.expenseMix} money={money} period={period}
                           total={pl.expenseMix.reduce((s, r) => s + r.total, 0)} />
        </Panel>
      </div>

      <div className="pl-band3">
        <Panel title="Margin trend" sub="Gross, operating and net, twelve months">
          {/* A month with no revenue has no margin. Passed through as null so
              the line breaks there rather than dropping to zero, which would
              read as "we broke even" on a month that never traded. */}
          <MultiLine points={t.map((m) => ({
                       period: m.period,
                       gross: m.grossMargin, operating: m.operatingMargin, net: m.netMargin,
                     }))}
                     money={{ compact: (v) => `${Math.round(v)}%`,
                              exact: (v) => `${v.toFixed(1)}%` }}
                     aheadFrom={null} height={200}
                     series={[
                       { key: "gross", label: "Gross", colour: "#1baf7a" },
                       { key: "operating", label: "Operating", colour: "#eda100" },
                       { key: "net", label: "Net", colour: "#4a3aa7" },
                     ]} />
        </Panel>

        <Panel title="Furthest from plan"
               sub={st.hasBudget ? `Operating expenses · ${monthLabel(period)}`
                                 : "No plan is set for this period"}
               action={
                 <button className="fin-btn ghost" onClick={() => setEditing(true)}>
                   {st.hasBudget ? "Edit budget" : "Set a budget"}
                 </button>
               }>
          {pl.variances.length === 0 ? (
            <p className="fc-none">
              {st.hasBudget
                ? "Every heading is on plan."
                : "Set a budget and the headings furthest from it appear here."}
            </p>
          ) : (
            <ul className="ch-costs pl-var">
              {pl.variances.map((v) => (
                <li key={v.name}>
                  <span className="vm-what">
                    <b>{v.name}</b>
                    <em>{money.round(v.actual)} against {money.round(v.budget)}</em>
                  </span>
                  <span className="vm-right">
                    <b className={`fin-fig ${v.favourable ? "sd-up" : "sd-down"}`}>
                      {v.variance > 0 ? "+" : "−"}{money.round(Math.abs(v.variance))}
                    </b>
                    <em className={v.favourable ? "sd-up" : "sd-down"}>
                      {v.variancePct == null ? "" :
                        `${v.variancePct > 0 ? "▲" : "▼"} ${Math.abs(Math.round(v.variancePct * 100))}%`}
                    </em>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="What this says" sub={`${monthLabel(period)} · read off the figures above`}>
          <div className="pl-ins">
            {pl.insights.overall.length > 0 && (
              <section>
                <h5>Overall</h5>
                {pl.insights.overall.map((x, i) => <p key={i}>{x}</p>)}
              </section>
            )}
            {pl.insights.positives.length > 0 && (
              <section>
                <h5 className="ok">Going well</h5>
                <ul className="sd-insights">
                  {pl.insights.positives.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </section>
            )}
            {pl.insights.watch.length > 0 && (
              <section>
                <h5 className="warn">Worth watching</h5>
                <ul className="pl-watch">
                  {pl.insights.watch.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </section>
            )}
          </div>
          <p className="fc-note">
            Every line here restates a figure on this page. Nothing is generated
            and nothing is predicted — if it says a heading is over plan, the
            statement above says so too.
          </p>
        </Panel>
      </div>

      {editing && (
        <BudgetEditor entity={entity} period={period} categories={categories}
                      money={money} onClose={() => setEditing(false)}
                      onSaved={() => { setEditing(false); onBudgetSaved(); }} />
      )}
    </>
  );
}

// ── Setting the plan ─────────────────────────────────────────
// Every category you could budget, in one form, so what you left blank is as
// visible as what you filled in. A blank is no plan; a zero is a plan to spend
// nothing, and the two are stored differently because they mean different
// things.
function BudgetEditor({ entity, period, categories, money, onClose, onSaved }) {
  const [values, setValues] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const ent = entity === "both" ? "strideup" : entity;
  const mine = useMemo(
    () => categories.filter(
      (c) => (c.entity === "both" || c.entity === ent) &&
             ["revenue", "cogs", "opex", "tax"].includes(c.kind)
    ),
    [categories, ent]
  );

  // Load what is already planned the first time the form opens.
  useMemo(() => {
    let dead = false;
    api.finBudgets(ent, period)
      .then((r) => {
        if (dead) return;
        const have = new Map(
          (r.byEntity[ent]?.budgets ?? []).map((b) => [b.categoryId, majorOf(b.amount, money.currency)])
        );
        setValues(Object.fromEntries(mine.map((c) => [c.id, have.has(c.id) ? String(have.get(c.id)) : ""])));
      })
      .catch(() => setValues(Object.fromEntries(mine.map((c) => [c.id, ""]))));
    return () => { dead = true; };
    // eslint-disable-next-line
  }, [ent, period]);

  const groups = useMemo(() => {
    const spend = mine.filter((c) => c.spendGroup);
    const out = SPEND_GROUPS
      .map((g) => ({ label: g, items: spend.filter((c) => c.spendGroup === g) }))
      .filter((g) => g.items.length);
    const rest = [
      { label: "Revenue", items: mine.filter((c) => c.kind === "revenue") },
      { label: "Everything else", items: mine.filter((c) => !c.spendGroup && c.kind !== "revenue") },
    ].filter((g) => g.items.length);
    return [...rest, ...out];
  }, [mine]);

  const total = (items) =>
    items.reduce((t, c) => t + (Number(values?.[c.id]) || 0), 0);

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const lines = mine.map((c) => ({
        categoryId: c.id,
        amount: values[c.id] === "" ? null : Number(values[c.id]),
      })).filter((l) => l.amount === null || Number.isFinite(l.amount));
      await api.saveBudgets({ entity: ent, period, lines });
      onSaved();
    } catch (err) {
      setMsg(err.message || "Could not save that budget.");
      setBusy(false);
    }
  };

  const copy = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await api.copyBudgets({ entity: ent, period });
      if (!r.copied) { setMsg(`Nothing was planned for ${monthLabel(r.from)}.`); setBusy(false); return; }
      onSaved();
    } catch (err) {
      setMsg(err.message || "Could not copy that."); setBusy(false);
    }
  };

  return (
    <div className="fin-modal" role="dialog" aria-modal="true" aria-label="Set the budget">
      <div className="fin-modalbox pl-budget">
        <header className="fin-modalhead">
          <div>
            <h2>Budget for {monthLabel(period)}</h2>
            <span>
              What the month is meant to cost. Leave a box empty for no plan;
              zero is a plan to spend nothing there.
            </span>
          </div>
          <button className="fin-x" onClick={onClose} aria-label="Close">×</button>
        </header>

        {values == null ? (
          <div className="fin-boot"><div className="fin-spinner" /></div>
        ) : (
          <div className="pl-budgetbody">
            {groups.map((g) => (
              <section key={g.label}>
                <h5>{g.label}<b className="fin-fig">{money.round(total(g.items) * 100)}</b></h5>
                {g.items.map((c) => (
                  <label key={c.id}>
                    <span>{c.name}</span>
                    <input type="number" step="0.01" min="0" inputMode="decimal"
                           placeholder="no plan"
                           value={values[c.id] ?? ""}
                           onChange={(e) => setValues((v) => ({ ...v, [c.id]: e.target.value }))} />
                  </label>
                ))}
              </section>
            ))}
          </div>
        )}

        {msg && <p className="fin-error">{msg}</p>}
        <footer className="fin-modalfoot">
          <button className="fin-btn ghost" disabled={busy} onClick={copy}>
            Copy last month
          </button>
          <span className="fin-spacer" />
          <button className="fin-btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="fin-btn" disabled={busy || values == null} onClick={save}>
            {busy ? "Saving…" : "Save budget"}
          </button>
        </footer>
      </div>
    </div>
  );
}
