import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const isProd = process.env.NODE_ENV === "production";
const isServerless = !!(process.env.VERCEL || process.env.AWS_REGION);
const rawSecret = process.env.SESSION_SECRET || "";
// Vercel's storage integrations name the connection string differently
// depending on the integration and on any custom prefix chosen in the connect
// dialog — DATABASE_URL, POSTGRES_URL, STORAGE_URL and others all occur. Try
// the known names, then fall back to any variable that actually holds a
// Postgres URL, so a prefix chosen in the dashboard cannot silently leave the
// app with no database.
function findDatabaseUrl() {
  const named = [
    "DATABASE_URL",
    "POSTGRES_URL",
    "STORAGE_URL",
    "NEON_DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "POSTGRES_URL_NON_POOLING",
  ];
  for (const key of named) {
    if (process.env[key]) return process.env[key];
  }
  const guess = Object.entries(process.env).find(
    ([key, value]) =>
      /^postgres(ql)?:\/\//.test(value || "") && !/PRISMA/i.test(key)
  );
  return guess ? guess[1] : "";
}

const databaseUrl = findDatabaseUrl();

// Collected rather than thrown: a crash at import time on a serverless host
// produces an opaque 500 with no body. The API reports these instead.
const configErrors = [];
if (isProd && rawSecret.length < 32) {
  configErrors.push(
    "SESSION_SECRET is missing or too short — set a random string of at least 32 characters."
  );
}
if (isServerless && !databaseUrl) {
  configErrors.push(
    "No database connection found — add a Postgres database in Vercel (Storage → Create Database → Neon) and connect it to this project. Any of DATABASE_URL, POSTGRES_URL or STORAGE_URL will do."
  );
}
if (isProd && !process.env.OWNER_PASSWORD) {
  configErrors.push("OWNER_PASSWORD is not set — set one so you can sign in.");
}

export const config = {
  isProd,
  isServerless,
  configErrors,
  port: Number(process.env.PORT) || 4100,
  sessionSecret:
    rawSecret ||
    (isProd ? "unconfigured-refuses-requests" : "dev-only-insecure-secret"),
  databaseUrl,
  hasDatabase: !!databaseUrl,
  pgliteDir: path.resolve(__dirname, "../../data/pg"),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5273",

  // One account owns this app. There is no registration — the company's books
  // are not something anyone should be able to sign themselves up for.
  owner: {
    email: (process.env.OWNER_EMAIL || "owner@strideup.org").trim().toLowerCase(),
    password: process.env.OWNER_PASSWORD || (isProd ? "" : "owner-dev-password"),
    name: process.env.OWNER_NAME || "Owner",
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.ANTHROPIC_MODEL || "claude-opus-5",
    baseUrl: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
    enabled: !!process.env.ANTHROPIC_API_KEY,
  },

  finance: {
    baseCurrency: (process.env.FINANCE_BASE_CURRENCY || "USD")
      .trim().toUpperCase().slice(0, 3),
    confidenceFloor: Number(process.env.FINANCE_CONFIDENCE_FLOOR || 0.85),
    // Daily reference rates, keyless and free. {date}, {from} and {to} are
    // substituted. Overridable so the source can be swapped without a code
    // change; a failure here never blocks an import.
    // How the reader tells the two sets of books apart. Tunable without a code
    // change, because only you know what counts as which.
    entityHints: {
      strideup:
        process.env.FINANCE_HINT_STRIDEUP ||
        "StrideUp, the business: coaching and programme delivery, client work, " +
        "software and subscriptions used for work, marketing and advertising, " +
        "contractors and freelancers, business travel, professional fees.",
      personal:
        process.env.FINANCE_HINT_PERSONAL ||
        "Personal finances of the owner: rent or mortgage, housing and utility " +
        "bills, groceries, personal subscriptions and phone, bank loan or EMI " +
        "repayments, insurance, rental income received from property owned personally.",
    },
    fxUrl:
      process.env.FINANCE_FX_URL ||
      "https://api.frankfurter.dev/v1/{date}?base={from}&symbols={to}",
  },

  sessionMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
};

if (configErrors.length) {
  console.error("[config] Not fully configured:\n  - " + configErrors.join("\n  - "));
}
