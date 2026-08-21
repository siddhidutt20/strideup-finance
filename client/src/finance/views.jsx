import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { Panel, Kpi, TrendChart, CategoryBars, Ranked, Receivables, CapitalList } from "./pieces.jsx";
import { CURRENCIES, delta, fmtAmount, majorOf, monthLabel, thisMonth, today, ZERO_DECIMAL,
         ENTITY_LABEL } from "./format.js";
import { SpendByCategory } from "./spend.jsx";

// ── Overview ─────────────────────────────────────────────────
// The one question this page answers: how is the month going. Detail lives
// behind the other tabs, so nothing here needs reading — only glancing at.
export function OverviewView({ data, trend, money, period }) {
  const s = data.summary, prev = data.previous;
  // A month that has not happened is down 100% on the one before it, which is
  // arithmetically true and tells you nothing. No comparison is offered.
  const future = period > thisMonth();
  const cmp = (now, before) => (future ? null : delta(now, before));
  return (
    <>
      <section className="fin-kpis">
        <Kpi label="Revenue" value={money.round(s.revenue)}
             delta={cmp(s.revenue, prev.revenue)} tone="in"
             hint={future ? "nothing recorded yet" : undefined} />
        <Kpi label="Expenses" value={money.round(s.expenses)}
             delta={cmp(s.expenses, prev.expenses)} tone="out" invertDelta
             hint={future ? "nothing recorded yet" : undefined} />
        <Kpi label="Net" value={money.round(s.net)}
             delta={cmp(s.net, prev.net)} tone={s.net >= 0 ? "in" : "out"} emphasis
             hint={future ? "nothing recorded yet" : undefined} />
        <Kpi label={data.cash.source === "bank" ? "Cash on hand" : "Recorded position"}
             value={money.round(data.cash.amount)}
             hint={data.cash.source === "bank" ? null : "no bank feed connected"} />
        <Kpi label="Runway"
             value={data.burn.runwayMonths == null ? "—" : `${data.burn.runwayMonths.toFixed(1)} mo`}
             hint={data.burn.monthlyBurn > 0 ? `${money.round(data.burn.monthlyBurn)}/mo burn` : "not burning"} />
        <Kpi label="Outstanding" value={money.round(data.receivables.total)}
             hint={data.receivables.overdue > 0
               ? `${money.round(data.receivables.overdue)} overdue` : "none overdue"}
             tone={data.receivables.overdue > 0 ? "warn" : undefined} />
        <Kpi label="Needs a look" value={String(data.needsReview)}
             hint={data.needsReview ? "highlighted in the ledger" : "all clear"}
             tone={data.needsReview ? "warn" : undefined} />
      </section>

      <Panel title="Revenue and expenses"
             sub={`${trend.length} month${trend.length === 1 ? "" : "s"} to ${monthLabel(trend[trend.length - 1]?.period || period, true)}`}>
        <TrendChart series={trend} money={money} current={period} />
      </Panel>

      <div className="fin-grid">
        <Panel title="Where the money went" sub={`Expenses · ${monthLabel(period)}`}>
          {/* Selected by category kind rather than by the sign of this month's
              net: a cost line that happens to net inward — a refund, a credit
              note — is still a cost line. */}
          <SpendByCategory
            rows={data.breakdown
              .filter((r) => ["cogs", "opex", "tax"].includes(r.kind) && r.direction === "out")
              .map((r) => ({ name: r.name, total: r.amount }))}
            money={money} period={period} />
        </Panel>
        <Panel title="Outstanding payments" sub="Invoices not yet settled">
          <Receivables ar={{ ...data.receivables, invoices: data.receivables.invoices.slice(0, 5) }}
                       money={money} />
        </Panel>
      </div>
    </>
  );
}
// ── Profit and loss ──────────────────────────────────────────
export function PnlView({ st, money, period }) {
  const p = st.pnl;
  const lines = (sec) =>
    sec.lines.map((l) => (
      <tr className="st-line" key={l.name}>
        <td>{l.name}</td><td>{money.exact(l.amount)}</td>
      </tr>
    ));
  const empty = <tr className="st-line"><td className="st-empty">Nothing recorded</td><td>—</td></tr>;

  return (
    <Panel narrow sub="Revenue, less what it cost to earn it">
      <table className="st-table">
        <tbody>
          <tr className="st-head"><td>Revenue</td><td /></tr>
          {p.revenue.lines.length ? lines(p.revenue) : empty}
          <tr className="st-sub"><td>Total revenue</td><td>{money.exact(p.revenue.total)}</td></tr>

          <tr className="st-head"><td>Cost of sales</td><td /></tr>
          {p.cogs.lines.length ? lines(p.cogs) : empty}
          <tr className="st-sub"><td>Total cost of sales</td><td>{money.exact(p.cogs.total)}</td></tr>

          <tr className={`st-sub ${p.grossProfit >= 0 ? "st-pos" : "st-neg"}`}>
            <td>Gross profit{p.grossMarginPct != null && ` · ${p.grossMarginPct.toFixed(0)}% margin`}</td>
            <td>{money.exact(p.grossProfit)}</td>
          </tr>

          <tr className="st-head"><td>Operating expenses</td><td /></tr>
          {p.opex.lines.length ? lines(p.opex) : empty}
          <tr className="st-sub"><td>Total operating expenses</td><td>{money.exact(p.opex.total)}</td></tr>

          <tr className={`st-sub ${p.operatingProfit >= 0 ? "st-pos" : "st-neg"}`}>
            <td>Operating profit</td><td>{money.exact(p.operatingProfit)}</td>
          </tr>

          {p.tax.lines.length > 0 && (
            <>
              <tr className="st-head"><td>Tax</td><td /></tr>
              {lines(p.tax)}
            </>
          )}

          <tr className={`st-total ${p.netProfit >= 0 ? "st-pos" : "st-neg"}`}>
            <td>Net {p.netProfit >= 0 ? "profit" : "loss"}</td>
            <td>{money.exact(p.netProfit)}</td>
          </tr>
        </tbody>
      </table>
      <p className="st-note">
        Capital events — equity, loans, draws — are deliberately absent: they are
        funding, not trading. They appear under Cash flow.
      </p>
    </Panel>
  );
}

