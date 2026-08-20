import crypto from "node:crypto";
import { all, get, run, lastId } from "../db.js";
import { config } from "../config.js";
import { extractDocument, reviewReason, toMinor, fromMinor } from "./extract.js";
import { getRate } from "./fx.js";

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

// ── Everything on the dashboard is in one currency ───────────
// An amount is stored twice: as written on the document, and converted to the
// base currency. Only the converted figure is ever summed, so a foreign
// invoice cannot quietly inflate a total by its face value.
export async function convertToBase(amountMinor, currency, date) {
  const base = config.finance.baseCurrency;
  if (!currency || currency === base) {
    return { fxRate: 1, baseAmountMinor: amountMinor, note: null };
  }
  const rate = await getRate(currency, base, date);
  if (!rate) {
    // Recorded rather than dropped, but flagged — an unconverted amount you
    // can see beats a document that vanished.
    return {
      fxRate: 1,
      baseAmountMinor: amountMinor,
      note: `could not convert ${currency} to ${base} — counted at face value, please check`,
    };
  }
  return {
    fxRate: rate,
    baseAmountMinor: toMinor(fromMinor(amountMinor, currency) * rate, base),
    note: null,
  };
}

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
export async function ingestDocument({ filename, mime, buffer, source = "upload", replace = false }) {
  const hash = sha256(buffer);
  const dedupKey = `doc:${hash}`;

  const entry = await get(
    `SELECT id, entry_date, amount_minor, currency, description, review_status
       FROM fin_entries WHERE dedup_key = ?`,
    [dedupKey]
  );
  const seen = await get(
    "SELECT id FROM fin_documents WHERE source = ? AND content_hash = ?",
    [source, hash]
  );

  // Only a document that actually produced a ledger row counts as a
  // duplicate. One that failed to parse — no API key, no credit, an outage —
  // is retried, because re-uploading it is exactly how someone asks for
  // another attempt. Reporting "already recorded" there would strand the
  // document forever.
  if (seen && entry && !replace) {
    return { duplicate: true, documentId: Number(seen.id), entry };
  }
  // Replacing means the reader deliberately asked for another attempt at a
  // document already on the books — drop the old row so the new reading
  // stands on its own rather than colliding with it.
  if (seen && entry && replace) {
    await run("DELETE FROM fin_entries WHERE id = ?", [entry.id]);
  }

  const b64 = buffer.toString("base64");
  let documentId;
  if (seen) {
    documentId = Number(seen.id);
    await run(
      `UPDATE fin_documents
          SET filename = ?, mime = ?, byte_size = ?, data = ?,
              parse_error = NULL, received_at = now()
        WHERE id = ?`,
      [filename, mime, buffer.length, b64, documentId]
    );
  } else {
    const docRs = await run(
      `INSERT INTO fin_documents (source, filename, mime, byte_size, content_hash, data)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      [source, filename, mime, buffer.length, hash, b64]
    );
    documentId = lastId(docRs);
  }

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

  const amountMinor = toMinor(ex.total, ex.currency);
  const fx = await convertToBase(amountMinor, ex.currency, ex.issue_date);

  // A reason to look at this row by hand. An adjusted period is noted on the
  // row but is not itself a review item — nothing about it is uncertain.
  const reason =
    reviewReason(ex, !!rule) ?? (categoryId ? null : "no matching category");
  const { period, adjusted } = await resolvePeriod(ex.issue_date);
  const note = adjusted ? `posted to ${period} — ${periodOf(ex.issue_date)} is closed` : null;
  const storedReason = [reason, fx.note, note].filter(Boolean).join("; ") || null;

  const result = await upsertEntry({
    entryDate: ex.issue_date,
    // A credit note is money coming back from a supplier.
    direction: ex.document_type === "credit_note" ? "in" : "out",
    amountMinor,
    currency: ex.currency,
    fxRate: fx.fxRate,
    baseAmountMinor: fx.baseAmountMinor,
    counterpartyId,
    categoryId,
    description: ex.summary || ex.vendor_name,
    reference: ex.invoice_number,
    documentId,
    dedupKey,
    confidence: ex.confidence,
    reviewStatus: reason || fx.note ? "needs_review" : "auto",
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
    currency: ex.currency,
    fxRate: fx.fxRate,
    needsReview: !!(reason || fx.note),
    reviewReason: storedReason,
    adjustedPeriod: adjusted ? period : null,
  };
}
