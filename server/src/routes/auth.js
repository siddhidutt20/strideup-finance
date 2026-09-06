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
      `SELECT id, email, name, password_hash, avatar_updated_at
         FROM owners WHERE email = ?`,
      [parsed.data.email.toLowerCase()]
    );
    const hash = owner?.password_hash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
    const ok = await verifyPassword(parsed.data.password, hash);
    if (!owner || !ok) return deny();

    await run("UPDATE owners SET last_login_at = now() WHERE id = ?", [owner.id]);
    issueSession(res, owner);
    res.json({ owner: shapeOwner(owner) });
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
      owner: shapeOwner(req.owner),
      ai: { enabled: config.anthropic.enabled },
      baseCurrency: config.finance.baseCurrency,
    });
  })
);

// ── Your profile ─────────────────────────────────────────────
// One person uses this app and it already knows who they are. All a profile
// needs to do is let them be called what they want to be called, and put a
// face on the account rather than a letter.

// `avatarUpdatedAt` doubles as the cache key: the picture is served from a
// fixed URL, so without something that changes, replacing it would leave the
// old one on screen until the browser felt like asking again.
const shapeOwner = (o) => ({
  id: o.id,
  email: o.email,
  name: o.name,
  avatarUpdatedAt: o.avatar_updated_at ? new Date(o.avatar_updated_at).toISOString() : null,
});

authRouter.get(
  "/avatar",
  requireOwner,
  ah(async (req, res) => {
    const row = await get(
      "SELECT avatar_mime, avatar_data FROM owners WHERE id = ?", [req.owner.id]
    );
    if (!row?.avatar_data) return res.status(404).json({ error: "No picture set." });
    res.setHeader("Content-Type", row.avatar_mime || "image/jpeg");
    // Private: this is one person's face, not a public asset. Short-lived
    // because the URL never changes — the query string is what busts it.
    res.setHeader("Cache-Control", "private, max-age=60");
    // Whatever bytes are in there, the browser treats them as the type we
    // declare and never guesses something more dangerous.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(Buffer.from(row.avatar_data, "base64"));
  })
);

// No SVG, deliberately. It is the one image format that can carry script, and
// this file is served back from the app's own origin — an avatar is not worth
// the one hole in the set. Do not add it.
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
// Roughly 1.5 MB of image once base64 is undone. The browser shrinks a photo
// to 256px before it ever gets here, so anything near this is a sign the
// resize did not happen rather than a picture worth keeping.
const AVATAR_MAX = 2_000_000;

const profileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  avatar: z.object({
    mime: z.string().trim().max(60),
    data: z.string().min(1).max(AVATAR_MAX),
  }).nullable().optional(),
});

authRouter.post(
  "/profile",
  requireOwner,
  ah(async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Give a name of 80 characters or fewer." });
    }
    const { name, avatar } = parsed.data;

    if (name != null) {
      // name_set_at is what stops the next redeploy renaming you back to
      // whatever OWNER_NAME says.
      await run(
        "UPDATE owners SET name = ?, name_set_at = now() WHERE id = ?",
        [name, req.owner.id]
      );
    }

    if (avatar === null) {
      await run(
        `UPDATE owners SET avatar_mime = NULL, avatar_data = NULL,
                           avatar_updated_at = NULL WHERE id = ?`,
        [req.owner.id]
      );
    } else if (avatar) {
      if (!AVATAR_TYPES.has(avatar.mime)) {
        return res.status(415).json({
          error: "That has to be a JPEG, PNG, WebP or GIF.",
        });
      }
      const bytes = Buffer.from(avatar.data, "base64");
      if (!bytes.length) return res.status(400).json({ error: "That file was empty." });
      if (bytes.length > AVATAR_MAX) {
        return res.status(413).json({ error: "That picture is too large." });
      }
      await run(
        `UPDATE owners SET avatar_mime = ?, avatar_data = ?, avatar_updated_at = now()
          WHERE id = ?`,
        [avatar.mime, bytes.toString("base64"), req.owner.id]
      );
    }

    const fresh = await get(
      "SELECT id, email, name, avatar_updated_at FROM owners WHERE id = ?", [req.owner.id]
    );
    res.json({ owner: shapeOwner(fresh) });
  })
);
