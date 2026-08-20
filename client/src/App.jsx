import { useEffect, useState } from "react";
import { api } from "./api.js";
import Login from "./Login.jsx";
import FinanceDashboard from "./FinanceDashboard.jsx";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [owner, setOwner] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setOwner((await api.me()).owner);
      } catch {
        setOwner(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function logout() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    setOwner(null);
  }

  if (loading) {
    return (
      <div className="sf-boot">
        <style>{SHELL_CSS}</style>
        <div className="sf-spinner" />
      </div>
    );
  }

  if (!owner) return <Login onAuthed={setOwner} />;

  return (
    <div className="sf-shell">
      <style>{SHELL_CSS}</style>
      <header className="sf-topbar">
        <div className="sf-brand">
          <span className="sf-mark" aria-hidden="true" />
          StrideUp <em>Finance</em>
        </div>
        <div className="sf-right">
          <span className="sf-who">{owner.name}</span>
          <button className="sf-logout" onClick={logout}>Log out</button>
        </div>
      </header>
      <FinanceDashboard />
    </div>
  );
}

const SHELL_CSS = `
.sf-shell{min-height:100vh}
.sf-boot{min-height:100vh;display:grid;place-items:center}
.sf-spinner{width:34px;height:34px;border-radius:50%;border:3px solid #E7DAF5;
  border-top-color:#6500C1;animation:sf-spin .8s linear infinite}
@keyframes sf-spin{to{transform:rotate(360deg)}}
.sf-topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;
  gap:14px;padding:13px 24px;background:rgba(255,255,255,.93);backdrop-filter:blur(8px);
  border-bottom:1px solid #E7DAF5;flex-wrap:wrap}
.sf-brand{display:inline-flex;align-items:center;gap:9px;font-weight:800;font-size:15px;
  letter-spacing:-.02em;color:#1c1430}
.sf-brand em{font-style:normal;font-weight:600;color:#8a80a8}
.sf-mark{width:11px;height:11px;border-radius:3px;
  background:linear-gradient(135deg,#6500C1,#0FA3C7);display:inline-block}
.sf-right{display:flex;align-items:center;gap:13px}
.sf-who{font-size:13.5px;font-weight:600;color:#5c5277}
.sf-logout{border:1px solid #E7DAF5;background:#fff;color:#8a80a8;font-family:inherit;
  font-weight:600;font-size:13px;padding:8px 14px;border-radius:11px;cursor:pointer}
.sf-logout:hover{color:#6500C1;border-color:#6500C1}
@media(max-width:600px){.sf-topbar{padding:11px 15px}}
`;
