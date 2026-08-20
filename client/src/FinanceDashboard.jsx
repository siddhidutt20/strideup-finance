import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";

// ── StrideUp finances ────────────────────────────────────────
// Built for one operator: drop an invoice in, watch the month update. Rows
// the reader wasn't sure about are corrected in place, and anything recorded
// by mistake can be removed outright — there is no queue to work through.

const MONTHS = ["January","February","March","April","May","June","July",
  "August","September","October","November","December"];

const thisMonth = () => `${new Date().toISOString().slice(0, 7)}-01`;
const today = () => new Date().toISOString().slice(0, 10);
const shiftMonth = (period, n) => {
  const [y, m] = period.split("-").map(Number);
  return `${new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)}-01`;
};
const monthLabel = (p, short = false) => {
  const [y, m] = p.split("-").map(Number);
  return `${short ? MONTHS[m - 1].slice(0, 3) : MONTHS[m - 1]} ${y}`;
};

function useMoney(currency) {
  return useMemo(() => {
    const opts = { style: "currency", currency };
    const round = new Intl.NumberFormat(undefined, { ...opts, maximumFractionDigits: 0 });
    const exact = new Intl.NumberFormat(undefined, { ...opts, minimumFractionDigits: 2 });
    return {
      round: (minor) => round.format((minor || 0) / 100),
      exact: (minor) => exact.format((minor || 0) / 100),
    };
  }, [currency]);
}

const readFile = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("Could not read that file."));
    r.readAsDataURL(file);
  });

const SECTIONS = [
  ["overview", "Overview"],
  ["add", "Add"],
  ["ledger", "Ledger"],
  ["tools", "Import & close"],
];

