import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { all, get, run, lastId } from "../db.js";
import { requireOwner } from "../auth.js";
import { aiLimiter } from "../security.js";
import { config } from "../config.js";
import { ah, isoDate } from "../util.js";
import { ACCEPTED_MIME, sniffMime, toMinor, fromMinor, ZERO_DECIMAL } from "../finance/extract.js";
import { ALL_ENTITIES, ENTITIES, ENTITY_LABEL, FREQUENCIES, SINGLE_ENTITY, DEFAULT_ENTITY } from "../finance/schema.js";
import { ingestDocument, learnRule, resolvePeriod, findOrCreateCounterparty, convertToBase } from "../finance/ingest.js";
import { importGhlCsv } from "../finance/ghl.js";
import {
  monthStart, addMonths, periodSummary, categoryBreakdown, trend, cashPosition,
  burnAndRunway, receivables, capitalPosition, reviewCount,
  profitAndLoss, cashflow, byCounterparty, forecast, activeCommitments, dueSoon,
  contractSchedule, occurrencesIn, occKey, statusOf, outstandingOn, commitmentsForMonth, paymentMap, committedRunUp,
  vendorManagement, contractLibrary, cashDashboard, sideDetail, overviewDashboard,
  budgetsFor, plStatement, plTrend, topVariances, plInsights, groupSpend,
  householdMonth,
  homeDashboard,
  incomeDashboard,
  expensesDashboard,
  wealth,
  goals,
  reports,
} from "../finance/metrics.js";
import { exportEntity, importAll, purgeEntity } from "../finance/transfer.js";

export const financeRouter = express.Router();

// The company's complete financial position. Every route requires the signed-in
// owner; there is no other kind of account.
financeRouter.use(requireOwner);

const MAX_BYTES = 8 * 1024 * 1024;
const periodParam = z.string().regex(/^\d{4}-\d{2}-01$/);
// An instance that keeps one set of books accepts that one and nothing else.
// This is the guarantee the whole split rests on: a request naming the other
// entity is not an error to report, it is simply answered with the books this
// deployment has — there is no query string that reaches data another instance
// holds, because this instance's database does not hold it either.
const entityParam = SINGLE_ENTITY
  ? z.enum([SINGLE_ENTITY]) : z.enum(["strideup", "personal", "both"]);
const entityOnly = SINGLE_ENTITY
  ? z.enum([SINGLE_ENTITY]) : z.enum(["strideup", "personal"]);

// Moving books out is the one thing that must still work for a set of books
// this deployment has stopped keeping. Clamping the transfer routes to the
// configured entity would strand whatever is left in the database with no way
// to reach it — so they validate against every entity that can exist, not
// against the ones this instance shows.
const entityAny = z.enum(ALL_ENTITIES);

// Which sets of books actually hold rows here, whether or not this deployment
// shows them. A leftover set has to be visible somewhere or it cannot be moved.
async function booksPresent() {
  const rows = await all(
    `SELECT entity, COUNT(*) AS n FROM fin_entries
      WHERE review_status <> 'rejected' GROUP BY entity`
  );
  return rows.map((r) => ({ id: r.entity, entries: Number(r.n) }))
             .filter((r) => ALL_ENTITIES.includes(r.id));
}

