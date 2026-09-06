import { useRef, useState } from "react";
import { api } from "../api.js";

// ── Who this account belongs to ──────────────────────────────
// One person uses this app and it already knows their address. All a profile
// needs to do is let them be called what they want to be called, and put a
// face on the account rather than a letter.

// The picture, wherever it appears. Falls back to the initial — not to a
// broken image, and not to an empty circle. `onError` matters: a stored
// picture that fails to load has to degrade to the letter rather than leave a
// hole where a face should be.
export function Avatar({ owner, size = 34, className = "" }) {
  const [failed, setFailed] = useState(false);
  const name = String(owner?.name || "?").trim();
  const letter = name.charAt(0).toUpperCase() || "?";
  const stamp = owner?.avatarUpdatedAt;
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };

  if (stamp && !failed) {
    return (
      <img className={`fin-avatar fin-avatar-img ${className}`} style={style}
           src={api.avatarUrl(stamp)} alt={name}
           onError={() => setFailed(true)} />
    );
  }
  return (
    <span className={`fin-avatar ${className}`} style={style} aria-hidden="true">
      {letter}
    </span>
  );
}

// Photographs off a phone are several megabytes and several thousand pixels
// wide, and none of that survives being drawn at 34px. Squaring and shrinking
// in the browser means what reaches the database is the size of the thing on
// screen, not the size of the thing that came out of the camera.
const SIDE = 256;

function squareTo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement("canvas");
      c.width = SIDE;
      c.height = SIDE;
      const ctx = c.getContext("2d");
      // White underneath, because a transparent PNG saved as JPEG turns black
      // otherwise — and a face on a black square reads as an error.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, SIDE, SIDE);
      // Cover, centred: fill the square and lose the overhang, rather than
      // letterbox a portrait into a circle.
      const scale = Math.max(SIDE / img.width, SIDE / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (SIDE - w) / 2, (SIDE - h) / 2, w, h);
      const out = c.toDataURL("image/jpeg", 0.86);
      const data = out.split(",")[1];
      if (!data) return reject(new Error("That image could not be read."));
      resolve({ mime: "image/jpeg", data });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file is not an image this browser can open."));
    };
    img.src = url;
  });
}

export function ProfileSheet({ owner, onClose, onSaved }) {
  const [name, setName] = useState(owner?.name ?? "");
  const [pending, setPending] = useState(null); // a new picture, not yet saved
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const file = useRef(null);

  const shown = pending
    ? `data:${pending.mime};base64,${pending.data}`
    : removing || !owner?.avatarUpdatedAt
      ? null
      : api.avatarUrl(owner.avatarUpdatedAt);

  async function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setMsg(null);
    if (!f.type.startsWith("image/")) {
      return setMsg("Choose an image file — a JPEG, PNG, WebP or GIF.");
    }
    try {
      setPending(await squareTo(f));
      setRemoving(false);
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const body = {};
      if (name.trim() && name.trim() !== owner?.name) body.name = name.trim();
      if (pending) body.avatar = pending;
      else if (removing) body.avatar = null;
      if (!Object.keys(body).length) { onClose(); return; }
      const r = await api.saveProfile(body);
      onSaved(r.owner);
    } catch (err) {
      setMsg(err.message || "Could not save that.");
    } finally { setBusy(false); }
  }

  const changed = pending || removing || (name.trim() && name.trim() !== owner?.name);

  return (
    <div className="fin-modal" role="dialog" aria-label="My profile">
      <div className="fin-sheet pf-sheet">
        <header className="fin-sheethead">
          <h2>My profile</h2>
          <button className="fin-x" onClick={onClose} aria-label="Close">×</button>
        </header>
        <form className="fin-form" onSubmit={save}>
          <div className="pf-pic wide">
            {shown ? (
              <img src={shown} alt="" className="pf-preview" />
            ) : (
              <span className="pf-preview pf-letter" aria-hidden="true">
                {String(name || owner?.name || "?").trim().charAt(0).toUpperCase() || "?"}
              </span>
            )}
            <div className="pf-picacts">
              <button type="button" className="fin-btn ghost"
                      onClick={() => file.current?.click()}>
                {shown ? "Change profile picture" : "Add profile picture"}
              </button>
              {shown && (
                <button type="button" className="fin-btn ghost danger"
                        onClick={() => { setPending(null); setRemoving(true); }}>
                  Remove
                </button>
              )}
              <input ref={file} type="file" accept="image/*" hidden onChange={pick} />
            </div>
          </div>

          <label className="wide"><span>What you would like to be called</span>
            <input value={name} onChange={(e) => setName(e.target.value)}
                   maxLength={80} required />
          </label>

          <label className="wide"><span>Signing in with</span>
            <input value={owner?.email ?? ""} readOnly />
          </label>

          {msg && <p className="fin-error wide">{msg}</p>}
          <div className="fin-formacts wide">
            <span className="ic-spacer" />
            <button type="button" className="fin-btn ghost" onClick={onClose}>Cancel</button>
            <button className="fin-btn" disabled={busy || !changed}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
