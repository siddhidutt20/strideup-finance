// Move one set of books out of an instance and into another.
//
//   node scripts/move-entity.mjs export personal books.json
//   node scripts/move-entity.mjs import books.json          (against the NEW instance)
//   node scripts/move-entity.mjs purge personal --yes-delete (against the OLD instance)
//
// Each step is separate and each one is survivable on its own: export reads
// and writes nothing, import only inserts, and purge is the only destructive
// step — it refuses to run without an explicit flag, and it should not be run
// until the new instance has been checked.
//
// Identifiers are not carried across. A document is matched by its content
// hash, a counterparty and a category by name, a commitment by its dedup key —
// the same keys the app already treats as identity, so importing the same file
// twice adds nothing the second time.
import { all, get, run, lastId, ensureReady } from "../server/src/db.js";
import { isoDate } from "../server/src/util.js";

// The schema and the chart of accounts, so importing into a brand-new
// instance works before it has ever been started.
await ensureReady();

const [, , cmd, arg, flag] = process.argv;
const fs = await import("node:fs/promises");

const TABLES_BY_ENTITY = [
  "fin_documents", "fin_entries", "fin_commitments", "fin_invoices",
  "fin_budgets", "fin_periods", "fin_bank_txns",
];

async function exportEntity(entity, file) {
  if (!entity || !file) throw new Error("usage: export <entity> <file.json>");
  const out = { entity, exportedAt: new Date().toISOString(), version: 1 };

  out.documents = await all(
    `SELECT id, source, external_id, filename, mime, byte_size, content_hash,
            data, payload, received_at, parsed_at, parse_error
       FROM fin_documents WHERE entity = ?`, [entity]);

  out.counterparties = await all(
    `SELECT DISTINCT p.name, p.kind, c.name AS default_category
       FROM fin_counterparties p
       LEFT JOIN fin_categories c ON c.id = p.default_category_id
      WHERE p.id IN (SELECT counterparty_id FROM fin_entries WHERE entity = ?
                     UNION SELECT counterparty_id FROM fin_commitments WHERE entity = ?)`,
    [entity, entity]);

  out.entries = await all(
    `SELECT e.entry_date, e.direction, e.amount_minor, e.currency, e.fx_rate,
            e.base_amount_minor, e.description, e.reference, e.dedup_key,
            e.confidence, e.review_status, e.review_reason, e.period,
            c.name AS category, p.name AS counterparty, d.content_hash AS document_hash
       FROM fin_entries e
       LEFT JOIN fin_categories c ON c.id = e.category_id
       LEFT JOIN fin_counterparties p ON p.id = e.counterparty_id
       LEFT JOIN fin_documents d ON d.id = e.document_id
      WHERE e.entity = ?`, [entity]);

  out.commitments = await all(
    `SELECT k.direction, k.description, k.amount_minor, k.currency, k.fx_rate,
            k.base_amount_minor, k.frequency, k.day_of_month, k.start_date,
            k.end_date, k.status, k.source, k.confidence, k.review_status,
            k.review_reason, k.dedup_key,
            c.name AS category, p.name AS counterparty, d.content_hash AS document_hash
       FROM fin_commitments k
       LEFT JOIN fin_categories c ON c.id = k.category_id
       LEFT JOIN fin_counterparties p ON p.id = k.counterparty_id
       LEFT JOIN fin_documents d ON d.id = k.document_id
      WHERE k.entity = ?`, [entity]);

  out.payments = await all(
    `SELECT k.dedup_key AS commitment_key, m.due_date, m.paid_date, m.status,
            m.amount_minor, m.base_amount_minor, m.matched_by, m.note
       FROM fin_commitment_payments m
       JOIN fin_commitments k ON k.id = m.commitment_id
      WHERE k.entity = ?`, [entity]);

  out.invoices = await all(
    `SELECT source, external_id, customer, issue_date, due_date, amount_minor,
            paid_minor, currency, status, url
       FROM fin_invoices WHERE entity = ?`, [entity]);

  out.budgets = await all(
    `SELECT b.period, b.amount_minor, b.note, c.name AS category
       FROM fin_budgets b JOIN fin_categories c ON c.id = b.category_id
      WHERE b.entity = ?`, [entity]);

  out.periods = await all(
    `SELECT period, status, closed_at FROM fin_periods WHERE entity = ?`, [entity]);

  await fs.writeFile(file, JSON.stringify(out, null, 1));
  const counts = Object.entries(out)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => `${v.length} ${k}`).join(", ");
  console.log(`Exported ${entity}: ${counts}`);
  console.log(`Written to ${file}`);
}