// "both" is answered by running the same query once per set of books and
// returning them separately. Nothing here ever adds two entities together.
const resolveEntities = (raw) => {
  if (SINGLE_ENTITY) return { choice: SINGLE_ENTITY, list: [SINGLE_ENTITY] };
  const parsed = entityParam.safeParse(raw);
  const choice = parsed.success ? parsed.data : ENTITIES[0];
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
    const asOf = isoDate(new Date());
    const ahead = period > monthStart();

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
      // What is already agreed to move in this month, as distinct from what
      // has been recorded. A month still ahead carries its opening balance
      // forward correctly but would otherwise claim nothing will move in it —
      // which is false whenever a contract or a rent falls due inside it.
      const commitments = await activeCommitments(ent);
      const settled = await paymentMap(ent);
      const c = commitmentsForMonth(commitments, period, ahead ? null : asOf, settled);
      // Everything already agreed between now and the start of this month, so
      // a month several ahead opens where the committed path actually leaves
      // it rather than at today's recorded figure.
      const runUp = ahead
        ? committedRunUp(commitments, settled, monthStart(), period, asOf)
        : 0;
      // A month that has already begun opened where it opened; only a month
      // still ahead has an opening that has to be projected. Either way the
      // closing figure builds on what the month has actually done so far.
      const openingProjected = ahead ? flow.opening + runUp : flow.opening;
      const closingBase = ahead ? openingProjected : flow.closing;

      byEntity[ent] = {
        entity: ent,
        label: ENTITY_LABEL[ent],
        pnl,
        cashflow: flow,
        committed: {
          in: c.committedIn,
          out: c.committedOut,
          movement: c.committedIn - c.committedOut,
          runUp,
          openingProjected,
          projectedClosing: closingBase + c.committedIn - c.committedOut,
          items: c.items,
          ahead,
        },
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
      // Books still in this database that this deployment does not show. The
      // Import and close page offers to move them out; nothing else reads them.
      leftover: (await booksPresent())
        .filter((b) => !ENTITIES.includes(b.id))
        .map((b) => ({ ...b, label: ENTITY_LABEL[b.id] })),
      categories: await all(
        `SELECT id, name, kind, pnl_line, entity, spend_group AS "spendGroup"
           FROM fin_categories ORDER BY sort, name`
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
  // "contract" is neither until the document says so — an agreement can be
  // money coming in or going out, and the reader works that out from the terms.
  kind: z.enum(["expense", "revenue", "contract"]).optional(),
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
            ? "That contract's schedule is already recorded. Choose Replace to " +
              "read it again — useful if the schedule came out wrong."
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
    // Free-text search across what somebody would actually type looking for a
    // row: who it was with, what it was called, and the reference on it.
    const q = String(req.query.q ?? "").trim().slice(0, 80);
    if (q) {
      where.push(
        "(e.description ILIKE ? OR e.reference ILIKE ? OR p.name ILIKE ? OR c.name ILIKE ?)"
      );
      const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      args.push(like, like, like, like);
    }
    const ent = entityOnly.safeParse(req.query.entity);
    if (ent.success) { where.push("e.entity = ?"); args.push(ent.data); }
    // Filters the transaction list offers. Each one narrows; none of them
    // change what a row means.
    if (["in", "out"].includes(req.query.direction)) {
      where.push("e.direction = ?"); args.push(req.query.direction);
    }
    if (Number.isInteger(Number(req.query.categoryId)) && Number(req.query.categoryId) > 0) {
      where.push("e.category_id = ?"); args.push(Number(req.query.categoryId));
    }
    for (const [q, op] of [["from", ">="], ["to", "<="]]) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query[q] ?? ""))) {
        where.push(`e.entry_date ${op} ?`); args.push(req.query[q]);
      }
    }
    if (req.query.needsReview === "1") where.push("e.review_status = 'needs_review'");
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    // Paging needs to know how many there are, not only which page you asked
    // for — "showing 1–8 of 120" is the whole point of the footer.
    const totalRow = await get(
      `SELECT COUNT(*) AS n
         FROM fin_entries e
         LEFT JOIN fin_categories c ON c.id = e.category_id
         LEFT JOIN fin_counterparties p ON p.id = e.counterparty_id
        WHERE ${where.join(" AND ")}`,
      args
    );

    const rows = await all(
        `SELECT e.id, e.entity, e.entry_date, e.direction, e.amount_minor, e.currency,
                e.base_amount_minor, e.description, e.reference, e.confidence,
                e.review_status, e.review_reason, e.document_id, e.period, e.dedup_key,
                c.id AS category_id, c.name AS category_name, c.kind AS category_kind,
                p.name AS counterparty
           FROM fin_entries e
           LEFT JOIN fin_categories c ON c.id = e.category_id
           LEFT JOIN fin_counterparties p ON p.id = e.counterparty_id
          WHERE ${where.join(" AND ")}
          ORDER BY e.entry_date DESC, e.id DESC
          LIMIT ${limit} OFFSET ${offset}`,
      args
    );
    res.json({
      total: Number(totalRow?.n ?? rows.length),
      limit, offset,
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

    // The document goes with the entry only if nothing else still needs it. A
    // contract's commitments point at the file they were read from, and the
    // contract folder is that file — deleting an unrelated ledger row must not
    // take the agreement with it. Foreign keys would have nulled the reference
    // silently, leaving a schedule with no document behind it.
    if (entry.document_id) {
      const stillUsed = await get(
        `SELECT
           (SELECT COUNT(*) FROM fin_entries      WHERE document_id = ?) AS entries,
           (SELECT COUNT(*) FROM fin_commitments  WHERE document_id = ?) AS commitments`,
        [entry.document_id, entry.document_id]
      );
      const used = Number(stillUsed?.entries ?? 0) + Number(stillUsed?.commitments ?? 0);
      if (used === 0) {
        await run("DELETE FROM fin_documents WHERE id = ?", [entry.document_id]);
      }
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
    const entity = b.entity || DEFAULT_ENTITY;
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
    // Closing a month that has not happened is not a thing closing means. It
    // would send anything dated in it to the open month as an adjustment,
    // which is the opposite of what someone pressing this wants.
    if (!reopen && period > monthStart()) {
      return res.status(422).json({
        error: `${period.slice(0, 7)} has not happened yet — there is nothing to close.`,
      });
    }
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
              e.base_amount_minor, e.fx_rate,
              COALESCE(c.name,'Uncategorised') AS category, COALESCE(c.kind,'') AS kind,
              c.spend_group AS spend_group,
              COALESCE(p.name,'') AS counterparty, COALESCE(e.description,'') AS description,
              COALESCE(e.reference,'') AS reference, e.review_status, e.document_id,
              d.filename AS document_name
         FROM fin_entries e
         LEFT JOIN fin_categories c ON c.id = e.category_id
         LEFT JOIN fin_counterparties p ON p.id = e.counterparty_id
         LEFT JOIN fin_documents d ON d.id = e.document_id
        WHERE e.review_status <> 'rejected'
        ORDER BY e.entry_date, e.id`
    );
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    // An absolute URL, because a spreadsheet has no page to be relative to.
    // Behind the proxy `req.protocol` reads x-forwarded-proto, which is why
    // `trust proxy` is set — without it every link would come out as http.
    const origin = `${req.protocol}://${req.get("host")}`;
    const base = config.finance.baseCurrency;
    const header = [
      "entity", "date", "direction", "amount", "currency",
      `base_amount (${base})`, "fx_rate",
      "category", "spend_group", "kind",
      "counterparty", "description", "reference", "status",
      "document", "document_link",
    ];
    const body = rows.map((r) =>
      [
        r.entity, isoDate(r.entry_date), r.direction,
        // Not every currency has two decimal places, and dividing by 100
        // regardless turned a ¥7,500 line into ¥75.00.
        fromMinor(Number(r.amount_minor), r.currency).toFixed(
          ZERO_DECIMAL.has(r.currency) ? 0 : 2
        ),
        r.currency,
        // The column every total in the app is summed from. Without it a
        // spreadsheet adding the `amount` column across currencies is wrong.
        fromMinor(Number(r.base_amount_minor), base).toFixed(
          ZERO_DECIMAL.has(base) ? 0 : 2
        ),
        r.fx_rate ?? "",
        r.category, r.spend_group ?? "", r.kind,
        r.counterparty, r.description, r.reference, r.review_status,
        r.document_name ?? "",
        r.document_id ? `${origin}/api/finance/documents/${r.document_id}` : "",
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
        commitments: markDuplicates((await activeCommitments(ent)).map(shapeCommitment)),
      };
    }
    res.json({
      entity: choice, entities: list, byEntity,
      baseCurrency: config.finance.baseCurrency,
    });
  })
);

