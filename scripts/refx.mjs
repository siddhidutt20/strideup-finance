// Re-convert amounts that were stored at face value.
//
// Before the peg table, a currency the rate feed could not price — AED, SAR
// and the other pegged ones — fell through to "counted at face value", and
// 15,000 dirhams were filed as 15,000 dollars. This finds those rows and
// re-prices them at the rate that should have applied on the day.
//
// It prints and changes nothing unless you pass --apply. Closed months are
// skipped unless you also pass --include-closed, because a closed month is
// meant to stay as it was read: the usual answer for one of those is a
// correcting entry in the open month, not a rewrite of settled history.

import { get, all, run } from "../server/src/db.js";
import { config } from "../server/src/config.js";
import { getRate } from "../server/src/finance/fx.js";
import { toMinor, fromMinor } from "../server/src/finance/extract.js";

const APPLY = process.argv.includes("--apply");
const CLOSED = process.argv.includes("--include-closed");
const base = config.finance.baseCurrency;
// pglite hands dates back as Date objects; a ledger line wants 2026-09-05.
const D = (d) => new Date(d).toISOString().slice(0, 10);
const M = (v, c = base) => `${c} ${(fromMinor(v, c)).toLocaleString(undefined,
  { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// A foreign row whose converted figure is identical to its face value never
// had a rate applied. A genuine rate of exactly 1.00000000 does not happen
// between two different currencies.
const suspect = await all(
  `SELECT e.id, e.entry_date, e.currency, e.amount_minor, e.base_amount_minor,
          e.description, e.period, e.entity, p.status AS period_status
     FROM fin_entries e
     LEFT JOIN fin_periods p ON p.period = e.period AND p.entity = e.entity
    WHERE e.currency <> $1 AND e.base_amount_minor = e.amount_minor
    ORDER BY e.entry_date`,
  [base]
);

if (!suspect.length) {
  console.log(`\n  Nothing to repair — every foreign amount already carries a rate.\n`);
  process.exit(0);
}

console.log(`\n  ${suspect.length} amount(s) stored at face value:\n`);
let fixed = 0, skipped = 0, unpriced = 0;

for (const e of suspect) {
  const closed = e.period_status === "closed";
  const rate = await getRate(e.currency, base, e.entry_date);

  if (!rate) {
    unpriced++;
    console.log(`  ?  ${D(e.entry_date)}  ${M(e.amount_minor, e.currency).padEnd(20)}` +
                `  still no rate for ${e.currency}  — ${e.description}`);
    continue;
  }

  const corrected = toMinor(fromMinor(e.amount_minor, e.currency) * rate, base);
  const line = `${D(e.entry_date)}  ${M(e.amount_minor, e.currency).padEnd(20)}` +
               `  ${M(e.base_amount_minor)} → ${M(corrected)}`.padEnd(34) +
               `  — ${e.description}`;

  if (closed && !CLOSED) {
    skipped++;
    console.log(`  ·  ${line}   [${D(e.period)} is closed — skipped]`);
    continue;
  }

  if (APPLY) {
    await run(
      `UPDATE fin_entries SET fx_rate = $1, base_amount_minor = $2 WHERE id = $3`,
      [rate, corrected, e.id]
    );
  }
  fixed++;
  console.log(`  ${APPLY ? "✓" : "→"}  ${line}${closed ? `   [${D(e.period)} was closed]` : ""}`);
}

console.log(
  `\n  ${APPLY ? "Repaired" : "Would repair"} ${fixed}` +
  (skipped ? `, skipped ${skipped} in closed months` : "") +
  (unpriced ? `, ${unpriced} still unpriced` : "") +
  (APPLY ? "." : ".  Nothing was changed — add --apply to write.") + "\n"
);
process.exit(0);
