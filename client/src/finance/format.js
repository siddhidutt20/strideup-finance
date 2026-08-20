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
    return {
      currency,
      round: (minor) => round.format(majorOf(minor, currency)),
      exact: (minor) => exact.format(majorOf(minor, currency)),
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
