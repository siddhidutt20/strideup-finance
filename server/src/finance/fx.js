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

// ── Currencies a feed will not quote ─────────────────────────
// The reference feed is ECB data, which covers about thirty floating
// currencies and nothing pegged to the dollar. Ask it for AED and it has no
// answer, the lookup fails, and the amount is counted at face value — which is
// how 15,000 dirhams became 15,000 dollars.
//
// A peg is not a market price to be looked up; it is a number a central bank
// sets and holds. 3.6725 dirhams to the dollar has been the UAE rate since
// 1997. Reading it from a table is more accurate than any daily quote, not
// less, and it works when the network does not.
const PEGGED_TO_USD = {
  AED: 3.6725,  // UAE Central Bank, fixed 1997
  SAR: 3.75,    // Saudi Central Bank, fixed 1986
  QAR: 3.64,    // Qatar Central Bank, fixed 2001
  BHD: 0.376,   // Central Bank of Bahrain, fixed 2001
  OMR: 0.3845,  // Central Bank of Oman, fixed 1986
};

// Both sides priced from the table, so no network is involved at all.
function pegRate(from, to) {
  const f = PEGGED_TO_USD[from];
  const t = PEGGED_TO_USD[to];
  if (f && t) return t / f;          // dirhams to riyals
  if (f && to === "USD") return 1 / f;
  if (t && from === "USD") return t;
  return null;                        // one leg still needs the feed
}

export function isPegged(code) {
  return Object.prototype.hasOwnProperty.call(PEGGED_TO_USD, code);
}

export async function getRate(from, to, date) {
  if (!from || !to || from === to) return 1;

  const pegged = pegRate(from, to);
  if (pegged) return pegged;

  // One pegged leg, one floating: price the peg from the table and the rest
  // from the feed. Neither branch can recurse — by here at most one side is
  // pegged, and the leg passed on is between two currencies that are not.
  if (PEGGED_TO_USD[from]) {
    const onward = await getRate("USD", to, date);
    return onward === null ? null : onward / PEGGED_TO_USD[from];
  }
  if (PEGGED_TO_USD[to]) {
    const incoming = await getRate(from, "USD", date);
    return incoming === null ? null : incoming * PEGGED_TO_USD[to];
  }

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
