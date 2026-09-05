import { useMemo, useState } from "react";
import { api } from "../api.js";
import { Panel } from "./pieces.jsx";
import { Disc } from "./glyphs.jsx";
import { CURRENCIES } from "./format.js";

// ── What you are saving toward ───────────────────────────────
// A goal is a plan, like a budget: never summed into a position, never
// counted as money. What it adds is arithmetic against a date — what is left,
// how long there is, and what that works out to a month — set beside what your
// months have actually been keeping, so the two can be compared rather than
// confused.

const pct = (v) => (v == null ? null : Math.round(v * 100));

const KIND_LABEL = { savings: "Savings", travel: "Travel", home: "Home",
                     education: "Education", custom: "Custom" };
const KINDS = Object.keys(KIND_LABEL);

const dayLabel = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

function GoalForm({ goal, seed, entity, currency, onClose, onSaved }) {
  const editing = !!goal?.id;
  const from = goal ?? seed ?? null;
  const [f, setF] = useState({
    name: from?.name ?? "",
    kind: from?.kind ?? "savings",
    currency: from?.currency ?? currency,
    target: from?.target != null ? String(from.target) : "",
    saved: from?.saved != null ? String(from.saved) : "0",
    targetDate: from?.targetDate ?? "",
    note: from?.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const body = {
      entity, name: f.name.trim(), kind: f.kind, currency: f.currency,
      target: Number(f.target), saved: Number(f.saved || 0),
      targetDate: f.targetDate || null, note: f.note.trim() || null,
    };
    try {
      if (editing) await api.updateGoal(goal.id, body);
      else await api.addGoal(body);
      onSaved();
    } catch (err) {
      setMsg(err.message || "Could not save that.");
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true);
    try { await api.deleteGoal(goal.id); onSaved(); }
    catch (err) { setMsg(err.message || "Could not remove that."); }
    finally { setBusy(false); }
  }

  return (
    <div className="fin-modal" role="dialog" aria-label={editing ? "Edit this goal" : "Add a goal"}>
      <div className="fin-sheet">
        <header className="fin-sheethead">
          <h2>{editing ? `Edit “${goal.name}”` : "Set a goal"}</h2>
          <button className="fin-x" onClick={onClose} aria-label="Close">×</button>
        </header>
        <form className="fin-form" onSubmit={save}>
          <label className="wide"><span>What you are saving for</span>
            <input value={f.name} onChange={set("name")} required maxLength={140}
                   placeholder="Emergency fund" />
          </label>
          <label><span>Kind</span>
            <select value={f.kind} onChange={set("kind")}>
              {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <label><span>Currency</span>
            <select value={f.currency} onChange={set("currency")}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label><span>Amount to reach</span>
            <input type="number" step="0.01" min="0.01" value={f.target}
                   onChange={set("target")} required />
          </label>
          <label><span>Put aside so far</span>
            <input type="number" step="0.01" min="0" value={f.saved} onChange={set("saved")} />
            <em className="fin-hint">
              What you say you have set aside for this. It is not read from your
              ledger — money in a savings account looks the same to the app as
              money anywhere else — so this is the one figure here you keep up
              to date yourself.
            </em>
          </label>
          <label><span>By when</span>
            <input type="date" value={f.targetDate} onChange={set("targetDate")} />
            <em className="fin-hint">
              Optional. With a date, this page can say what it works out to a
              month; without one, it can only show how far along you are.
            </em>
          </label>
          <label className="wide"><span>Note</span>
            <input value={f.note} onChange={set("note")} maxLength={300} />
          </label>
          {msg && <p className="fin-error wide">{msg}</p>}
          <div className="fin-formacts wide">
            {editing && (confirming ? (
              <>
                <span className="ic-confirm">Remove “{goal.name}”?</span>
                <button type="button" className="fin-btn ghost danger" disabled={busy}
                        onClick={remove}>Yes, remove it</button>
                <button type="button" className="fin-btn ghost"
                        onClick={() => setConfirming(false)}>Keep it</button>
              </>
            ) : (
              <button type="button" className="fin-btn ghost danger"
                      onClick={() => setConfirming(true)}>Remove</button>
            ))}
            {!confirming && (
              <>
                <span className="ic-spacer" />
                <button type="button" className="fin-btn ghost" onClick={onClose}>Cancel</button>
                <button className="fin-btn" disabled={busy}>
                  {busy ? "Saving…" : editing ? "Save changes" : "Add it"}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// What a target and a date work out to a month, before anything is saved.
// Arithmetic, shown as arithmetic — nothing is stored until you say so.
function Calculator({ money, onCreate }) {
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const [have, setHave] = useState("0");
  const n = Number(target) || 0;
  const got = Number(have) || 0;
  const remaining = Math.max(0, n - got);
  const days = date ? Math.round((new Date(date) - new Date()) / 86400000) : null;
  const months = days == null ? null : Math.max(1, Math.round(days / 30.44));
  const per = months ? remaining / months : null;

  return (
    <div className="go-calc">
      <div className="fin-form go-calcform">
        <label><span>Amount to reach</span>
          <input type="number" step="0.01" min="0" value={target}
                 onChange={(e) => setTarget(e.target.value)} placeholder="200000" />
        </label>
        <label><span>Already put aside</span>
          <input type="number" step="0.01" min="0" value={have}
                 onChange={(e) => setHave(e.target.value)} />
        </label>
        <label><span>By when</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {per == null || !n ? (
        <p className="fc-none">
          Put in an amount and a date and this says what it works out to a month.
        </p>
      ) : (
        <div className="go-calcout">
          <div>
            <strong className="fin-fig">{money.round(Math.round(per * 100))}</strong>
            <em>a month, for {months} month{months === 1 ? "" : "s"}</em>
          </div>
          <div>
            <strong className="fin-fig">{money.round(Math.round(remaining * 100))}</strong>
            <em>still to find</em>
          </div>
          {days != null && days < 0 && (
            <p className="fc-none">That date has already passed.</p>
          )}
          <button className="fin-btn" onClick={() => onCreate({ target: n, saved: got, date })}>
            Make this a goal
          </button>
        </div>
      )}
    </div>
  );
}

const TABS = [["goals", "Goals"], ["calc", "What would it take"]];

export function GoalsView({ go, money, entity, currency, onChanged, onGo }) {
  const [tab, setTab] = useState("goals");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [seed, setSeed] = useState(null);

  const shown = useMemo(
    () => (filter === "all" ? go.items : go.items.filter((g) => g.kind === filter)),
    [go.items, filter]
  );
  const kinds = [...new Set(go.items.map((g) => g.kind))];

  return (
    <div className="go">
      <div className="hh-tabs">
        <span className="fin-scope hh-tabrow">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </span>
        {tab === "goals" && (
          <button className="fin-btn" onClick={() => setAdding(true)}>+ Add goal</button>
        )}
      </div>

      {tab === "goals" && (
        <>
          {go.items.length > 0 && (
            <div className="go-summary">
              <article><strong className="fin-fig">{money.round(go.totalSaved)}</strong>
                <em>put aside, of {money.round(go.totalTarget)}</em></article>
              <article><strong className="fin-fig">{money.round(go.neededPerMonth)}</strong>
                <em>a month to hit every date</em></article>
              <article>
                <strong className={`fin-fig${(go.savingPerMonth ?? 0) < 0 ? " fe-out" : ""}`}>
                  {go.savingPerMonth == null ? "—" : money.round(go.savingPerMonth)}
                </strong>
                <em>
                  {go.savingPerMonth == null
                    ? "no complete month to average yet"
                    : "your average over the last complete months"}
                </em>
              </article>
            </div>
          )}

          <Panel title="Your goals"
                 sub={go.items.length
                   ? `${go.items.filter((g) => g.done).length} of ${go.items.length} reached`
                   : undefined}
                 action={kinds.length > 1 && (
                   <span className="fin-scope">
                     <button className={filter === "all" ? "on" : ""}
                             onClick={() => setFilter("all")}>All</button>
                     {kinds.map((k) => (
                       <button key={k} className={filter === k ? "on" : ""}
                               onClick={() => setFilter(k)}>{KIND_LABEL[k] ?? k}</button>
                     ))}
                   </span>
                 )}>
            {shown.length === 0 ? (
              <p className="fc-none">
                {go.items.length
                  ? "Nothing under that heading."
                  : "No goals yet. Set one and this page works out what it asks of each month between now and the date you pick."}
              </p>
            ) : (
              <ul className="go-list">
                {shown.map((g) => (
                  <li key={g.id} className={g.done ? "done" : g.overdue ? "late" : undefined}>
                    <Disc name={g.kind === "custom" ? g.name : KIND_LABEL[g.kind]} />
                    <span className="go-body">
                      <b>{g.name}</b>
                      <em>{money.round(g.saved)} / {money.round(g.target)}</em>
                      <span className="go-bar">
                        <i className={g.done ? "done" : g.overdue ? "late" : ""}
                           style={{ width: `${Math.min(100, (g.progress ?? 0) * 100)}%` }} />
                      </span>
                    </span>
                    <span className="go-pct">{pct(g.progress) ?? 0}%</span>
                    <span className="go-when">
                      {g.targetDate ? (
                        <>
                          <em>Target</em>
                          <b>{dayLabel(g.targetDate)}</b>
                          {g.done ? <i className="go-tag done">reached</i>
                            : g.overdue ? <i className="go-tag late">date passed</i>
                            : <i className="go-tag">{money.round(g.perMonth)} a month</i>}
                        </>
                      ) : (
                        <>
                          <em>No date</em>
                          <b>—</b>
                          {g.done && <i className="go-tag done">reached</i>}
                        </>
                      )}
                    </span>
                    <button className="fin-btn ghost sm" onClick={() => setEditing(g)}>Edit</button>
                  </li>
                ))}
              </ul>
            )}
            <p className="fc-note">
              A goal is a plan, like a budget. It is never added into your
              position and never counted as money. "Put aside so far" is a
              figure you keep — your ledger cannot tell savings from any other
              balance.
            </p>
          </Panel>

          {go.timeline.length > 0 && (
            <Panel title="What comes when" sub="Every goal with a date, soonest first">
              <ol className="go-timeline">
                {go.timeline.map((g) => (
                  <li key={g.id}>
                    <Disc name={g.kind === "custom" ? g.name : KIND_LABEL[g.kind]} size="sm" />
                    <b>{g.name}</b>
                    <em>{dayLabel(g.targetDate)}</em>
                    <span>{pct(g.progress) ?? 0}% there</span>
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          {go.shortfall != null && go.shortfall > 0 && (
            <div className="hh-note warn">
              <span className="hh-note-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor"
                     strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 16.5h4" /><path d="M7 13a5 5 0 1 1 6 0c-.6.5-1 1.1-1 1.8h-4c0-.7-.4-1.3-1-1.8Z" />
                </svg>
              </span>
              <span className="hh-note-body">
                <b>
                  Your goals ask {money.round(go.neededPerMonth)} a month, and your
                  months have been keeping{" "}
                  {go.savingPerMonth == null ? "nothing measurable"
                    : go.savingPerMonth < 0 ? "less than nothing"
                    : money.round(go.savingPerMonth)}.
                </b>
                <em>
                  {money.round(go.shortfall)} a month short. Either a date moves,
                  an amount comes down, or the months have to change — this page
                  cannot decide which.
                </em>
              </span>
              <button className="fin-link" onClick={() => onGo("budget")}>Open Budget →</button>
            </div>
          )}
        </>
      )}

      {tab === "calc" && (
        <Panel title="What would it take"
               sub="Work out the monthly amount before committing to anything">
          <Calculator money={money}
                      onCreate={(v) => { setSeed(v); setAdding(true); }} />
        </Panel>
      )}

      {(adding || editing) && (
        <GoalForm
          goal={editing && {
            ...editing,
            target: editing.targetAsWritten / 100,
            saved: editing.saved / 100,
          }}
          seed={seed && { target: seed.target, saved: seed.saved, targetDate: seed.date || "" }}
          entity={entity} currency={currency}
          onClose={() => { setAdding(false); setEditing(null); setSeed(null); }}
          onSaved={() => { setAdding(false); setEditing(null); setSeed(null); onChanged(); }} />
      )}
    </div>
  );
}
