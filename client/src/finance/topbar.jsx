import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Avatar } from "./profile.jsx";

// ── The bar above everything ─────────────────────────────────
// Three things a household app is asked for constantly and should not have to
// be navigated to: find a row, see what wants a decision, and get out.

// Search runs against the ledger, not against what happens to be loaded on
// screen — a row from March is findable in September.
export function Search({ entity, onOpen }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  const seq = useRef(0);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setRows(null); return; }
    // Typing is faster than the network, so a stale answer must never
    // overwrite a fresh one.
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await api.finSearch(text, entity);
        if (seq.current === mine) setRows(r.entries);
      } catch {
        if (seq.current === mine) setRows([]);
      } finally {
        if (seq.current === mine) setBusy(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, entity]);

  useEffect(() => {
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setRows(null); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  return (
    <div className="tb-search" ref={box}>
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor"
           strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2 17 17" />
      </svg>
      <input value={q} onChange={(e) => setQ(e.target.value)}
             onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); setRows(null); } }}
             placeholder="Search transactions, bills, or anything…"
             aria-label="Search your entries" />
      {q && (
        <button className="tb-clear" onClick={() => { setQ(""); setRows(null); }}
                aria-label="Clear search">×</button>
      )}
      {rows && (
        <div className="tb-results" role="listbox">
          {busy && <p className="tb-hint">Searching…</p>}
          {!busy && rows.length === 0 && <p className="tb-hint">Nothing matches “{q.trim()}”.</p>}
          {rows.map((r) => (
            <button key={r.id} onClick={() => { setRows(null); onOpen(r); }}>
              <b>{r.counterparty || r.description}</b>
              <em>{r.entry_date} · {r.category_name || "Uncategorised"}</em>
              <span className={r.direction === "in" ? "fe-in" : "fe-out"}>
                {r.direction === "in" ? "+" : "−"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// The bell counts things that want a decision — bills past their date and
// rows nobody has confirmed — not a feed of everything that happened.
export function Alerts({ alerts, onGo }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);
  const n = alerts?.total ?? 0;
  return (
    <div className="tb-bell" ref={box}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
              aria-label={n ? `${n} things need attention` : "Nothing needs attention"}>
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor"
             strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 2.8a4.6 4.6 0 0 1 4.6 4.6c0 4 1.4 5.4 1.4 5.4H4s1.4-1.4 1.4-5.4A4.6 4.6 0 0 1 10 2.8Z" />
          <path d="M8.4 15.6a1.8 1.8 0 0 0 3.2 0" />
        </svg>
        {n > 0 && <i className="tb-dot" />}
      </button>
      {open && (
        <div className="tb-menu tb-alerts">
          {n === 0 ? (
            <p className="tb-hint">Nothing is late and nothing is waiting to be checked.</p>
          ) : (
            <>
              {alerts.overdue > 0 && (
                <button onClick={() => { setOpen(false); onGo("bills"); }}>
                  <b>{alerts.overdue} bill{alerts.overdue === 1 ? "" : "s"} past their date</b>
                  <em>Open Bills</em>
                </button>
              )}
              {alerts.needsReview > 0 && (
                <button onClick={() => { setOpen(false); onGo("ledger"); }}>
                  <b>{alerts.needsReview} entr{alerts.needsReview === 1 ? "y" : "ies"} to check</b>
                  <em>Read from a document, not yet confirmed</em>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function AccountMenu({ owner, onLogout, onProfile }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);
  const name = String(owner?.name || "You").trim();
  return (
    <div className="tb-who" ref={box}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Avatar owner={owner} size={30} />
        <b>{name.split(/\s+/)[0]}</b>
        <i className="tb-caret" aria-hidden="true">▾</i>
      </button>
      {open && (
        <div className="tb-menu">
          <p className="tb-hint tb-me">
            <Avatar owner={owner} size={38} />
            <span><b>{name}</b><em>{owner?.email}</em></span>
          </p>
          <button onClick={() => { setOpen(false); onProfile(); }}>
            <b>Your profile</b>
            <em>Your picture and what you are called</em>
          </button>
          <button onClick={onLogout}>
            <b>Log out</b>
            <em>End this session</em>
          </button>
        </div>
      )}
    </div>
  );
}
