import { useMemo, useState } from "react";
import { Panel } from "./pieces.jsx";
import { segment as seg } from "./spend.jsx";
import { api } from "../api.js";
import { monthLabel, ENTITY_LABEL, SPEND_GROUPS } from "./format.js";

// ── Vendor management ────────────────────────────────────────
// A vendor here is any party you have a schedule with, in either direction.
// A university that pays you and a landlord you pay are the same kind of
// record — a relationship with agreed payments attached — so they live in one
// directory with the direction shown, rather than in two lists that would
// need maintaining twice.

// Paid / partly paid / unpaid, validated for colour vision: worst pair
// separates at ΔE 17.5 under protanopia. The obvious green-amber-red fails
// that check at 4.1 — red and green are the pair most readers cannot tell
// apart — so the good end is teal. Every slice carries a word regardless.
export const PAY_COLOUR = { paid: "#1785a8", partial: "#eda100", unpaid: "#d03b3b" };
const REL = {
  in: { label: "They pay", cls: "rel-in" },
  out: { label: "We pay", cls: "rel-out" },
  both: { label: "Both ways", cls: "rel-both" },
};
const STATUS_LABEL = {
  paid: "Paid", partial: "Part paid", due: "Due",
  overdue: "Overdue", waived: "Waived",
};



