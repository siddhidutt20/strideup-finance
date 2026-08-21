import { z } from "zod";
import { all } from "../db.js";
import { config } from "../config.js";
import { askClaudeDocumentJSON, aiEnabled } from "../anthropic.js";

// ── Reading an invoice or receipt ────────────────────────────
// One model call per document, answering into a fixed JSON shape. The live
// chart of accounts is passed in the prompt so the model picks from real
// categories instead of inventing labels, and everything it returns is
// validated before it can reach the ledger.

export const ACCEPTED_MIME = {
  "application/pdf": "document",
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
};

// Reject a file whose bytes don't match its claimed type before spending a
// model call on it — a clear error now beats an opaque API rejection later.
export function sniffMime(buffer) {
  const b = buffer;
  if (b.length < 12) return null;
  const ascii = (start, len) => b.subarray(start, start + len).toString("latin1");
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (b[0] === 0x89 && ascii(1, 3) === "PNG") return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  return null;
}

// Currencies without minor units — "1000 JPY" is 1000, not 100000.
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "XAF", "XOF"]);

export function toMinor(amount, currency) {
  const factor = ZERO_DECIMAL.has(currency) ? 1 : 100;
  return Math.round(Number(amount) * factor);
}
export function fromMinor(minor, currency) {
  const factor = ZERO_DECIMAL.has(currency) ? 1 : 100;
  return Number(minor) / factor;
}

// An installment is one dated payment a contract promises. Contracts rarely
// pay on a tidy monthly cycle — "half on signature, half on completion" is
// two dates six months apart — so the schedule is a list of dates rather than
// a recurrence rule wherever the document actually names the dates.
const installment = z.object({
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().finite().positive(),
  label: z.string().trim().max(120).catch(""),
});

const extraction = z.object({
  vendor_name: z.string().trim().min(1).max(160),
  document_type: z
    .enum(["invoice", "receipt", "credit_note", "statement", "contract", "other"])
    .catch("receipt"),
  // ── Contract terms, present only when document_type is "contract" ──
  installments: z.array(installment).max(60).catch([]),
  contract_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  contract_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  // Which way the money moves under this agreement, from the point of view of
  // the business keeping these books.
  direction: z.enum(["in", "out"]).nullable().catch(null),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((c) => c.toUpperCase()),
  subtotal: z.number().finite().nullable().catch(null),
  tax_amount: z.number().finite().nullable().catch(null),
  total: z.number().finite(),
  invoice_number: z.string().trim().max(80).nullable().catch(null),
  suggested_category: z.string().trim().min(1).max(80),
  entity: z.enum(["strideup", "personal"]).catch("strideup"),
  entity_confidence: z.number().min(0).max(1).catch(0),
  summary: z.string().trim().max(200).catch(""),
  confidence: z.number().min(0).max(1).catch(0),
});

// The same document shape means opposite things depending on which way the
// money went: a bill you received is an expense, an invoice you issued is
// revenue. Telling the reader which it is up front stops it guessing.
function buildPrompt(grouped, kind) {
  const hints = config.finance.entityHints;
  const list = (rows) => rows.map((r) => `- ${r.name}`).join("\n");
  const framing =
    kind === "contract"
      ? `You are reading a CONTRACT or AGREEMENT. It may run in either
direction: the company may be the one being paid under it, or the one paying.
Work out which from the terms and say so in "direction". Do not assume.`
    : kind === "revenue"
      ? `You are reading a SALES document a company ISSUED to a customer — an
invoice it sent out, or a receipt for money it received. The company is the
one being PAID here.`
      : `You are reading a business EXPENSE document a company RECEIVED — a
bill, an invoice from a supplier, or a receipt for something it bought. The
company is the one PAYING here.`;

  return `${framing}

Extract the following and reply with ONLY a JSON object, no prose and no code fences:

{
  "vendor_name": "${kind === "revenue" ? "the CUSTOMER being billed" : "the supplier/merchant name as printed"}",
  "document_type": "invoice | receipt | credit_note | statement | contract | other",
  "issue_date": "YYYY-MM-DD — the document date, not today's date",
  "installments": [],
  "contract_start": null,
  "contract_end": null,
  "direction": null,
  "currency": "ISO-4217 code, e.g. USD, GBP, EUR, INR",
  "subtotal": number or null,
  "tax_amount": number or null,
  "total": number — the amount actually payable, as a positive number,
  "invoice_number": "string or null",
  "suggested_category": "EXACTLY one name from the category list below",
  "entity": "strideup | personal — whose books this belongs to",
  "entity_confidence": number between 0 and 1,
  "summary": "at most 12 words describing what was bought",
  "confidence": number between 0 and 1
}

Is this a CONTRACT rather than a bill?

A contract, agreement, order form, retainer or subscription plan describes
payments that will happen in the FUTURE. A bill, invoice or receipt records
one payment that has already been agreed for work already identified. The
difference matters more than anything else on this page: a signed agreement
worth 100,000 is not 100,000 of income on the day it is signed, it is a
promise of payments on the dates it names.

If the document sets out future payments, set "document_type" to "contract"
and fill in:

- "installments": one entry per payment the document names, as
  [{"due_date":"YYYY-MM-DD","amount":number,"label":"short description"}].
  Read the payment clause carefully and work the dates out:
    · "50% on execution, 50% on completion, invoiced on or after 15 March
      2027" with an effective date of 15 September 2026 and a total of 100,000
      is TWO installments: 50,000 on 2026-09-15 and 50,000 on 2027-03-15.
    · "12 monthly payments of 2,000 from 1 April" is twelve entries, one a
      month, each 2,000.
  The installment amounts must add up to the total. If the document states a
  total but you cannot work out the dates, return an empty list and give a low
  confidence — do not invent dates.
- "contract_start" / "contract_end": the service period, or null if open-ended.
- "direction": "in" if this business RECEIVES the money under the agreement,
  "out" if it PAYS.
- "total": the full contract value.

For anything that is not a contract, leave installments empty and direction null.

Whose books does this belong to?
- "strideup" — ${hints.strideup}
- "personal" — ${hints.personal}

Judge from the document itself: who is named as the customer or the account
holder, what was actually bought, and whether it reads as a business cost or a
household one. If it genuinely could be either, say so with a low
entity_confidence rather than picking one confidently.

Category list — pick the single best fit and copy it verbatim. The category
you pick and the entity you pick must agree with each other.

StrideUp categories:
${list(grouped.strideup)}

Personal categories:
${list(grouped.personal)}

Either (use only when it genuinely could be either):
${list(grouped.both)}

Rules:
- Amounts are plain numbers: no currency symbols, no thousands separators.
- "total" is ${kind === "revenue" ? "what the customer owes or paid" : "what the business paid or owes"}.
  If the document shows a total including tax, use that.
- If the document is a credit note or refund, still report a positive total —
  the direction is handled elsewhere.
- Set confidence below 0.6 if the image is unclear, the total is ambiguous,
  or you had to guess the vendor or the date.
- Never invent a category that is not in the list above.`;
}

