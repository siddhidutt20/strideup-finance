import { get, run, lastId } from "../db.js";
import { toMinor } from "./extract.js";
import { categoryByName, findOrCreateCounterparty, resolvePeriod, upsertEntry } from "./ingest.js";

// ── GoHighLevel revenue and receivables ──────────────────────
// GHL is a CRM, not a bank: it records what a payment processor told it.
// So it owns *who owes what* (invoices), and the processor owns cash. The
// importer below therefore writes receivables always, and revenue entries
// only for transactions GHL has actually marked paid.
//
// Live webhooks and this CSV importer resolve to the SAME dedup key, so
// uploading an export that overlaps already-ingested data is a no-op. That
// property is what makes running both transports safe.

export const ghlDedupKey = (txnId) => `ghl:${String(txnId).trim()}`;

// ── Minimal CSV reader (quoted fields, embedded commas/newlines) ──
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// GHL's exports vary by report and by release, so columns are matched by
// meaning rather than by an exact header string.
const COLUMNS = {
  externalId: ["transaction id", "transactionid", "id", "payment id", "invoice id", "_id"],
  date: ["date", "created", "created at", "payment date", "issue date", "transaction date"],
  customer: ["contact", "contact name", "customer", "customer name", "name", "email"],
  amount: ["amount", "total", "subtotal", "amount paid", "value", "price"],
  currency: ["currency", "currency code"],
  status: ["status", "payment status", "invoice status"],
  dueDate: ["due date", "duedate"],
  reference: ["invoice number", "invoice #", "number", "reference"],
};

const norm = (h) => String(h || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

export function mapHeaders(header) {
  const cleaned = header.map(norm);
  const map = {};
  for (const [field, aliases] of Object.entries(COLUMNS)) {
    const idx = cleaned.findIndex((h) => aliases.includes(h));
    if (idx >= 0) map[field] = idx;
  }
  return map;
}

function parseAmount(raw) {
  const n = Number(String(raw ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseDate(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const PAID = new Set(["paid", "succeeded", "success", "completed", "complete", "won"]);

// ── Import one export ────────────────────────────────────────
export async function importGhlCsv(text, { defaultCurrency = "USD" } = {}) {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    const err = new Error("That CSV has no data rows.");
    err.code = "EMPTY_CSV";
    throw err;
  }
  const map = mapHeaders(rows[0]);
  const missing = ["externalId", "date", "amount"].filter((f) => map[f] === undefined);
  if (missing.length) {
    const err = new Error(
      `Could not find these columns in the CSV: ${missing.join(", ")}. ` +
        `Headers seen: ${rows[0].join(", ").slice(0, 200)}`
    );
    err.code = "BAD_HEADERS";
    throw err;
  }

  const revenueCat = await categoryByName("Programme revenue");
  const at = (row, field) => (map[field] === undefined ? null : row[map[field]]);

  let imported = 0, duplicates = 0, invoices = 0, skipped = 0;
  const problems = [];

  for (const row of rows.slice(1)) {
    const externalId = String(at(row, "externalId") ?? "").trim();
    const date = parseDate(at(row, "date"));
    const amount = parseAmount(at(row, "amount"));
    if (!externalId || !date || amount === null || amount === 0) {
      skipped++;
      if (problems.length < 5) {
        problems.push(`row with id "${externalId || "(blank)"}" is missing an id, date, or amount`);
      }
      continue;
    }

    const currency = (String(at(row, "currency") ?? "").trim() || defaultCurrency)
      .toUpperCase()
      .slice(0, 3);
    const customer = String(at(row, "customer") ?? "").trim() || "Unknown customer";
    const status = String(at(row, "status") ?? "paid").trim().toLowerCase();
    const isPaid = PAID.has(status);
    const amountMinor = toMinor(Math.abs(amount), currency);

    // Receivable: recorded whatever the status, so outstanding money is visible.
    await run(
      `INSERT INTO fin_invoices
         (source, external_id, customer, issue_date, due_date, amount_minor,
          paid_minor, currency, status, updated_at)
       VALUES ('ghl', ?, ?, ?, ?, ?, ?, ?, ?, now())
       ON CONFLICT (source, external_id) DO UPDATE SET
         customer = EXCLUDED.customer, due_date = EXCLUDED.due_date,
         amount_minor = EXCLUDED.amount_minor, paid_minor = EXCLUDED.paid_minor,
         status = EXCLUDED.status, updated_at = now()`,
      [
        externalId, customer, date, parseDate(at(row, "dueDate")),
        amountMinor, isPaid ? amountMinor : 0, currency,
        isPaid ? "paid" : status || "sent",
      ]
    );
    invoices++;

    // Revenue: only once GHL says the money actually landed.
    if (!isPaid) continue;
    const { period } = await resolvePeriod(date);
    const res = await upsertEntry({
      entryDate: date,
      direction: "in",
      amountMinor,
      currency,
      baseAmountMinor: amountMinor,
      counterpartyId: await findOrCreateCounterparty(customer, "customer"),
      categoryId: revenueCat ? Number(revenueCat.id) : null,
      description: `GHL payment — ${customer}`,
      reference: String(at(row, "reference") ?? "").trim() || externalId,
      dedupKey: ghlDedupKey(externalId),
      confidence: 1,
      reviewStatus: "auto",
      period,
    });
    if (res.created) imported++;
    else duplicates++;
  }

  return { imported, duplicates, invoices, skipped, problems };
}
