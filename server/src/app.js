import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { ensureReady } from "./db.js";
import { csrfProtect } from "./auth.js";
import { apiLimiter } from "./security.js";
import { authRouter } from "./routes/auth.js";
import { financeRouter } from "./routes/finance.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../client/dist");

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          // Uploaded documents are rendered back for review from the API.
          imgSrc: ["'self'", "data:", "blob:"],
          objectSrc: ["'self'"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // Document uploads and CSV imports carry base64 payloads; everything else
  // is small.
  const smallJson = express.json({ limit: "64kb" });
  const largeJson = express.json({ limit: "12mb" });
  app.use((req, res, next) =>
    req.path.startsWith("/api/finance") ? largeJson(req, res, next) : smallJson(req, res, next)
  );
  app.use(cookieParser());

  app.get("/api/health", (req, res) =>
    res.json({
      ok: config.configErrors.length === 0,
      ai: config.anthropic.enabled,
      app: "strideup-finance",
      configErrors: config.configErrors,
    })
  );

  app.use("/api", (req, res, next) => {
    if (config.configErrors.length) {
      return res.status(503).json({
        error: "The server isn't fully configured yet. " + config.configErrors.join(" "),
      });
    }
    next();
  });

  // Schema + owner seed, once per cold start — this is what makes it work on
  // serverless hosts where there is no long-lived boot step.
  app.use("/api", (req, res, next) => {
    ensureReady().then(() => next()).catch(next);
  });

  // Login establishes the session, so no CSRF cookie exists yet; it is
  // protected by SameSite=Strict and the rate limiter instead.
  app.use("/api", apiLimiter, (req, res, next) => {
    if (req.originalUrl.split("?")[0] === "/api/auth/login") return next();
    return csrfProtect(req, res, next);
  });

  app.use("/api/auth", authRouter);
  app.use("/api/finance", financeRouter);
  app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("*", (req, res) => res.sendFile(path.join(clientDist, "index.html")));
  } else {
    app.get("*", (req, res) =>
      res.status(200).send("Client not built yet. Run `npm --prefix client run build`.")
    );
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error("[error]", err);
    res.status(500).json({ error: "Something went wrong." });
  });

  return app;
}