// One contract read twice used to leave two schedules for one payment. New
// readings are stopped at the door now, but the ones already on the books have
// to be findable, so a row that another row already covers on the same day is
// marked. Nothing is deleted here — which of two readings is the right one is
// a judgement, and it belongs to whoever signed the contract.
function markDuplicates(rows) {
  const seen = new Map();
  return rows.map((k) => {
    const key = [k.entity, k.direction, k.counterparty ?? "", k.baseAmountMinor,
                 k.startDate].join("|");
    const first = seen.get(key);
    if (first === undefined) { seen.set(key, k.id); return { ...k, duplicateOf: null }; }
    return { ...k, duplicateOf: first };
  });
}

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
      [b.entity || DEFAULT_ENTITY, b.direction, b.description, minor,
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
        b.entity || DEFAULT_ENTITY, b.direction, b.description,
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
        categoryId: z.number().int().positive().nullish(),
        // A schedule read off a contract is the reader's answer, and the
        // reader can be wrong about any part of it. All of it is correctable.
        amount: z.number().positive().max(1e12).optional(),
        currency: z.string().trim().length(3).optional(),
        description: z.string().trim().min(1).max(200).optional(),
        counterparty: z.string().trim().max(120).nullish(),
        frequency: z.enum(["once", "weekly", "monthly", "quarterly", "annual"]).optional(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Nothing to change." });
    const { status, endDate, categoryId, amount, currency, description,
            counterparty, frequency, startDate } = parsed.data;

    const existing = await get(
      "SELECT id, entity, currency, start_date, end_date FROM fin_commitments WHERE id = ?",
      [id]
    );
    if (!existing) return res.status(404).json({ error: "That commitment is gone." });

    // The amount is stored as written and again in base currency, because
    // base_amount_minor is the only column any total is summed from. Changing
    // one without the other is how a corrected figure fails to reach a total.
    if (amount !== undefined || currency !== undefined) {
      const cur = (currency || existing.currency || config.finance.baseCurrency).toUpperCase();
      const when = startDate || isoDate(existing.start_date);
      const minor = amount !== undefined
        ? toMinor(amount, cur)
        : Number((await get("SELECT amount_minor FROM fin_commitments WHERE id = ?", [id]))
                 ?.amount_minor ?? 0);
      const fx = await convertToBase(minor, cur, when);
      await run(
        `UPDATE fin_commitments
            SET amount_minor = ?, currency = ?, fx_rate = ?, base_amount_minor = ?
          WHERE id = ?`,
        [minor, cur, fx.fxRate, fx.baseAmountMinor, id]
      );
    }
    if (description !== undefined) {
      await run("UPDATE fin_commitments SET description = ? WHERE id = ?", [description, id]);
    }
    if (counterparty !== undefined) {
      await run("UPDATE fin_commitments SET counterparty_id = ? WHERE id = ?", [
        counterparty ? await findOrCreateCounterparty(counterparty) : null, id,
      ]);
    }
    if (frequency !== undefined) {
      await run("UPDATE fin_commitments SET frequency = ? WHERE id = ?", [frequency, id]);
    }
    if (startDate !== undefined) {
      const end = endDate !== undefined ? endDate : (existing.end_date && isoDate(existing.end_date));
      if (end && end < startDate) {
        return res.status(400).json({ error: "That start date is after the agreement ends." });
      }
      await run(
        "UPDATE fin_commitments SET start_date = ?, day_of_month = ? WHERE id = ?",
        [startDate, Number(startDate.slice(8, 10)), id]
      );
    }

    if (status) await run("UPDATE fin_commitments SET status = ? WHERE id = ?", [status, id]);
    if (endDate !== undefined) {
      await run("UPDATE fin_commitments SET end_date = ? WHERE id = ?", [endDate || null, id]);
    }
    // A contract the reader filed under the wrong heading is a judgement call
    // it got wrong, not a fact to be preserved. Only the heading moves: the
    // amounts, the dates and everything already recorded against it stand.
    if (categoryId !== undefined) {
      if (categoryId !== null) {
        const cat = await get(
          "SELECT id, entity FROM fin_categories WHERE id = ?", [categoryId]
        );
        if (!cat) return res.status(400).json({ error: "No such category." });
        if (cat.entity !== "both" && cat.entity !== existing.entity) {
          return res.status(400).json({
            error: `That category belongs to the ${cat.entity} books, and this ` +
                   `agreement is on the ${existing.entity} ones.`,
          });
        }
      }
      await run("UPDATE fin_commitments SET category_id = ? WHERE id = ?", [categoryId, id]);
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

// Removing a contract from the folder. The agreement and its schedule go; the
// payments already recorded against it stay, because they happened — deleting
// the paperwork does not un-spend the money. The count of those is returned so
// the page can say what was kept.
financeRouter.delete(
  "/contracts/:documentId",
  ah(async (req, res) => {
    const documentId = Number(req.params.documentId);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      return res.status(400).json({ error: "Bad id." });
    }
    const rows = await all(
      "SELECT id FROM fin_commitments WHERE document_id = ? AND source = 'contract'",
      [documentId]
    );
    if (!rows.length) return res.status(404).json({ error: "No contract on that document." });
    const ids = rows.map((r) => Number(r.id));

    const settled = await get(
      `SELECT COUNT(*) AS n FROM fin_commitment_payments
        WHERE commitment_id IN (${ids.map(() => "?").join(",")})`,
      ids
    );
    const kept = Number(settled?.n ?? 0);

    // The payment rows cascade with the commitment; the ledger entries they
    // point at do not, and must not — `entry_id` is ON DELETE SET NULL in the
    // other direction for exactly this reason.
    await run(
      `DELETE FROM fin_commitments WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids
    );
    await run("DELETE FROM fin_documents WHERE id = ?", [documentId]);

    res.json({ ok: true, removed: ids.length, keptPayments: kept });
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
    // The schedule is read one month at a time. A grid of a year of columns
    // repeated a party's name down every row of its own schedule and made a
    // twelve-payment contract unreadable; the month picker already exists to
    // answer "what about July".
    const focus = periodParam.safeParse(req.query.period).success
      ? req.query.period : monthStart();
    const byEntity = {};
    for (const ent of list) {
      byEntity[ent] = {
        label: ENTITY_LABEL[ent], focus,
        ...(await contractSchedule(ent, back, ahead)),
      };
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
        status: z.enum(["paid", "partial", "waived"]).optional(),
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

    if (status === "paid" || status === "partial") {
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
      [id, dueDate, status === "waived" ? null : when, entryId, status, minor, baseMinor]
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

// ── Vendor management ────────────────────────────────────────
financeRouter.get(
  "/vendors",
  ah(async (req, res) => {
    const { choice, list } = resolveEntities(req.query.entity);
    const byEntity = {};
    for (const ent of list) {
      byEntity[ent] = {
        label: ENTITY_LABEL[ent],
        ...(await vendorManagement(ent)),
        library: await contractLibrary(ent),
      };
    }
    res.json({
      entity: choice, entities: list, byEntity,
      baseCurrency: config.finance.baseCurrency,
    });
  })
);

// ── Export ───────────────────────────────────────────────────
// Every scheduled payment, one row each, with what was agreed and what
// actually happened against it. A spreadsheet is where this goes next, so the
// shape is flat and the dates are plain ISO — nothing here needs parsing back
// out of a formatted string.
financeRouter.get(
  "/vendors/export.csv",
  ah(async (req, res) => {
    const { list } = resolveEntities(req.query.entity);
    const asOf = isoDate(new Date());
    const cell = (v) => {
      const t = v == null ? "" : String(v);
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const money = (minor, currency) =>
      (Number(minor || 0) / (["JPY", "KRW", "VND"].includes(currency) ? 1 : 100)).toFixed(2);

    const lines = [[
      "books", "vendor", "relationship", "contract", "category", "source",
      "due_date", "currency", "scheduled_amount", "scheduled_base",
      "status", "paid_date", "paid_base", "outstanding_base", "document_id",
    ].join(",")];

    for (const ent of list) {
      const commitments = await activeCommitments(ent);
      const settled = await paymentMap(ent);
      const thisPeriod = monthStart();
      for (const k of commitments) {
        for (let i = -18; i <= 18; i++) {
          const period = addMonths(thisPeriod, i);
          for (const occ of occurrencesIn(k, period)) {
            const rec = settled.get(occKey(k.id, occ.date));
            const scheduled = Number(k.base_amount_minor);
            lines.push([
              ent,
              k.counterparty || "Unattributed",
              k.direction === "in" ? "they pay" : "we pay",
              k.description,
              k.category_name || "",
              k.source,
              occ.date,
              k.currency,
              money(k.amount_minor, k.currency),
              money(scheduled, config.finance.baseCurrency),
              statusOf(occ.date, asOf, rec),
              rec?.paidDate || "",
              money(rec?.amount ?? 0, config.finance.baseCurrency),
              money(outstandingOn(scheduled, rec), config.finance.baseCurrency),
              k.document_id ?? "",
            ].map(cell).join(","));
          }
        }
      }
    }

    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader(
      "content-disposition",
      `attachment; filename="strideup-vendors-${asOf}.csv"`
    );
    res.send(lines.join("\n"));
  })
);

// ── Cash flow and forecast dashboard ─────────────────────────
financeRouter.get(
  "/cash",
  ah(async (req, res) => {
    const { choice, list } = resolveEntities(req.query.entity);
    const months = Math.min(12, Math.max(1, Number(req.query.months) || 3));
    const byEntity = {};
    for (const ent of list) {
      byEntity[ent] = { label: ENTITY_LABEL[ent], ...(await cashDashboard(ent, months)) };
    }
    res.json({
      entity: choice, entities: list, months, byEntity,
      baseCurrency: config.finance.baseCurrency,
    });
  })
);

// ── Revenue and expenses in detail ───────────────────────────
financeRouter.get(
  "/side/:direction",
  ah(async (req, res) => {
    const direction = req.params.direction === "in" ? "in" : "out";
    const period = periodParam.safeParse(req.query.period).success
      ? req.query.period
      : monthStart();
    const { choice, list } = resolveEntities(req.query.entity);
    const byEntity = {};
    for (const ent of list) {
      byEntity[ent] = { label: ENTITY_LABEL[ent], ...(await sideDetail(ent, period, direction)) };
    }
    res.json({
      entity: choice, entities: list, period, direction, byEntity,
      baseCurrency: config.finance.baseCurrency,
    });
  })
);

// ── Invoices ─────────────────────────────────────────────────
// An invoice you have issued is money owed to you. It is not revenue and it
// is not cash: it is a claim. So creating one writes nothing to the ledger —
// it appears under outstanding payments and starts ageing. Recording it as
// paid is what turns it into revenue, in the month the money actually landed,
// which is the same rule contracts follow.
const invoiceSchema = z.object({
  entity: entityOnly.optional(),
  customer: z.string().trim().min(1).max(160),
  number: z.string().trim().max(80).optional(),
  amount: z.coerce.number().positive(),
  currency: z.string().length(3).optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  url: z.string().trim().max(500).nullish(),
});

financeRouter.get(
  "/invoices",
  ah(async (req, res) => {
    const { choice, list } = resolveEntities(req.query.entity);
    const rows = (await Promise.all(list.map((ent) =>
      all(
        `SELECT id, source, external_id, customer, issue_date, due_date,
                amount_minor, paid_minor, currency, status, entity, url
           FROM fin_invoices WHERE entity = ?
          ORDER BY issue_date DESC, id DESC LIMIT 200`, [ent]
      )
    ))).flat();
    res.json({
      entity: choice, entities: list,
      invoices: rows.map((r) => ({
        id: Number(r.id), source: r.source, number: r.external_id,
        customer: r.customer, issueDate: isoDate(r.issue_date),
        dueDate: r.due_date ? isoDate(r.due_date) : null,
        amountMinor: Number(r.amount_minor), paidMinor: Number(r.paid_minor),
        outstanding: Number(r.amount_minor) - Number(r.paid_minor),
        currency: r.currency, status: r.status, entity: r.entity, url: r.url,
      })),
      baseCurrency: config.finance.baseCurrency,
    });
  })
);

financeRouter.post(
  "/invoices",
  ah(async (req, res) => {
    const parsed = invoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Fill in who it is for, how much, and when." });
    }
    const b = parsed.data;
    if (b.dueDate && b.dueDate < b.issueDate) {
      return res.status(400).json({ error: "The due date is before the issue date." });
    }
    const entity = b.entity || DEFAULT_ENTITY;
    const currency = (b.currency || config.finance.baseCurrency).toUpperCase();
    const minor = toMinor(b.amount, currency);
    const number = b.number?.trim() || `INV-${Date.now().toString(36).toUpperCase()}`;

    const clash = await get(
      "SELECT id FROM fin_invoices WHERE source = 'manual' AND external_id = ?",
      [number]
    );
    if (clash) {
      return res.status(409).json({ error: `Invoice ${number} already exists.` });
    }

    const rs = await run(
      `INSERT INTO fin_invoices
         (source, external_id, customer, issue_date, due_date,
          amount_minor, currency, status, entity, url)
       VALUES ('manual', ?, ?, ?, ?, ?, ?, 'sent', ?, ?) RETURNING id`,
      [number, b.customer, b.issueDate, b.dueDate || null,
       minor, currency, entity, b.url || null]
    );
    res.status(201).json({ id: lastId(rs), number });
  })
);

// Recording payment is what makes it revenue. Partial payments are allowed:
// the balance keeps ageing and the invoice stays open.
financeRouter.post(
  "/invoices/:id/payments",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Bad id." });
    const parsed = z
      .object({
        amount: z.coerce.number().positive().optional(),
        paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        categoryId: z.coerce.number().int().positive().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "How much, and when?" });

    const inv = await get("SELECT * FROM fin_invoices WHERE id = ?", [id]);
    if (!inv) return res.status(404).json({ error: "That invoice is gone." });

    const outstanding = Number(inv.amount_minor) - Number(inv.paid_minor);
    if (outstanding <= 0) return res.status(409).json({ error: "That invoice is already settled." });

    const when = parsed.data.paidDate || isoDate(new Date());
    const minor = parsed.data.amount != null
      ? toMinor(parsed.data.amount, inv.currency)
      : outstanding;
    if (minor > outstanding) {
      return res.status(422).json({
        error: `That is more than the ${inv.currency} ` +
               `${fromMinor(outstanding, inv.currency).toLocaleString()} still outstanding.`,
      });
    }

    const { period } = await resolvePeriod(when, inv.entity);
    const fx = await convertToBase(minor, inv.currency, when);
    const paidSoFar = Number(inv.paid_minor) + minor;

    await run(
      `INSERT INTO fin_entries
         (entry_date, direction, amount_minor, currency, fx_rate, base_amount_minor,
          counterparty_id, category_id, description, dedup_key, confidence,
          review_status, period, entity)
       VALUES (?, 'in', ?,?,?,?,?,?,?,?,1,'approved',?,?)
       ON CONFLICT (dedup_key) DO NOTHING`,
      [
        when, minor, inv.currency, fx.fxRate, fx.baseAmountMinor,
        inv.customer ? await findOrCreateCounterparty(inv.customer, "customer") : null,
        parsed.data.categoryId ?? null,
        `${inv.customer || "Invoice"} — ${inv.external_id}`,
        `invoice:${id}:${when}:${minor}`, period, inv.entity,
      ]
    );
    await run(
      "UPDATE fin_invoices SET paid_minor = ?, status = ?, updated_at = now() WHERE id = ?",
      [paidSoFar, paidSoFar >= Number(inv.amount_minor) ? "paid" : "partial", id]
    );
    res.status(201).json({ ok: true, id, paidMinor: paidSoFar });
  })
);

financeRouter.delete(
  "/invoices/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Bad id." });
    const inv = await get(
      "SELECT paid_minor, entity FROM fin_invoices WHERE id = ?", [id]
    );
    if (!inv) return res.status(404).json({ error: "That invoice is gone." });

    // A payment recorded against an invoice was posted to the ledger with a
    // dedup key naming that invoice, so the entries it created can be found
    // exactly rather than guessed at. Deleting the invoice takes them with it
    // — leaving them behind is what made a deleted invoice keep showing up.
    const entries = await all(
      `SELECT e.id, e.period FROM fin_entries e
        WHERE e.dedup_key LIKE ? AND e.entity = ?`,
      [`invoice:${id}:%`, inv.entity]
    );

    // Except in a month that has been closed. Closed months are never
    // rewritten, so this stops rather than quietly reopening settled history.
    if (entries.length) {
      const periods = [...new Set(entries.map((e) => isoDate(e.period)))];
      const closed = await all(
        `SELECT period FROM fin_periods
          WHERE status = 'closed' AND entity = ?
            AND period IN (${periods.map(() => "?").join(",")})`,
        [inv.entity, ...periods]
      );
      if (closed.length) {
        return res.status(409).json({
          error:
            `This invoice has money recorded in ${closed
              .map((c) => isoDate(c.period).slice(0, 7))
              .join(", ")}, which ${closed.length === 1 ? "is a closed month" : "are closed months"}. ` +
            "Closed months are never rewritten. Reopen the month first, or leave " +
            "the invoice in place and mark it cancelled.",
        });
      }
      await run(
        `DELETE FROM fin_entries WHERE id IN (${entries.map(() => "?").join(",")})`,
        entries.map((e) => Number(e.id))
      );
    }

    await run("DELETE FROM fin_invoices WHERE id = ?", [id]);
    res.json({ ok: true, removedEntries: entries.length });
  })
);

// ── Moving a set of books to another instance ────────────────
// Three steps, deliberately separate, and none of them needs a terminal or a
// database password: download the books, upload them into the other instance,
// and only then remove them here.
financeRouter.get(
  "/books/:entity/export.json",
  ah(async (req, res) => {
    const parsed = entityAny.safeParse(req.params.entity);
    if (!parsed.success) return res.status(400).json({ error: "No such books." });
    const data = await exportEntity(parsed.data);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${parsed.data}-books-${isoDate(new Date())}.json"`
    );
    res.send(JSON.stringify(data, null, 1));
  })
);

financeRouter.post(
  "/books/import",
  ah(async (req, res) => {
    const data = req.body;
    if (!data || typeof data !== "object" || !data.entity || !Array.isArray(data.entries)) {
      return res.status(400).json({
        error: "That does not look like a books file. Use the file downloaded " +
               "from the other instance, unchanged.",
      });
    }
    // A file of business books has no home in a personal instance. Refusing is
    // the honest answer — silently relabelling them would put the two sets of
    // books back together, which is the thing this whole split exists to stop.
    if (!ENTITIES.includes(data.entity)) {
      return res.status(400).json({
        error: `That file holds ${ENTITY_LABEL[data.entity] || data.entity} books, ` +
               `and this app keeps ${ENTITIES.map((e) => ENTITY_LABEL[e]).join(" and ")}.`,
      });
    }
    const r = await importAll(data);
    res.json({ ok: true, ...r });
  })
);

financeRouter.post(
  "/books/:entity/remove",
  ah(async (req, res) => {
    const parsed = entityAny.safeParse(req.params.entity);
    if (!parsed.success) return res.status(400).json({ error: "No such books." });
    const entity = parsed.data;
    // Typing the name is the confirmation. A dialog you can dismiss with the
    // space bar is not one, and this is the only irreversible thing in the app.
    if (String(req.body?.confirm || "").trim().toLowerCase() !== entity) {
      return res.status(400).json({
        error: `To remove these books, type "${entity}" to confirm.`,
      });
    }
    if (ENTITIES.length < 2) {
      return res.status(409).json({
        error: "These are the only books this app keeps. Removing them would " +
               "leave nothing behind — that is a job for deleting the instance.",
      });
    }
    const r = await purgeEntity(entity, true);
    res.json({ ok: true, ...r });
  })
);

// ── Budgets ──────────────────────────────────────────────────
// A plan for a month, per category. Read and written whole: the page shows
// every category you could budget, so saving sends the lot and an empty box
// means "no plan", which is different from a plan of zero.
financeRouter.get(
  "/budgets",
  ah(async (req, res) => {
    const period = periodParam.safeParse(req.query.period).success
      ? req.query.period : monthStart();
    const { choice, list } = resolveEntities(req.query.entity);
    const byEntity = {};
    for (const ent of list) {
      byEntity[ent] = {
        entity: ent, label: ENTITY_LABEL[ent], period,
        budgets: await budgetsFor(ent, period),
      };
    }
    res.json({ entity: choice, entities: list, period, byEntity,
               baseCurrency: config.finance.baseCurrency });
  })
);

const budgetSchema = z.object({
  entity: entityOnly,
  period: z.string().regex(/^\d{4}-\d{2}-01$/),
  lines: z.array(z.object({
    categoryId: z.number().int().positive(),
    // null clears the plan for that category. Zero is a real plan — "spend
    // nothing here" — and is kept apart from having no plan at all.
    amount: z.number().min(0).max(1e12).nullable(),
    note: z.string().trim().max(200).nullish(),
  })).max(200),
});

financeRouter.put(
  "/budgets",
  ah(async (req, res) => {
    const parsed = budgetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Could not read that budget." });
    const { entity, period, lines } = parsed.data;

    const closed = await get(
      "SELECT status FROM fin_periods WHERE period = ? AND entity = ?", [period, entity]
    );
    if (closed?.status === "closed") {
      return res.status(409).json({
        error: "That month is closed. A closed month is never rewritten, and its " +
               "plan is part of the record.",
      });
    }

    let set = 0, cleared = 0;
    for (const l of lines) {
      const cat = await get(
        "SELECT id, entity FROM fin_categories WHERE id = ?", [l.categoryId]
      );
      if (!cat) continue;
      if (cat.entity !== "both" && cat.entity !== entity) continue;
      if (l.amount == null) {
        await run(
          "DELETE FROM fin_budgets WHERE entity = ? AND period = ? AND category_id = ?",
          [entity, period, l.categoryId]
        );
        cleared += 1;
        continue;
      }
      const currency = config.finance.baseCurrency;
      await run(
        `INSERT INTO fin_budgets (entity, period, category_id, amount_minor, note)
         VALUES (?,?,?,?,?)
         ON CONFLICT (entity, period, category_id) DO UPDATE SET
           amount_minor = EXCLUDED.amount_minor, note = EXCLUDED.note,
           updated_at = now()`,
        [entity, period, l.categoryId, toMinor(l.amount, currency), l.note ?? null]
      );
      set += 1;
    }
    res.json({ ok: true, set, cleared });
  })
);

// Last month's plan, as this month's starting point. Budgets rarely change
// wholesale, and retyping twenty lines is how a budget stops being kept.
financeRouter.post(
  "/budgets/copy",
  ah(async (req, res) => {
    const parsed = z.object({
      entity: entityOnly,
      period: z.string().regex(/^\d{4}-\d{2}-01$/),
      from: z.string().regex(/^\d{4}-\d{2}-01$/).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Bad request." });
    const { entity, period } = parsed.data;
    const from = parsed.data.from ?? isoDate(
      new Date(Date.UTC(+period.slice(0, 4), +period.slice(5, 7) - 2, 1))
    );
    const rows = await all(
      "SELECT category_id, amount_minor, note FROM fin_budgets WHERE entity = ? AND period = ?",
      [entity, from]
    );
    for (const r of rows) {
      await run(
        `INSERT INTO fin_budgets (entity, period, category_id, amount_minor, note)
         VALUES (?,?,?,?,?)
         ON CONFLICT (entity, period, category_id) DO UPDATE SET
           amount_minor = EXCLUDED.amount_minor, updated_at = now()`,
        [entity, period, r.category_id, r.amount_minor, r.note]
      );
    }
    res.json({ ok: true, copied: rows.length, from });
  })
);

// ── The household month ──────────────────────────────────────
// Budget, bills, subscriptions and income for one month, arranged the way
// somebody asks about their own money rather than the way a company reports.
financeRouter.get(
  "/household",
  ah(async (req, res) => {
    const period = periodParam.safeParse(req.query.period).success
      ? req.query.period : monthStart();
    const { choice, list } = resolveEntities(req.query.entity);
    const byEntity = {};
    for (const ent of list) {
      byEntity[ent] = {
        label: ENTITY_LABEL[ent],
        ...(await householdMonth(ent, period)),
      };
    }
    res.json({ entity: choice, entities: list, period, byEntity,
               baseCurrency: config.finance.baseCurrency });
  })
);

// ── The home page ────────────────────────────────────────────
// Everything the first screen shows, in one call: where you stand, how the
// month compares with the one before, what is about to leave, where the money
// went, and the last few things that actually happened.
financeRouter.get(
  "/home",
  ah(async (req, res) => {
    const period = periodParam.safeParse(req.query.period).success
      ? req.query.period : monthStart();
    const { choice, list } = resolveEntities(req.query.entity);
    const money = (v) => `${config.finance.baseCurrency} ${Math.round(v / 100).toLocaleString()}`;
    const byEntity = {};
    for (const ent of list) {
      byEntity[ent] = {
        label: ENTITY_LABEL[ent],
        ...(await homeDashboard(ent, period, new Date(), money)),
      };
    }
    res.json({ entity: choice, entities: list, period, byEntity,
               baseCurrency: config.finance.baseCurrency });
  })
);

// ── Income ───────────────────────────────────────────────────
// Where the money comes from: what arrived this month, what keeps arriving
// under a standing arrangement, and what has arrived with no arrangement
// behind it at all. The three are never added together.
financeRouter.get(
  "/income",
  ah(async (req, res) => {
    const period = periodParam.safeParse(req.query.period).success
      ? req.query.period : monthStart();
    const { choice, list } = resolveEntities(req.query.entity);
    const byEntity = {};
    for (const ent of list) {
      byEntity[ent] = {
        label: ENTITY_LABEL[ent],
        ...(await incomeDashboard(ent, period)),
      };
    }
    res.json({ entity: choice, entities: list, period, byEntity,
               baseCurrency: config.finance.baseCurrency });
  })
);

// ── Spending ─────────────────────────────────────────────────
// Where the money went, how much of it a standing agreement caused, and what
// that leaves. The split is read from the ledger — a row an agreement caused
// carries that agreement's dedup key — not guessed from the amount or name.
financeRouter.get(
  "/expenses",
  ah(async (req, res) => {
    const period = periodParam.safeParse(req.query.period).success
      ? req.query.period : monthStart();
    const { choice, list } = resolveEntities(req.query.entity);
    const money = (v) =>
      `${config.finance.baseCurrency} ${Math.round(v / 100).toLocaleString()}`;
    const byEntity = {};
    for (const ent of list) {
      byEntity[ent] = {
        label: ENTITY_LABEL[ent],
        ...(await expensesDashboard(ent, period, new Date(), money)),
      };
    }
    res.json({ entity: choice, entities: list, period, byEntity,
               baseCurrency: config.finance.baseCurrency });
  })
);

// ── What you own and what you owe ────────────────────────────
// Nothing here is connected to a bank or a broker, so every figure is a
// valuation somebody entered. The date it was entered for travels with it.
financeRouter.get(
  "/wealth",
  ah(async (req, res) => {
    const { choice, list } = resolveEntities(req.query.entity);
    const byEntity = {};
    for (const ent of list) {
      byEntity[ent] = { label: ENTITY_LABEL[ent], ...(await wealth(ent)) };
    }
    res.json({ entity: choice, entities: list, byEntity,
               baseCurrency: config.finance.baseCurrency });
  })
);

const holdingSchema = z.object({
  entity: entityOnly.optional(),
  side: z.enum(["asset", "liability"]),
  name: z.string().trim().min(1).max(140),
  kind: z.enum(["equity", "debt", "cash", "property", "gold", "other"]).optional(),
  currency: z.string().trim().length(3).optional(),
  value: z.coerce.number().min(0).max(1e12),
  cost: z.coerce.number().min(0).max(1e12).nullish(),
  ratePct: z.coerce.number().min(0).max(200).nullish(),
  monthlyPayment: z.coerce.number().min(0).max(1e12).nullish(),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(300).nullish(),
});

// Saving a holding always writes a valuation as well as the holding itself.
// A present figure with no history is a number that cannot be checked later.
async function writeValue(id, asOf, minor, baseMinor) {
  await run(
    `INSERT INTO fin_holding_values (holding_id, as_of, value_minor, base_value_minor)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (holding_id, as_of)
     DO UPDATE SET value_minor = EXCLUDED.value_minor,
                   base_value_minor = EXCLUDED.base_value_minor`,
    [id, asOf, minor, baseMinor]
  );
}

financeRouter.post(
  "/holdings",
  ah(async (req, res) => {
    const parsed = holdingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Fill in what it is, what it is worth, and the date that figure is for.",
      });
    }
    const b = parsed.data;
    const currency = (b.currency || config.finance.baseCurrency).toUpperCase();
    const entity = b.entity || DEFAULT_ENTITY;
    const minor = toMinor(b.value, currency);
    const fx = await convertToBase(minor, currency, b.asOf);
    const costMinor = b.cost == null ? null : toMinor(b.cost, currency);
    const costFx = costMinor == null ? null : await convertToBase(costMinor, currency, b.asOf);
    const r = await run(
      `INSERT INTO fin_holdings
         (entity, side, name, kind, currency, value_minor, base_value_minor,
          cost_minor, base_cost_minor, rate_pct, monthly_payment_minor, as_of, note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      [entity, b.side, b.name, b.kind || "other", currency, minor, fx.baseAmountMinor,
       costMinor, costFx?.baseAmountMinor ?? null,
       b.ratePct ?? null,
       b.monthlyPayment == null ? null : toMinor(b.monthlyPayment, currency),
       b.asOf, b.note ?? null]
    );
    const id = lastId(r);
    if (!id) return res.status(500).json({ error: "Could not save that." });
    await writeValue(id, b.asOf, minor, fx.baseAmountMinor);
    res.status(201).json({ id });
  })
);

financeRouter.patch(
  "/holdings/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Bad id." });
    const parsed = holdingSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Nothing valid to change." });
    const existing = await get("SELECT * FROM fin_holdings WHERE id = ?", [id]);
    if (!existing) return res.status(404).json({ error: "That is gone." });
    const b = parsed.data;
    const currency = (b.currency || existing.currency).toUpperCase();
    const asOf = b.asOf || isoDate(existing.as_of);
    const minor = b.value == null ? Number(existing.value_minor) : toMinor(b.value, currency);
    const fx = await convertToBase(minor, currency, asOf);
    const costMinor = b.cost === undefined
      ? (existing.cost_minor == null ? null : Number(existing.cost_minor))
      : (b.cost == null ? null : toMinor(b.cost, currency));
    const costFx = costMinor == null ? null : await convertToBase(costMinor, currency, asOf);
    await run(
      `UPDATE fin_holdings
          SET side = ?, name = ?, kind = ?, currency = ?, value_minor = ?,
              base_value_minor = ?, cost_minor = ?, base_cost_minor = ?,
              rate_pct = ?, monthly_payment_minor = ?, as_of = ?, note = ?,
              updated_at = now()
        WHERE id = ?`,
      [b.side || existing.side, b.name ?? existing.name, b.kind || existing.kind,
       currency, minor, fx.baseAmountMinor, costMinor, costFx?.baseAmountMinor ?? null,
       b.ratePct === undefined ? existing.rate_pct : b.ratePct,
       b.monthlyPayment === undefined
         ? existing.monthly_payment_minor
         : (b.monthlyPayment == null ? null : toMinor(b.monthlyPayment, currency)),
       asOf, b.note === undefined ? existing.note : b.note, id]
    );
    await writeValue(id, asOf, minor, fx.baseAmountMinor);
    res.json({ ok: true });
  })
);

financeRouter.delete(
  "/holdings/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Bad id." });
    await run("DELETE FROM fin_holdings WHERE id = ?", [id]);
    res.json({ ok: true });
  })
);

// ── What you are saving toward ───────────────────────────────
financeRouter.get(
  "/goals",
  ah(async (req, res) => {
    const { choice, list } = resolveEntities(req.query.entity);
    const byEntity = {};
    for (const ent of list) {
      // What the months have actually been keeping, so "what this asks of a
      // month" has something real to sit beside.
      const t = await trend(4, monthStart(), ent);
      const closed = t.slice(0, 3);
      const saving = closed.length
        ? Math.round(closed.reduce((s, m) => s + (m.revenue - m.expenses), 0) / closed.length)
        : null;
      byEntity[ent] = { label: ENTITY_LABEL[ent], ...(await goals(ent, new Date(), saving)) };
    }
    res.json({ entity: choice, entities: list, byEntity,
               baseCurrency: config.finance.baseCurrency });
  })
);

const goalSchema = z.object({
  entity: entityOnly.optional(),
  name: z.string().trim().min(1).max(140),
  kind: z.enum(["savings", "travel", "home", "education", "custom"]).optional(),
  currency: z.string().trim().length(3).optional(),
  target: z.coerce.number().positive().max(1e12),
  saved: z.coerce.number().min(0).max(1e12).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  note: z.string().trim().max(300).nullish(),
});

financeRouter.post(
  "/goals",
  ah(async (req, res) => {
    const parsed = goalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Give it a name and an amount to reach." });
    }
    const b = parsed.data;
    const currency = (b.currency || config.finance.baseCurrency).toUpperCase();
    const entity = b.entity || DEFAULT_ENTITY;
    const when = b.targetDate || isoDate(new Date());
    const target = toMinor(b.target, currency);
    const saved = toMinor(b.saved ?? 0, currency);
    const tFx = await convertToBase(target, currency, when);
    const sFx = await convertToBase(saved, currency, when);
    const r = await run(
      `INSERT INTO fin_goals
         (entity, name, kind, currency, target_minor, base_target_minor,
          saved_minor, base_saved_minor, target_date, note)
       VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      [entity, b.name, b.kind || "custom", currency, target, tFx.baseAmountMinor,
       saved, sFx.baseAmountMinor, b.targetDate ?? null, b.note ?? null]
    );
    res.status(201).json({ id: lastId(r) });
  })
);

financeRouter.patch(
  "/goals/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Bad id." });
    const parsed = goalSchema.partial()
      .extend({ status: z.enum(["open", "done", "archived"]).optional() })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Nothing valid to change." });
    const existing = await get("SELECT * FROM fin_goals WHERE id = ?", [id]);
    if (!existing) return res.status(404).json({ error: "That goal is gone." });
    const b = parsed.data;
    const currency = (b.currency || existing.currency).toUpperCase();
    const when = b.targetDate || (existing.target_date ? isoDate(existing.target_date) : isoDate(new Date()));
    const target = b.target == null ? Number(existing.target_minor) : toMinor(b.target, currency);
    const saved = b.saved == null ? Number(existing.saved_minor) : toMinor(b.saved, currency);
    const tFx = await convertToBase(target, currency, when);
    const sFx = await convertToBase(saved, currency, when);
    await run(
      `UPDATE fin_goals
          SET name = ?, kind = ?, currency = ?, target_minor = ?, base_target_minor = ?,
              saved_minor = ?, base_saved_minor = ?, target_date = ?, status = ?,
              note = ?, updated_at = now()
        WHERE id = ?`,
      [b.name ?? existing.name, b.kind || existing.kind, currency,
       target, tFx.baseAmountMinor, saved, sFx.baseAmountMinor,
       b.targetDate === undefined
         ? (existing.target_date ? isoDate(existing.target_date) : null)
         : b.targetDate,
       b.status || existing.status,
       b.note === undefined ? existing.note : b.note, id]
    );
    res.json({ ok: true });
  })
);