// ── Ledger ───────────────────────────────────────────────────
export function LedgerView({
  entries, categories, money, baseCurrency, period, scope, onScope, showEntity,
  onFix, onRemove, onCurrency, onAmount,
}) {
  return (
    <>
      <Panel title={scope === "all" ? "Ledger — everything" : `Ledger — ${monthLabel(period)}`}
             sub={`${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
             action={
               <span className="fin-scope">
                 <button className={scope === "month" ? "on" : ""}
                         onClick={() => onScope("month")}>{monthLabel(period, true)}</button>
                 <button className={scope === "all" ? "on" : ""}
                         onClick={() => onScope("all")}>All months</button>
                 <a className="fin-link" href={api.finExportUrl()}>Export CSV</a>
               </span>
             }>
        <LedgerTable entries={entries} categories={categories} money={money}
                     baseCurrency={baseCurrency} showEntity={showEntity} onFix={onFix}
                     onRemove={onRemove} onCurrency={onCurrency} onAmount={onAmount} />
      </Panel>
    </>
  );
}

// The figure a document was read from is not always the figure that belongs
// in the books — a contract's total read as one payment, a tip added by hand,
// a partial settlement. Correcting it is a click on the number itself; the
// server re-converts the currency for the entry's own date, so the base
// figure that every total is summed from moves with it.
function AmountCell({ entry, onAmount }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const major = majorOf(entry.amount_minor, entry.currency);

  const start = () => { setValue(String(major)); setEditing(true); };
  const commit = async () => {
    setEditing(false);
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n === major) return;
    await onAmount(entry.id, n);
  };

  if (editing) {
    return (
      <input className="fe-amtin" type="number" step="0.01" min="0.01" autoFocus
             value={value} onChange={(ev) => setValue(ev.target.value)}
             onBlur={commit}
             onKeyDown={(ev) => {
               if (ev.key === "Enter") { ev.preventDefault(); ev.currentTarget.blur(); }
               if (ev.key === "Escape") setEditing(false);
             }} />
    );
  }
  return (
    <button className={`fe-amtbtn ${entry.direction === "in" ? "amt-in" : "amt-out"}`}
            onClick={start} title="Click to correct this amount">
      {entry.direction === "in" ? "+" : "−"}{fmtAmount(entry.currency, entry.amount_minor)}
    </button>
  );
}

function LedgerTable({ entries, categories, money, baseCurrency, showEntity,
                      onFix, onRemove, onCurrency, onAmount }) {
  if (!entries.length) return <p className="fin-none">No entries for this month yet.</p>;
  return (
    <div className="fin-tablewrap">
      <table className="fin-table">
        <thead>
          <tr>
            <th>Date</th>{showEntity && <th>Books</th>}<th>Description</th><th>Category</th>
            <th className="r">Amount</th><th>Doc</th><th aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const flagged = e.review_status === "needs_review";
            return (
              <tr key={e.id} className={flagged ? "flagged" : ""}>
                <td className="nowrap">{e.entry_date}</td>
                {showEntity && (
                  <td className="nowrap">
                    <span className={`fe-ent e-${e.entity}`}>{ENTITY_LABEL[e.entity]}</span>
                  </td>
                )}
                <td>
                  <span className="fe-desc">{e.description || "—"}</span>
                  {e.counterparty && <span className="fe-cp">{e.counterparty}</span>}
                  {e.review_reason && (
                    <span className={flagged ? "fe-why" : "fe-note"}>{e.review_reason}</span>
                  )}
                </td>
                <td>
                  <select className={flagged ? "fe-sel warn" : "fe-sel"}
                          value={e.category_id || ""}
                          onChange={(ev) => onFix(e.id, ev.target.value)}>
                    <option value="" disabled>Choose…</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </td>
                <td className="r nowrap fe-amt">
                  <AmountCell entry={e} onAmount={onAmount} />
                  <span className="fe-fx">
                    <select className="fe-cur" value={e.currency}
                            title="Currency on the document"
                            onChange={(ev) => onCurrency(e.id, ev.target.value)}>
                      {[...new Set([e.currency, baseCurrency, ...CURRENCIES])].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    {e.currency !== baseCurrency && <em>≈ {money.exact(e.base_amount_minor)}</em>}
                  </span>
                </td>
                <td>
                  {e.document_id
                    ? <a className="fin-link" href={api.finDocUrl(e.document_id)}
                         target="_blank" rel="noreferrer">view</a>
                    : <span className="fin-dash">—</span>}
                </td>
                <td>
                  <button className="fe-del" onClick={() => onRemove(e)}
                          title="Remove this entry"
                          aria-label={`Remove ${e.description || "entry"}`}>✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Not everything arrives as a document: money you put in, a bank charge, a
// payment settled by transfer. This is how those get on the books.
export function ManualEntry({
  categories, currency, onAdded, entity: entityProp = "strideup",
  defaultDirection = "out", preferKinds, title, sub,
  descPlaceholder = "Founder equity injection", whoPlaceholder = "Founder, bank, supplier…",
  whoLabel = "Who", openSignal = 0,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const formRef = useRef(null);
  // Opened from the button in the page header. A counter rather than a
  // boolean, so pressing it again while the form is already open still brings
  // it back into view instead of doing nothing.
  useEffect(() => {
    if (!openSignal) return;
    setOpen(true);
    const id = requestAnimationFrame(() =>
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    return () => cancelAnimationFrame(id);
  }, [openSignal]);
  const [form, setForm] = useState({
    entryDate: today(), direction: defaultDirection, amount: "",
    currency, categoryId: "", description: "", counterparty: "",
    entity: entityProp,
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const ready = form.amount && Number(form.amount) > 0 && form.categoryId && form.description.trim();

  const grouped = useMemo(() => {
    // Whichever kinds this section is about come first, so the category you
    // want is the one already in view.
    const base = ["revenue", "capital", "cogs", "opex", "capex", "tax", "transfer"];
    const order = preferKinds
      ? [...preferKinds, ...base.filter((k) => !preferKinds.includes(k))]
      : base;
    const names = {
      revenue: "Revenue", capital: "Capital", cogs: "Cost of sales",
      opex: "Operating expenses", capex: "Capital expenditure",
      tax: "Tax", transfer: "Transfers",
    };
    // Only the categories that belong to the chosen books, plus the shared ones.
    const mine = categories.filter(
      (c) => !c.entity || c.entity === "both" || c.entity === form.entity
    );
    return order
      .map((kind) => ({ kind, label: names[kind], items: mine.filter((c) => c.kind === kind) }))
      .filter((g) => g.items.length);
  }, [categories, preferKinds, form.entity]);

  async function submit(e) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setMsg(null);
    try {
      await api.finAddEntry({
        entryDate: form.entryDate,
        direction: form.direction,
        amount: Number(form.amount),
        currency: form.currency,
        entity: form.entity,
        categoryId: Number(form.categoryId),
        description: form.description.trim(),
        ...(form.counterparty.trim() ? { counterparty: form.counterparty.trim() } : {}),
      });
      setMsg({ ok: true, text: "Added to the ledger." });
      setForm((f) => ({ ...f, amount: "", description: "", counterparty: "" }));
      onAdded();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="fin-panel" ref={formRef}>
      <div className="fin-panel-head">
        <div>
          <h2>{title || "Add an entry by hand"}</h2>
          <span>{sub || "Capital, transfers, anything without a document"}</span>
        </div>
        <button className="fin-link asbtn" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Write one"}
        </button>
      </div>

      {open && (
        <form className="fin-form" onSubmit={submit}>
          <label>
            <span>Books</span>
            <select value={form.entity}
                    onChange={(e) => setForm((f) => ({ ...f, entity: e.target.value, categoryId: "" }))}>
              <option value="strideup">StrideUp</option>
              <option value="personal">Personal</option>
            </select>
          </label>
          <label>
            <span>Date</span>
            <input type="date" value={form.entryDate} onChange={set("entryDate")}
                   max={today()} required />
          </label>
          <label>
            <span>Direction</span>
            <select value={form.direction} onChange={set("direction")}>
              <option value="out">Money out</option>
              <option value="in">Money in</option>
            </select>
          </label>
          <label>
            <span>Amount</span>
            <div className="fin-amtrow">
              <input type="number" step="0.01" min="0.01" inputMode="decimal"
                     value={form.amount} onChange={set("amount")} placeholder="0.00" required />
              <select value={form.currency} onChange={set("currency")} aria-label="Currency">
                {[...new Set([currency, ...CURRENCIES])].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </label>
          <label className="wide">
            <span>Category</span>
            <select value={form.categoryId} onChange={set("categoryId")} required>
              <option value="" disabled>Choose a category…</option>
              {grouped.map((g) => (
                <optgroup key={g.kind} label={g.label}>
                  {g.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="wide">
            <span>Description</span>
            <input value={form.description} onChange={set("description")}
                   placeholder={descPlaceholder} maxLength={300} required />
          </label>
          <label className="wide">
            <span>{whoLabel} <em>optional</em></span>
            <input value={form.counterparty} onChange={set("counterparty")}
                   placeholder={whoPlaceholder} maxLength={160} />
          </label>
          <div className="fin-form-foot">
            <button className="fin-btn" disabled={!ready || busy}>
              {busy ? "Adding…" : "Add entry"}
            </button>
            {msg && <span className={msg.ok ? "fin-ok-inline" : "fin-err-inline"}>{msg.text}</span>}
          </div>
        </form>
      )}
    </section>
  );
}

// ── Import and close ─────────────────────────────────────────
export function ToolsView({ period, entity, entityList, byEntity, onDone }) {
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState(null);
  const [working, setWorking] = useState(false);

  async function importCsv() {
    if (!csv.trim()) return;
    setWorking(true); setMsg(null);
    try {
      const r = await api.finImportGhl(csv);
      setMsg({ ok: true, text:
        `${r.imported} new payment${r.imported === 1 ? "" : "s"}, ` +
        `${r.invoices} invoice${r.invoices === 1 ? "" : "s"} tracked` +
        (r.duplicates ? `, ${r.duplicates} already known` : "") +
        (r.skipped ? `, ${r.skipped} skipped` : "") });
      setCsv(""); onDone();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally { setWorking(false); }
  }

  async function toggleClose(ent, isClosed) {
    setWorking(true);
    try { await api.finClosePeriod(period, ent, isClosed); onDone(); }
    finally { setWorking(false); }
  }

  return (
    <section className="fin-panel fin-tools">
      <div className="fin-panel-head">
        <div><h2>Bring in revenue</h2><span>GoHighLevel export</span></div>
      </div>
      <p className="fin-help">
        Paste a GHL payments or invoices CSV. Rows already recorded are ignored,
        so importing the same export twice is safe.
      </p>
      <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={5}
                placeholder="Transaction ID,Date,Contact Name,Amount,Currency,Status…" />
      <div className="fin-tools-row">
        <button className="fin-btn" onClick={importCsv} disabled={working || !csv.trim()}>
          {working ? "Importing…" : "Import CSV"}
        </button>
        <label className="fin-filebtn">
          Choose a file
          <input type="file" accept=".csv,text/csv" hidden
                 onChange={async (e) => {
                   const f = e.target.files?.[0];
                   if (f) setCsv(await f.text());
                   e.target.value = "";
                 }} />
        </label>
      </div>
      {msg && <p className={msg.ok ? "fin-ok" : "fin-error"}>{msg.text}</p>}

      <div className="fin-closebox">
        <h3>Close {monthLabel(period)}</h3>
        {period > thisMonth() && (
          <p className="fin-help warn">
            {monthLabel(period)} has not happened yet. Closing a month that is still
            ahead would send anything dated in it to the open month instead, which is
            not what closing is for.
          </p>
        )}
        <p className="fin-help">
          Each set of books closes on its own. Closing one stops a late document
          dated in that month from quietly changing a figure you have already
          acted on — it is posted to the open month as an adjustment instead.
        </p>
        <div className="fin-tools-row">
          {(entityList ?? [entity]).filter((e) => e !== "both").map((ent) => {
            const isClosed = byEntity?.[ent]?.periodClosed;
            return (
              <button key={ent} className="fin-btn ghost"
                      disabled={working || (period > thisMonth() && !isClosed)}
                      onClick={() => toggleClose(ent, isClosed)}>
                {isClosed ? `Reopen ${ENTITY_LABEL[ent]}` : `Close ${ENTITY_LABEL[ent]}`}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
