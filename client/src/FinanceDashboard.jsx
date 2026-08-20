import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { FIN_CSS, STATEMENT_CSS } from "./finance/styles.js";
import {
  fmtAmount, monthLabel, readFile, shiftMonth, thisMonth, useMoney, ZERO_DECIMAL,
} from "./finance/format.js";
import {
  OverviewView, RevenueView, ExpensesView, CashflowView, PnlView, LedgerView, ToolsView,
} from "./finance/views.jsx";

// ── StrideUp finances ────────────────────────────────────────
// One section per question. Overview answers "how is the month going" at a
// glance; the rest answer what you ask next — where money came from, where it
// went, what it added up to, and what actually moved.

const VIEWS = [
  ["overview", "Overview", "Finances", "How StrideUp is doing in"],
  ["revenue", "Revenue", "Revenue", "Where the money came from in"],
  ["expenses", "Expenses", "Expenses", "Where the money went in"],
  ["cashflow", "Cash flow", "Cash flow", "What actually moved in"],
  ["pnl", "P&L", "Profit and loss", "The statement for"],
  ["ledger", "Ledger", "Ledger", "Every entry in"],
  ["tools", "Import & close", "Import and close", "Bring in revenue, and settle"],
];
const NEEDS_STATEMENTS = new Set(["revenue", "expenses", "cashflow", "pnl"]);

export default function FinanceDashboard() {
  const [view, setView] = useState("overview");
  const [period, setPeriod] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [statements, setStatements] = useState(null);
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
        setStatements(null); // recomputed for the new month, on demand
      } catch (err) {
        setError(err.message || "Could not load your finances.");
      } finally {
        setLoading(false);
      }
    },
    [period, categories]
  );

  useEffect(() => { load(period); /* eslint-disable-next-line */ }, [period]);

  // Statements are fetched only when a statement view is opened, so the
  // dashboard does not pay for four of them nobody asked to see.
  useEffect(() => {
    if (!NEEDS_STATEMENTS.has(view) || statements?.period === period) return;
    let cancelled = false;
    api
      .finStatements(period)
      .then((st) => { if (!cancelled) setStatements(st); })
      .catch((err) => { if (!cancelled) setError(err.message || "Could not load that view."); });
    return () => { cancelled = true; };
  }, [view, period, statements]);

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
          ? { ...x, state: res.duplicate ? "duplicate" : "done", result: res,
              retry: res.duplicate ? { file, dataB64: b64 } : null }
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
        setFeed((f) => f.map((x) => (x.id === id ? { ...x, state: "error", message: err.message } : x)));
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
      await sendOne(item.retry.file, { id: item.id, dataB64: item.retry.dataB64, replace: true });
    } catch (err) {
      setFeed((f) => f.map((x) => (x.id === item.id ? { ...x, state: "error", message: err.message } : x)));
    }
    setBusy(false);
    load(period);
  }

  const dismiss = (id) => setFeed((f) => f.filter((x) => x.id !== id));

  async function fixEntry(id, categoryId) {
    await api.finPatchEntry(id, { categoryId: Number(categoryId) });
    load(period);
  }

  // Correcting a misread currency re-converts, so the month's totals move
  // with it.
  async function fixCurrency(id, currency) {
    try {
      await api.finPatchEntry(id, { currency });
      load(period);
    } catch (err) {
      setError(err.message || "Could not change that currency.");
    }
  }

  async function removeEntry(entry) {
    const what = entry.description || entry.counterparty || "this entry";
    const amount = fmtAmount(entry.currency, entry.amount_minor);
    if (!window.confirm(
      `Remove "${what}" (${amount})?\n\nThis deletes the entry and its uploaded file. It cannot be undone.`
    )) return;
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
        <style>{FIN_CSS}{STATEMENT_CSS}</style>
        <div className="fin-boot"><div className="fin-spinner" /></div>
      </div>
    );
  }

  const [, , heading, blurb] = VIEWS.find((v) => v[0] === view);
  const waiting = NEEDS_STATEMENTS.has(view) && statements?.period !== period;
  const showUpload = view === "overview" || view === "ledger";
  const isEmpty = (data?.summary?.entryCount ?? 0) === 0 && !data?.receivables?.total;

  return (
    <div className="fin">
      <style>{FIN_CSS}{STATEMENT_CSS}</style>

      <nav className="fin-nav" aria-label="Sections">
        <div className="fin-nav-inner">
          <ul>
            {VIEWS.map(([id, label]) => (
              <li key={id}>
                <button className={view === id ? "on" : ""}
                        aria-current={view === id ? "page" : undefined}
                        onClick={() => setView(id)}>{label}</button>
              </li>
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

      <header className="fin-viewhead">
        <div>
          <h1>{heading}</h1>
          <p>{blurb} {monthLabel(period)}.</p>
        </div>
      </header>

      {error && <div className="fin-error">{error}</div>}
      {data && !data.aiEnabled && view === "overview" && (
        <div className="fin-warn">
          Reading documents needs an Anthropic API key. Set <code>ANTHROPIC_API_KEY</code>{" "}
          and redeploy — everything else works without it.
        </div>
      )}

      {showUpload && (
        <UploadZone onFiles={handleFiles} busy={busy} feed={feed} money={money}
                    onReplace={replaceFile} onDismiss={dismiss} />
      )}

      {view === "overview" && isEmpty ? (
        <div className="fin-empty">
          <h2>Nothing recorded for {monthLabel(period)} yet</h2>
          <p>
            Drop an invoice above, or open the Ledger and write an entry by hand —
            capital you put in, a payment that never had a document, anything at all.
          </p>
        </div>
      ) : waiting ? (
        <div className="fin-boot"><div className="fin-spinner" /></div>
      ) : (
        <>
          {view === "overview" && (
            <OverviewView data={data} trend={shownTrend} money={money} period={period} />
          )}
          {view === "revenue" && statements && (
            <RevenueView st={statements} trend={shownTrend} money={money} period={period} />
          )}
          {view === "expenses" && statements && (
            <ExpensesView st={statements} trend={shownTrend} money={money} period={period} />
          )}
          {view === "cashflow" && statements && (
            <CashflowView st={statements} money={money} period={period} />
          )}
          {view === "pnl" && statements && (
            <PnlView st={statements} money={money} period={period} />
          )}
          {view === "ledger" && (
            <LedgerView entries={entries} categories={categories} money={money}
                        baseCurrency={data?.baseCurrency || "USD"} period={period}
                        onFix={fixEntry} onRemove={removeEntry} onCurrency={fixCurrency}
                        onAdded={() => load(period)} />
          )}
          {view === "tools" && (
            <ToolsView period={period} closed={data?.periodClosed} onDone={() => load(period)} />
          )}
        </>
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
                  {fmtAmount(
                    f.result.currency || f.result.extraction.currency,
                    Math.round(
                      f.result.extraction.total *
                        (ZERO_DECIMAL.has(f.result.currency || f.result.extraction.currency) ? 1 : 100)
                    )
                  )}
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