financeRouter.delete(
  "/goals/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Bad id." });
    await run("DELETE FROM fin_goals WHERE id = ?", [id]);
    res.json({ ok: true });
  })
);

// ── Reports ──────────────────────────────────────────────────
// Nothing new is measured here: every figure is one another page already
// shows, arranged so a run of months can be read at once.
financeRouter.get(
  "/reports",
  ah(async (req, res) => {
    const period = periodParam.safeParse(req.query.period).success
      ? req.query.period : monthStart();
    const months = Math.min(24, Math.max(3, Number(req.query.months) || 6));
    const { choice, list } = resolveEntities(req.query.entity);
    const byEntity = {};
    for (const ent of list) {
      // The sentences this page writes carry money in them, so they need the
      // currency the rest of the page is in — a bare number in a sentence
      // reads as a count.
      const money = (v) =>
        `${config.finance.baseCurrency} ${Math.round(v / 100).toLocaleString()}`;
      byEntity[ent] = {
        label: ENTITY_LABEL[ent],
        ...(await reports(ent, period, months, new Date(), money)),
      };
    }
    res.json({ entity: choice, entities: list, period, months, byEntity,
               baseCurrency: config.finance.baseCurrency });
  })
);

// ── Profit and loss ──────────────────────────────────────────
// The statement, the plan beside it, twelve months of trend, and what the
// two together say. `months` folds the periods: 1 for the month, 3 for the
// quarter, and however many have elapsed for year to date.
financeRouter.get(
  "/pl",
  ah(async (req, res) => {
    const period = periodParam.safeParse(req.query.period).success
      ? req.query.period : monthStart();
    const span = ["month", "quarter", "ytd"].includes(req.query.span)
      ? req.query.span : "month";
    const months = span === "month" ? 1
      : span === "quarter" ? 3
      : Number(period.slice(5, 7));
    const compare = periodParam.safeParse(req.query.compare).success
      ? req.query.compare
      : isoDate(new Date(Date.UTC(+period.slice(0, 4), +period.slice(5, 7) - 2, 1)));

    const { choice, list } = resolveEntities(req.query.entity);
    const byEntity = {};
    for (const ent of list) {
      const [st, before, trend, revenueMix, expenseMix] = await Promise.all([
        plStatement(ent, period, months),
        plStatement(ent, compare, months),
        plTrend(ent, period, 12),
        categoryBreakdown(period, ent),
        categoryBreakdown(period, ent),
      ]);
      const money = (v) => `${config.finance.baseCurrency} ${(v / 100).toLocaleString()}`;
      byEntity[ent] = {
        entity: ent, label: ENTITY_LABEL[ent], span, compare,
        statement: st,
        previous: before,
        trend,
        variances: topVariances(st),
        insights: plInsights(st, before, trend, money),
        revenueMix: revenueMix
          .filter((r) => r.kind === "revenue" && r.direction === "in")
          .map((r) => ({ name: r.name, total: r.amount })),
        expenseMix: groupSpend(
          expenseMix
            .filter((r) => ["cogs", "opex", "tax"].includes(r.kind) && r.direction === "out")
            .map((r) => ({ name: r.name, group: r.group, total: r.amount, count: r.count }))
        ),
      };
    }
    res.json({ entity: choice, entities: list, period, span, compare, byEntity,
               baseCurrency: config.finance.baseCurrency });
  })
);

