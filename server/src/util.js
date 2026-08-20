// Wrap an async route handler so rejected promises reach Express's error
// handler instead of becoming unhandled rejections (Express 4 doesn't
// await handlers itself).
export const ah = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Postgres `date` columns come back as JS Date objects on both drivers.
// Normalise to a plain YYYY-MM-DD string for JSON and CSV output.
export function isoDate(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