export async function extractDocument({ mime, data, kind = "expense" }) {
  if (!aiEnabled()) {
    const err = new Error(
      "Document reading needs an Anthropic API key. Set ANTHROPIC_API_KEY to enable it."
    );
    err.code = "AI_DISABLED";
    throw err;
  }
  const mediaKind = ACCEPTED_MIME[mime];
  if (!mediaKind) {
    const err = new Error(`Unsupported file type: ${mime}`);
    err.code = "BAD_MIME";
    throw err;
  }

  // Offer only the categories that make sense for the direction of the money,
  // so a sales invoice cannot come back filed under Office supplies.
  // A contract may run either way, so it is offered the whole chart of
  // accounts rather than half of it.
  const kinds =
    kind === "contract" ? "('revenue','cogs','opex','capex','tax','capital')"
    : kind === "revenue" ? "('revenue')"
    : "('cogs','opex','capex','tax')";
  const cats = await all(
    `SELECT name, entity FROM fin_categories WHERE kind IN ${kinds} ORDER BY sort`
  );
  const grouped = {
    strideup: cats.filter((c) => c.entity === "strideup"),
    personal: cats.filter((c) => c.entity === "personal"),
    both: cats.filter((c) => c.entity === "both"),
  };

  const raw = await askClaudeDocumentJSON(
    { kind: mediaKind, mime, data },
    buildPrompt(grouped, kind),
    1500
  );

  const parsed = extraction.safeParse(raw);
  if (!parsed.success) {
    const err = new Error("Could not read that document reliably.");
    err.code = "BAD_EXTRACTION";
    err.detail = parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message);
    throw err;
  }

  // The category and the entity are two answers to the same question. When a
  // category that belongs to one set of books is paired with the other, one of
  // them is wrong and a human should say which.
  const chosen = cats.find(
    (c) => c.name.toLowerCase() === parsed.data.suggested_category.toLowerCase()
  );
  const entityMismatch =
    !!chosen && chosen.entity !== "both" && chosen.entity !== parsed.data.entity;

  return { ...parsed.data, entity_mismatch: entityMismatch, category_entity: chosen?.entity };
}

// ── Why a document might need a human look ───────────────────
// A low-confidence document is still written to the ledger; it is only
// flagged. Totals stay complete, and the flag is about attribution.
export function reviewReason(ex, matchedByRule, confidenceFloor = 0.85) {
  const reasons = [];
  // The entity is judged even for a known vendor, unless a rule settled it —
  // getting the wrong set of books is as wrong as the wrong category.
  if (!matchedByRule?.entitySettled && ex.entity_confidence < confidenceFloor) {
    reasons.push(
      `unsure whether this is StrideUp or personal (${(ex.entity_confidence * 100).toFixed(0)}%)`
    );
  }
  if (ex.entity_mismatch) {
    reasons.push(
      `"${ex.suggested_category}" is a ${ex.category_entity === "personal" ? "personal" : "StrideUp"} ` +
      `category but this was filed as ${ex.entity === "personal" ? "personal" : "StrideUp"}`
    );
  }
  if (matchedByRule?.categorySettled) {
    return reasons.length ? reasons.join("; ") : null;
  }
  if (ex.confidence < confidenceFloor) {
    reasons.push(`extraction confidence ${(ex.confidence * 100).toFixed(0)}%`);
  }
  // Arithmetic check: a hallucinated total usually fails this even when the
  // model claims high confidence.
  if (ex.subtotal != null && ex.tax_amount != null) {
    const sum = ex.subtotal + ex.tax_amount;
    if (Math.abs(sum - ex.total) > 0.02) {
      reasons.push(
        `subtotal + tax (${sum.toFixed(2)}) does not equal total (${ex.total.toFixed(2)})`
      );
    }
  }
  return reasons.length ? reasons.join("; ") : null;
}
