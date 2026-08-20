import express from "express";
import { z } from "zod";
import { get, run } from "../db.js";
import { config } from "../config.js";
import { loginLimiter } from "../security.js";
import { issueSession, clearSession, verifyPassword, requireOwner } from "../auth.js";
import { ah } from "../util.js";

export const authRouter = express.Router();

// There is no registration route. The owner account comes from OWNER_EMAIL /
// OWNER_PASSWORD and is seeded on boot — nobody can sign themselves up to see
// the company's books.

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

authRouter.post(
  "/login",
  loginLimiter,
  ah(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    // Same message and roughly the same work either way, so a wrong address
    // can't be told apart from a wrong password.
    const deny = () => res.status(401).json({ error: "Wrong email or password." });
    if (!parsed.success) return deny();

    const owner = await get(
      "SELECT id, email, name, password_hash FROM owners WHERE email = ?",
      [parsed.data.email.toLowerCase()]
    );
    const hash = owner?.password_hash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
    const ok = await verifyPassword(parsed.data.password, hash);
    if (!owner || !ok) return deny();

    await run("UPDATE owners SET last_login_at = now() WHERE id = ?", [owner.id]);
    issueSession(res, owner);
    res.json({ owner: { id: owner.id, email: owner.email, name: owner.name } });
  })
);

authRouter.post("/logout", (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

authRouter.get(
  "/me",
  requireOwner,
  ah(async (req, res) => {
    res.json({
      owner: req.owner,
      ai: { enabled: config.anthropic.enabled },
      baseCurrency: config.finance.baseCurrency,
    });
  })
);
