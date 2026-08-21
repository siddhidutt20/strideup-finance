import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { all, get, run, lastId } from "../db.js";
import { requireOwner } from "../auth.js";
import { aiLimiter } from "../security.js";
import { config } from "../config.js";
import { ah, isoDate } from "../util.js";
import { ACCEPTED_MIME, sniffMime, toMinor } from "../finance/extract.js";
import { ENTITIES, ENTITY_LABEL, FREQUENCIES } from "../finance/schema.js";
import { ingestDocument, learnRule, resolvePeriod, findOrCreateCounterparty, convertToBase } from "../finance/ingest.js";
import { importGhlCsv } from "../finance/ghl.js";
import {
  monthStart, periodSummary, categoryBreakdown, trend, cashPosition,
  burnAndRunway, receivables, capitalPosition, reviewCount,
  profitAndLoss, cashflow, byCounterparty, forecast, activeCommitments, dueSoon,
  contractSchedule, occurrencesIn,
} from "../finance/metrics.js";

export const financeRouter = express.Router();

// The company's complete financial position. Every route requires the signed-in
// owner; there is no other kind of account.
financeRouter.use(requireOwner);

const MAX_BYTES = 8 * 1024 * 1024;
const periodParam = z.string().regex(/^\d{4}-\d{2}-01$/);
const entityParam = z.enum(["strideup", "personal", "both"]);
const entityOnly = z.enum(["strideup", "personal"]);

// "both" is answered by running the same query once per set of books and
// returning them separately. Nothing here ever adds two entities together.
const resolveEntities = (raw) => {
  const parsed = entityParam.safeParse(raw);
  const choice = parsed.success ? parsed.data : "strideup";
  return { choice, list: choice === "both" ? ENTITIES : [choice] };
};

// ── The dashboard, in one call ───────────────────────────────
financeRouter.get(
  "/overview",
  ah(async (req, res) => {
    const period = periodParam.safeParse(req.query.period).success
      ? req.query.period
      : monthStart();

    const { choice, list } = resolveEntities(req.query.entity);
    const prevPeriod = `${new Date(
      Date.UTC(+period.slice(0, 4), +period.slice(5, 7) - 2, 1)
    ).toISOString().slice(0, 7)}-01`;

    const byEntity = {};
    for (const ent of list) {
      const [summary, previous, breakdown, series, cash, ar, capital, needsReview] =
        await Promise.all([
          periodSummary(period, ent),
          periodSummary(prevPeriod, ent),
          categoryBreakdown(period, ent),
          trend(13, monthStart(), ent),
          cashPosition(ent),
          receivables(new Date(), ent),
          capitalPosition(ent),
          reviewCount(ent),
        ]);
      const { monthlyBurn, runwayMonths } = await burnAndRunway(cash.amount, ent);
      const closed = await get(
        "SELECT status FROM fin_periods WHERE period = ? AND entity = ?",
        [period, ent]
      );
      byEntity[ent] = {
        entity: ent,
        label: ENTITY_LABEL[ent],
        periodClosed: closed?.status === "closed",
        summary, previous, breakdown,
        trend: series, cash,
        burn: { monthlyBurn, runwayMonths },
        receivables: ar, capital, needsReview,
      };
    }

    res.json({
      baseCurrency: config.finance.baseCurrency,
      period,
      entity: choice,
      entities: list,
      byEntity,
      aiEnabled: config.anthropic.enabled,
    });
  })
);

// ── The statement views ──────────────────────────────────────
// Fetched on demand rather than folded into /overview, so opening the
// dashboard does not pay for four statements nobody asked to see.
financeRouter.get(
  "/statements",
  ah(async (req, res) => {
    const period = periodParam.safeParse(req.query.period).success
      ? req.query.period
      : monthStart();

    const { choice, list } = resolveEntities(req.query.entity);

    const byEntity = {};
    for (const ent of list) {
      const [pnl, flow, revenueBy, expenseBy, breakdown, series, ar, capital] =
        await Promise.all([
          profitAndLoss(period, ent),
          cashflow(period, ent),
          byCounterparty(period, "in", 12, ent),
          byCounterparty(period, "out", 12, ent),
          categoryBreakdown(period, ent),
          trend(13, monthStart(), ent),
          receivables(new Date(), ent),
          capitalPosition(ent),
        ]);
      byEntity[ent] = {
        entity: ent,
        label: ENTITY_LABEL[ent],
        pnl,
        cashflow: flow,
        revenue: {
          byCategory: breakdown.filter((r) => r.direction === "in"),
          byCustomer: revenueBy,
          receivables: ar,
        },
        expenses: {
          byCategory: breakdown.filter((r) => r.direction === "out"),
          byVendor: expenseBy,
        },
        trend: series,
        capital,
      };
    }

    res.json({
      period,
      baseCurrency: config.finance.baseCurrency,
      entity: choice,
      entities: list,
      byEntity,
    });
  })
);