const catId = async (name) =>
  name ? (await get("SELECT id FROM fin_categories WHERE name = ?", [name]))?.id ?? null : null;

async function partyId(name, kind) {
  if (!name) return null;
  const found = await get("SELECT id FROM fin_counterparties WHERE lower(name) = lower(?)", [name]);
  if (found) return found.id;
  const rs = await run(
    "INSERT INTO fin_counterparties (name, kind) VALUES (?,?) RETURNING id",
    [name, kind || "supplier"]);
  return lastId(rs);
}

async function importAll(file) {
  if (!file) throw new Error("usage: import <file.json>");
  const data = JSON.parse(await fs.readFile(file, "utf8"));
  const entity = data.entity;
  const tally = {};
  const bump = (k) => { tally[k] = (tally[k] ?? 0) + 1; };

  // Documents first: everything else points at one by content hash.
  const docByHash = new Map();
  for (const d of data.documents ?? []) {
    const found = await get(
      "SELECT id FROM fin_documents WHERE source = ? AND content_hash = ?",
      [d.source, d.content_hash]);
    if (found) { docByHash.set(d.content_hash, found.id); continue; }
    const rs = await run(
      `INSERT INTO fin_documents
         (source, external_id, filename, mime, byte_size, content_hash, data,
          payload, received_at, parsed_at, parse_error, entity)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      [d.source, d.external_id, d.filename, d.mime, d.byte_size, d.content_hash,
       d.data, d.payload ?? "{}", d.received_at, d.parsed_at, d.parse_error, entity]);
    docByHash.set(d.content_hash, lastId(rs));
    bump("documents");
  }

  for (const p of data.counterparties ?? []) {
    await partyId(p.name, p.kind);
  }

  for (const e of data.entries ?? []) {
    const rs = await run(
      `INSERT INTO fin_entries
         (entry_date, direction, amount_minor, currency, fx_rate, base_amount_minor,
          counterparty_id, category_id, description, reference, document_id,
          dedup_key, confidence, review_status, review_reason, period, entity)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT (dedup_key) DO NOTHING RETURNING id`,
      [isoDate(e.entry_date), e.direction, e.amount_minor, e.currency, e.fx_rate,
       e.base_amount_minor, await partyId(e.counterparty), await catId(e.category),
       e.description, e.reference, docByHash.get(e.document_hash) ?? null,
       e.dedup_key, e.confidence, e.review_status, e.review_reason,
       isoDate(e.period), entity]);
    if (lastId(rs) != null) bump("entries");
  }

  const commitByKey = new Map();
  for (const k of data.commitments ?? []) {
    const existing = await get("SELECT id FROM fin_commitments WHERE dedup_key = ?", [k.dedup_key]);
    if (existing) { commitByKey.set(k.dedup_key, existing.id); continue; }
    const rs = await run(
      `INSERT INTO fin_commitments
         (entity, direction, description, counterparty_id, category_id,
          amount_minor, currency, fx_rate, base_amount_minor, frequency,
          day_of_month, start_date, end_date, status, source, document_id,
          confidence, review_status, review_reason, dedup_key)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      [entity, k.direction, k.description, await partyId(k.counterparty),
       await catId(k.category), k.amount_minor, k.currency, k.fx_rate,
       k.base_amount_minor, k.frequency, k.day_of_month, isoDate(k.start_date),
       k.end_date ? isoDate(k.end_date) : null, k.status, k.source,
       docByHash.get(k.document_hash) ?? null, k.confidence, k.review_status,
       k.review_reason, k.dedup_key]);
    commitByKey.set(k.dedup_key, lastId(rs));
    bump("commitments");
  }

  for (const m of data.payments ?? []) {
    const id = commitByKey.get(m.commitment_key);
    if (id == null) continue;
    const rs = await run(
      `INSERT INTO fin_commitment_payments
         (commitment_id, due_date, paid_date, status, amount_minor,
          base_amount_minor, matched_by, note)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT (commitment_id, due_date) DO NOTHING RETURNING id`,
      [id, isoDate(m.due_date), m.paid_date ? isoDate(m.paid_date) : null,
       m.status, m.amount_minor, m.base_amount_minor, m.matched_by, m.note]);
    if (lastId(rs) != null) bump("payments");
  }

  for (const v of data.invoices ?? []) {
    const rs = await run(
      `INSERT INTO fin_invoices
         (source, external_id, customer, issue_date, due_date, amount_minor,
          paid_minor, currency, status, entity, url)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT (source, external_id) DO NOTHING RETURNING id`,
      [v.source, v.external_id, v.customer, isoDate(v.issue_date),
       v.due_date ? isoDate(v.due_date) : null, v.amount_minor, v.paid_minor,
       v.currency, v.status, entity, v.url]);
    if (lastId(rs) != null) bump("invoices");
  }

  for (const b of data.budgets ?? []) {
    const cid = await catId(b.category);
    if (cid == null) continue;
    await run(
      `INSERT INTO fin_budgets (entity, period, category_id, amount_minor, note)
       VALUES (?,?,?,?,?)
       ON CONFLICT (entity, period, category_id) DO UPDATE
         SET amount_minor = EXCLUDED.amount_minor`,
      [entity, isoDate(b.period), cid, b.amount_minor, b.note]);
    bump("budgets");
  }

  for (const p of data.periods ?? []) {
    await run(
      `INSERT INTO fin_periods (period, status, closed_at, entity)
       VALUES (?,?,?,?) ON CONFLICT (period, entity) DO NOTHING`,
      [isoDate(p.period), p.status, p.closed_at, entity]);
    bump("periods");
  }

  const counts = Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(", ") || "nothing new";
  console.log(`Imported into ${entity}: ${counts}`);
  console.log("Rows already present were left alone — this is safe to run twice.");
}

