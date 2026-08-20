import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { all, get, run, lastId } from "../db.js";
import { requireOwner } from "../auth.js";
import { aiLimiter } from "../security.js";
import { config } from "../config.js";
import { ah, isoDate } from "../util.js";
import { ACCEPTED_MIME, sniffMime, toMinor } from "../finance/extract.js";
import { ingestDocument, learnRule, resolvePeriod, findOrCreateCounterparty } from "../finance/ingest.js";
import { importGhlCsv } from "../finance/ghl.js";
import {
  monthStart, periodSummary, categoryBreakdown, trend, cashPosition,
  burnAndRunway, receivables, capitalPosition, reviewCount,
} from "../finance/metrics.js";

export const financeRouter = express.Router();

// The company's complete financial position. Every route requires the signed-in
// owner; there is no other kind of account.
financeRouter.use(requireOwner);

const MAX_BYTES = 8 * 1024 * 1024;
const periodParam = z.string().regex(/^\d{4}-\d{2}-01$/);

// ── The dashboard, in one call ───────────────────────────────
financeRouter.get(
  "/overview",
  ah(async (req, res) => {
    const period = periodParam.safeParse(req.query.period).success
      ? req.query.period
      : monthStart();

    const [summary, previous, breakdown, series, cash, ar, capital, needsReview] =
      await Promise.all([
        periodSummary(period),
        periodSummary(
          `${new Date(Date.UTC(+period.slice(0, 4), +period.slice(5, 7) - 2, 1))
            .toISOString()
            .slice(0, 7)}-01`
        ),
        categoryBreakdown(period),
        trend(13, monthStart()),
        cashPosition(),
        receivables(),
        capitalPosition(),
        reviewCount(),
      ]);

    const { monthlyBurn, runwayMonths } = await burnAndRunway(cash.amount);
    const closed = await get("SELECT status FROM fin_periods WHERE period = ?", [period]);

    res.json({
      baseCurrency: config.finance.baseCurrency,
      period,
      periodClosed: closed?.status === "closed",
      summary,
      previous,
      breakdown,
      trend: series,
      cash,
      burn: { monthlyBurn, runwayMonths },
      receivables: ar,
      capital,
      needsReview,
      aiEnabled: config.anthropic.enabled,
    });
  })
);

financeRouter.get(
  "/categories",
  ah(async (req, res) => {
    res.json({
      categories: await all(
        "SELECT id, name, kind, pnl_line FROM fin_categories ORDER BY sort, name"
      ),
    });
  })
);

// ── Upload an invoice or receipt ─────────────────────────────
const uploadSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  mime: z.string().trim().min(1).max(100),
  data: z.string().min(1).max((MAX_BYTES * 4) / 3 + 4096),
  // Set when the reader has been told this document is already recorded and
  // has chosen to replace it.
  replace: z.boolean().optional(),
});

financeRouter.post(
  "/documents",
  aiLimiter,
  ah(async (req, res) => {
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Choose a PDF or photo to upload." });
    }
    const { filename, mime } = parsed.data;
    if (!ACCEPTED_MIME[mime]) {
      return res.status(400).json({
        error: `${mime} isn't supported. Upload a PDF, JPEG, PNG, or WebP.`,
      });
    }
    const raw = parsed.data.data;
    const b64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
    const buffer = Buffer.from(b64, "base64");
    if (!buffer.length) return res.status(400).json({ error: "That file is empty." });
    if (buffer.length > MAX_BYTES) {
      return res.status(400).json({ error: "Files must be 8 MB or smaller." });
    }
    // Trust the bytes, not the label.
    const actual = sniffMime(buffer);
    if (!actual) {
      return res.status(400).json({
        error: "That file isn't a readable PDF or image.",
      });
    }
    if (actual !== mime) {
      return res.status(400).json({
        error: `That file looks like ${actual}, not ${mime}. Try uploading it again.`,
      });
    }

    try {
      const result = await ingestDocument({
        filename, mime, buffer, source: "upload",
        replace: parsed.data.replace === true,
      });
      if (result.duplicate) {
        return res.status(200).json({
          duplicate: true,
          message: "You have already uploaded this file.",
          entry: result.entry,
        });
      }
      return res.status(201).json(result);
    } catch (err) {
      if (err.code === "AI_DISABLED") return res.status(503).json({ error: err.message });
      // Name the actual problem — a wrong key, an empty balance and a rate
      // limit all used to surface as the same generic failure.
      if (err.code === "ANTHROPIC_ERROR") {
        const detail = err.detail || "";
        let hint;
        if (err.status === 401 || err.status === 403) {
          hint =
            "That Anthropic API key was rejected. Check it was pasted in full " +
            "(it starts with sk-ant-) and redeploy.";
        } else if (/credit balance|insufficient|too low|quota/i.test(detail)) {
          hint =
            "Your Anthropic account has no credit left. Top up at " +
            "console.anthropic.com/settings/billing, then try again.";
        } else if (err.status === 429) {
          hint = "Anthropic is rate limiting right now — wait a moment and try again.";
        } else if (err.status >= 500) {
          hint = "Anthropic is having trouble at their end. Try again shortly.";
        } else {
          hint = `Claude could not read this document (API returned ${err.status}).`;
        }
        return res.status(502).json({ error: hint, detail });
      }
      if (err.code === "BAD_EXTRACTION" || err.code === "BAD_MIME") {
        return res.status(422).json({ error: err.message, detail: err.detail });
      }
      throw err;
    }
  })
);

