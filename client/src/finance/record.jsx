import { useState } from "react";
import { ManualEntryForm } from "./views.jsx";
import { CommitmentForm } from "./forecast.jsx";
import { InvoiceFields } from "./invoice.jsx";

// ── One "New" button ─────────────────────────────────────────
// Three things used to sit permanently on the page competing for the same
// space: a drop zone, a by-hand entry panel, and an invoice button. They are
// all the same intention — put something into the books — so they are one
// button and one dialog, with the kind chosen first.
//
// The kinds differ in what they claim, which is why they cannot be merged
// into one form: a payment happened, an invoice is owed, a commitment is
// agreed. Each writes somewhere different and only one of them is money.

const KINDS = {
  payment_in: {
    label: "Payment received", hint: "Money that has arrived. Goes straight into revenue.",
    group: "in",
  },
  invoice: {
    label: "Invoice raised", hint: "Money owed to you. Ages until you record it as paid.",
    group: "in",
  },
  payment_out: {
    label: "Payment made", hint: "Money that has left. Goes straight into expenses.",
    group: "out",
  },
  commitment: {
    label: "Contract or commitment",
    hint: "A retainer, rent, an EMI, a subscription. Agreed, not yet moved.",
    group: "both",
  },
};

export function NewRecord({ side, entity, currency, categories, onClose, onSaved }) {
  const offered = Object.entries(KINDS).filter(([, k]) =>
    k.group === "both" || k.group === side);
  const [kind, setKind] = useState(offered[0][0]);
  const chosen = KINDS[kind];
  const ent = entity === "both" ? "strideup" : entity;

  return (
    <div className="ct-modal" role="dialog" aria-modal="true" aria-label="Add a record">
      <div className="ct-dialog nr-dialog">
        <h3>Add a record</h3>

        <div className="nr-kinds" role="group" aria-label="What kind of record">
          {offered.map(([key, k]) => (
            <button key={key} type="button"
                    className={`nr-kind${kind === key ? " on" : ""}`}
                    onClick={() => setKind(key)}>
              <b>{k.label}</b>
              <em>{k.hint}</em>
            </button>
          ))}
        </div>

        <div className="nr-body">
          {kind === "payment_in" && (
            <ManualEntryForm categories={categories} currency={currency} entity={ent}
                             defaultDirection="in" preferKinds={["revenue", "capital"]}
                             descPlaceholder="Coaching programme — August cohort"
                             whoPlaceholder="Customer name…" whoLabel="Customer"
                             onAdded={onSaved} />
          )}
          {kind === "payment_out" && (
            <ManualEntryForm categories={categories} currency={currency} entity={ent}
                             defaultDirection="out" preferKinds={["cogs", "opex", "capex", "tax"]}
                             descPlaceholder="Cloud hosting — August"
                             whoPlaceholder="Supplier name…" whoLabel="Supplier"
                             onAdded={onSaved} />
          )}
          {kind === "invoice" && (
            <InvoiceFields entity={ent} currency={currency} onSaved={onSaved} />
          )}
          {kind === "commitment" && (
            <CommitmentForm entity={ent} categories={categories} currency={currency}
                            onAdded={onSaved} />
          )}
        </div>

        <div className="ct-dialogactions">
          <button type="button" className="fin-btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
