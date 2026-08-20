import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { get } from "./db.js";

export const SESSION_COOKIE = "sf_session";
export const CSRF_COOKIE = "sf_csrf";

export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

export function issueSession(res, owner) {
  const token = jwt.sign({ sub: owner.id }, config.sessionSecret, {
    expiresIn: Math.floor(config.sessionMaxAgeMs / 1000),
  });
  const secure = config.isProd;
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, secure, sameSite: "strict",
    maxAge: config.sessionMaxAgeMs, path: "/",
  });
  // Double-submit CSRF token: readable by JS, echoed back in a header.
  res.cookie(CSRF_COOKIE, crypto.randomBytes(24).toString("hex"), {
    httpOnly: false, secure, sameSite: "strict",
    maxAge: config.sessionMaxAgeMs, path: "/",
  });
}

export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.clearCookie(CSRF_COOKIE, { path: "/" });
}

export async function requireOwner(req, res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return res.status(401).json({ error: "Not authenticated" });
    let payload;
    try {
      payload = jwt.verify(token, config.sessionSecret);
    } catch {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const owner = await get("SELECT id, email, name FROM owners WHERE id = ?", [payload.sub]);
    if (!owner) return res.status(401).json({ error: "Not authenticated" });
    req.owner = owner;
    next();
  } catch (err) {
    next(err);
  }
}

export function csrfProtect(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const header = req.get("x-csrf-token");
  const cookie = req.cookies?.[CSRF_COOKIE];
  if (!header || !cookie || header !== cookie) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }
  next();
}