// Serve the original document, so a flagged row can be checked against it.
financeRouter.get(
  "/documents/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad id" });
    const doc = await get(
      "SELECT filename, mime, data FROM fin_documents WHERE id = ?",
      [id]
    );
    if (!doc?.data) return res.status(404).json({ error: "Not found" });
    res.setHeader("Content-Type", doc.mime);
    res.setHeader("Content-Disposition", `inline; filename="${doc.filename || "document"}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(Buffer.from(doc.data, "base64"));
  })
);

// ── The ledger ───────────────────────────────────────────────
financeRouter.get(
  "/entries",
  ah(async (req, res) => {
    const where = ["1=1"];
    const args = [];
    if (periodParam.safeParse(req.query.period).success) {
      where.push("e.period = ?");
      args.push(req.query.period);
    }
    if (req.query.status === "needs_review") where.push("e.review_status = 'needs_review'");
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));

    const rows = await all(
        `SELECT e.id, e.entry_date, e.direction, e.amount_minor, e.currency,
                e.base_amount_minor, e.description, e.reference, e.confidence,
                e.review_status, e.review_reason, e.document_id, e.period,
                c.id AS category_id, c.name AS category_name, c.kind AS category_kind,
                p.name AS counterparty
           FROM fin_entries e
           LEFT JOIN fin_categories c ON c.id = e.category_id
           LEFT JOIN fin_counterparties p ON p.id = e.counterparty_id
          WHERE ${where.join(" AND ")}
          ORDER BY e.entry_date DESC, e.id DESC
          LIMIT ${limit}`,
      args
    );
    res.json({
      entries: rows.map((r) => ({
        ...r,
        entry_date: isoDate(r.entry_date),
        period: isoDate(r.period),
      })),
    });
  })
);

// Correct or confirm a row. Approving teaches a rule, so the same vendor is
// categorised automatically from then on.
const patchSchema = z.object({
  categoryId: z.number().int().positive().optional(),
  description: z.string().trim().max(300).optional(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount: z.number().finite().positive().optional(),
  direction: z.enum(["in", "out"]).optional(),
  reviewStatus: z.enum(["approved", "rejected", "needs_review"]).optional(),
});

financeRouter.patch(
  "/entries/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad id" });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Nothing valid to update." });

    const entry = await get(
      `SELECT e.*, p.name AS counterparty FROM fin_entries e
         LEFT JOIN fin_counterparties p ON p.id = e.counterparty_id
        WHERE e.id = ?`,
      [id]
    );
    if (!entry) return res.status(404).json({ error: "Entry not found." });

    const sets = [];
    const args = [];
    const b = parsed.data;
    if (b.categoryId !== undefined) { sets.push("category_id = ?"); args.push(b.categoryId); }
    if (b.description !== undefined) { sets.push("description = ?"); args.push(b.description); }
    if (b.direction !== undefined) { sets.push("direction = ?"); args.push(b.direction); }
    if (b.entryDate !== undefined) {
      const { period } = await resolvePeriod(b.entryDate);
      sets.push("entry_date = ?", "period = ?");
      args.push(b.entryDate, period);
    }
    if (b.amount !== undefined) {
      const minor = toMinor(b.amount, entry.currency);
      sets.push("amount_minor = ?", "base_amount_minor = ?");
      args.push(minor, minor);
    }
    if (b.reviewStatus !== undefined) {
      sets.push("review_status = ?");
      args.push(b.reviewStatus);
      if (b.reviewStatus !== "needs_review") { sets.push("review_reason = NULL"); }
    } else if (b.categoryId !== undefined && entry.review_status === "needs_review") {
      // Correcting the category is itself the approval.
      sets.push("review_status = 'approved'", "review_reason = NULL");
    }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update." });

    sets.push("updated_at = now()");
    await run(`UPDATE fin_entries SET ${sets.join(", ")} WHERE id = ?`, [...args, id]);

    // Learn from the correction so this vendor never needs review again.
    const finalCategory = b.categoryId ?? entry.category_id;
    if (finalCategory && entry.counterparty && b.reviewStatus !== "rejected") {
      await learnRule(entry.counterparty, Number(finalCategory), entry.counterparty_id);
    }

    res.json({ ok: true });
  })
);

// ── Remove something recorded by mistake ─────────────────────
// The source document goes with it: a ledger row and the file it came from
// are one fact, and leaving the file behind would make re-uploading it look
// like a duplicate of something no longer there.
financeRouter.delete(
  "/entries/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad id" });
    const entry = await get(
      "SELECT id, document_id, period FROM fin_entries WHERE id = ?",
      [id]
    );
    if (!entry) return res.status(404).json({ error: "That entry no longer exists." });

    const closed = await get("SELECT status FROM fin_periods WHERE period = ?", [entry.period]);
    if (closed?.status === "closed") {
      return res.status(409).json({
        error: "That month is closed. Reopen it first if you really want to remove this.",
      });
    }

    await run("DELETE FROM fin_entries WHERE id = ?", [id]);
    if (entry.document_id) {
      await run("DELETE FROM fin_documents WHERE id = ?", [entry.document_id]);
    }
    res.json({ ok: true });
  })
);

// ── Manual entry, for anything with no document ──────────────
const manualSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  direction: z.enum(["in", "out"]),
  amount: z.number().finite().positive(),
  currency: z.string().trim().length(3).optional(),
  categoryId: z.number().int().positive(),
  description: z.string().trim().min(1).max(300),
  counterparty: z.string().trim().max(160).optional(),
});

financeRouter.post(
  "/entries",
  ah(async (req, res) => {
    const parsed = manualSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Fill in the date, amount, category and description." });
    }
    const b = parsed.data;
    const currency = (b.currency || config.finance.baseCurrency).toUpperCase();
    const minor = toMinor(b.amount, currency);
    const { period } = await resolvePeriod(b.entryDate);

    const rs = await run(
      `INSERT INTO fin_entries
         (entry_date, direction, amount_minor, currency, base_amount_minor,
          counterparty_id, category_id, description, dedup_key, confidence,
          review_status, period)
       VALUES (?,?,?,?,?,?,?,?,?,1,'approved',?) RETURNING id`,
      [
        b.entryDate, b.direction, minor, currency, minor,
        b.counterparty ? await findOrCreateCounterparty(b.counterparty) : null,
        b.categoryId, b.description,
        `manual:${crypto.randomUUID()}`, period,
      ]
    );
    res.status(201).json({ id: lastId(rs) });
  })
);

// ── GHL CSV import ───────────────────────────────────────────
financeRouter.post(
  "/import/ghl",
  ah(async (req, res) => {
    const parsed = z
      .object({ csv: z.string().min(1).max(6 * 1024 * 1024) })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Paste or choose a CSV file." });
    try {
      const result = await importGhlCsv(parsed.data.csv, {
        defaultCurrency: config.finance.baseCurrency,
      });
      res.json(result);
    } catch (err) {
      if (err.code === "EMPTY_CSV" || err.code === "BAD_HEADERS") {
        return res.status(422).json({ error: err.message });
      }
      throw err;
    }
  })
);

// ── Close a month ────────────────────────────────────────────
// Not a lock against other people — there aren't any. It stops a figure you
// have already acted on from changing when a late receipt turns up.
financeRouter.post(
  "/periods/close",
  ah(async (req, res) => {
    const parsed = z
      .object({ period: periodParam, reopen: z.boolean().optional() })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Bad period." });
    const { period, reopen } = parsed.data;
    await run(
      `INSERT INTO fin_periods (period, status, closed_at)
       VALUES (?, ?, ?)
       ON CONFLICT (period) DO UPDATE SET status = EXCLUDED.status, closed_at = EXCLUDED.closed_at`,
      [period, reopen ? "open" : "closed", reopen ? null : new Date().toISOString()]
    );
    res.json({ ok: true, period, status: reopen ? "open" : "closed" });
  })
);

// ── Export for the accountant ────────────────────────────────
// The one sanctioned spreadsheet: generated, complete, never hand-edited.
financeRouter.get(
  "/export.csv",
  ah(async (req, res) => {
    const rows = await all(
      `SELECT e.entry_date, e.direction, e.amount_minor, e.currency,
              COALESCE(c.name,'Uncategorised') AS category, COALESCE(c.kind,'') AS kind,
              COALESCE(p.name,'') AS counterparty, COALESCE(e.description,'') AS description,
              COALESCE(e.reference,'') AS reference, e.review_status, e.document_id
         FROM fin_entries e
         LEFT JOIN fin_categories c ON c.id = e.category_id
         LEFT JOIN fin_counterparties p ON p.id = e.counterparty_id
        WHERE e.review_status <> 'rejected'
        ORDER BY e.entry_date, e.id`
    );
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = [
      "date", "direction", "amount", "currency", "category", "kind",
      "counterparty", "description", "reference", "status", "document_id",
    ];
    const body = rows.map((r) =>
      [
        isoDate(r.entry_date), r.direction, (Number(r.amount_minor) / 100).toFixed(2),
        r.currency, r.category, r.kind, r.counterparty, r.description,
        r.reference, r.review_status, r.document_id ?? "",
      ].map(esc).join(",")
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="strideup-ledger.csv"');
    res.send([header.map(esc).join(","), ...body].join("\n"));
  })
);