export default function FinanceDashboard() {
  const [period, setPeriod] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [entries, setEntries] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feed, setFeed] = useState([]);
  const [busy, setBusy] = useState(false);

  const money = useMoney(data?.baseCurrency || "USD");

  const load = useCallback(
    async (p = period) => {
      setError("");
      try {
        const [ov, en, cats] = await Promise.all([
          api.finOverview(p),
          api.finEntries(`?period=${p}`),
          categories.length ? Promise.resolve({ categories }) : api.finCategories(),
        ]);
        setData(ov);
        setEntries(en.entries);
        setCategories(cats.categories);
      } catch (err) {
        setError(err.message || "Could not load your finances.");
      } finally {
        setLoading(false);
      }
    },
    [period, categories]
  );

  useEffect(() => { load(period); /* eslint-disable-next-line */ }, [period]);

  const shownTrend = useMemo(() => {
    const t = data?.trend ?? [];
    const first = t.findIndex((m) => m.revenue || m.expenses);
    return first < 0 ? t.slice(-6) : t.slice(Math.max(0, first - 1));
  }, [data]);

  // ── Upload: one call per document, sequentially, so progress is legible
  // and one failure never takes the rest of the batch down with it.
  async function sendOne(file, { id, dataB64, replace = false }) {
    const b64 = dataB64 ?? (await readFile(file));
    setFeed((f) => f.map((x) => (x.id === id ? { ...x, state: "reading-doc" } : x)));
    const res = await api.finUpload({
      filename: file.name,
      mime: file.type || "application/octet-stream",
      data: b64,
      ...(replace ? { replace: true } : {}),
    });
    setFeed((f) =>
      f.map((x) =>
        x.id === id
          ? {
              ...x,
              state: res.duplicate ? "duplicate" : "done",
              result: res,
              // Kept only while a replace is still on offer.
              retry: res.duplicate ? { file, dataB64: b64 } : null,
            }
          : x
      )
    );
  }

  async function handleFiles(files) {
    const list = [...files];
    if (!list.length) return;
    setBusy(true);
    for (const file of list) {
      const id = `${file.name}-${Date.now()}-${Math.random()}`;
      setFeed((f) => [{ id, name: file.name, state: "reading" }, ...f].slice(0, 10));
      try {
        await sendOne(file, { id });
      } catch (err) {
        setFeed((f) =>
          f.map((x) => (x.id === id ? { ...x, state: "error", message: err.message } : x))
        );
      }
    }
    setBusy(false);
    load(period);
  }

  async function replaceFile(item) {
    if (!item.retry) return;
    setBusy(true);
    setFeed((f) => f.map((x) => (x.id === item.id ? { ...x, state: "reading-doc" } : x)));
    try {
      await sendOne(item.retry.file, {
        id: item.id,
        dataB64: item.retry.dataB64,
        replace: true,
      });
    } catch (err) {
      setFeed((f) =>
        f.map((x) => (x.id === item.id ? { ...x, state: "error", message: err.message } : x))
      );
    }
    setBusy(false);
    load(period);
  }

  const dismiss = (id) => setFeed((f) => f.filter((x) => x.id !== id));

  async function fixEntry(id, categoryId) {
    await api.finPatchEntry(id, { categoryId: Number(categoryId) });
    load(period);
  }

  async function removeEntry(entry) {
    const what = entry.description || entry.counterparty || "this entry";
    const amount = money.exact(entry.amount_minor);
    if (!window.confirm(`Remove "${what}" (${amount})?\n\nThis deletes the entry and its uploaded file. It cannot be undone.`)) {
      return;
    }
    try {
      await api.finDeleteEntry(entry.id);
      load(period);
    } catch (err) {
      setError(err.message || "Could not remove that entry.");
    }
  }

  if (loading) {
    return (
      <div className="fin">
        <style>{FIN_CSS}</style>
        <div className="fin-boot"><div className="fin-spinner" /></div>
      </div>
    );
  }

  const s = data?.summary;
  const prev = data?.previous;
  const isEmpty = (s?.entryCount ?? 0) === 0 && !data?.receivables?.total;

  return (
    <div className="fin">
      <style>{FIN_CSS}</style>

      <nav className="fin-nav" aria-label="Sections">
        <div className="fin-nav-inner">
          <ul>
            {SECTIONS.map(([id, label]) => (
              <li key={id}><a href={`#${id}`}>{label}</a></li>
            ))}
          </ul>
          <div className="fin-monthnav">
            <button onClick={() => setPeriod(shiftMonth(period, -1))} aria-label="Previous month">‹</button>
            <strong>{monthLabel(period)}</strong>
            <button onClick={() => setPeriod(shiftMonth(period, 1))}
                    disabled={period >= thisMonth()} aria-label="Next month">›</button>
          </div>
        </div>
      </nav>

      <header className="fin-head" id="overview">
        <h1>Finances</h1>
        <p>How StrideUp is doing in {monthLabel(period)}.</p>
      </header>

      {error && <div className="fin-error">{error}</div>}
      {data && !data.aiEnabled && (
        <div className="fin-warn">
          Reading documents needs an Anthropic API key. Set <code>ANTHROPIC_API_KEY</code>{" "}
          and redeploy — everything else works without it.
        </div>
      )}

      <UploadZone
        onFiles={handleFiles} busy={busy} feed={feed} money={money}
        onReplace={replaceFile} onDismiss={dismiss}
      />

      {isEmpty ? (
        <div className="fin-empty">
          <h2>Nothing recorded for {monthLabel(period)} yet</h2>
          <p>
            Drop an invoice above, or write an entry by hand below — capital you
            put in, a payment that never had a document, anything at all.
          </p>
        </div>
      ) : (
        <>
          <section className="fin-kpis">
            <Kpi label="Revenue" value={money.round(s.revenue)}
                 delta={delta(s.revenue, prev.revenue)} tone="in" />
            <Kpi label="Expenses" value={money.round(s.expenses)}
                 delta={delta(s.expenses, prev.expenses)} tone="out" invertDelta />
            <Kpi label="Net" value={money.round(s.net)}
                 delta={delta(s.net, prev.net)} tone={s.net >= 0 ? "in" : "out"} emphasis />
            <Kpi label={data.cash.source === "bank" ? "Cash on hand" : "Recorded position"}
                 value={money.round(data.cash.amount)}
                 hint={data.cash.source === "bank" ? null : "no bank feed connected"} />
            <Kpi label="Runway"
                 value={data.burn.runwayMonths == null ? "—" : `${data.burn.runwayMonths.toFixed(1)} mo`}
                 hint={data.burn.monthlyBurn > 0
                   ? `${money.round(data.burn.monthlyBurn)}/mo burn` : "not burning"} />
            <Kpi label="Outstanding" value={money.round(data.receivables.total)}
                 hint={data.receivables.overdue > 0
                   ? `${money.round(data.receivables.overdue)} overdue` : "none overdue"}
                 tone={data.receivables.overdue > 0 ? "warn" : undefined} />
            <Kpi label="Needs a look" value={String(data.needsReview)}
                 hint={data.needsReview ? "highlighted in the ledger" : "all clear"}
                 tone={data.needsReview ? "warn" : undefined} />
          </section>

          <div className="fin-grid">
            <Panel title="Revenue and expenses"
                   sub={`${shownTrend.length} month${shownTrend.length === 1 ? "" : "s"} to ${monthLabel(shownTrend[shownTrend.length - 1]?.period || period, true)}`}>
              <TrendChart series={shownTrend} money={money} current={period} />
            </Panel>
            <Panel title="Where the money went" sub={`Expenses · ${monthLabel(period)}`}>
              <CategoryBars rows={data.breakdown.filter((r) => r.direction === "out")} money={money} />
            </Panel>
          </div>

          <div className="fin-grid">
            <Panel title="Outstanding payments" sub="Invoices not yet settled">
              <Receivables ar={data.receivables} money={money} />
            </Panel>
            <Panel title="Capital" sub="Equity, loans and draws">
              <CapitalList capital={data.capital} money={money} />
            </Panel>
          </div>
        </>
      )}

      <ManualEntry
        categories={categories}
        currency={data?.baseCurrency || "USD"}
        onAdded={() => load(period)}
      />

      <Panel
        id="ledger"
        title={`Ledger — ${monthLabel(period)}`}
        sub={`${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
        action={<a className="fin-link" href={api.finExportUrl()}>Export CSV</a>}
      >
        <LedgerTable entries={entries} categories={categories} money={money}
                     onFix={fixEntry} onRemove={removeEntry} />
      </Panel>

      <Tools period={period} closed={data?.periodClosed} onDone={() => load(period)} />
    </div>
  );
}

const delta = (now, before) => (before ? ((now - before) / Math.abs(before)) * 100 : null);

// ── Pieces ───────────────────────────────────────────────────

function Panel({ id, title, sub, action, children }) {
  return (
    <section className="fin-panel" id={id}>
      <div className="fin-panel-head">
        <div>
          <h2>{title}</h2>
          {sub && <span>{sub}</span>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, delta, hint, tone, emphasis, invertDelta }) {
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

function UploadZone({ onFiles, busy, feed, money, onReplace, onDismiss }) {
  const [over, setOver] = useState(false);
  const input = useRef(null);
  return (
    <section
      className={`fin-drop${over ? " over" : ""}${busy ? " busy" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}
    >
      <input ref={input} type="file" multiple
             accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
             onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} hidden />
      <div className="fin-drop-main">
        <div className="fin-drop-icon" aria-hidden="true">＋</div>
        <div>
          <strong>{busy ? "Reading…" : "Drop invoices and receipts here"}</strong>
          <p>
            PDF or a photo. They are read, categorised, and added to the month
            automatically. <button type="button" onClick={() => input.current?.click()}>
              or choose files
            </button>
          </p>
        </div>
      </div>

      {feed.length > 0 && (
        <ul className="fin-feed">
          {feed.map((f) => (
            <li key={f.id} className={`fin-feed-item s-${f.state}`}>
              <span className="ff-name">{f.name}</span>
              {f.state === "reading" && <span className="ff-note">reading file…</span>}
              {f.state === "reading-doc" && <span className="ff-note">extracting…</span>}
              {f.state === "error" && <span className="ff-err">{f.message}</span>}
              {f.state === "duplicate" && (
                <>
                  <span className="ff-dup">
                    You have already uploaded this file. Replace what's recorded?
                  </span>
                  <span className="ff-actions">
                    <button className="ff-btn" onClick={() => onReplace(f)}>Replace</button>
                    <button className="ff-btn ghost" onClick={() => onDismiss(f.id)}>Keep existing</button>
                  </span>
                </>
              )}
              {f.state === "done" && f.result?.extraction && (
                <span className="ff-ok">
                  {money.exact(Math.round(f.result.extraction.total * 100))}
                  {" · "}{f.result.categoryName || "uncategorised"}
                  {f.result.matchedRule && " · known vendor"}
                  {f.result.needsReview && " · needs a look"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Write an entry by hand ───────────────────────────────────
// Not everything arrives as a document: money you put in, a bank charge, a
// payment settled by transfer. This is how those get on the books.
function ManualEntry({ categories, currency, onAdded }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState({
    entryDate: today(), direction: "out", amount: "",
    categoryId: "", description: "", counterparty: "",
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const ready = form.amount && Number(form.amount) > 0 && form.categoryId && form.description.trim();

  const grouped = useMemo(() => {
    const order = ["revenue", "capital", "cogs", "opex", "capex", "tax", "transfer"];
    const names = {
      revenue: "Revenue", capital: "Capital", cogs: "Cost of sales",
      opex: "Operating expenses", capex: "Capital expenditure",
      tax: "Tax", transfer: "Transfers",
    };
    return order
      .map((kind) => ({ kind, label: names[kind], items: categories.filter((c) => c.kind === kind) }))
      .filter((g) => g.items.length);
  }, [categories]);

  async function submit(e) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setMsg(null);
    try {
      await api.finAddEntry({
        entryDate: form.entryDate,
        direction: form.direction,
        amount: Number(form.amount),
        currency,
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
    <section className="fin-panel" id="add">
      <div className="fin-panel-head">
        <div>
          <h2>Add an entry by hand</h2>
          <span>Capital, transfers, anything without a document</span>
        </div>
        <button className="fin-link asbtn" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Write one"}
        </button>
      </div>

      {open && (
        <form className="fin-form" onSubmit={submit}>
          <label>
            <span>Date</span>
            <input type="date" value={form.entryDate} onChange={set("entryDate")} max={today()} required />
          </label>
          <label>
            <span>Direction</span>
            <select value={form.direction} onChange={set("direction")}>
              <option value="out">Money out</option>
              <option value="in">Money in</option>
            </select>
          </label>
          <label>
            <span>Amount ({currency})</span>
            <input type="number" step="0.01" min="0.01" inputMode="decimal"
                   value={form.amount} onChange={set("amount")} placeholder="0.00" required />
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
                   placeholder="Founder equity injection" maxLength={300} required />
          </label>
          <label className="wide">
            <span>Who <em>optional</em></span>
            <input value={form.counterparty} onChange={set("counterparty")}
                   placeholder="Founder, bank, supplier…" maxLength={160} />
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

function barPath(x, y, w, h, r = 4) {
  const rr = Math.min(r, w / 2, Math.max(0, h));
  if (h <= 0.5) return "";
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} ` +
         `L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

function TrendChart({ series, money, current }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...series.flatMap((m) => [m.revenue, m.expenses]));
  const W = 760, H = 190, PAD_B = 26, PAD_T = 10;
  const slot = W / series.length;
  const bw = Math.min(18, Math.max(6, slot / 2 - 3));
  const scale = (v) => ((H - PAD_B - PAD_T) * v) / max;

  return (
    <div className="fin-chart">
      <div className="fin-legend">
        <span><i style={{ background: "var(--fin-in)" }} />Revenue</span>
        <span><i style={{ background: "var(--fin-out)" }} />Expenses</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="fin-svg" role="img"
           aria-label="Revenue and expenses by month">
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
              <path d={barPath(cx - bw - 1, H - PAD_B - scale(m.revenue), bw, scale(m.revenue))}
                    fill="var(--fin-in)" />
              <path d={barPath(cx + 1, H - PAD_B - scale(m.expenses), bw, scale(m.expenses))}
                    fill="var(--fin-out)" />
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
            <span><i style={{ background: "var(--fin-in)" }} />{money.exact(hover.revenue)}</span>
            <span><i style={{ background: "var(--fin-out)" }} />{money.exact(hover.expenses)}</span>
            <span className="fin-tip-net">net {money.exact(hover.net)}</span>
          </>
        ) : <span className="fin-tip-idle">Hover a month for exact figures</span>}
      </div>
    </div>
  );
}

function CategoryBars({ rows, money }) {
  if (!rows.length) return <p className="fin-none">No expenses recorded this month.</p>;
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

function Receivables({ ar, money }) {
  if (!ar.total) return <p className="fin-none">Nothing outstanding. Everything is paid.</p>;
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
          {ar.invoices.slice(0, 6).map((inv) => (
            <li key={inv.id}>
              <span>{inv.customer}</span>
              <span className={inv.daysOverdue > 0 ? "od" : ""}>
                {inv.daysOverdue > 0 ? `${inv.daysOverdue}d overdue` : `due ${inv.dueDate || "—"}`}
              </span>
              <strong>{money.exact(inv.outstanding)}</strong>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function CapitalList({ capital, money }) {
  if (!capital.items.length) {
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

function LedgerTable({ entries, categories, money, onFix, onRemove }) {
  if (!entries.length) return <p className="fin-none">No entries for this month yet.</p>;
  return (
    <div className="fin-tablewrap">
      <table className="fin-table">
        <thead>
          <tr>
            <th>Date</th><th>Description</th><th>Category</th>
            <th className="r">Amount</th><th>Doc</th><th aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const flagged = e.review_status === "needs_review";
            return (
              <tr key={e.id} className={flagged ? "flagged" : ""}>
                <td className="nowrap">{e.entry_date}</td>
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
                <td className={`r nowrap ${e.direction === "in" ? "amt-in" : "amt-out"}`}>
                  {e.direction === "in" ? "+" : "−"}{money.exact(e.amount_minor)}
                </td>
                <td>
                  {e.document_id
                    ? <a className="fin-link" href={api.finDocUrl(e.document_id)}
                         target="_blank" rel="noreferrer">view</a>
                    : <span className="fin-dash">—</span>}
                </td>
                <td>
                  <button className="fe-del" onClick={() => onRemove(e)}
                          title="Remove this entry" aria-label={`Remove ${e.description || "entry"}`}>
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Tools({ period, closed, onDone }) {
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

  async function toggleClose() {
    setWorking(true);
    try { await api.finClosePeriod(period, closed); onDone(); }
    finally { setWorking(false); }
  }

  return (
    <section className="fin-panel fin-tools" id="tools">
      <div className="fin-panel-head">
        <div><h2>Bring in revenue</h2><span>GoHighLevel export</span></div>
      </div>
      <p className="fin-help">
        Paste a GHL payments or invoices CSV. Rows already recorded are ignored,
        so importing the same export twice is safe.
      </p>
      <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={4}
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
        <span className="fin-spacer" />
        <button className="fin-btn ghost" onClick={toggleClose} disabled={working}>
          {closed ? "Reopen this month" : "Close this month"}
        </button>
      </div>
      {msg && <p className={msg.ok ? "fin-ok" : "fin-error"}>{msg.text}</p>}
      {closed && (
        <p className="fin-help">
          This month is closed. A late document dated in it is posted to the open
          month as an adjustment instead of changing a figure you have already used.
        </p>
      )}
    </section>
  );
}

// Series colours are validated for colour-vision separation (deutan ΔE 10.7
// between revenue and expenses); both carry a legend and direct labels, so
// identity never rests on colour alone. Newsreader is reserved for the page
// title and the financial figures — the register of a printed statement —
// with Instrument Sans carrying every piece of interface around them.
const FIN_CSS = `
.fin{
  --fin-in:#0FA3C7; --fin-out:#D43081; --fin-accent:#5B21B6;
  --fin-ink:#171326; --fin-muted:#6E6884; --fin-faint:#9C96AE;
  --fin-line:#EBE8F2; --fin-hair:#F2F0F7; --fin-surface:#fff;
  --fin-sunk:#FAF9FC; --fin-warn:#8A6A15; --fin-neg:#A8225F;
  --fin-serif:'Newsreader',Georgia,'Times New Roman',serif;
  max-width:1160px;margin:0 auto;padding:0 24px 96px;color:var(--fin-ink);
  font-size:15px;line-height:1.6}
.fin-boot{display:flex;justify-content:center;padding:96px}
.fin-spinner{width:32px;height:32px;border-radius:50%;border:2.5px solid var(--fin-line);
  border-top-color:var(--fin-accent);animation:fin-spin .8s linear infinite}
@keyframes fin-spin{to{transform:rotate(360deg)}}

/* ── Section nav ── */
.fin-nav{position:sticky;top:0;z-index:15;margin:0 -24px 0;padding:0 24px;
  background:rgba(247,246,250,.88);backdrop-filter:blur(10px);
  border-bottom:1px solid var(--fin-line)}
.fin-nav-inner{max-width:1112px;margin:0 auto;display:flex;align-items:center;
  justify-content:space-between;gap:16px;flex-wrap:wrap;padding:9px 0}
.fin-nav ul{list-style:none;display:flex;gap:2px;margin:0;padding:0}
.fin-nav a{display:inline-block;text-decoration:none;color:var(--fin-muted);
  font-size:13px;font-weight:500;padding:6px 11px;border-radius:8px;transition:.14s}
.fin-nav a:hover{color:var(--fin-accent);background:#F1ECFB}
.fin-monthnav{display:inline-flex;align-items:center;gap:2px;background:var(--fin-surface);
  border:1px solid var(--fin-line);border-radius:9px;padding:3px 4px}
.fin-monthnav strong{min-width:124px;text-align:center;font-size:13px;font-weight:600;
  font-variant-numeric:tabular-nums}
.fin-monthnav button{border:none;background:none;font-size:16px;line-height:1;
  color:var(--fin-accent);cursor:pointer;padding:4px 9px;border-radius:6px}
.fin-monthnav button:hover:not(:disabled){background:#F1ECFB}
.fin-monthnav button:disabled{color:#D6D1E2;cursor:not-allowed}

/* ── Masthead ── */
.fin-head{padding:44px 0 26px}
.fin-head h1{font-family:var(--fin-serif);font-weight:400;font-size:clamp(34px,5vw,46px);
  letter-spacing:-.021em;line-height:1;margin:0 0 8px}
.fin-head p{margin:0;color:var(--fin-muted);font-size:15px}

.fin-error,.fin-warn,.fin-ok{padding:11px 15px;border-radius:10px;font-size:13.5px;margin-bottom:14px}
.fin-error{background:#FDF1F3;border:1px solid #F3CBD5;color:#8E1F3F}
.fin-warn{background:#FDF8EA;border:1px solid #EDE0BC;color:var(--fin-warn)}
.fin-ok{background:#EAF7F1;border:1px solid #C2E5D6;color:#0A6B4C;margin:14px 0 0}
.fin code{background:var(--fin-sunk);border:1px solid var(--fin-line);padding:1px 5px;
  border-radius:4px;font-size:12.5px}

/* ── Upload ── */
.fin-drop{background:var(--fin-surface);border:1.5px dashed #DED8EC;border-radius:14px;
  padding:20px 22px;margin-bottom:26px;transition:border-color .15s,background .15s}
.fin-drop.over{border-color:var(--fin-accent);background:#FBF9FE}
.fin-drop.busy{opacity:.9}
.fin-drop-main{display:flex;align-items:center;gap:16px}
.fin-drop-icon{width:42px;height:42px;flex:none;border-radius:11px;background:#F3EEFC;
  color:var(--fin-accent);display:grid;place-items:center;font-size:20px}
.fin-drop-main strong{display:block;font-size:15px;font-weight:600;letter-spacing:-.005em}
.fin-drop-main p{margin:3px 0 0;color:var(--fin-muted);font-size:13.5px}
.fin-drop-main button{border:none;background:none;color:var(--fin-accent);font:inherit;
  font-size:13.5px;font-weight:600;text-decoration:underline;cursor:pointer;padding:0}
.fin-feed{list-style:none;margin:16px 0 0;padding:14px 0 0;border-top:1px solid var(--fin-hair);
  display:flex;flex-direction:column;gap:9px}
.fin-feed-item{display:flex;align-items:center;gap:10px;font-size:13px;flex-wrap:wrap}
.ff-name{font-weight:600;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ff-note{color:var(--fin-muted)}
.ff-ok{color:#0A6B4C;font-variant-numeric:tabular-nums}
.ff-err{color:#8E1F3F}
.ff-dup{color:var(--fin-warn)}
.ff-actions{display:inline-flex;gap:7px;margin-left:auto}
.ff-btn{border:1px solid var(--fin-accent);background:var(--fin-accent);color:#fff;
  font:inherit;font-size:12px;font-weight:600;padding:5px 12px;border-radius:8px;cursor:pointer}
.ff-btn.ghost{background:#fff;color:var(--fin-muted);border-color:var(--fin-line)}
.ff-btn.ghost:hover{color:var(--fin-ink);border-color:var(--fin-faint)}

.fin-empty{background:var(--fin-surface);border:1px solid var(--fin-line);border-radius:14px;
  padding:44px 34px;text-align:center}
.fin-empty h2{font-family:var(--fin-serif);font-weight:400;font-size:24px;
  letter-spacing:-.015em;margin:0 0 10px}
.fin-empty p{margin:0 auto;max-width:430px;color:var(--fin-muted);font-size:14.5px}

/* ── KPI tiles ── */
.fin-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));
  gap:11px;margin-bottom:26px}
@media(min-width:1040px){.fin-kpis{grid-template-columns:repeat(7,1fr)}}
.fin-kpi{background:var(--fin-surface);border:1px solid var(--fin-line);border-radius:12px;
  padding:14px 14px 13px;min-width:0;display:flex;flex-direction:column;gap:6px}
.fin-kpi.emph{border-color:#D9CBF3;box-shadow:0 1px 3px rgba(91,33,182,.06),0 8px 24px -16px rgba(91,33,182,.4)}
.fin-kpi-label{font-size:10.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;
  color:var(--fin-faint)}
.fin-kpi-value{font-family:var(--fin-serif);font-weight:400;font-size:24px;line-height:1.08;
  letter-spacing:-.015em;font-variant-numeric:tabular-nums}
.fin-kpi.t-in .fin-kpi-value{color:#0A7E96}
.fin-kpi.t-out .fin-kpi-value{color:var(--fin-neg)}
.fin-kpi.t-warn .fin-kpi-value{color:var(--fin-warn)}
.fin-kpi-delta,.fin-kpi-hint{font-size:11.5px;color:var(--fin-muted)}
.fin-kpi-delta.up{color:#0A6B4C}
.fin-kpi-delta.down{color:var(--fin-neg)}

/* ── Panels ── */
.fin-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
@media(max-width:900px){.fin-grid{grid-template-columns:1fr}}
.fin-panel{background:var(--fin-surface);border:1px solid var(--fin-line);border-radius:14px;
  padding:20px 22px;margin-bottom:14px;scroll-margin-top:64px}
.fin-panel-head{display:flex;align-items:baseline;justify-content:space-between;gap:14px;
  margin-bottom:16px}
.fin-panel-head h2{font-family:var(--fin-serif);font-weight:400;font-size:19px;
  letter-spacing:-.012em;margin:0}
.fin-panel-head>div>span{display:block;font-size:12.5px;color:var(--fin-faint);margin-top:2px}
.fin-none{color:var(--fin-muted);font-size:13.5px;margin:4px 0}
.fin-link{color:var(--fin-accent);font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap}
.fin-link:hover{text-decoration:underline}
.fin-link.asbtn{background:none;border:none;font-family:inherit;cursor:pointer;padding:0}
.fin-dash{color:#D6D1E2}
.fin-total{margin:14px 0 0;font-size:13.5px;font-weight:600;text-align:right;
  font-variant-numeric:tabular-nums}

/* ── Charts ── */
.fin-legend{display:flex;gap:16px;font-size:12px;color:var(--fin-muted);margin-bottom:8px}
.fin-legend span{display:inline-flex;align-items:center;gap:6px}
.fin-legend i,.fin-tip i{width:9px;height:9px;border-radius:2.5px;display:inline-block}
.fin-svg{width:100%;height:auto;display:block;overflow:visible}
.fin-grid-line{stroke:var(--fin-hair);stroke-width:1}
.fin-axis{stroke:var(--fin-line);stroke-width:1}
.fin-xlab{font-size:9.5px;fill:var(--fin-faint);text-anchor:middle;font-family:inherit}
.fin-xlab.now{fill:var(--fin-accent);font-weight:700}
.fin-svg g:hover rect[fill="transparent"]{fill:rgba(91,33,182,.04)}
.fin-tip{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:10px;padding-top:10px;
  border-top:1px solid var(--fin-hair);font-size:12.5px;min-height:20px;
  font-variant-numeric:tabular-nums}
.fin-tip span{display:inline-flex;align-items:center;gap:6px}
.fin-tip-net{color:var(--fin-muted)}
.fin-tip-idle{color:#B9B3C8}

.fin-cats{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.fin-cats li{display:grid;grid-template-columns:minmax(96px,1.15fr) 2fr auto;align-items:center;
  gap:12px;font-size:13px}
.fc-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#4A4360}
.fc-track{background:var(--fin-hair);border-radius:4px;height:8px;overflow:hidden}
.fc-fill{display:block;height:100%;border-radius:0 4px 4px 0}
.fc-val{font-variant-numeric:tabular-nums;font-weight:600;font-size:12.5px}
.fin-aging .fc-name{color:var(--fin-ink)}

.fin-invoices{list-style:none;margin:14px 0 0;padding:13px 0 0;border-top:1px solid var(--fin-hair);
  display:flex;flex-direction:column;gap:9px}
.fin-invoices li{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:baseline;
  font-size:13px}
.fin-invoices li span:nth-child(2){color:var(--fin-faint);font-size:12px}
.fin-invoices li span.od{color:var(--fin-neg);font-weight:600}
.fin-invoices strong{font-variant-numeric:tabular-nums;font-weight:600}

/* ── Manual entry form ── */
.fin-form{display:grid;grid-template-columns:repeat(3,1fr);gap:13px;
  padding-top:4px;border-top:1px solid var(--fin-hair)}
@media(max-width:720px){.fin-form{grid-template-columns:1fr 1fr}}
.fin-form label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;
  color:var(--fin-muted)}
.fin-form label.wide{grid-column:1/-1}
.fin-form label span em{font-style:normal;font-weight:400;color:var(--fin-faint)}
.fin-form input,.fin-form select{font:inherit;font-size:14px;padding:9px 11px;border-radius:9px;
  border:1px solid var(--fin-line);background:var(--fin-surface);color:var(--fin-ink);width:100%}
.fin-form input:focus,.fin-form select:focus{outline:none;border-color:var(--fin-accent);
  box-shadow:0 0 0 3px rgba(91,33,182,.12)}
.fin-form-foot{grid-column:1/-1;display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:2px}
.fin-ok-inline{color:#0A6B4C;font-size:13px}
.fin-err-inline{color:#8E1F3F;font-size:13px}

/* ── Ledger ── */
.fin-tablewrap{overflow-x:auto}
.fin-table{width:100%;border-collapse:collapse;font-size:13px;min-width:660px}
.fin-table th{text-align:left;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;
  color:var(--fin-faint);font-weight:600;padding:0 10px 9px;border-bottom:1px solid var(--fin-line)}
.fin-table td{padding:11px 10px;border-bottom:1px solid var(--fin-hair);vertical-align:top}
.fin-table .r{text-align:right}
.fin-table .nowrap{white-space:nowrap}
.fin-table tbody tr:hover{background:var(--fin-sunk)}
.fin-table tr.flagged{background:#FEFBF2}
.fin-table tr.flagged:hover{background:#FDF8E9}
.fe-desc{display:block}
.fe-cp{display:block;color:var(--fin-faint);font-size:11.5px;margin-top:1px}
.fe-why{display:block;color:var(--fin-warn);font-size:11.5px;margin-top:3px}
.fe-note{display:block;color:var(--fin-faint);font-size:11.5px;margin-top:3px;font-style:italic}
.amt-in{color:#0A7E96;font-weight:600;font-variant-numeric:tabular-nums}
.amt-out{color:var(--fin-ink);font-variant-numeric:tabular-nums}
.fe-sel{font:inherit;font-size:12.5px;padding:5px 8px;border-radius:8px;
  border:1px solid var(--fin-line);background:#fff;color:var(--fin-ink);max-width:100%;width:186px}
.fe-sel.warn{border-color:#E4CE8E;background:#FFFDF6}
.fe-del{border:1px solid transparent;background:none;color:#C9C3D6;font:inherit;font-size:12px;
  line-height:1;padding:5px 7px;border-radius:7px;cursor:pointer;transition:.14s}
.fe-del:hover{color:var(--fin-neg);border-color:#F0CEDD;background:#FDF3F7}

/* ── Tools ── */
.fin-tools textarea{width:100%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:12px;padding:11px 13px;border-radius:10px;border:1px solid var(--fin-line);
  resize:vertical;color:var(--fin-ink);background:var(--fin-surface)}
.fin-tools textarea:focus{outline:none;border-color:var(--fin-accent);
  box-shadow:0 0 0 3px rgba(91,33,182,.12)}
.fin-help{color:var(--fin-muted);font-size:13px;margin:0 0 11px}
.fin-tools-row{display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap}
.fin-spacer{flex:1}
.fin-btn{border:none;background:var(--fin-accent);color:#fff;font:inherit;font-weight:600;
  font-size:13.5px;padding:10px 17px;border-radius:10px;cursor:pointer;transition:.14s}
.fin-btn:hover:not(:disabled){background:#4C1D95}
.fin-btn:disabled{background:#DCD4EC;cursor:not-allowed}
.fin-btn.ghost{background:#fff;color:var(--fin-muted);border:1px solid var(--fin-line)}
.fin-btn.ghost:hover:not(:disabled){color:var(--fin-accent);border-color:var(--fin-accent);background:#fff}
.fin-filebtn{font-size:13.5px;font-weight:600;color:var(--fin-accent);cursor:pointer;
  border:1px solid var(--fin-line);padding:10px 15px;border-radius:10px;background:#fff}
.fin-filebtn:hover{border-color:var(--fin-accent)}

button:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible,input:focus-visible{
  outline:2px solid var(--fin-accent);outline-offset:2px}
@media(max-width:600px){.fin{padding:0 15px 64px}.fin-head{padding:30px 0 20px}}
`;
