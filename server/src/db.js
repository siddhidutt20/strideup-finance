import fs from "node:fs";
import bcrypt from "bcryptjs";
import { config } from "./config.js";
import { FIN_SCHEMA, FIN_CATEGORIES, FIN_MIGRATIONS } from "./finance/schema.js";

// Neon Postgres in production; a zero-setup embedded Postgres (pglite) for
// local development. Both speak real Postgres, so the SQL is identical.
// Helpers take "?" placeholders and convert to Postgres "$1, $2 …".

let queryFnPromise;
async function getQueryFn() {
  if (!queryFnPromise) {
    queryFnPromise = (async () => {
      if (config.hasDatabase) {
        const { neon } = await import("@neondatabase/serverless");
        const sql = neon(config.databaseUrl, { fullResults: true });
        return (text, args) => sql(text, args);
      }
      const pkg = "@electric-sql/pglite";
      fs.mkdirSync(config.pgliteDir, { recursive: true });
      const { PGlite } = await import(pkg);
      const db = new PGlite(config.pgliteDir);
      await db.waitReady;
      return (text, args) => db.query(text, args);
    })();
  }
  return queryFnPromise;
}

function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function run(sql, args = []) {
  const q = await getQueryFn();
  return q(toPg(sql), args);
}
export async function get(sql, args = []) {
  return (await run(sql, args)).rows[0] ?? null;
}
export async function all(sql, args = []) {
  return (await run(sql, args)).rows;
}
export function lastId(rs) {
  return rs.rows?.[0]?.id != null ? Number(rs.rows[0].id) : null;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS owners (
     id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     email         text NOT NULL UNIQUE,
     name          text NOT NULL,
     password_hash text NOT NULL,
     created_at    timestamptz NOT NULL DEFAULT now(),
     last_login_at timestamptz
   )`,
];

// Added after the fact, so they are separate and individually skippable — a
// fresh database already has everything below and each one is a no-op there.
const OWNER_MIGRATIONS = [
  // A picture, stored the same way documents are: base64 in a text column,
  // served back as bytes. Small enough that a table of its own would be
  // ceremony — there is one owner.
  `ALTER TABLE owners ADD COLUMN IF NOT EXISTS avatar_mime text`,
  `ALTER TABLE owners ADD COLUMN IF NOT EXISTS avatar_data text`,
  `ALTER TABLE owners ADD COLUMN IF NOT EXISTS avatar_updated_at timestamptz`,
  // Set the first time the owner edits their own name. Until then the seed
  // owns the name; afterwards it does not, or every redeploy would quietly
  // undo what you typed.
  `ALTER TABLE owners ADD COLUMN IF NOT EXISTS name_set_at timestamptz`,
];

let readyPromise;
export function ensureReady() {
  if (!readyPromise) readyPromise = initialise();
  return readyPromise;
}

async function initialise() {
  const q = await getQueryFn();
  for (const stmt of SCHEMA) await q(stmt, []);
  for (const stmt of FIN_SCHEMA) await q(stmt, []);
  // Migrations are independent and idempotent: a fresh database already has
  // everything they add, so each one is expected to be a no-op there.
  for (const stmt of [...OWNER_MIGRATIONS, ...FIN_MIGRATIONS]) {
    try {
      await q(stmt, []);
    } catch (err) {
      console.warn(`[db] migration skipped: ${String(err.message).slice(0, 120)}`);
    }
  }
  await seedOwner();
  await seedCategories();
}

// Idempotent. Changing OWNER_PASSWORD and redeploying resets the password,
// which is the recovery path when it is forgotten.
export async function seedOwner() {
  if (!config.owner.password) {
    console.warn("[db] No OWNER_PASSWORD set — skipping owner seed.");
    return;
  }
  const hash = bcrypt.hashSync(config.owner.password, 12);
  const existing = await get(
    "SELECT id, name_set_at FROM owners WHERE email = ?", [config.owner.email]
  );
  if (existing) {
    // Resetting the password on every boot is the documented way back in when
    // it is forgotten. Resetting the name is not: once you have set your own,
    // OWNER_NAME stops speaking for you, or a redeploy would rename you back.
    if (existing.name_set_at) {
      await run("UPDATE owners SET password_hash = ? WHERE id = ?", [hash, existing.id]);
    } else {
      await run("UPDATE owners SET password_hash = ?, name = ? WHERE id = ?", [
        hash, config.owner.name, existing.id,
      ]);
    }
    return;
  }
  await run("INSERT INTO owners (email, name, password_hash) VALUES (?, ?, ?)", [
    config.owner.email, config.owner.name, hash,
  ]);
  console.log(`[db] Seeded owner account: ${config.owner.email}`);
}

async function seedCategories() {
  for (const [name, kind, pnlLine, sort, entity, spendGroup] of FIN_CATEGORIES) {
    await run(
      `INSERT INTO fin_categories (name, kind, pnl_line, sort, entity, spend_group)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (name) DO UPDATE SET
         kind = EXCLUDED.kind, pnl_line = EXCLUDED.pnl_line,
         sort = EXCLUDED.sort, entity = EXCLUDED.entity,
         spend_group = EXCLUDED.spend_group`,
      [name, kind, pnlLine, sort, entity || "strideup", spendGroup ?? null]
    );
  }
}
