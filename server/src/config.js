import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const isProd = process.env.NODE_ENV === "production";
const isServerless = !!(process.env.VERCEL || process.env.AWS_REGION);
const rawSecret = process.env.SESSION_SECRET || "";
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

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
    "No database connection found — add the Neon Postgres integration in Vercel (Storage → Create Database → Neon). It sets DATABASE_URL automatically."
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
  },

  sessionMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
};

if (configErrors.length) {
  console.error("[config] Not fully configured:\n  - " + configErrors.join("\n  - "));
}
