import { useState } from "react";
import { api } from "../api.js";
import { CURRENCIES, today, ENTITY_LABEL } from "./format.js";

// ── Raising an invoice ───────────────────────────────────────
// An invoice you have issued is money owed to you. It is not revenue and it
// is not cash — it is a claim, and it ages. Creating one writes nothing to
// the ledger; recording payment against it is what makes it revenue, in the
// month the money actually landed. Same rule contracts follow.

export function InvoiceFields({ entity, currency, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    entity: entity === "both" ? "strideup" : entity,
    customer: "", number: "", amount: "", currency,
    issueDate: today(), dueDate: "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api.addInvoice({
        entity: form.entity, customer: form.customer,
        number: form.number || undefined, amount: Number(form.amount),
        currency: form.currency, issueDate: form.issueDate,
        dueDate: form.dueDate || null,
      });
      onSaved();
    } catch (err) {
      setError(err.message || "Could not save that invoice.");
    } finally { setBusy(false); }
  };

  return (
      <form className="fin-form iv-form" onSubmit={submit}>
        <div className="iv-grid">
          <label className="wide"><span>Customer</span>
            <input value={form.customer} onChange={set("customer")} required maxLength={160}
                   placeholder="Lakewood State University" autoFocus />
          </label>
          <label><span>Books</span>
            <select value={form.entity} onChange={set("entity")}>
              <option value="strideup">{ENTITY_LABEL.strideup}</option>
              <option value="personal">{ENTITY_LABEL.personal}</option>
            </select>
          </label>
          <label><span>Invoice number <em>(optional)</em></span>
            <input value={form.number} onChange={set("number")} maxLength={80}
                   placeholder="generated if blank" />
          </label>
          <label><span>Amount</span>
            <input type="number" step="0.01" min="0.01" value={form.amount}
                   onChange={set("amount")} required />
          </label>
          <label><span>Currency</span>
            <select value={form.currency} onChange={set("currency")}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label><span>Issued</span>
            <input type="date" value={form.issueDate} onChange={set("issueDate")} required />
          </label>
          <label><span>Due <em>(optional)</em></span>
            <input type="date" value={form.dueDate} onChange={set("dueDate")}
                   min={form.issueDate} />
          </label>
        </div>

        <div className="fin-form-foot">
          <button className="fin-btn" disabled={busy}>{busy ? "Saving…" : "Raise it"}</button>
          {error && <span className="fin-err-inline">{error}</span>}
        </div>
      </form>
  );
}

// ── Recording payment against one ────────────────────────────
export function PayInvoice({ invoice, categories, money, onClose, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    amount: (invoice.outstanding / 100).toFixed(2),
    paidDate: today(),
    categoryId: "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const revenue = categories.filter((c) => c.kind === "revenue" &&
    (!c.entity || c.entity === "both" || c.entity === invoice.entity));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api.payInvoice(invoice.id, {
        amount: Number(form.amount), paidDate: form.paidDate,
        categoryId: form.categoryId || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.message || "Could not record that.");
    } finally { setBusy(false); }
  };

  return (
    <div className="ct-modal" role="dialog" aria-modal="true" aria-label="Record a payment">
      <form className="ct-dialog" onSubmit={submit}>
        <h3>Record payment</h3>
        <p className="ct-dialogsub">
          {invoice.customer} · {invoice.number} · {money.exact(invoice.outstanding)} outstanding
        </p>
        <label><span>How much arrived</span>
          <input type="number" step="0.01" min="0.01" value={form.amount}
                 onChange={set("amount")} required />
        </label>
        <label><span>When</span>
          <input type="date" value={form.paidDate} onChange={set("paidDate")} required />
        </label>
        <label><span>Category</span>
          <select value={form.categoryId} onChange={set("categoryId")}>
            <option value="">Uncategorised</option>
            {revenue.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <p className="ct-dialognote">
          This writes a revenue entry dated {form.paidDate}. Paying part of it leaves
          the balance outstanding and still ageing.
        </p>
        {error && <p className="fin-error">{error}</p>}
        <div className="ct-dialogactions">
          <button type="button" className="fin-btn ghost" onClick={onClose}>Cancel</button>
          <button className="fin-btn" disabled={busy}>{busy ? "Recording…" : "It arrived"}</button>
        </div>
      </form>
    </div>
  );
}

// ── The list ─────────────────────────────────────────────────
export function InvoiceList({ invoices, money, onPay, onDelete, busy }) {
  if (!invoices.length) {
    return (
      <p className="fc-none">
        No invoices raised yet. "New invoice" records money owed to you — it ages
        under outstanding payments until you record it as paid.
      </p>
    );
  }
  const label = { sent: "Open", partial: "Part paid", paid: "Paid",
                  void: "Void", written_off: "Written off" };
  return (
    <div className="fin-tablewrap">
      <table className="fin-table iv-table">
        <thead>
          <tr>
            <th>Customer</th><th>Number</th><th>Issued</th><th>Due</th><th>Status</th>
            <th className="num">Amount</th><th className="num">Outstanding</th><th />
          </tr>
        </thead>
        <tbody>
          {invoices.map((v) => {
            const late = v.dueDate && v.outstanding > 0 && v.dueDate < today();
            return (
              <tr key={v.id}>
                <td>{v.customer || "—"}</td>
                <td className="fc-date">{v.number}</td>
                <td className="fc-date">{v.issueDate}</td>
                <td className="fc-date">
                  {v.dueDate || <span className="fin-dash">—</span>}
                  {late && <em className="vm-late">overdue</em>}
                </td>
                <td>
                  <span className={`vm-status s-${v.outstanding <= 0 ? "paid"
                    : late ? "overdue" : v.paidMinor > 0 ? "partial" : "due"}`}>
                    {label[v.status] || v.status}
                  </span>
                </td>
                <td className="num fin-fig">{money.exact(v.amountMinor)}</td>
                <td className="num fin-fig fe-in">{money.exact(v.outstanding)}</td>
                <td className="iv-actions">
                  {v.outstanding > 0 && (
                    <button className="vm-rec" disabled={busy} onClick={() => onPay(v)}>
                      Record
                    </button>
                  )}
                  {v.paidMinor === 0 && (
                    <button className="fin-x" disabled={busy} title="Remove this invoice"
                            onClick={() => onDelete(v)}>×</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
