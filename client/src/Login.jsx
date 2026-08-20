import { useState } from "react";

// One account owns this app, so there is nothing to sign up for — just a way
// back in.
export default function Login({ onAuthed }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      const { api } = await import("./api.js");
      const { owner } = await api.login({ email: email.trim(), password });
      onAuthed(owner);
    } catch (err) {
      setError(err.message || "Could not sign you in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lg-wrap">
      <style>{LOGIN_CSS}</style>
      <form className="lg-card" onSubmit={submit}>
        <p className="lg-eyebrow">StrideUp</p>
        <h1 className="lg-title">Finance</h1>
        <p className="lg-sub">
          Revenue, expenses, cash and outstanding payments — in one place.
        </p>

        <label className="lg-label" htmlFor="email">Email</label>
        <input
          id="email" className="lg-input" type="email" autoComplete="username"
          value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@strideup.org" required
        />

        <label className="lg-label" htmlFor="password">Password</label>
        <input
          id="password" className="lg-input" type="password" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password" required
        />

        {error && <div className="lg-error">{error}</div>}

        <button className="lg-cta" disabled={busy || !email.trim() || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="lg-note">
          This app has one account. If you've forgotten the password, change
          <code>OWNER_PASSWORD</code> in the deployment's environment variables
          and redeploy.
        </p>
      </form>
    </div>
  );
}

const LOGIN_CSS = `
.lg-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 16px;
  background:radial-gradient(130% 120% at 0% 0%,#1A0B2E,#0B0415);position:relative;overflow:hidden}
.lg-wrap::before{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(40% 40% at 85% 12%,rgba(15,163,199,.26),transparent 62%),
             radial-gradient(42% 42% at 12% 88%,rgba(101,0,193,.34),transparent 62%)}
.lg-card{position:relative;z-index:1;width:100%;max-width:410px;background:#fff;border-radius:22px;
  padding:34px 30px;box-shadow:0 30px 80px -30px rgba(20,8,40,.7);display:flex;flex-direction:column}
.lg-eyebrow{font-size:11.5px;font-weight:800;letter-spacing:2.2px;text-transform:uppercase;
  color:#9333EA;margin:0 0 6px}
.lg-title{font-family:'Newsreader',Georgia,serif;font-weight:400;font-size:40px;
  letter-spacing:-.02em;line-height:1;margin:0 0 10px;color:#171326}
.lg-sub{font-size:14px;line-height:1.55;color:#6b6188;margin:0 0 20px}
.lg-label{font-size:12.5px;font-weight:700;color:#5c5277;margin:14px 0 6px}
.lg-input{width:100%;padding:13px 15px;border-radius:12px;border:1px solid #E7DAF5;background:#faf9ff;
  font-size:15px;font-family:inherit;color:#1c1430;outline:none}
.lg-input:focus{border-color:#9333EA;box-shadow:0 0 0 3px rgba(139,92,246,.2)}
.lg-error{margin-top:14px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;
  font-size:13.5px;padding:10px 13px;border-radius:11px}
.lg-cta{margin-top:22px;width:100%;padding:15px;border:none;border-radius:13px;cursor:pointer;
  font-family:inherit;font-weight:800;font-size:15px;color:#fff;
  background:linear-gradient(90deg,#5B21B6,#0FA3C7);transition:.16s}
.lg-cta:hover:not(:disabled){filter:brightness(1.08)}
.lg-cta:disabled{opacity:.45;cursor:not-allowed}
.lg-note{margin:18px 0 0;font-size:11.5px;line-height:1.6;color:#8a80a8;text-align:center}
.lg-note code{background:#F7F2FE;border:1px solid #E7DAF5;padding:1px 5px;border-radius:5px}
`;
