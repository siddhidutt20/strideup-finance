import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { Panel } from "./pieces.jsx";
import { Disc, CategoryPill } from "./glyphs.jsx";

// ── Every transaction, filtered ──────────────────────────────
// The ledger, asked the way somebody looks for one thing: who was it with,
// roughly when, what kind of thing was it. Every filter is a query the server
// answers — narrowing what happens to be on screen is not searching.

const PAGE = 12;

const dayLabel = (d) =>
  new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

// How a row got onto the books. This is the honest version of an "account"
// column: without a bank feed there are no accounts, but where a row came
// from is real, recorded, and the thing you actually want when a figure
// looks wrong.
function sourceOf(r) {
  if (r.document_id) return { label: "From a document", cls: "doc" };
  if (String(r.dedup_key ?? "").startsWith("commitment:")) return { label: "Scheduled payment", cls: "sched" };
  if (String(r.dedup_key ?? "").startsWith("invoice:")) return { label: "Invoice", cls: "inv" };
  if (String(r.dedup_key ?? "").startsWith("ghl:")) return { label: "Imported", cls: "imp" };
  return { label: "Added by hand", cls: "hand" };
}

const BLANK = { q: "", direction: "", categoryId: "", from: "", to: "" };

export function TransactionsView({ entity, categories, money, onAdd, reloadKey }) {
  const [f, setF] = useState(BLANK);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setPage(0); };
  const dirty = Object.keys(BLANK).some((k) => f[k] !== BLANK[k]);

  const load = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      const r = await api.finTransactions({
        ...f, entity: entity === "both" ? "" : entity,
        limit: PAGE, offset: page * PAGE,
      });
      setRows(r.entries); setTotal(r.total ?? r.entries.length);
    } catch (e) {
      setErr(e.message || "Could not load your transactions."); setRows([]);
    } finally { setBusy(false); }
  }, [f, entity, page]);

  // Typing should not fire a request per keystroke, and a slow answer must
  // never overwrite a fast one that came after it.
  useEffect(() => {
    const t = setTimeout(load, f.q ? 220 : 0);
    return () => clearTimeout(t);
  }, [load, reloadKey]);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const from = total ? page * PAGE + 1 : 0;
  const to = Math.min(total, (page + 1) * PAGE);
  const usable = categories.filter(
    (c) => !c.entity || c.entity === "both" || c.entity === entity
  );

  return (
    <div className="tx">
      <div className="tx-filters">
        <div className="tb-search tx-search">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2 17 17" />
          </svg>
          <input value={f.q} onChange={set("q")} placeholder="Search transactions…"
                 aria-label="Search transactions" />
        </div>
        <label className="tx-pick"><span className="fin-sr">From</span>
          <input type="date" value={f.from} onChange={set("from")} aria-label="From date" />
        </label>
        <label className="tx-pick"><span className="fin-sr">To</span>
          <input type="date" value={f.to} onChange={set("to")} aria-label="To date" />
        </label>
        <label className="tx-pick"><span className="fin-sr">Category</span>
          <select value={f.categoryId} onChange={set("categoryId")} aria-label="Category">
            <option value="">Any category</option>
            {usable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="tx-pick"><span className="fin-sr">Type</span>
          <select value={f.direction} onChange={set("direction")} aria-label="Money in or out">
            <option value="">In and out</option>
            <option value="in">Money in</option>
            <option value="out">Money out</option>
          </select>
        </label>
        <button className="fin-link tx-clear" disabled={!dirty}
                onClick={() => { setF(BLANK); setPage(0); }}>Clear all</button>
        <span className="tx-add">
          <a className="fin-btn ghost" href={api.finExportUrl()}
             title="Every entry, as a spreadsheet">Export</a>
          <button className="fin-btn" onClick={onAdd}>+ Add transaction</button>
        </span>
      </div>

      <Panel>
        {err && <div className="fin-error">{err}</div>}
        {rows == null ? (
          <div className="fin-boot"><div className="fin-spinner" /></div>
        ) : rows.length === 0 ? (
          <p className="fc-none">
            {dirty ? "Nothing matches those filters. Clear them to see everything."
                   : "Nothing is recorded yet. Upload a bill or add a transaction."}
          </p>
        ) : (
          <div className="fin-tablewrap">
            <table className="fin-table tx-table">
              <thead>
                <tr><th>Date</th><th>Description</th><th>Category</th>
                    <th>Where from</th><th className="num">Amount</th></tr>
              </thead>
              <tbody className={busy ? "tx-busy" : undefined}>
                {rows.map((r) => {
                  const src = sourceOf(r);
                  return (
                    <tr key={r.id}>
                      <td className="fc-date tx-date">{dayLabel(r.entry_date)}</td>
                      <td>
                        <span className="ic-who">
                          <Disc name={r.category_name || r.counterparty || r.description} size="sm" />
                          <b>{r.counterparty || r.description}</b>
                          {r.review_status === "needs_review" &&
                            <span className="fc-dupetag">needs a look</span>}
                        </span>
                      </td>
                      <td><CategoryPill name={r.category_name} /></td>
                      <td><span className={`tx-src s-${src.cls}`}>{src.label}</span></td>
                      <td className={`num fin-fig ${r.direction === "in" ? "fe-in" : "fe-out"}`}>
                        {r.direction === "in" ? "+" : "−"} {money.exact(r.base_amount_minor)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div className="tx-foot">
            <span>Showing {from}–{to} of {total} transaction{total === 1 ? "" : "s"}</span>
            {pages > 1 && (
              <span className="tx-pages">
                <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}
                        aria-label="Previous page">‹</button>
                {pageList(page, pages).map((n, i) =>
                  n === "…" ? <em key={`g${i}`}>…</em> : (
                    <button key={n} className={n === page ? "on" : ""}
                            aria-current={n === page ? "page" : undefined}
                            onClick={() => setPage(n)}>{n + 1}</button>
                  ))}
                <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}
                        aria-label="Next page">›</button>
              </span>
            )}
          </div>
        )}
        <p className="fc-note">
          Amounts are shown in your own currency, converted at the rate on the
          day. Correcting or removing a row is on the Ledger.
        </p>
      </Panel>
    </div>
  );
}

// First, last, and a window around where you are — the rest is an ellipsis,
// because thirty numbered buttons is not navigation.
function pageList(page, pages) {
  if (pages <= 7) return [...Array(pages).keys()];
  const out = new Set([0, pages - 1, page]);
  for (const d of [-1, 1]) {
    const n = page + d;
    if (n > 0 && n < pages - 1) out.add(n);
  }
  const sorted = [...out].sort((a, b) => a - b);
  const withGaps = [];
  sorted.forEach((n, i) => {
    if (i && n - sorted[i - 1] > 1) withGaps.push("…");
    withGaps.push(n);
  });
  return withGaps;
}