// ── The overview ─────────────────────────────────────────────
financeRouter.get(
  "/dashboard",
  ah(async (req, res) => {
    const { choice, list } = resolveEntities(req.query.entity);
    // The month picker reaches the overview too: a month still ahead is
    // answered from what is committed, a month behind from what it recorded.
    const period = periodParam.safeParse(req.query.period).success
      ? req.query.period
      : monthStart();
    const byEntity = {};
    for (const ent of list) {
      byEntity[ent] = {
        label: ENTITY_LABEL[ent],
        ...(await overviewDashboard(ent, new Date(), period)),
      };
    }
    res.json({
      entity: choice, entities: list, period, byEntity,
      baseCurrency: config.finance.baseCurrency,
    });
  })
);

// ── Re-read a contract already on file ───────────────────────
// The document is already stored, so this needs no upload: it reads the bytes
// again and rebuilds the schedule from them. The reason it exists is that an
// extraction improved after a contract was first read leaves a bad schedule
// behind, and the dedup key makes re-uploading a no-op.
financeRouter.post(
  "/documents/:id/reread",
  aiLimiter,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Bad id." });
    const doc = await get(
      "SELECT id, filename, mime, data FROM fin_documents WHERE id = ?", [id]
    );
    if (!doc?.data) return res.status(404).json({ error: "That document is gone." });

    const kindParsed = z.enum(["expense", "revenue", "contract"])
      .safeParse(req.body?.kind);
    try {
      const result = await ingestDocument({
        filename: doc.filename, mime: doc.mime,
        buffer: Buffer.from(doc.data, "base64"),
        source: "upload", replace: true,
        kind: kindParsed.success ? kindParsed.data : "contract",
        entityHint: entityOnly.safeParse(req.body?.entityHint).success
          ? req.body.entityHint : undefined,
      });
      res.json(result);
    } catch (err) {
      if (err.code === "AI_DISABLED") return res.status(503).json({ error: err.message });
      if (err.code === "ANTHROPIC_ERROR") {
        return res.status(502).json({ error: "Claude could not read that document again." });
      }
      throw err;
    }
  })
);