financeRouter.get(
  "/categories",
  ah(async (req, res) => {
    res.json({
      baseCurrency: config.finance.baseCurrency,
      entities: ENTITIES.map((e) => ({ id: e, label: ENTITY_LABEL[e] })),
      categories: await all(
        "SELECT id, name, kind, pnl_line, entity FROM fin_categories ORDER BY sort, name"
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
  // Which way the money went — a bill received, or an invoice issued.
  kind: z.enum(["expense", "revenue"]).optional(),
  // Which books you were looking at. Used only when the reader is unsure —
  // a rule always wins, and a confident reading beats the hint.
  entityHint: entityOnly.optional(),
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
        kind: parsed.data.kind || "expense",
        entityHint: parsed.data.entityHint,
      });
      if (result.duplicate) {
        return res.status(200).json({
          duplicate: true,
          contract: result.contract === true,
          message: result.contract
            ? "That contract's schedule is already recorded."
            : "You have already uploaded this file.",
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
    const ent = entityOnly.safeParse(req.query.entity);
    if (ent.success) { where.push("e.entity = ?"); args.push(ent.data); }
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));

    const rows = await all(
        `SELECT e.id, e.entity, e.entry_date, e.direction, e.amount_minor, e.currency,
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
  // Correcting a misread currency is the common case — the amount is right
  // and only the symbol was wrong.
  currency: z.string().trim().length(3).optional(),
  direction: z.enum(["in", "out"]).optional(),
  reviewStatus: z.enum(["approved", "rejected", "needs_review"]).optional(),
  entity: entityOnly.optional(),
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
    if (b.entity !== undefined) {
      sets.push("entity = ?");
      args.push(b.entity);
      // Moving books can land in a month that side has already closed.
      const { period } = await resolvePeriod(isoDate(entry.entry_date), b.entity);
      sets.push("period = ?");
      args.push(period);
    }
    if (b.direction !== undefined) { sets.push("direction = ?"); args.push(b.direction); }
    if (b.entryDate !== undefined) {
      const { period } = await resolvePeriod(b.entryDate);
      sets.push("entry_date = ?", "period = ?");
      args.push(b.entryDate, period);
    }
    // Amount, currency and date all feed the converted figure, so any of them
    // changing means re-converting — otherwise the total silently keeps the
    // old rate.
    if (b.amount !== undefined || b.currency !== undefined || b.entryDate !== undefined) {
      const currency = (b.currency || entry.currency).toUpperCase();
      const when = b.entryDate || isoDate(entry.entry_date);
      const minor =
        b.amount !== undefined ? toMinor(b.amount, currency) : Number(entry.amount_minor);
      const fx = await convertToBase(minor, currency, when);
      sets.push("amount_minor = ?", "currency = ?", "fx_rate = ?", "base_amount_minor = ?");
      args.push(minor, currency, fx.fxRate, fx.baseAmountMinor);
      if (fx.note) { sets.push("review_status = 'needs_review'", "review_reason = ?"); args.push(fx.note); }
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
      await learnRule(
        entry.counterparty, Number(finalCategory), entry.counterparty_id,
        b.entity ?? entry.entity
      );
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
      "SELECT id, document_id, period, entity FROM fin_entries WHERE id = ?",
      [id]
    );
    if (!entry) return res.status(404).json({ error: "That entry no longer exists." });

    const closed = await get(
      "SELECT status FROM fin_periods WHERE period = ? AND entity = ?",
      [entry.period, entry.entity]
    );
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
  entity: entityOnly.optional(),
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
    const entity = b.entity || "strideup";
    const { period } = await resolvePeriod(b.entryDate, entity);
    const fx = await convertToBase(minor, currency, b.entryDate);

    const rs = await run(
      `INSERT INTO fin_entries
         (entry_date, direction, amount_minor, currency, fx_rate, base_amount_minor,
          counterparty_id, category_id, description, dedup_key, confidence,
          review_status, period, entity)
       VALUES (?,?,?,?,?,?,?,?,?,?,1,'approved',?,?) RETURNING id`,
      [
        b.entryDate, b.direction, minor, currency, fx.fxRate, fx.baseAmountMinor,
        b.counterparty ? await findOrCreateCounterparty(b.counterparty) : null,
        b.categoryId, b.description,
        `manual:${crypto.randomUUID()}`, period, entity,
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
      .object({ period: periodParam, entity: entityOnly, reopen: z.boolean().optional() })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Bad period." });
    const { period, entity, reopen } = parsed.data;
    await run(
      `INSERT INTO fin_periods (period, entity, status, closed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (period, entity) DO UPDATE SET
         status = EXCLUDED.status, closed_at = EXCLUDED.closed_at`,
      [period, entity, reopen ? "open" : "closed", reopen ? null : new Date().toISOString()]
    );
    res.json({ ok: true, period, entity, status: reopen ? "open" : "closed" });
  })
);

// ── Export for the accountant ────────────────────────────────
// The one sanctioned spreadsheet: generated, complete, never hand-edited.
financeRouter.get(
  "/export.csv",
  ah(async (req, res) => {
    const rows = await all(
      `SELECT e.entity, e.entry_date, e.direction, e.amount_minor, e.currency,
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
      "entity", "date", "direction", "amount", "currency", "category", "kind",
      "counterparty", "description", "reference", "status", "document_id",
    ];
    const body = rows.map((r) =>
      [
        r.entity, isoDate(r.entry_date), r.direction,
        (Number(r.amount_minor) / 100).toFixed(2),
        r.currency, r.category, r.kind, r.counterparty, r.description,
        r.reference, r.review_status, r.document_id ?? "",
      ].map(esc).join(",")
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="strideup-ledger.csv"');
    res.send([header.map(esc).join(","), ...body].join("\n"));
  })
);

// ── Commitments ──────────────────────────────────────────────
// Money already agreed, in either direction. A commitment is a rule, not a
// row per payment: amount, how often, from when, until when (or open-ended).
// The schedule is expanded on demand, so nothing here goes stale.
const commitmentSchema = z.object({
  entity: entityOnly.optional(),
  direction: z.enum(["in", "out"]),
  description: z.string().min(1).max(200),
  counterparty: z.string().max(120).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  amount: z.coerce.number().positive(),
  currency: z.string().length(3).optional(),
  frequency: z.enum(FREQUENCIES),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  dayOfMonth: z.coerce.number().int().min(1).max(31).nullish(),
});

financeRouter.get(
  "/commitments",
  ah(async (req, res) => {
    const { choice, list } = resolveEntities(req.query.entity);
    const byEntity = {};
    for (const ent of list) {
      byEntity[ent] = {
        entity: ent,
        label: ENTITY_LABEL[ent],
        commitments: (await activeCommitments(ent)).map(shapeCommitment),
      };
    }
    res.json({
      entity: choice, entities: list, byEntity,
      baseCurrency: config.finance.baseCurrency,
    });
  })
);

const shapeCommitment = (k) => ({
  id: Number(k.id),
  entity: k.entity,
  direction: k.direction,
  description: k.description,
  counterparty: k.counterparty,
  categoryId: k.category_id,
  categoryName: k.category_name,
  amountMinor: Number(k.amount_minor),
  baseAmountMinor: Number(k.base_amount_minor),
  currency: k.currency,
  frequency: k.frequency,
  dayOfMonth: k.day_of_month,
  startDate: isoDate(k.start_date),
  endDate: k.end_date ? isoDate(k.end_date) : null,
  status: k.status,
  source: k.source,
  reviewStatus: k.review_status,
  reviewReason: k.review_reason,
});

financeRouter.post(
  "/commitments",
  ah(async (req, res) => {
    const parsed = commitmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Fill in what it is, how much, how often, and when it starts.",
      });
    }
    const b = parsed.data;
    if (b.endDate && b.endDate < b.startDate) {
      return res.status(400).json({ error: "The end date is before the start date." });
    }
    const currency = (b.currency || config.finance.baseCurrency).toUpperCase();
    const minor = toMinor(b.amount, currency);

    // A commitment entered twice does not look wrong anywhere — it just makes
    // every future month quietly wrong by that amount. Same books, same
    // description, same amount and same schedule is refused rather than
    // silently doubled; two genuinely separate ones can be told apart in the
    // description.
    const twin = await get(
      `SELECT id FROM fin_commitments
        WHERE status = 'active' AND entity = ? AND direction = ?
          AND lower(description) = lower(?) AND amount_minor = ?
          AND currency = ? AND frequency = ? AND start_date = ?`,
      [b.entity || "strideup", b.direction, b.description, minor,
       currency, b.frequency, b.startDate]
    );
    if (twin) {
      return res.status(409).json({
        error: `"${b.description}" is already committed on those exact terms. ` +
               `Adding it twice would double it in every future month — if this ` +
               `really is a second one, give it a name that tells them apart.`,
      });
    }

    // Converted at today's rate: a commitment in a foreign currency is an
    // estimate in base terms until it is actually paid, and saying so is
    // better than pretending a future rate is known.
    const fx = await convertToBase(minor, currency, isoDate(new Date()));

    const rs = await run(
      `INSERT INTO fin_commitments
         (entity, direction, description, counterparty_id, category_id,
          amount_minor, currency, fx_rate, base_amount_minor,
          frequency, day_of_month, start_date, end_date, source, dedup_key)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'manual',?) RETURNING id`,
      [
        b.entity || "strideup", b.direction, b.description,
        b.counterparty ? await findOrCreateCounterparty(b.counterparty) : null,
        b.categoryId ?? null,
        minor, currency, fx.fxRate, fx.baseAmountMinor,
        b.frequency, b.dayOfMonth ?? null, b.startDate, b.endDate || null,
        `manual:${crypto.randomUUID()}`,
      ]
    );
    res.status(201).json({ id: lastId(rs) });
  })
);

// Ending a commitment is not deleting it. A retainer that ran for eight
// months and stopped is history the forecast still needs when it looks at
// those months, so `status` changes and the row stays.
financeRouter.patch(
  "/commitments/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Bad id." });
    const parsed = z
      .object({
        status: z.enum(["active", "ended"]).optional(),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Nothing to change." });
    const { status, endDate } = parsed.data;

    const existing = await get("SELECT id FROM fin_commitments WHERE id = ?", [id]);
    if (!existing) return res.status(404).json({ error: "That commitment is gone." });

    if (status) await run("UPDATE fin_commitments SET status = ? WHERE id = ?", [status, id]);
    if (endDate !== undefined) {
      await run("UPDATE fin_commitments SET end_date = ? WHERE id = ?", [endDate || null, id]);
    }
    res.json({ ok: true, id });
  })
);

