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
export async function resolvePeriod(entryDate, entity = "strideup") {
  const natural = periodOf(entryDate);
  const row = await get(
    "SELECT status FROM fin_periods WHERE period = ? AND entity = ?",
    [natural, entity]
  );
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
  const row = await get(
    `SELECT r.id, r.set_category_id, r.set_counterparty_id, r.set_entity,
            c.name AS category_name
       FROM fin_rules r JOIN fin_categories c ON c.id = r.set_category_id
      WHERE r.match_pattern = ?`,
    [key]
  );
  if (!row) return null;
  // A rule always settles the category. It settles the entity only while the
  // party has been seen on one side of the books — set_entity goes NULL the
  // moment a correction contradicts it.
  return { ...row, categorySettled: true, entitySettled: row.set_entity != null };
}

// Approving a suggestion teaches the system, so the next month is lighter.
export async function learnRule(vendorName, categoryId, counterpartyId, entity = null) {
  const key = vendorKey(vendorName);
  if (!key || !categoryId) return;

  const existing = await get(
    "SELECT id, set_entity FROM fin_rules WHERE match_pattern = ?",
    [key]
  );

  // A party used by both sets of books cannot have one answer. When a
  // correction contradicts what was stored, clear it rather than flip-flopping:
  // from then on the reader judges the entity and the row is flagged.
  let nextEntity = entity;
  if (existing && existing.set_entity && entity && existing.set_entity !== entity) {
    nextEntity = null;
  } else if (existing && !entity) {
    nextEntity = existing.set_entity;
  }

  if (existing) {
    await run(
      `UPDATE fin_rules SET set_category_id = ?, set_counterparty_id = ?, set_entity = ?
        WHERE id = ?`,
      [categoryId, counterpartyId ?? null, nextEntity, existing.id]
    );
  } else {
    await run(
      `INSERT INTO fin_rules (match_pattern, set_category_id, set_counterparty_id, set_entity)
       VALUES (?, ?, ?, ?)`,
      [key, categoryId, counterpartyId ?? null, nextEntity]
    );
  }
}