async function purge(entity, confirm) {
  if (!entity) throw new Error("usage: purge <entity> --yes-delete");
  if (confirm !== "--yes-delete") {
    console.error(
      `Refusing to delete.\n\n` +
      `This removes every ${entity} row from THIS database: entries,\n` +
      `commitments and their payments, documents, invoices, budgets and\n` +
      `closed-period records. It cannot be undone from inside the app.\n\n` +
      `Export first, import into the new instance, open it and check the\n` +
      `figures. Only then run:\n\n` +
      `  node scripts/move-entity.mjs purge ${entity} --yes-delete\n`);
    process.exit(1);
  }
  const before = {};
  for (const t of TABLES_BY_ENTITY) {
    before[t] = Number((await get(`SELECT COUNT(*) AS n FROM ${t} WHERE entity = ?`, [entity]))?.n ?? 0);
  }
  // Payments cascade with their commitment; entries pointing at a document
  // being removed have their link cleared rather than being deleted, because
  // an entry is a fact about money and the document is only its evidence.
  await run(
    `UPDATE fin_entries SET document_id = NULL
      WHERE document_id IN (SELECT id FROM fin_documents WHERE entity = ?)`, [entity]);
  for (const t of ["fin_entries", "fin_commitments", "fin_invoices", "fin_budgets",
                   "fin_periods", "fin_bank_txns", "fin_documents"]) {
    await run(`DELETE FROM ${t} WHERE entity = ?`, [entity]);
  }
  console.log(`Removed from this database: ` +
    Object.entries(before).filter(([, n]) => n).map(([t, n]) => `${n} ${t}`).join(", "));
}

try {
  if (cmd === "export") await exportEntity(arg, process.argv[4]);
  else if (cmd === "import") await importAll(arg);
  else if (cmd === "purge") await purge(arg, flag);
  else {
    console.log("usage:\n" +
      "  node scripts/move-entity.mjs export <entity> <file.json>\n" +
      "  node scripts/move-entity.mjs import <file.json>\n" +
      "  node scripts/move-entity.mjs purge  <entity> --yes-delete");
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