// Deleting is for something entered by mistake, which is why it is separate
// from ending one.
financeRouter.delete(
  "/commitments/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Bad id." });
    await run("DELETE FROM fin_commitments WHERE id = ?", [id]);
    res.json({ ok: true });
  })
);

// ── The forecast ─────────────────────────────────────────────
// Committed money only. Nothing is extrapolated from past months; where
// income is not under contract, the projection shows nothing rather than a
// guess, and reports how much of the picture that leaves out.
financeRouter.get(
  "/forecast",
  ah(async (req, res) => {
    const { choice, list } = resolveEntities(req.query.entity);
    const months = Math.min(12, Math.max(1, Number(req.query.months) || 6));
    const byEntity = {};
    for (const ent of list) {
      byEntity[ent] = { label: ENTITY_LABEL[ent], ...(await forecast(ent, months)) };
    }
    res.json({
      entity: choice, entities: list, months, byEntity,
      baseCurrency: config.finance.baseCurrency,
    });
  })
);

// ── Due soon ─────────────────────────────────────────────────
// Scheduled commitments and genuinely outstanding invoices, kept separate:
// one is a date that was agreed, the other is money actually owed.
financeRouter.get(
  "/due",
  ah(async (req, res) => {
    const { choice, list } = resolveEntities(req.query.entity);
    const days = Math.min(120, Math.max(1, Number(req.query.days) || 30));
    const byEntity = {};
    for (const ent of list) {
      byEntity[ent] = { label: ENTITY_LABEL[ent], ...(await dueSoon(ent, days)) };
    }
    res.json({
      entity: choice, entities: list, days, byEntity,
      baseCurrency: config.finance.baseCurrency,
    });
  })
);