// ── Write one ledger row, idempotently ───────────────────────
export async function upsertEntry(e) {
  const rs = await run(
    `INSERT INTO fin_entries
       (entry_date, direction, amount_minor, currency, fx_rate, base_amount_minor,
        counterparty_id, category_id, description, reference, document_id,
        dedup_key, confidence, review_status, review_reason, period, entity)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT (dedup_key) DO NOTHING
     RETURNING id`,
    [
      e.entryDate, e.direction, e.amountMinor, e.currency, e.fxRate ?? 1,
      e.baseAmountMinor ?? e.amountMinor, e.counterpartyId ?? null,
      e.categoryId ?? null, e.description ?? null, e.reference ?? null,
      e.documentId ?? null, e.dedupKey, e.confidence ?? null,
      e.reviewStatus ?? "auto", e.reviewReason ?? null, e.period,
      e.entity ?? "strideup",
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
export async function ingestDocument({
  filename, mime, buffer, source = "upload", replace = false, kind = "expense",
  entityHint,
}) {
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
    ex = await extractDocument({ mime, data: b64, kind });
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

  // Whose books. A rule settles it for a party seen on one side only. Failing
  // that a confident reading stands. Only when the reader is unsure does the
  // section you were looking at break the tie — and the row is flagged either
  // way, so a guess is never silent.
  const entityConfident = ex.entity_confidence >= config.finance.confidenceFloor;
  const entity =
    rule?.set_entity ??
    (entityConfident ? ex.entity : entityHint ?? ex.entity) ??
    "strideup";

  const counterpartyId =
    rule?.set_counterparty_id != null
      ? Number(rule.set_counterparty_id)
      : await findOrCreateCounterparty(
          ex.vendor_name,
          kind === "revenue" ? "customer" : "supplier"
        );

  // ── A contract is a schedule, not a transaction ────────────
  // Booking a signed agreement's total value as one ledger entry states that
  // the money has already been earned and received. It has not: the document
  // is a promise of payments on the dates it names. So a contract writes
  // commitments — one per installment — and touches the ledger not at all
  // until each payment is actually recorded as arrived.
  if (ex.document_type === "contract" && ex.installments?.length) {
    return await ingestContract({
      ex, documentId, entity, counterpartyId, categoryId, categoryName, kind, filename,
    });
  }

  const amountMinor = toMinor(ex.total, ex.currency);
  const fx = await convertToBase(amountMinor, ex.currency, ex.issue_date);

  // A reason to look at this row by hand. An adjusted period is noted on the
  // row but is not itself a review item — nothing about it is uncertain.
  const reason =
    reviewReason(ex, !!rule) ?? (categoryId ? null : "no matching category");
  const { period, adjusted } = await resolvePeriod(ex.issue_date, entity);
  const note = adjusted ? `posted to ${period} — ${periodOf(ex.issue_date)} is closed` : null;
  const storedReason = [reason, fx.note, note].filter(Boolean).join("; ") || null;

  const result = await upsertEntry({
    entryDate: ex.issue_date,
    // A credit note reverses whichever way the money normally goes: a refund
    // from a supplier comes in, a credit against a customer goes out.
    direction:
      ex.document_type === "credit_note"
        ? (kind === "revenue" ? "out" : "in")
        : (kind === "revenue" ? "in" : "out"),
    amountMinor,
    currency: ex.currency,
    fxRate: fx.fxRate,
    entity,
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
    entity,
  });

  await run(
    "UPDATE fin_documents SET parsed_at = now(), payload = ?, entity = ? WHERE id = ?",
    [JSON.stringify(ex), entity, documentId]
  );

  return {
    duplicate: false,
    documentId,
    entryId: result.id,
    extraction: ex,
    categoryName,
    matchedRule: !!rule,
    currency: ex.currency,
    fxRate: fx.fxRate,
    entity,
    needsReview: !!(reason || fx.note),
    reviewReason: storedReason,
    adjustedPeriod: adjusted ? period : null,
  };
}

// ── Contracts ────────────────────────────────────────────────
// One commitment per installment, all linked to the document they came from.
// Two installments six months apart is the normal shape of a service
// agreement and does not fit a monthly recurrence, so each is stored as a
// single dated commitment rather than a rule.
//
// The dedup key is the document hash plus the installment's date, so
// re-reading the same contract cannot produce a second copy of its schedule.
async function ingestContract({
  ex, documentId, entity, counterpartyId, categoryId, categoryName, kind, filename,
}) {
  const direction = ex.direction ?? (kind === "revenue" ? "in" : "out");
  const doc = await get("SELECT content_hash FROM fin_documents WHERE id = ?", [documentId]);
  const hash = doc?.content_hash ?? String(documentId);

  // The installments must account for the contract's stated total. When they
  // do not, the reading is recorded anyway and flagged — a schedule that is
  // nearly right is far more useful than no schedule, but nobody should have
  // to discover the gap themselves.
  const stated = Number(ex.total) || 0;
  const summed = ex.installments.reduce((t, i) => t + Number(i.amount || 0), 0);
  const mismatch = stated > 0 && Math.abs(summed - stated) > Math.max(1, stated * 0.01);

  const reasons = [];
  if (mismatch) {
    reasons.push(
      `installments add up to ${summed.toFixed(2)} but the contract states ` +
      `${stated.toFixed(2)}`
    );
  }
  if (ex.confidence < config.finance.confidenceFloor) reasons.push("unsure reading");
  if (!categoryId) reasons.push("no matching category");
  const reason = reasons.join("; ") || null;

  const lastInstallment = ex.installments
    .map((x) => x.due_date)
    .sort()
    .at(-1);

  const created = [];
  for (const [i, inst] of ex.installments.entries()) {
    const minor = toMinor(inst.amount, ex.currency);
    const fx = await convertToBase(minor, ex.currency, inst.due_date);
    const label = inst.label?.trim()
      ? `${ex.vendor_name} — ${inst.label.trim()}`
      : `${ex.vendor_name} — installment ${i + 1} of ${ex.installments.length}`;
    // Each installment is a single dated commitment, but its end_date is the
    // agreement's end, not its own due date. Storing the due date there made
    // every installment look like an agreement expiring that day, so a
    // contract running to March 2027 reported as "ending in 25 days" the
    // moment its first payment came round. Never earlier than the installment
    // itself, or the occurrence would fall outside its own window.
    const agreementEnd =
      ex.contract_end && ex.contract_end >= inst.due_date
        ? ex.contract_end
        : lastInstallment;
    const rs = await run(
      `INSERT INTO fin_commitments
         (entity, direction, description, counterparty_id, category_id,
          amount_minor, currency, fx_rate, base_amount_minor,
          frequency, start_date, end_date, source, document_id,
          confidence, review_status, review_reason, dedup_key)
       VALUES (?,?,?,?,?,?,?,?,?, 'once', ?, ?, 'contract', ?, ?, ?, ?, ?)
       ON CONFLICT (dedup_key) DO NOTHING
       RETURNING id`,
      [
        entity, direction, label.slice(0, 200), counterpartyId, categoryId,
        minor, ex.currency, fx.fxRate, fx.baseAmountMinor,
        inst.due_date, agreementEnd, documentId,
        ex.confidence, reason ? "needs_review" : "ok", reason,
        `doc:${hash}:${inst.due_date}:${i}`,
      ]
    );
    const id = lastId(rs);
    if (id != null) {
      created.push({ id: Number(id), dueDate: inst.due_date, amount: inst.amount, label });
    }
  }

  await run(
    "UPDATE fin_documents SET parse_error = NULL WHERE id = ?", [documentId]
  );

  // The schedule already existing is the normal outcome of re-reading a
  // contract, and nothing needs doing. But a commitment can end up pointing at
  // no document — an earlier version of the delete route took the file with an
  // unrelated ledger row — and re-uploading is exactly how someone would try
  // to fix that. So the link is repaired rather than left dangling.
  await run(
    `UPDATE fin_commitments SET document_id = ?
      WHERE source = 'contract' AND document_id IS NULL
        AND dedup_key LIKE ?`,
    [documentId, `doc:${hash}:%`]
  );

  return {
    contract: true,
    documentId,
    filename,
    entity,
    direction,
    vendor: ex.vendor_name,
    currency: ex.currency,
    total: ex.total,
    categoryName,
    contractStart: ex.contract_start,
    contractEnd: ex.contract_end,
    commitments: created,
    duplicate: created.length === 0,
    reviewReason: reason,
    confidence: ex.confidence,
  };
}
