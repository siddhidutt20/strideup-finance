import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { FIN_CSS, STATEMENT_CSS, FORECAST_CSS, CONTRACTS_CSS, CONTRACTS_EXTRA_CSS, LEDGER_EDIT_CSS, FUTURE_CSS, CASHFLOW_AHEAD_CSS, CF_NONE_CSS, VENDORS_CSS, CASH_CSS, CONTRACTS_GROUP_CSS, SIDE_CSS, CASH_BAND_CSS, NARROW_FIX_CSS } from "./finance/styles.js";
import {
  fmtAmount, monthLabel, readFile, shiftMonth, thisMonth, useMoney, ZERO_DECIMAL,
  ENTITY_LABEL, ENTITY_CHOICES, loadEntity, saveEntity,
} from "./finance/format.js";
import {
  OverviewView, RevenueView, ExpensesView, CashflowView, PnlView, LedgerView,
  ToolsView, ManualEntry,
} from "./finance/views.jsx";
import { ForecastView } from "./finance/forecast.jsx";
import { ContractsView } from "./finance/contracts.jsx";
import { VendorsView } from "./finance/vendors.jsx";
import { CashView } from "./finance/cash.jsx";
import { SideView } from "./finance/side.jsx";
import { DueSoon } from "./finance/spend.jsx";
import { Panel } from "./finance/pieces.jsx";
import { ICONS } from "./finance/icons.jsx";

// ── StrideUp finances ────────────────────────────────────────
// One section per question. Overview answers "how is the month going" at a
// glance; the rest answer what you ask next — where money came from, where it
// went, what it added up to, and what actually moved.

const VIEWS = [
  ["overview", "Overview", "Finances", "How StrideUp is doing in"],
  ["revenue", "Revenue", "Revenue", "Where the money came from in"],
  ["expenses", "Expenses", "Expenses", "Where the money went in"],
  ["cashflow", "Cash flow", "Cash flow", "What actually moved in"],
  ["forecast", "Forecast", "Forecast", "What is already committed, from"],
  ["vendors", "Vendor Management", "Vendor Management",
   "Parties, contracts and payments, around"],
  ["contracts", "Payment schedule", "Payment schedule", "Every agreed payment, around"],
  ["pnl", "P&L", "Profit and loss", "The statement for"],
  ["ledger", "Ledger", "Ledger", "Every entry in"],
  ["tools", "Import & close", "Import and close", "Bring in revenue, and settle"],
];
const NEEDS_STATEMENTS = new Set(["revenue", "expenses", "cashflow", "pnl"]);

// Months ahead the picker will walk to. Future months hold no actuals — the
// point of visiting one is to see what is already committed to land in it.
const HORIZON_MONTHS = 18;