// ── Contracts and their payment status ───────────────────────
financeRouter.get(
  "/schedule",
  ah(async (req, res) => {
    const { choice, list } = resolveEntities(req.query.entity);
    const clamp = (raw, dflt, lo, hi) => {
      const n = Number(raw);
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
    };
    const back = clamp(req.query.back, 2, 0, 12);
    const ahead = clamp(req.query.ahead, 9, 1, 18);
    const byEntity = {};
    for (const ent of list) {
      byEntity[ent] = { label: ENTITY_LABEL[ent], ...(await contractSchedule(ent, back, ahead)) };
    }
    res.json({
      entity: choice, entities: list, byEntity,
      baseCurrency: config.finance.baseCurrency,
    });
  })
);

// Marking an occurrence paid is what turns a promise into money. It writes a
// real ledger entry — so the payment lands in revenue or expenses, in the
// month it actually arrived, and moves the recorded position. Until then the
// contract is visible as committed and counts toward nothing else.
//
// The dedup key is the (commitment, due date) pair, so pressing this twice
// records one payment, exactly like every other way money enters the ledger.
financeRouter.post(
  "/commitments/:id/payments",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Bad id." });
    const parsed = z
      .object({
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        amount: z.coerce.number().positive().optional(),
        status: z.enum(["paid", "waived"]).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Which payment, and when?" });
    const { dueDate, paidDate, amount, status = "paid" } = parsed.data;

    const k = await get(
      `SELECT k.*, c.name AS category_name FROM fin_commitments k
         LEFT JOIN fin_categories c ON c.id = k.category_id
        WHERE k.id = ?`, [id]
    );
    if (!k) return res.status(404).json({ error: "That commitment is gone." });

    // The date must be one the schedule actually produces — otherwise a typo
    // creates a payment against an occurrence that does not exist.
    const period = `${dueDate.slice(0, 7)}-01`;
    const scheduled = occurrencesIn(k, period).some((o) => o.date === dueDate);
    if (!scheduled) {
      return res.status(422).json({
        error: `${dueDate} is not a date this commitment falls due.`,
      });
    }

    const already = await get(
      "SELECT id FROM fin_commitment_payments WHERE commitment_id = ? AND due_date = ?",
      [id, dueDate]
    );
    if (already) return res.status(409).json({ error: "That payment is already recorded." });

    const when = paidDate || dueDate;
    let entryId = null;
    let minor = Number(k.amount_minor);
    let baseMinor = Number(k.base_amount_minor);

    if (status === "paid") {
      // A payment can land for a different amount than the schedule said —
      // a part payment, a rounded transfer, a rate that moved. What is
      // recorded is what arrived, not what was expected.
      if (amount != null) minor = toMinor(amount, k.currency);
      const { period: entryPeriod } = await resolvePeriod(when, k.entity);
      const fx = await convertToBase(minor, k.currency, when);
      const rs = await run(
        `INSERT INTO fin_entries
           (entry_date, direction, amount_minor, currency, fx_rate, base_amount_minor,
            counterparty_id, category_id, description, dedup_key, confidence,
            review_status, period, entity)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,'approved',?,?)
         ON CONFLICT (dedup_key) DO NOTHING
         RETURNING id`,
        [
          when, k.direction, minor, k.currency, fx.fxRate, fx.baseAmountMinor,
          k.counterparty_id, k.category_id, k.description,
          `commitment:${id}:${dueDate}`, entryPeriod, k.entity,
        ]
      );
      entryId = lastId(rs);
      baseMinor = fx.baseAmountMinor;
      if (entryId == null) {
        const found = await get("SELECT id FROM fin_entries WHERE dedup_key = ?",
                                [`commitment:${id}:${dueDate}`]);
        entryId = found ? Number(found.id) : null;
      }
    }

    await run(
      `INSERT INTO fin_commitment_payments
         (commitment_id, due_date, paid_date, entry_id, status,
          amount_minor, base_amount_minor, matched_by)
       VALUES (?,?,?,?,?,?,?, 'manual')`,
      [id, dueDate, status === "paid" ? when : null, entryId, status, minor, baseMinor]
    );
    res.status(201).json({ ok: true, id, dueDate, status, entryId });
  })
);