function PaymentStatus({ tally, money }) {
  const [hover, setHover] = useState(null);
  const parts = [
    { key: "paid", label: "Paid in full", value: tally.paid },
    { key: "partial", label: "Partly paid", value: tally.partial },
    { key: "unpaid", label: "Not paid", value: tally.unpaid + tally.overdue },
  ].filter((p) => p.value > 0);
  const total = parts.reduce((t, p) => t + p.value, 0);

  if (!total) {
    return <p className="fc-none">Nothing scheduled to report on yet.</p>;
  }

  const S = 200, C = S / 2, R = 88, RI = 58, GAP = parts.length > 1 ? 2 : 0;
  let angle = 0;
  const arcs = parts.map((p) => {
    const sweep = (p.value / total) * 360;
    const from = angle + GAP / 2, to = angle + sweep - GAP / 2;
    angle += sweep;
    return { ...p, from, to: Math.max(from + 0.4, to), share: p.value / total };
  });
  const focus = hover ? arcs.find((a) => a.key === hover) : null;

  return (
    <div className="sp-wrap">
      <div className="sp-donut">
        <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label="Payment status by amount">
          {arcs.map((a) => (
            <path key={a.key} d={seg(C, C, focus?.key === a.key ? R + 4 : R, RI, a.from, a.to)}
                  fill={PAY_COLOUR[a.key]} className="sp-seg"
                  onMouseEnter={() => setHover(a.key)} onMouseLeave={() => setHover(null)} />
          ))}
          <text x={C} y={C - 5} className="sp-centre-fig">
            {money.round(focus ? focus.value : total)}
          </text>
          <text x={C} y={C + 15} className="sp-centre-lab">
            {focus ? `${Math.round(focus.share * 100)}% ${focus.label}` : "scheduled"}
          </text>
        </svg>
      </div>
      <ul className="sp-list">
        {arcs.map((a) => (
          <li key={a.key} className={hover === a.key ? "on" : ""}
              onMouseEnter={() => setHover(a.key)} onMouseLeave={() => setHover(null)}>
            <i style={{ background: PAY_COLOUR[a.key] }} aria-hidden="true" />
            <span className="sp-name">{a.label}</span>
            <span className="sp-share">{Math.round(a.share * 100)}%</span>
            <span className="sp-amt fin-fig">{money.round(a.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Pending({ items, money, onRecord }) {
  if (!items.length) return <p className="fc-none">Nothing falls due in the next 30 days.</p>;
  return (
    <ul className="vm-list">
      {items.slice(0, 6).map((u, i) => (
        <li key={`${u.commitmentId}-${u.date}-${i}`}>
          <span className="vm-what">
            <b>{u.vendor}</b>
            <em>{u.description}</em>
          </span>
          <span className="vm-right">
            <b className={`fin-fig ${u.direction === "in" ? "fe-in" : "fe-out"}`}>
              {money.exact(u.amount)}
            </b>
            <em className={u.status === "overdue" ? "vm-late" : ""}>
              {u.status === "overdue"
                ? `Due ${Math.abs(u.daysAway)} day${Math.abs(u.daysAway) === 1 ? "" : "s"} ago`
                : u.daysAway === 0 ? "Due today" : `Due in ${u.daysAway} days`}
            </em>
          </span>
          <button className="vm-rec" onClick={() => onRecord(u)}>Record</button>
        </li>
      ))}
    </ul>
  );
}

function Expiring({ vendors, money }) {
  if (!vendors.length) return <p className="fc-none">No agreement ends in the next 90 days.</p>;
  return (
    <ul className="vm-list">
      {vendors.slice(0, 6).map((v) => (
        <li key={`${v.name}-${v.entity}`}>
          <span className="vm-what">
            <b>{v.name}</b>
            <em>Ends {v.endsOn}</em>
          </span>
          <span className={`vm-days${v.daysToEnd <= 30 ? " soon" : ""}`}>
            {v.daysToEnd} day{v.daysToEnd === 1 ? "" : "s"}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── The contract folder ──────────────────────────────────────
// The reader files a contract by what it reads on the page, and sometimes it
// reads it wrong — a freelance marketer's retainer filed as contractor fees.
// Changing the heading changes nothing else: the amounts, the dates and every
// payment already recorded against the agreement stand.
function CategoryPick({ contract, categories, onChange }) {
  const [busy, setBusy] = useState(false);
  const usable = categories.filter(
    (c) => (c.entity === "both" || c.entity === contract.entity) &&
           (contract.direction === "in"
             ? c.kind === "revenue" || c.kind === "capital"
             : c.kind !== "revenue")
  );
  const save = async (id) => {
    setBusy(true);
    try {
      await Promise.all(contract.commitmentIds.map(
        (k) => api.updateCommitment(k, { categoryId: id ? Number(id) : null })
      ));
      onChange?.();
    } finally { setBusy(false); }
  };
  return (
    <select className="vm-cat" disabled={busy} value={contract.categoryId ?? ""}
            aria-label={`Category for ${contract.counterparty || contract.filename}`}
            onChange={(e) => save(e.target.value)}>
      <option value="">Uncategorised</option>
      {SPEND_GROUPS.map((g) => {
        const items = usable.filter((c) => c.spendGroup === g);
        return items.length ? (
          <optgroup key={g} label={g}>
            {items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        ) : null;
      })}
      {usable.some((c) => !c.spendGroup) && (
        <optgroup label="Everything else">
          {usable.filter((c) => !c.spendGroup)
                 .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      )}
    </select>
  );
}

function Library({ library, money, showEntity, onReread, rereading, categories, onChange }) {
  if (!library.count) {
    return (
      <p className="fc-none">
        No contracts filed yet. Upload one above — the payment schedule is read
        off it, and the agreement itself is kept here.
      </p>
    );
  }
  return (
    <div className="vm-lib">
      {library.months.map((m) => (
        <section key={m.period}>
          <h4>{monthLabel(m.period)}<span>{m.contracts.length}</span></h4>
          <ul>
            {m.contracts.map((c) => (
              <li key={c.documentId}>
                <span className={`fc-dir ${c.direction}`}>
                  {c.direction === "in" ? "In" : "Out"}
                </span>
                <span className="vm-file">
                  <a href={api.finDocUrl(c.documentId)} target="_blank" rel="noreferrer">
                    {c.filename || `document ${c.documentId}`}
                  </a>
                  <em>
                    {c.counterparty || "no party recorded"} · {c.installments} payment
                    {c.installments === 1 ? "" : "s"} · {c.firstDue} to {c.lastDue}
                    {showEntity && ` · ${ENTITY_LABEL[c.entity]}`}
                    {c.flagged && " · needs a look"}
                  </em>
                </span>
                <CategoryPick contract={c} categories={categories} onChange={onChange} />
                <b className={`fin-fig ${c.direction === "in" ? "fe-in" : "fe-out"}`}>
                  {money.round(c.total)}
                </b>
                <button className="vm-rec" disabled={rereading === c.documentId}
                        title="Read this contract again and rebuild its schedule"
                        onClick={() => onReread(c)}>
                  {rereading === c.documentId ? "Reading…" : "Read again"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function VendorsView({ vm, money, entity, categories, onUpload, onRecord, busy, showEntity, onChange }) {
  const t = vm.totals;
  const [rereading, setRereading] = useState(null);
  const [note, setNote] = useState("");

  // Reading a contract again is how a schedule that came out wrong gets
  // fixed — the document is already stored, so nothing needs re-uploading.
  const reread = async (c) => {
    setRereading(c.documentId); setNote("");
    try {
      const r = await api.rereadDoc(c.documentId, { kind: "contract", entityHint: c.entity });
      const made = r.commitments?.length ?? 0;
      setNote(r.contract
        ? `${c.filename}: ${made} commitment${made === 1 ? "" : "s"} now` +
          (r.replaced ? `, ${r.replaced} replaced` : "") +
          (r.kept ? `, ${r.kept} kept because payments are recorded against them` : "")
        : `${c.filename}: that did not read as a contract this time.`);
      onChange?.();
    } catch (err) {
      setNote(err.message || "Could not read that again.");
    } finally { setRereading(null); }
  };
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return vm.vendors;
    return vm.vendors.filter((v) =>
      v.name.toLowerCase().includes(needle) ||
      v.categories.some((c) => c.toLowerCase().includes(needle))
    );
  }, [vm.vendors, q]);

  return (
    <>
      <div className="fc-kpis vm-kpis">
        <article className="fc-kpi">
          <header><span>Parties</span></header>
          <p className="fin-fig">{t.vendors}</p>
          <footer>{t.contracts} agreement{t.contracts === 1 ? "" : "s"} on file</footer>
        </article>
        <article className="fc-kpi">
          <header><span>Due soon</span></header>
          <p className="fin-fig">{t.dueCount}</p>
          <footer>{money.round(t.dueAmount)} in the next {vm.horizonDays} days</footer>
        </article>
        <article className={`fc-kpi${t.overdueCount > 0 ? " warn" : ""}`}>
          <header><span>Overdue</span></header>
          <p className={`fin-fig${t.overdueCount > 0 ? " fe-out" : ""}`}>{t.overdueCount}</p>
          <footer>
            {t.overdueCount
              ? `${money.round(t.overdueAmount)} past its date, nothing recorded`
              : "nothing past its date"}
          </footer>
        </article>
        <article className={`fc-kpi${vm.expiring.length > 0 ? " warn" : ""}`}>
          <header><span>Ending soon</span></header>
          <p className="fin-fig">{vm.expiring.length}</p>
          <footer>agreements ending within 90 days</footer>
        </article>
        <article className="fc-kpi">
          <header><span>Paid out this year</span></header>
          <p className="fin-fig fe-out">{money.round(t.paidOutYear)}</p>
          <footer>since {vm.yearStart}</footer>
        </article>
        <article className="fc-kpi">
          <header><span>Received this year</span></header>
          <p className="fin-fig fe-in">{money.round(t.paidInYear)}</p>
          <footer>since {vm.yearStart}</footer>
        </article>
      </div>

      <div className="fin-twocol">
        <Panel title="Payment status" sub="Every scheduled payment, by what has been settled">
          <PaymentStatus tally={vm.tally} money={money} />
        </Panel>
        <div className="vm-stack">
          <Panel title="Pending payments" sub={`Overdue first, then the next ${vm.horizonDays} days`}>
            <Pending items={vm.pending} money={money} onRecord={onRecord} />
          </Panel>
          <Panel title="Ending soon" sub="Agreements that run out within 90 days">
            <Expiring vendors={vm.expiring} money={money} />
          </Panel>
        </div>
      </div>

      <Panel
        title="Directory"
        sub="Everyone you have an agreement with, and which way the money goes"
        action={
          <span className="vm-actions">
            <input className="vm-search" placeholder="Search parties…" value={q}
                   onChange={(e) => setQ(e.target.value)} aria-label="Search parties" />
            <a className="fin-btn ghost" href={api.vendorExportUrl(entity)}>Export CSV</a>
          </span>
        }>
        {rows.length === 0 ? (
          <p className="fc-none">
            {vm.vendors.length ? "Nothing matches that search." :
              "No agreements yet. Upload a contract below, or add a commitment on the Forecast page."}
          </p>
        ) : (
          <div className="fin-tablewrap">
            <table className="fin-table vm-table">
              <thead>
                <tr>
                  <th>Party</th><th>Relationship</th>{showEntity && <th>Books</th>}
                  <th>Next payment</th><th>Status</th>
                  <th className="num">Outstanding</th><th className="num">Settled this year</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={`${v.name}-${v.entity}`}>
                    <td>
                      <span className="vm-avatar" aria-hidden="true">
                        {v.name.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="vm-name">
                        {v.name}
                        <em>{v.categories[0] || "uncategorised"}
                          {v.fromContract && " · from a contract"}</em>
                      </span>
                    </td>
                    <td><span className={`vm-rel ${REL[v.relationship].cls}`}>
                      {REL[v.relationship].label}
                    </span></td>
                    {showEntity && <td><span className={`fe-ent e-${v.entity}`}>
                      {ENTITY_LABEL[v.entity]}
                    </span></td>}
                    <td className="fc-date">
                      {v.next ? v.next.date : <span className="fin-dash">—</span>}
                      {v.endsOn && <em className="vm-ends">ends {v.endsOn}</em>}
                    </td>
                    <td>
                      {v.next ? (
                        <span className={`vm-status s-${v.next.status}`}>
                          {STATUS_LABEL[v.next.status]}
                        </span>
                      ) : v.outstanding === 0 ? (
                        <span className="vm-status s-paid">Settled</span>
                      ) : <span className="fin-dash">—</span>}
                    </td>
                    <td className={`num fin-fig${v.overdue > 0 ? " fe-out" : ""}`}>
                      {money.exact(v.outstanding)}
                      {v.overdue > 0 && <em className="vm-late">{money.round(v.overdue)} late</em>}
                    </td>
                    <td className="num fin-fig">{money.exact(v.paidThisYear)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Contract folder" sub="Every agreement on file, by the month its payments begin">
        {note && <p className="fin-ok">{note}</p>}
        <Library library={vm.library} money={money} showEntity={showEntity}
                 categories={categories} onChange={onChange}
                 onReread={reread} rereading={rereading} />
      </Panel>
    </>
  );
}
