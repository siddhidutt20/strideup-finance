import crypto from "node:crypto";
import { all, get, run, lastId } from "../db.js";
import { extractDocument, reviewReason, toMinor } from "./extract.js";

// ── The normaliser ───────────────────────────────────────────
// Everything that becomes a ledger row goes through here, whatever the
// transport. One dedup key per financial fact, one unique index, therefore
// every import is idempotent and every job is safely retryable.

export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// Vendor names arrive in many shapes — "GOOGLE*CLOUD", "Google Cloud EMEA Ltd".
// Flatten to a comparable key so a rule learned once keeps matching.
export function vendorKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(ltd|limited|inc|llc|llp|plc|gmbh|bv|pvt|co|corp|company)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const periodOf = (isoDate) => `${String(isoDate).slice(0, 7)}-01`;

// If the month a document belongs to has been closed, the entry is posted to
// the open month as an adjustment instead of rewriting settled history.
export async function resolvePeriod(entryDate) {
  const natural = periodOf(entryDate);
  const row = await get("SELECT status FROM fin_periods WHERE period = ?", [natural]);
  if (row?.status !== "closed") return { period: natural, adjusted: false };
  const today = new Date().toISOString().slice(0, 10);
  return { period: periodOf(today), adjusted: true };
}

export async function categoryByName(name) {
  if (!name) return null;
  return get("SELECT id, name, kind FROM fin_categories WHERE lower(name) = lower(?)", [
    String(name).trim(),
  ]);
}

export async function findOrCreateCounterparty(name, kind = "supplier") {
  const clean = String(name || "").trim().slice(0, 160);
  if (!clean) return null;
  const existing = await get(
    "SELECT id FROM fin_counterparties WHERE lower(name) = lower(?)",
    [clean]
  );
  if (existing) return Number(existing.id);
  const rs = await run(
    "INSERT INTO fin_counterparties (name, kind) VALUES (?, ?) RETURNING id",
    [clean, kind]
  );
  return lastId(rs);
}

// Deterministic categorisation, checked before any model call.
export async function matchRule(vendorName) {
  const key = vendorKey(vendorName);
  if (!key) return null;
  return get(
    `SELECT r.id, r.set_category_id, r.set_counterparty_id, c.name AS category_name
       FROM fin_rules r JOIN fin_categories c ON c.id = r.set_category_id
      WHERE r.match_pattern = ?`,
    [key]
  );
}

// Approving a suggestion teaches the system, so the next month is lighter.
export async function learnRule(vendorName, categoryId, counterpartyId) {
  const key = vendorKey(vendorName);
  if (!key || !categoryId) return;
  await run(
    `INSERT INTO fin_rules (match_pattern, set_category_id, set_counterparty_id)
     VALUES (?, ?, ?)
     ON CONFLICT (match_pattern) DO UPDATE SET
       set_category_id = EXCLUDED.set_category_id,
       set_counterparty_id = EXCLUDED.set_counterparty_id`,
    [key, categoryId, counterpartyId ?? null]
  );
}

// ── Write one ledger row, idempotently ───────────────────────
export async function upsertEntry(e) {
  const rs = await run(
    `INSERT INTO fin_entries
       (entry_date, direction, amount_minor, currency, fx_rate, base_amount_minor,
        counterparty_id, category_id, description, reference, document_id,
        dedup_key, confidence, review_status, review_reason, period)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT (dedup_key) DO NOTHING
     RETURNING id`,
    [
      e.entryDate, e.direction, e.amountMinor, e.currency, e.fxRate ?? 1,
      e.baseAmountMinor ?? e.amountMinor, e.counterpartyId ?? null,
      e.categoryId ?? null, e.description ?? null, e.reference ?? null,
      e.documentId ?? null, e.dedupKey, e.confidence ?? null,
      e.reviewStatus ?? "auto", e.reviewReason ?? null, e.period,
    ]
  );
  const id = lastId(rs);
  if (id) return { id, created: true };
  const existing = await get("SELECT id FROM fin_entries WHERE dedup_key = ?", [e.dedupKey]);
  return { id: existing ? Number(existing.id) : null, created: false };
}