// Undoing it removes the ledger entry too — otherwise unmarking a payment
// would leave the money behind in the books with nothing pointing at it.
financeRouter.delete(
  "/commitments/:id/payments/:dueDate",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const dueDate = String(req.params.dueDate);
    if (!Number.isInteger(id) || id <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return res.status(400).json({ error: "Bad payment reference." });
    }
    const row = await get(
      "SELECT entry_id FROM fin_commitment_payments WHERE commitment_id = ? AND due_date = ?",
      [id, dueDate]
    );
    if (!row) return res.status(404).json({ error: "No payment recorded for that date." });

    // A closed month is not rewritten. The entry stays and so does the record.
    if (row.entry_id != null) {
      const entry = await get("SELECT period, entity FROM fin_entries WHERE id = ?", [row.entry_id]);
      if (entry) {
        const closed = await get(
          "SELECT status FROM fin_periods WHERE period = ? AND entity = ?",
          [isoDate(entry.period), entry.entity]
        );
        if (closed?.status === "closed") {
          return res.status(409).json({
            error: `That payment is in ${isoDate(entry.period).slice(0, 7)}, which is closed. ` +
                   `Reopen the month first if it really needs changing.`,
          });
        }
      }
      await run("DELETE FROM fin_entries WHERE id = ?", [row.entry_id]);
    }
    await run(
      "DELETE FROM fin_commitment_payments WHERE commitment_id = ? AND due_date = ?",
      [id, dueDate]
    );
    res.json({ ok: true });
  })
);
