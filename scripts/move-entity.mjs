// Move one set of books between instances, from the command line. The same
// three operations are in the app under Import & close, which is where to do
// this without a terminal; this exists for a bulk move or a scripted one.
//
//   node scripts/move-entity.mjs export personal books.json
//   node scripts/move-entity.mjs import books.json          (against the NEW instance)
//   node scripts/move-entity.mjs purge personal --yes-delete (against the OLD instance)
import fs from "node:fs/promises";
import { ensureReady } from "../server/src/db.js";
import { exportEntity, importAll, purgeEntity } from "../server/src/finance/transfer.js";

await ensureReady();
const [, , cmd, arg, flag] = process.argv;

try {
  if (cmd === "export") {
    if (!arg || !process.argv[4]) throw new Error("usage: export <entity> <file.json>");
    const out = await exportEntity(arg);
    await fs.writeFile(process.argv[4], JSON.stringify(out, null, 1));
    const counts = Object.entries(out).filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => `${v.length} ${k}`).join(", ");
    console.log(`Exported ${arg}: ${counts}`);
    console.log(`Written to ${process.argv[4]}`);
  } else if (cmd === "import") {
    if (!arg) throw new Error("usage: import <file.json>");
    const r = await importAll(JSON.parse(await fs.readFile(arg, "utf8")));
    const counts = Object.entries(r.added).map(([k, v]) => `${v} ${k}`).join(", ") || "nothing new";
    console.log(`Imported into ${r.entity}: ${counts}`);
    console.log("Rows already present were left alone — this is safe to run twice.");
  } else if (cmd === "purge") {
    if (flag !== "--yes-delete") {
      console.error(
        `Refusing to delete.\n\n` +
        `This removes every ${arg} row from THIS database: entries,\n` +
        `commitments and their payments, documents, invoices, budgets and\n` +
        `closed-period records. It cannot be undone from inside the app.\n\n` +
        `Export first, import into the new instance, open it and check the\n` +
        `figures. Only then run:\n\n` +
        `  node scripts/move-entity.mjs purge ${arg} --yes-delete\n`);
      process.exit(1);
    }
    const r = await purgeEntity(arg, true);
    console.log("Removed from this database: " +
      Object.entries(r.removed).filter(([, n]) => n).map(([t, n]) => `${n} ${t}`).join(", "));
  } else {
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