// ── Document → ledger row ────────────────────────────────────
// The content hash is the document's identity, so the same receipt is one
// expense whether it arrives by upload, by Drive, or twice by both.
export async function ingestDocument({ filename, mime, buffer, source = "upload" }) {
  const hash = sha256(buffer);
  const dedupKey = `doc:${hash}`;

  const seen = await get(
    "SELECT id FROM fin_documents WHERE source = ? AND content_hash = ?",
    [source, hash]
  );
  if (seen) {
    const entry = await get(
      `SELECT id, entry_date, amount_minor, currency, description, review_status
         FROM fin_entries WHERE dedup_key = ?`,
      [dedupKey]
    );
    return { duplicate: true, documentId: Number(seen.id), entry };
  }

  const b64 = buffer.toString("base64");
  const docRs = await run(
    `INSERT INTO fin_documents (source, filename, mime, byte_size, content_hash, data)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    [source, filename, mime, buffer.length, hash, b64]
  );
  const documentId = lastId(docRs);

  let ex;
  try {
    ex = await extractDocument({ mime, data: b64 });
  } catch (err) {
    await run("UPDATE fin_documents SET parse_error = ? WHERE id = ?", [
      String(err.message).slice(0, 400),
      documentId,
    ]);
    throw err;
  }

  // Rules first, model second. A known vendor never reaches the extractor's
  // suggestion — it is categorised deterministically and for free.
  const rule = await matchRule(ex.vendor_name);
  let categoryId = rule ? Number(rule.set_category_id) : null;
  let categoryName = rule?.category_name ?? null;
  if (!categoryId) {
    const cat = await categoryByName(ex.suggested_category);
    categoryId = cat ? Number(cat.id) : null;
    categoryName = cat?.name ?? null;
  }
  if (rule) await run("UPDATE fin_rules SET hits = hits + 1 WHERE id = ?", [rule.id]);

  const counterpartyId =
    rule?.set_counterparty_id != null
      ? Number(rule.set_counterparty_id)
      : await findOrCreateCounterparty(ex.vendor_name);

  // A reason to look at this row by hand. An adjusted period is noted on the
  // row but is not itself a review item — nothing about it is uncertain.
  const reason =
    reviewReason(ex, !!rule) ?? (categoryId ? null : "no matching category");
  const { period, adjusted } = await resolvePeriod(ex.issue_date);
  const note = adjusted ? `posted to ${period} — ${periodOf(ex.issue_date)} is closed` : null;
  const storedReason = [reason, note].filter(Boolean).join("; ") || null;

  const amountMinor = toMinor(ex.total, ex.currency);
  const result = await upsertEntry({
    entryDate: ex.issue_date,
    // A credit note is money coming back from a supplier.
    direction: ex.document_type === "credit_note" ? "in" : "out",
    amountMinor,
    currency: ex.currency,
    baseAmountMinor: amountMinor,
    counterpartyId,
    categoryId,
    description: ex.summary || ex.vendor_name,
    reference: ex.invoice_number,
    documentId,
    dedupKey,
    confidence: ex.confidence,
    reviewStatus: reason ? "needs_review" : "auto",
    reviewReason: storedReason,
    period,
  });

  await run("UPDATE fin_documents SET parsed_at = now(), payload = ? WHERE id = ?", [
    JSON.stringify(ex),
    documentId,
  ]);

  return {
    duplicate: false,
    documentId,
    entryId: result.id,
    extraction: ex,
    categoryName,
    matchedRule: !!rule,
    needsReview: !!reason,
    reviewReason: storedReason,
    adjustedPeriod: adjusted ? period : null,
  };
}