export default function FinanceDashboard({ owner, onLogout }) {
  const [view, setView] = useState("overview");
  const [period, setPeriod] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [statements, setStatements] = useState(null);
  const [entries, setEntries] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feed, setFeed] = useState([]);
  const [ledgerScope, setLedgerScope] = useState("month");
  const [entity, setEntityState] = useState(loadEntity);
  const [forecast, setForecast] = useState(null);
  const [commitments, setCommitments] = useState(null);
  const [due, setDue] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [vendors, setVendors] = useState(null);
  const [cash, setCash] = useState(null);
  const [sides, setSides] = useState(null);
  const setEntity = (v) => { saveEntity(v); setEntityState(v); };
  const [busy, setBusy] = useState(false);

  const money = useMoney(data?.baseCurrency || "USD");

  const load = useCallback(
    async (p = period) => {
      setError("");
      try {
        const [ov, en, cats] = await Promise.all([
          api.finOverview(p, entity),
          api.finEntries(
            (ledgerScope === "all" ? "?limit=500" : `?period=${p}`) +
            (entity === "both" ? "" : `&entity=${entity}`)
          ),
          categories.length ? Promise.resolve({ categories }) : api.finCategories(),
        ]);
        setData(ov);
        setEntries(en.entries);
        setCategories(cats.categories);
        setStatements(null); // recomputed for the new month, on demand
      } catch (err) {
        setError(err.message || "Could not load your finances.");
      } finally {
        setLoading(false);
      }
    },
    [period, categories, ledgerScope, entity]
  );

  useEffect(() => { load(period); /* eslint-disable-next-line */ }, [period, ledgerScope, entity]);

  // Statements are fetched only when a statement view is opened, so the
  // dashboard does not pay for four of them nobody asked to see.
  useEffect(() => {
    if (!NEEDS_STATEMENTS.has(view) ||
        (statements?.period === period && statements?.entity === entity)) return;
    let cancelled = false;
    api
      .finStatements(period, entity)
      .then((st) => { if (!cancelled) setStatements(st); })
      .catch((err) => { if (!cancelled) setError(err.message || "Could not load that view."); });
    return () => { cancelled = true; };
  }, [view, period, entity, statements]);

  // Forecast data is fetched only when its section is open — three more calls
  // on every dashboard load would be paid by everyone to serve one view.
  const loadForecast = useCallback(async () => {
    try {
      const [fc, cm, dd, sc, vn, cs] = await Promise.all([
        api.finForecast(entity, 6),
        api.finCommitments(entity),
        api.finDue(entity, 30),
        api.finSchedule(entity),
        api.finVendors(entity),
        api.finCash(entity, 3),
      ]);
      const [rin, rout] = await Promise.all([
        api.finSide("in", entity, period),
        api.finSide("out", entity, period),
      ]);
      setSides({ in: rin, out: rout });
      setForecast(fc); setCommitments(cm); setDue(dd);
      setSchedule(sc); setVendors(vn); setCash(cs);
    } catch (err) {
      setError(err.message || "Could not load the forecast.");
    }
  }, [entity, period]);

  useEffect(() => {
    if (!["forecast", "contracts", "vendors", "cashflow", "revenue", "expenses", "overview"].includes(view)
        && period <= thisMonth()) return;
    loadForecast();
  }, [view, entity, period, loadForecast]);

  // How many committed payments fall due in the next 30 days, across whichever
  // books are in view. Shown on the nav so it is visible without opening it.
  const duePending = useMemo(() => {
    if (!due?.byEntity) return 0;
    return Object.values(due.byEntity)
      .reduce((n, d) => n + d.payable.length + d.incoming.length, 0);
  }, [due]);

  const entityList = data?.entities ?? [entity];
  // Trailing months are trimmed per set of books — StrideUp and personal do
  // not necessarily start in the same month.
  const trendFor = useCallback((ent) => {
    const t = data?.byEntity?.[ent]?.trend ?? [];
    const first = t.findIndex((m) => m.revenue || m.expenses);
    return first < 0 ? t.slice(-6) : t.slice(Math.max(0, first - 1));
  }, [data]);

  // ── Upload: one call per document, sequentially, so progress is legible
  // and one failure never takes the rest of the batch down with it.
  async function sendOne(file, { id, dataB64, replace = false, kind = "expense" }) {
    const b64 = dataB64 ?? (await readFile(file));
    setFeed((f) => f.map((x) => (x.id === id ? { ...x, state: "reading-doc" } : x)));
    const res = await api.finUpload({
      filename: file.name,
      mime: file.type || "application/octet-stream",
      data: b64,
      kind,
      ...(entity === "both" ? {} : { entityHint: entity }),
      ...(replace ? { replace: true } : {}),
    });
    setFeed((f) =>
      f.map((x) =>
        x.id === id
          ? { ...x, state: res.duplicate ? "duplicate" : "done", result: res,
              retry: res.duplicate ? { file, dataB64: b64, kind } : null }
          : x
      )
    );
  }

  async function handleFiles(files, kind = "expense") {
    const list = [...files];
    if (!list.length) return;
    setBusy(true);
    for (const file of list) {
      const id = `${file.name}-${Date.now()}-${Math.random()}`;
      setFeed((f) => [{ id, name: file.name, state: "reading" }, ...f].slice(0, 10));
      try {
        await sendOne(file, { id, kind });
      } catch (err) {
        setFeed((f) => f.map((x) => (x.id === id ? { ...x, state: "error", message: err.message } : x)));
      }
    }
    setBusy(false);
    load(period);
  }

  async function replaceFile(item) {
    if (!item.retry) return;
    setBusy(true);
    setFeed((f) => f.map((x) => (x.id === item.id ? { ...x, state: "reading-doc" } : x)));
    try {
      await sendOne(item.retry.file, {
        id: item.id, dataB64: item.retry.dataB64, replace: true,
        kind: item.retry.kind || "expense",
      });
    } catch (err) {
      setFeed((f) => f.map((x) => (x.id === item.id ? { ...x, state: "error", message: err.message } : x)));
    }
    setBusy(false);
    load(period);
  }

  const dismiss = (id) => setFeed((f) => f.filter((x) => x.id !== id));

  async function fixEntry(id, categoryId) {
    await api.finPatchEntry(id, { categoryId: Number(categoryId) });
    load(period);
  }

  // Correcting a misread currency re-converts, so the month's totals move
  // with it.
  async function fixCurrency(id, currency) {
    try {
      await api.finPatchEntry(id, { currency });
      load(period);
    } catch (err) {
      setError(err.message || "Could not change that currency.");
    }
  }

  // Correcting a misread amount. The server re-converts for the entry's own
  // date, so base_amount_minor — the only column any total is summed from —
  // moves with it rather than keeping the old figure.
  async function fixAmount(id, amount) {
    try {
      await api.finPatchEntry(id, { amount });
      load(period);
    } catch (err) {
      setError(err.message || "Could not change that amount.");
    }
  }

  async function removeEntry(entry) {
    const what = entry.description || entry.counterparty || "this entry";
    const amount = fmtAmount(entry.currency, entry.amount_minor);
    if (!window.confirm(
      `Remove "${what}" (${amount})?\n\nThis deletes the entry and its uploaded file. It cannot be undone.`
    )) return;
    try {
      await api.finDeleteEntry(entry.id);
      load(period);
    } catch (err) {
      setError(err.message || "Could not remove that entry.");
    }
  }

  if (loading) {
    return (
      <div className="fin">
        {/* Joined in JS, not as three JSX children: a <style> element with
            several text children does not reliably end up with all of them in
            the DOM, and the symptom is a stylesheet that silently truncates. */}
        <style>{FIN_CSS + STATEMENT_CSS + FORECAST_CSS + CONTRACTS_CSS + CONTRACTS_EXTRA_CSS + LEDGER_EDIT_CSS + FUTURE_CSS + CASHFLOW_AHEAD_CSS + CF_NONE_CSS + VENDORS_CSS + CASH_CSS + CONTRACTS_GROUP_CSS + SIDE_CSS + CASH_BAND_CSS + NARROW_FIX_CSS}</style>
        <div className="fin-boot"><div className="fin-spinner" /></div>
      </div>
    );
  }

  const [, , heading, blurbBase] = VIEWS.find((v) => v[0] === view);
  const blurb =
    view === "ledger" && ledgerScope === "all"
      ? "Every entry recorded, across all months"
      : blurbBase;
  const waiting =
    NEEDS_STATEMENTS.has(view) &&
    (statements?.period !== period || statements?.entity !== entity);
  // Adding things belongs where you are looking at them: a sales invoice on
  // Revenue, a bill on Expenses.
  const UPLOAD_VIEWS = { overview: "expense", revenue: "revenue", expenses: "expense",
                         ledger: "expense", vendors: "contract" };
  const uploadKind = UPLOAD_VIEWS[view];
  const showUpload = !!uploadKind;
  const MANUAL = {
    revenue: { defaultDirection: "in", preferKinds: ["revenue", "capital"],
               title: "Record revenue by hand", sub: "A payment that never had a document",
               descPlaceholder: "Coaching programme — August cohort",
               whoPlaceholder: "Customer name…", whoLabel: "Customer" },
    expenses: { defaultDirection: "out", preferKinds: ["cogs", "opex", "capex", "tax"],
                title: "Record an expense by hand", sub: "A cost that never had a document",
                descPlaceholder: "Figma team seats",
                whoPlaceholder: "Supplier name…", whoLabel: "Supplier" },
    ledger: { defaultDirection: "out" },
  };
  const isEmpty = entityList.every(
    (e) => (data?.byEntity?.[e]?.summary?.entryCount ?? 0) === 0 &&
           !data?.byEntity?.[e]?.receivables?.total
  );

  return (
    <div className="fin-app">
      <style>{FIN_CSS + STATEMENT_CSS + FORECAST_CSS + CONTRACTS_CSS + CONTRACTS_EXTRA_CSS + LEDGER_EDIT_CSS + FUTURE_CSS + CASHFLOW_AHEAD_CSS + CF_NONE_CSS + VENDORS_CSS + CASH_CSS + CONTRACTS_GROUP_CSS + SIDE_CSS + CASH_BAND_CSS + NARROW_FIX_CSS}</style>

      <aside className="fin-side" aria-label="Sections">
        <div className="fin-sidebrand">
          <img src="/strideup-wordmark.png" alt="StrideUp"
               width="128" height="53" className="fin-wordmark" />
          <span className="fin-product">Finance</span>
        </div>
        <p className="fin-sidelabel">Menu</p>
        <nav>
          <ul>
            {VIEWS.map(([id, label]) => (
              <li key={id}>
                <button className={view === id ? "on" : ""}
                        aria-current={view === id ? "page" : undefined}
                        onClick={() => setView(id)}>
                  {ICONS[id]}<span>{label}</span>
                  {id === "forecast" && duePending > 0 && (
                    <b className="fin-badge" title={`${duePending} due in the next 30 days`}>
                      {duePending}
                    </b>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        {owner && (
          <div className="fin-sideuser">
            <span className="fin-avatar" aria-hidden="true">
              {String(owner.name || "?").trim().charAt(0).toUpperCase()}
            </span>
            <span className="fin-sidewho">
              <b>{owner.name}</b>
              <em>{owner.email}</em>
            </span>
            <button className="fin-sideout" onClick={onLogout} title="Log out">↪</button>
          </div>
        )}
      </aside>

      <div className="fin">
        <header className="fin-viewhead">
          <div>
            <h1>{heading}</h1>
            <p>
              {view === "ledger" && ledgerScope === "all"
                ? `${blurb}.`
                : `${blurb} ${monthLabel(period)}.`}
            </p>
          </div>
          <div className="fin-headctl">
            <div className="fin-entnav" role="group" aria-label="Which books">
              {ENTITY_CHOICES.map((e) => (
                <button key={e} className={entity === e ? "on" : ""}
                        aria-pressed={entity === e}
                        onClick={() => setEntity(e)}>{ENTITY_LABEL[e]}</button>
              ))}
            </div>
            <div className="fin-monthnav">
              <button onClick={() => setPeriod(shiftMonth(period, -1))} aria-label="Previous month">‹</button>
              <strong>{monthLabel(period)}</strong>
              <button onClick={() => setPeriod(shiftMonth(period, 1))}
                      disabled={period >= shiftMonth(thisMonth(), HORIZON_MONTHS)}
                      aria-label="Next month">›</button>
            </div>
          </div>
        </header>

      {error && <div className="fin-error">{error}</div>}

      {period > thisMonth() && <FutureMonth period={period} entityList={entityList}
                                            forecast={forecast} money={money}
                                            onGo={setView} />}
      {data && !data.aiEnabled && view === "overview" && (
        <div className="fin-warn">
          Reading documents needs an Anthropic API key. Set <code>ANTHROPIC_API_KEY</code>{" "}
          and redeploy — everything else works without it.
        </div>
      )}

      {showUpload && (
        <UploadZone kind={uploadKind} onFiles={handleFiles} busy={busy} feed={feed}
                    money={money} onReplace={replaceFile} onDismiss={dismiss} />
      )}

      {MANUAL[view] && !waiting && (
        <ManualEntry key={view} categories={categories}
                     currency={data?.baseCurrency || "USD"}
                     entity={entity === "both" ? "strideup" : entity}
                     onAdded={() => load(period)} {...MANUAL[view]} />
      )}

      {view === "overview" && isEmpty ? (
        <div className="fin-empty">
          <h2>Nothing recorded for {monthLabel(period)} yet</h2>
          <p>
            Drop an invoice above, or open the Ledger and write an entry by hand —
            capital you put in, a payment that never had a document, anything at all.
          </p>
        </div>
      ) : waiting ? (
        <div className="fin-boot"><div className="fin-spinner" /></div>
      ) : (
        <>
          {view === "overview" && entityList.map((ent) => (
            <EntityBlock key={ent} show={entityList.length > 1}
                         label={data.byEntity[ent].label}>
              <OverviewView data={data.byEntity[ent]} trend={trendFor(ent)}
                            money={money} period={period} />
              <Panel title="Scheduled in the next 30 days"
                     sub="Committed payments falling due — invoices are in Outstanding, above">
                <DueSoon due={due?.byEntity?.[ent]} money={money} />
              </Panel>
            </EntityBlock>
          ))}
          {view === "revenue" && sides?.in && (sides.in.entities ?? [entity]).map((ent) => (
            <EntityBlock key={ent} show={(sides.in.entities ?? []).length > 1}
                         label={sides.in.byEntity[ent].label}>
              <SideView sd={sides.in.byEntity[ent]} money={money} period={period}
                        trend={trendFor(ent)} />
            </EntityBlock>
          ))}
          {view === "expenses" && sides?.out && (sides.out.entities ?? [entity]).map((ent) => (
            <EntityBlock key={ent} show={(sides.out.entities ?? []).length > 1}
                         label={sides.out.byEntity[ent].label}>
              <SideView sd={sides.out.byEntity[ent]} money={money} period={period}
                        trend={trendFor(ent)} />
            </EntityBlock>
          ))}
          {view === "cashflow" && (
            <>
              {cash && (cash.entities ?? [entity]).map((ent) => (
                <EntityBlock key={`ch-${ent}`} show={(cash.entities ?? []).length > 1}
                             label={cash.byEntity[ent].label}>
                  <CashView ch={cash.byEntity[ent]} money={money} period={period}
                            onGo={setView} />
                </EntityBlock>
              ))}
              {statements && (
                <div className={entityList.length > 1 ? "fin-sidebyside" : ""}>
                  {entityList.map((ent) => (
                    <EntityBlock key={ent} show={entityList.length > 1}
                                 label={`${statements.byEntity[ent].label} — ${monthLabel(period)}`}>
                      <CashflowView st={statements.byEntity[ent]} money={money} period={period} />
                    </EntityBlock>
                  ))}
                </div>
              )}
            </>
          )}
          {view === "pnl" && statements && (
            <div className={entityList.length > 1 ? "fin-sidebyside" : ""}>
              {entityList.map((ent) => (
                <EntityBlock key={ent} show={entityList.length > 1}
                             label={statements.byEntity[ent].label}>
                  <PnlView st={statements.byEntity[ent]} money={money} period={period} />
                </EntityBlock>
              ))}
            </div>
          )}
          {view === "ledger" && (
            <LedgerView entries={entries} categories={categories} money={money}
                        baseCurrency={data?.baseCurrency || "USD"} period={period}
                        showEntity={entityList.length > 1}
                        scope={ledgerScope} onScope={setLedgerScope}
                        onFix={fixEntry} onRemove={removeEntry} onCurrency={fixCurrency}
                        onAmount={fixAmount} />
          )}
          {view === "forecast" && (forecast && commitments ? (
            <div className={entityList.length > 1 ? "" : ""}>
              {(forecast.entities ?? [entity]).map((ent) => (
                <EntityBlock key={ent} show={(forecast.entities ?? []).length > 1}
                             label={forecast.byEntity[ent].label}>
                  <ForecastView fc={forecast.byEntity[ent]}
                                commitments={commitments.byEntity[ent]?.commitments ?? []}
                                money={money} categories={categories} entity={ent}
                                onChange={loadForecast} />
                </EntityBlock>
              ))}
            </div>
          ) : <div className="fin-boot"><div className="fin-spinner" /></div>)}
          {view === "vendors" && (vendors ? (
            (vendors.entities ?? [entity]).map((ent) => (
              <EntityBlock key={ent} show={(vendors.entities ?? []).length > 1}
                           label={vendors.byEntity[ent].label}>
                <VendorsView vm={vendors.byEntity[ent]} money={money} entity={ent}
                             showEntity={(vendors.entities ?? []).length > 1}
                             onRecord={(u) => { setView("contracts"); }}
                             busy={busy} />
              </EntityBlock>
            ))
          ) : <div className="fin-boot"><div className="fin-spinner" /></div>)}
          {view === "contracts" && (schedule ? (
            (schedule.entities ?? [entity]).map((ent) => (
              <EntityBlock key={ent} show={(schedule.entities ?? []).length > 1}
                           label={schedule.byEntity[ent].label}>
                <ContractsView sched={schedule.byEntity[ent]} money={money}
                               onChange={() => { loadForecast(); load(period); }} />
              </EntityBlock>
            ))
          ) : <div className="fin-boot"><div className="fin-spinner" /></div>)}
          {view === "tools" && (
            <ToolsView period={period} entity={entity} entityList={entityList}
                       byEntity={data?.byEntity} onDone={() => load(period)} />
          )}
          </>
        )}
      </div>
    </div>
  );
}

// A month that has not happened yet holds no actuals, so every statement in
// it is legitimately empty. Saying so — and saying what is already committed
// to land in it — is the difference between an empty page and an answer.
function FutureMonth({ period, entityList, forecast, money, onGo }) {
  const rows = entityList
    .map((ent) => {
      const m = forecast?.byEntity?.[ent]?.months?.find((x) => x.period === period);
      return m ? { ent, label: forecast.byEntity[ent].label, ...m } : null;
    })
    .filter(Boolean);
  const anything = rows.some((r) => r.committedIn || r.committedOut);

  return (
    <div className="fin-future">
      <strong>{monthLabel(period)} hasn't happened yet</strong>
      {anything ? (
        <>
          <p>
            Nothing is recorded against it, so the statements below are empty. What
            is already agreed for that month:
          </p>
          <ul>
            {rows.map((r) => (
              <li key={r.ent}>
                {entityList.length > 1 && <b>{r.label}</b>}
                {r.committedIn > 0 && <span className="fe-in">{money.round(r.committedIn)} in</span>}
                {r.committedOut > 0 && <span className="fe-out">{money.round(r.committedOut)} out</span>}
                {!r.committedIn && !r.committedOut && <span className="fin-dash">nothing committed</span>}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>
          Nothing is recorded against it and nothing is committed to land in it, so
          the statements below are empty.
        </p>
      )}
      <p className="fin-future-go">
        <button className="fin-link asbtn" onClick={() => onGo("contracts")}>See the schedule</button>
        {" · "}
        <button className="fin-link asbtn" onClick={() => onGo("forecast")}>See the projection</button>
      </p>
    </div>
  );
}

function EntityBlock({ show, label, children }) {
  if (!show) return children;
  return (
    <section className="fin-entblock">
      <h2 className="fin-entlabel">{label}</h2>
      {children}
    </section>
  );
}

const DROP_COPY = {
  revenue: {
    title: "Drop sales invoices and receipts here",
    body: "Invoices you issued, or receipts for money you received. Read and added to revenue automatically.",
  },
  expense: {
    title: "Drop invoices and receipts here",
    body: "Bills and receipts for things you paid for. Read, categorised, and added to the month automatically.",
  },
  contract: {
    title: "Drop contracts and agreements here",
    body: "Retainers, service agreements, subscriptions, leases. The payment " +
          "schedule is read off the terms and filed below — whether the money " +
          "comes to you or goes out is worked out from the document.",
  },
};

function UploadZone({ kind = "expense", onFiles, busy, feed, money, onReplace, onDismiss }) {
  const copy = DROP_COPY[kind];
  const [over, setOver] = useState(false);
  const input = useRef(null);
  return (
    <section
      className={`fin-drop${over ? " over" : ""}${busy ? " busy" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files, kind); }}
    >
      <input ref={input} type="file" multiple
             accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
             onChange={(e) => { onFiles(e.target.files, kind); e.target.value = ""; }} hidden />
      <div className="fin-drop-main">
        <div className="fin-drop-icon" aria-hidden="true">＋</div>
        <div>
          <strong>{busy ? "Reading…" : copy.title}</strong>
          <p>
            {copy.body}{" "}
            <button type="button" onClick={() => input.current?.click()}>
              or choose files
            </button>
          </p>
        </div>
      </div>

      {feed.length > 0 && (
        <ul className="fin-feed">
          {feed.map((f) => (
            <li key={f.id} className={`fin-feed-item s-${f.state}`}>
              <span className="ff-name">{f.name}</span>
              {f.state === "reading" && <span className="ff-note">reading file…</span>}
              {f.state === "reading-doc" && <span className="ff-note">extracting…</span>}
              {f.state === "error" && <span className="ff-err">{f.message}</span>}
              {f.state === "duplicate" && (
                <>
                  <span className="ff-dup">
                    You have already uploaded this file. Replace what's recorded?
                  </span>
                  <span className="ff-actions">
                    <button className="ff-btn" onClick={() => onReplace(f)}>Replace</button>
                    <button className="ff-btn ghost" onClick={() => onDismiss(f.id)}>Keep existing</button>
                  </span>
                </>
              )}
              {f.state === "done" && f.result?.contract && (
                <span className="ff-ok">
                  Contract read · {f.result.commitments?.length ?? 0} payment
                  {(f.result.commitments?.length ?? 0) === 1 ? "" : "s"} scheduled
                  {f.result.commitments?.length
                    ? ` · ${f.result.commitments[0].dueDate} to ` +
                      `${f.result.commitments[f.result.commitments.length - 1].dueDate}`
                    : ""}
                  {f.result.reviewReason && ` · ${f.result.reviewReason}`}
                </span>
              )}
              {f.state === "done" && f.result?.extraction && (
                <span className="ff-ok">
                  {fmtAmount(
                    f.result.currency || f.result.extraction.currency,
                    Math.round(
                      f.result.extraction.total *
                        (ZERO_DECIMAL.has(f.result.currency || f.result.extraction.currency) ? 1 : 100)
                    )
                  )}
                  {" · "}{f.result.categoryName || "uncategorised"}
                  {f.result.matchedRule && " · known vendor"}
                  {f.result.needsReview && " · needs a look"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
