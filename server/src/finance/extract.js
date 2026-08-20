import { z } from "zod";
import { all } from "../db.js";
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

const extraction = z.object({
  vendor_name: z.string().trim().min(1).max(160),
  document_type: z
    .enum(["invoice", "receipt", "credit_note", "statement", "other"])
    .catch("receipt"),
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
  summary: z.string().trim().max(200).catch(""),
  confidence: z.number().min(0).max(1).catch(0),
});

// The same document shape means opposite things depending on which way the
// money went: a bill you received is an expense, an invoice you issued is
// revenue. Telling the reader which it is up front stops it guessing.
function buildPrompt(categoryNames, kind) {
  const framing =
    kind === "revenue"
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
  "document_type": "invoice | receipt | credit_note | statement | other",
  "issue_date": "YYYY-MM-DD — the document date, not today's date",
  "currency": "ISO-4217 code, e.g. USD, GBP, EUR, INR",
  "subtotal": number or null,
  "tax_amount": number or null,
  "total": number — the amount actually payable, as a positive number,
  "invoice_number": "string or null",
  "suggested_category": "EXACTLY one name from the category list below",
  "summary": "at most 12 words describing what was bought",
  "confidence": number between 0 and 1
}

Category list (choose the single best fit, copied verbatim):
${categoryNames.map((n) => `- ${n}`).join("\n")}

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
  const kinds =
    kind === "revenue" ? "('revenue')" : "('cogs','opex','capex','tax')";
  const cats = await all(
    `SELECT name FROM fin_categories WHERE kind IN ${kinds} ORDER BY sort`
  );
  const names = cats.map((c) => c.name);

  const raw = await askClaudeDocumentJSON(
    { kind: mediaKind, mime, data },
    buildPrompt(names, kind),
    1500
  );

  const parsed = extraction.safeParse(raw);
  if (!parsed.success) {
    const err = new Error("Could not read that document reliably.");
    err.code = "BAD_EXTRACTION";
    err.detail = parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message);
    throw err;
  }
  return parsed.data;
}

// ── Why a document might need a human look ───────────────────
// A low-confidence document is still written to the ledger; it is only
// flagged. Totals stay complete, and the flag is about attribution.
export function reviewReason(ex, matchedByRule, confidenceFloor = 0.85) {
  if (matchedByRule) return null;
  const reasons = [];
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
