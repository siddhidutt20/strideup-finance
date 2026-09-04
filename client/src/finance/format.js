import { useMemo } from "react";

export const MONTHS = ["January","February","March","April","May","June","July",
  "August","September","October","November","December"];

export const thisMonth = () => `${new Date().toISOString().slice(0, 7)}-01`;
export const today = () => new Date().toISOString().slice(0, 10);

export const shiftMonth = (period, n) => {
  const [y, m] = period.split("-").map(Number);
  return `${new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)}-01`;
};

export const monthLabel = (p, short = false) => {
  const [y, m] = p.split("-").map(Number);
  return `${short ? MONTHS[m - 1].slice(0, 3) : MONTHS[m - 1]} ${y}`;
};

// Currencies without minor units — 1000 JPY is 1000, not 100000.
export const ZERO_DECIMAL = new Set(["JPY","KRW","VND","CLP","ISK","XAF","XOF"]);
export const CURRENCIES = ["USD","EUR","GBP","INR","AUD","CAD","SGD","AED","CHF","JPY"];

export const majorOf = (minor, currency) =>
  Number(minor || 0) / (ZERO_DECIMAL.has(currency) ? 1 : 100);

// Format an amount in its own currency, not the dashboard's.
export function fmtAmount(currency, minor) {
  const major = majorOf(minor, currency);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency", currency,
      minimumFractionDigits: ZERO_DECIMAL.has(currency) ? 0 : 2,
    }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}

export function useMoney(currency) {
  return useMemo(() => {
    const opts = { style: "currency", currency };
    const round = new Intl.NumberFormat(undefined, { ...opts, maximumFractionDigits: 0 });
    const exact = new Intl.NumberFormat(undefined, { ...opts, minimumFractionDigits: 2 });
    // Axis labels have to fit in a gutter, so $16,399 becomes $16K. Only ever
    // used where the exact figure is one hover away.
    const compact = new Intl.NumberFormat(undefined, {
      ...opts, notation: "compact", maximumFractionDigits: 1,
    });
    return {
      currency,
      round: (minor) => round.format(majorOf(minor, currency)),
      exact: (minor) => exact.format(majorOf(minor, currency)),
      compact: (minor) => compact.format(majorOf(minor, currency)),
    };
  }, [currency]);
}

export const delta = (now, before) =>
  before ? ((now - before) / Math.abs(before)) * 100 : null;

export const readFile = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("Could not read that file."));
    r.readAsDataURL(file);
  });

// ── Entities ─────────────────────────────────────────────────
// Labels for the two sets of books. A deployment that keeps only one of them
// says so, and the switcher never appears — there is nothing to switch to,
// because this instance's database holds nothing else.
export const ENTITY_LABEL = { strideup: "StrideUp", personal: "Personal", both: "Both" };
export const ENTITY_CHOICES = ["strideup", "personal", "both"];

// Money coming in is revenue to a business and income to a household. Same
// arithmetic, different word, and the wrong word makes a personal app read
// like a company's.
export const moneyInLabel = (books) =>
  (books ?? []).length === 1 && books[0].id === "personal" ? "Income" : "Revenue";

// The pages an instance shows. A household has no profit and loss statement
// and no revenue import to run, so a personal-only instance does not carry
// them — and the books transfer moves onto the Ledger rather than vanishing
// with the page that held it.
export function viewsFor(views, books) {
  const personalOnly = (books ?? []).length === 1 && books[0].id === "personal";
  if (!personalOnly) return views;
  return views
    .filter(([id]) => !["pnl", "tools"].includes(id))
    .map((v) =>
      v[0] === "revenue" ? [v[0], "Income", "Income", "Where the money came from in"]
      : v[0] === "overview" ? [v[0], v[1], v[2], "How your money is doing in"]
      : v);
}

// What this instance actually offers, given the books the server says it
// keeps. One set of books means one choice and no switcher.
export function entityChoices(books) {
  const list = (books ?? []).map((b) => b.id).filter(Boolean);
  if (!list.length) return ENTITY_CHOICES;
  return list.length === 1 ? list : [...list, "both"];
}

// Remembered between visits — you almost always want the same books you had
// open last time.
const ENTITY_KEY = "sf.entity";
export function loadEntity() {
  try {
    const v = localStorage.getItem(ENTITY_KEY);
    return ENTITY_CHOICES.includes(v) ? v : "strideup";
  } catch {
    return "strideup";
  }
}
export function saveEntity(v) {
  try { localStorage.setItem(ENTITY_KEY, v); } catch { /* private window */ }
}

// The five headings company money is read under, in the order they are shown.
// A lens over the chart of accounts, not a replacement: the entry keeps the
// category it was coded to, and the P&L keeps cost of sales apart from
// operating spend. Kept in step with FIN_CATEGORIES on the server.
export const SPEND_GROUPS = ["Payroll", "Tech", "Marketing", "Operations", "G&A"];
