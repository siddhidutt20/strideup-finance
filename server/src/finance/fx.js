import { get, run } from "../db.js";
import { config } from "../config.js";

// ── Foreign currency ─────────────────────────────────────────
// A document in another currency has to be converted before it can be added
// to a total, or the figure is nonsense — a ₹20,000 invoice is not $20,000.
// Rates are cached per day, so a month of foreign invoices costs one lookup
// and a past month's figures never drift because today's rate moved.
//
// A lookup that fails returns null rather than throwing: the entry is still
// recorded, in its own currency, and flagged for a look. Losing the document
// entirely would be a worse outcome than an unconverted one you can see.

export async function getRate(from, to, date) {
  if (!from || !to || from === to) return 1;

  const cached = await get(
    "SELECT rate FROM fin_fx_rates WHERE rate_date = ? AND base = ? AND quote = ?",
    [date, from, to]
  );
  if (cached) return Number(cached.rate);

  const url = config.finance.fxUrl
    .replace("{date}", encodeURIComponent(date))
    .replace("{from}", encodeURIComponent(from))
    .replace("{to}", encodeURIComponent(to));

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) throw new Error(`rate source returned ${res.status}`);
    const data = await res.json();
    // Tolerate the two shapes these services use: rates keyed by currency, or
    // a bare conversion result.
    const rate = Number(data?.rates?.[to] ?? data?.[to] ?? data?.result);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("no usable rate in response");

    await run(
      `INSERT INTO fin_fx_rates (rate_date, base, quote, rate) VALUES (?, ?, ?, ?)
       ON CONFLICT (rate_date, base, quote) DO NOTHING`,
      [date, from, to, rate]
    );
    return rate;
  } catch (err) {
    console.warn(`[fx] ${from}→${to} on ${date}: ${err.message}`);
    return null;
  }
}
