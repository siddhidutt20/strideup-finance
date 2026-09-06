import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { FIN_CSS, STATEMENT_CSS, FORECAST_CSS, CONTRACTS_CSS, CONTRACTS_EXTRA_CSS, LEDGER_EDIT_CSS, FUTURE_CSS, CASHFLOW_AHEAD_CSS, CF_NONE_CSS, VENDORS_CSS, CASH_CSS, CONTRACTS_GROUP_CSS, SIDE_CSS, CASH_BAND_CSS, NARROW_FIX_CSS, INVOICE_CSS, RECORD_CSS, OVERVIEW_CSS, PL_CSS, BOOKS_CSS, HOUSEHOLD_CSS, HOME_CSS, MONEY_CSS, LONG_CSS, EXPENSES_CSS, MERGE_CSS, PROFILE_CSS } from "./finance/styles.js";
import {
  fmtAmount, monthLabel, readFile, shiftMonth, thisMonth, useMoney, ZERO_DECIMAL,
  ENTITY_LABEL, entityChoices, viewsFor, moneyInLabel, loadEntity, saveEntity,
} from "./finance/format.js";
import {
  OverviewView, LedgerView, ToolsView,
} from "./finance/views.jsx";
import { ForecastView } from "./finance/forecast.jsx";
import { ContractsView } from "./finance/contracts.jsx";
import { VendorsView } from "./finance/vendors.jsx";
import { CashView } from "./finance/cash.jsx";
import { OverviewDash } from "./finance/overview.jsx";
import { SideView } from "./finance/side.jsx";
import { PlView, BudgetEditor } from "./finance/pl.jsx";
import { BudgetView, BillsView } from "./finance/household.jsx";
import { MoneyView } from "./finance/money.jsx";
import { WealthView } from "./finance/wealth.jsx";
import { GoalsView } from "./finance/goals.jsx";
import { ReportsView } from "./finance/reports.jsx";
import { HomeView, greeting } from "./finance/home.jsx";
import { Search, Alerts, AccountMenu } from "./finance/topbar.jsx";
import { Avatar, ProfileSheet } from "./finance/profile.jsx";
import { PayInvoice, InvoiceList } from "./finance/invoice.jsx";
import { NewRecord } from "./finance/record.jsx";
import { DueSoon } from "./finance/spend.jsx";
import { Panel, CapitalList } from "./finance/pieces.jsx";
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
const NEEDS_STATEMENTS = new Set(["revenue", "expenses", "cashflow"]);

// Household pages that carry their own Export and Add. The generic header row
// would only repeat them a few pixels away.
const SELF_SERVED = new Set(["money"]);

// What a household's pages call themselves. Two lines and a sentence: the
// second line is the one that carries the colour, so the sentence reads as
// one thing rather than a heading with a label stuck under it.
const PERSONAL_HEADS = {
  budget: ["Budget", "Stay on track,", "for what matters.",
           "Set your budget, track what you actually spend, and see what is left."],
  wealth: ["Wealth", "Grow today,", "for a brighter tomorrow.",
           "What you own, what you owe, and what that leaves — all in one place."],
  goals: ["Goals", "Big dreams,", "real progress.",
          "Set goals, track your progress, and see what each one asks of a month."],
  reports: ["Reports & insights", "Understand today,", "make better tomorrow.",
            "Your own months, read together."],
  bills: ["Bills & subscriptions", "Never miss a payment,", "stay in control.",
          "Every bill and subscription, all in one place."],
  money: ["Money", "Everything that moved,", "in one place.",
          "What came in, what went out, and every row behind both."],
};

// Months ahead the picker will walk to. Future months hold no actuals — the
// point of visiting one is to see what is already committed to land in it.
const HORIZON_MONTHS = 18;

// Where "+ New" and "Upload" appear, and which direction each page is about.
const RECORD_VIEWS = { overview: "out", revenue: "in", expenses: "out",
                       ledger: "out", vendors: "out" };

export default function FinanceDashboard({ owner, onLogout, onOwner,
                                          brand = { name: "StrideUp Finance", wordmark: true } }) {
  const [view, setView] = useState("overview");
  const [period, setPeriod] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [statements, setStatements] = useState(null);
  const [entries, setEntries] = useState([]);
  const [categories, setCategories] = useState([]);
  const [books, setBooks] = useState(null);
  // Books still in this database that this deployment no longer shows.
  // Only the transfer tool reads them, so they can be moved out.
  const [leftover, setLeftover] = useState([]);
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
  const [dash, setDash] = useState(null);
  const [dashFailed, setDashFailed] = useState(false);
  const [pl, setPl] = useState(null);
  const [household, setHousehold] = useState(null);
  const [home, setHome] = useState(null);
  const [income, setIncome] = useState(null);
  const [spend, setSpend] = useState(null);
  const [we, setWe] = useState(null);
  const [go, setGo] = useState(null);
  const [rp, setRp] = useState(null);
  const [rpMonths, setRpMonths] = useState(6);
  // Bumped to make the transaction list refetch after something changes.
  const [txKey, setTxKey] = useState(0);
  const [addingSource, setAddingSource] = useState(false);
  const [budgeting, setBudgeting] = useState(false);
  const [plSpan, setPlSpan] = useState("month");
  // Which period the statement is read against. Null follows the month
  // picker — one back — until a month is chosen deliberately.
  const [plCompare, setPlCompare] = useState(null);
  const [sides, setSides] = useState(null);
  const [invoices, setInvoices] = useState(null);
  const [paying, setPaying] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadKindPick, setUploadKindPick] = useState(null);
  const [adding, setAdding] = useState(false);
  const setEntity = (v) => { saveEntity(v); setEntityState(v); };
  const [busy, setBusy] = useState(false);
  const [profiling, setProfiling] = useState(false);
  const bumpTx = useCallback(() => setTxKey((k) => k + 1), []);

  const money = useMoney(data?.baseCurrency || "USD");

  // What this deployment offers. One set of books is not a choice, so the
  // entity is pinned to it rather than left on whatever was last remembered
  // from another instance in the same browser.
  const choices = useMemo(() => entityChoices(books), [books]);
  // Which pages this instance carries, and what it calls money coming in.
  const views = useMemo(() => viewsFor(VIEWS, books), [books]);
  const inLabel = useMemo(() => moneyInLabel(books), [books]);
  // A household's first screen is its own page, not the company overview
  // wearing a different word. Same ledger, same month, different question.
  const personalOnly = (books ?? []).length === 1 && books[0].id === "personal";
  const isHome = personalOnly && view === "overview";
  // A page this instance does not have must not stay open behind the nav.
  useEffect(() => {
    if (!views.some((v) => v[0] === view)) setView("overview");
    // eslint-disable-next-line
  }, [views]);
  useEffect(() => {
    if (choices.length === 1 && entity !== choices[0]) setEntity(choices[0]);
    else if (choices.length > 1 && !choices.includes(entity)) setEntity(choices[0]);
    // eslint-disable-next-line
  }, [choices]);

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
        // Which sets of books this deployment keeps. A personal instance
        // answers with one, and the switcher goes away.
        if (cats.entities) setBooks(cats.entities);
        setLeftover(cats.leftover ?? []);
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

  // A comparison month chosen for August makes no sense once the picker moves
  // to June, so it follows the picker back to the default rather than being
  // silently kept.
  useEffect(() => { setPlCompare(null); }, [period]);

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
  // Nine calls, each feeding a different page. They used to be awaited
  // together and assigned together, so one failing call left every one of them
  // unassigned — a single 500 on the vendor list blanked the Overview, which
  // does not use the vendor list at all. Each result is now settled and
  // applied on its own; what fails is named, and what worked still lands.
  const loadForecast = useCallback(async () => {
    const jobs = [
      ["the projection", () => api.finForecast(entity, 6), setForecast],
      ["commitments", () => api.finCommitments(entity), setCommitments],
      ["what is due", () => api.finDue(entity, 30), setDue],
      ["the payment schedule", () => api.finSchedule(entity, period), setSchedule],
      ["vendor management", () => api.finVendors(entity), setVendors],
      ["the cash dashboard", () => api.finCash(entity, 3), setCash],
      ["the overview", () => api.finDashboard(entity, period),
       (v) => { setDash(v); setDashFailed(false); }],
      ["revenue", () => api.finSide("in", entity, period), (v) => setSides((s) => ({ ...s, in: v }))],
      ["expenses", () => api.finSide("out", entity, period), (v) => setSides((s) => ({ ...s, out: v }))],
      ["invoices", () => api.finInvoices(entity), setInvoices],
    ];
    const results = await Promise.allSettled(jobs.map(([, run]) => run()));
    const broken = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") { jobs[i][2](r.value); return; }
      broken.push(`${jobs[i][0]} (${r.reason?.message || "failed"})`);
      if (jobs[i][0] === "the overview") setDashFailed(true);
    });
    setError(broken.length
      ? `Could not load ${broken.join(", ")}. Everything else on this page is current.`
      : "");
  }, [entity, period]);

  useEffect(() => {
    if (!["forecast", "contracts", "vendors", "cashflow", "revenue", "expenses",
          "overview", "ledger"].includes(view)
        && period <= thisMonth()) return;
    loadForecast();
  }, [view, entity, period, loadForecast]);

  // The P&L carries a statement, a plan, twelve months of trend and the
  // comparison period, so it is fetched only when that page is open.
  const loadPl = useCallback(async () => {
    try {
      setPl(await api.finPl(entity, period, plSpan, plCompare));
    } catch (err) {
      setError(err.message || "Could not load the profit and loss.");
    }
  }, [entity, period, plSpan, plCompare]);

  useEffect(() => {
    if (view !== "pnl") return;
    loadPl();
  }, [view, loadPl]);

  // Budget and Bills read one month of the household view.
  const loadHousehold = useCallback(async () => {
    try {
      setHousehold(await api.finHousehold(entity, period));
    } catch (err) {
      setError(err.message || "Could not load the month.");
    }
  }, [entity, period]);

  useEffect(() => {
    if (!["budget", "bills"].includes(view)) return;
    loadHousehold();
  }, [view, loadHousehold]);

  // The home page is one call: everything on it comes back together, so no
  // panel is ever showing one month's figures beside another's.
  const loadHome = useCallback(async () => {
    try {
      setHome(await api.finHome(entity, period));
    } catch (err) {
      setError(err.message || "Could not load the home page.");
    }
  }, [entity, period]);

  useEffect(() => {
    if (!isHome) return;
    loadHome();
  }, [isHome, loadHome]);

  // The Income page, for a household. The business Revenue page is unchanged.
  const loadIncome = useCallback(async () => {
    try {
      setIncome(await api.finIncome(entity, period));
    } catch (err) {
      setError(err.message || "Could not load your income.");
    }
  }, [entity, period]);

  useEffect(() => {
    if (!(personalOnly && view === "money")) return;
    loadIncome();
    // eslint-disable-next-line
  }, [personalOnly, view, loadIncome]);

  // Spending, for a household: the same ledger, split by what an agreement
  // caused and what did not.
  const loadSpend = useCallback(async () => {
    try { setSpend(await api.finExpenses(entity, period)); }
    catch (err) { setError(err.message || "Could not load your spending."); }
  }, [entity, period]);

  useEffect(() => {
    if (!(personalOnly && view === "money")) return;
    loadSpend();
    // eslint-disable-next-line
  }, [personalOnly, view, loadSpend]);

  // What you own, what you are saving toward, and the months read together.
  // Wealth is not scoped to a month — a position is a position — so it does
  // not reload when the picker moves.
  const loadWealth = useCallback(async () => {
    try { setWe(await api.finWealth(entity)); }
    catch (err) { setError(err.message || "Could not load what you own."); }
  }, [entity]);
  const loadGoals = useCallback(async () => {
    try { setGo(await api.finGoals(entity)); }
    catch (err) { setError(err.message || "Could not load your goals."); }
  }, [entity]);
  const loadReports = useCallback(async () => {
    try { setRp(await api.finReports(entity, period, rpMonths)); }
    catch (err) { setError(err.message || "Could not build that report."); }
  }, [entity, period, rpMonths]);

  useEffect(() => {
    if (view === "wealth") loadWealth();
    if (view === "goals") loadGoals();
    if (view === "reports") loadReports();
  }, [view, loadWealth, loadGoals, loadReports]);

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

  // Every commitment across whichever books are in view, for the schedule
  // section under the ledger.
  const scheduledRows = useMemo(() => {
    if (!commitments?.byEntity) return null;
    return entityList.flatMap((e) => commitments.byEntity[e]?.commitments ?? []);
  }, [commitments, entityList]);

  // Correcting what the reader made of a contract. Everything downstream is
  // built from these rows, so one save reaches all of it — which is why both
  // handlers reload the forecast set rather than patching state in place.
  const scheduleActions = useMemo(() => ({
    update: async (id, body) => {
      try { await api.updateCommitment(id, body); await loadForecast(); }
      catch (err) { setError(err.message || "Could not save that change."); throw err; }
    },
    remove: async (k) => {
      const what = k.counterparty || k.description || "this payment";
      if (!window.confirm(
        `Delete the scheduled payment "${k.description}" to ${what}?\n\n` +
        `It stops appearing in the forecast, the cash flow and the schedule. ` +
        `Anything already recorded as paid stays in the ledger.`
      )) return;
      try { await api.deleteCommitment(k.id); await loadForecast(); }
      catch (err) { setError(err.message || "Could not delete that."); }
    },
  }), [loadForecast]);

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

  // An invoice and the money recorded against it are one thing, so they go
  // together. What that means is said before it happens, not after.
  async function removeInvoice(inv) {
    const paid = inv.paidMinor > 0;
    if (!window.confirm(
      `Remove invoice ${inv.number} for ${inv.customer || "no customer"}?\n\n` +
      (paid
        ? `${fmtAmount(inv.currency, inv.paidMinor)} has been recorded as ` +
          `collected against it. Those ledger entries are removed too, so the ` +
          `month goes down by that much. A closed month cannot be touched — if ` +
          `any of it sits in one, nothing is deleted and you will be told which.`
        : `Nothing has been recorded against it, so no ledger entry is affected.`)
    )) return;
    try {
      const r = await api.deleteInvoice(inv.id);
      if (r?.removedEntries) {
        setError(`Invoice ${inv.number} removed, along with ${r.removedEntries} ` +
                 `ledger entr${r.removedEntries === 1 ? "y" : "ies"}.`);
      }
      loadForecast(); load(period);
    } catch (err) { setError(err.message || "Could not remove that invoice."); }
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
        <style>{FIN_CSS + STATEMENT_CSS + FORECAST_CSS + CONTRACTS_CSS + CONTRACTS_EXTRA_CSS + LEDGER_EDIT_CSS + FUTURE_CSS + CASHFLOW_AHEAD_CSS + CF_NONE_CSS + VENDORS_CSS + CASH_CSS + CONTRACTS_GROUP_CSS + SIDE_CSS + CASH_BAND_CSS + NARROW_FIX_CSS + INVOICE_CSS + RECORD_CSS + OVERVIEW_CSS + PL_CSS + BOOKS_CSS + HOUSEHOLD_CSS + HOME_CSS + MONEY_CSS + LONG_CSS + EXPENSES_CSS + MERGE_CSS + PROFILE_CSS}</style>
        <div className="fin-boot"><div className="fin-spinner" /></div>
      </div>
    );
  }

  const [, , heading, blurbBase] = (views.find((v) => v[0] === view) ?? VIEWS[0]);
  const blurb =
    view === "ledger" && ledgerScope === "all"
      ? "Every entry recorded, across all months"
      : blurbBase;
  const waiting =
    (NEEDS_STATEMENTS.has(view) &&
     (statements?.period !== period || statements?.entity !== entity)) ||
    // The overview is now month-scoped too, so a month's figures are never
    // shown under another month's heading while the new ones are in flight.
    // `dashFailed` breaks the wait: a spinner that will never resolve is
    // indistinguishable from a page that is simply broken.
    (view === "overview" && !isHome && !dashFailed && (!dash || dash.period !== period));
  // Adding things belongs where you are looking at them: a sales invoice on
  // Revenue, a bill on Expenses.

  // Which side "+ New" defaults to, and what a dropped file is assumed to be.
  const recordSide = RECORD_VIEWS[view];
  const uploadKind = uploadKindPick ??
    (view === "revenue" ? "revenue" : view === "vendors" ? "contract" : "expense");
  // "Empty" means these books hold nothing at all, in any month — not that
  // the month you happen to be looking at is quiet. A new month opens with
  // last month's position carried forward, and blanking the page over it
  // threw away cash, commitments, outstanding invoices and every chart.
  const isEmpty = entityList.every((e) => {
    const ov = dash?.byEntity?.[e];
    if (ov && typeof ov.entriesEver === "number") return ov.entriesEver === 0;
    // Before the overview lands, fall back to what the month knows.
    return (data?.byEntity?.[e]?.summary?.entryCount ?? 0) === 0 &&
           !data?.byEntity?.[e]?.receivables?.total;
  });

  return (
    <div className="fin-app">
      <style>{FIN_CSS + STATEMENT_CSS + FORECAST_CSS + CONTRACTS_CSS + CONTRACTS_EXTRA_CSS + LEDGER_EDIT_CSS + FUTURE_CSS + CASHFLOW_AHEAD_CSS + CF_NONE_CSS + VENDORS_CSS + CASH_CSS + CONTRACTS_GROUP_CSS + SIDE_CSS + CASH_BAND_CSS + NARROW_FIX_CSS + INVOICE_CSS + RECORD_CSS + OVERVIEW_CSS + PL_CSS + BOOKS_CSS + HOUSEHOLD_CSS + HOME_CSS + MONEY_CSS + LONG_CSS + EXPENSES_CSS + MERGE_CSS + PROFILE_CSS}</style>

      <aside className="fin-side" aria-label="Sections">
        <div className="fin-sidebrand">
          <Brand brand={brand} height={53} />
        </div>
        <p className="fin-sidelabel">Menu</p>
        <nav>
          <ul>
            {views.map(([id, label]) => (
              <li key={id}>
                <button className={view === id ? "on" : ""}
                        aria-current={view === id ? "page" : undefined}
                        onClick={() => setView(id)}>
                  {ICONS[personalOnly && id === "overview" ? "home" : id]}
                  <span>{label}</span>
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
        {/* Who you are and the way out live in the bar above the page where
            there is one. Two of each, in two corners, is not redundancy —
            it is a second thing to keep in step with the first. */}
        {owner && !personalOnly && (
          <div className="fin-sideuser">
            <Avatar owner={owner} size={30} />
            <span className="fin-sidewho">
              <b>{owner.name}</b>
              <em>{owner.email}</em>
            </span>
            <button className="fin-sideedit" onClick={() => setProfiling(true)}
                    title="Your profile" aria-label="Your profile">
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none"
                   stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                   strokeLinejoin="round" aria-hidden="true">
                <path d="M13.2 3.6a1.9 1.9 0 0 1 2.7 2.7L7.4 14.8l-3.6.9.9-3.6Z" />
              </svg>
            </button>
          </div>
        )}
        {owner && !personalOnly && (
          // A bare ↪ with a tooltip is not a control anyone finds. The way out
          // of an app has to say what it is.
          <button className="fin-sideout" onClick={onLogout}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
                 stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
                 strokeLinejoin="round" aria-hidden="true">
              <path d="M10 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
              <path d="M16 16l4-4-4-4" />
              <path d="M20 12H10" />
            </svg>
            Log out
          </button>
        )}
      </aside>

      <div className="fin">
        {personalOnly && (
          <div className="fin-topbar">
            <Search entity={entity} onOpen={(r) => { setPeriod(r.period); setView("ledger"); }} />
            <Alerts alerts={home?.byEntity?.[entity]?.alerts} onGo={setView} />
            <AccountMenu owner={owner} onLogout={onLogout}
                         onProfile={() => setProfiling(true)} />
          </div>
        )}
        <header className={`fin-viewhead${isHome || (personalOnly && PERSONAL_HEADS[view]) ? " fin-greet" : ""}`}>
          <div>
            {!isHome && personalOnly && PERSONAL_HEADS[view] ? (
              <>
                <p className="fin-eyebrow">{PERSONAL_HEADS[view][0]}</p>
                <h1 className="fin-twoline">
                  {PERSONAL_HEADS[view][1]}<br />
                  <i>{PERSONAL_HEADS[view][2]}</i>
                </h1>
                <p>{PERSONAL_HEADS[view][3]}</p>
              </>
            ) : isHome ? (
              <>
                <p className="fin-eyebrow">Welcome back</p>
                <h1>
                  {greeting()}, <i>{String(owner?.name || "there").split(/\s+/)[0]}!</i>
                </h1>
                <p>Here's your financial snapshot for {monthLabel(period)}.</p>
              </>
            ) : (
              <>
                <h1>{heading}</h1>
                <p>
                  {view === "ledger" && ledgerScope === "all"
                    ? `${blurb}.`
                    : `${blurb} ${monthLabel(period)}.`}
                </p>
              </>
            )}
          </div>
          {isHome && (
            <p className="fin-motto" aria-hidden="true">
              “A calmer today<br />for a brighter tomorrow.”
            </p>
          )}
          <div className="fin-headctl">
            {RECORD_VIEWS[view] && !(personalOnly && SELF_SERVED.has(view)) && (
              <span className="fin-headacts">
                <a className="fin-btn ghost" href={api.finExportUrl()}
                   title="Every entry, as a spreadsheet">Export</a>
                <button className="fin-btn ghost" onClick={() => setUploading(true)}>
                  Upload
                </button>
                <button className="fin-btn" onClick={() => setAdding(true)}>+ New</button>
              </span>
            )}
            {choices.length > 1 && (
              <div className="fin-entnav" role="group" aria-label="Which books">
                {choices.map((e) => (
                  <button key={e} className={entity === e ? "on" : ""}
                          aria-pressed={entity === e}
                          onClick={() => setEntity(e)}>{ENTITY_LABEL[e]}</button>
                ))}
              </div>
            )}
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

      {period > thisMonth() && view !== "overview" &&
        <FutureMonth period={period} entityList={entityList}
                     forecast={forecast} money={money} onGo={setView} />}
      {data && !data.aiEnabled && view === "overview" && (
        <div className="fin-warn">
          Reading documents needs an Anthropic API key. Set <code>ANTHROPIC_API_KEY</code>{" "}
          and redeploy — everything else works without it.
        </div>
      )}

      {/* The extraction feed follows the dialog out, but stays visible after it
          closes — a document being read is worth watching finish. */}
      {profiling && (
        <ProfileSheet owner={owner}
                      onClose={() => setProfiling(false)}
                      onSaved={(o) => { setProfiling(false); onOwner?.(o); }} />
      )}

      {feed.length > 0 && !uploading && (
        <UploadFeed feed={feed} money={money} onReplace={replaceFile} onDismiss={dismiss} />
      )}

      {view === "overview" && isEmpty && period <= thisMonth() ? (
        <div className="fin-empty">
          <h2>Nothing recorded yet</h2>
          <p>
            Drop an invoice above, or open the Ledger and write an entry by hand —
            capital you put in, a payment that never had a document, anything at all.
          </p>
        </div>
      ) : waiting ? (
        <div className="fin-boot"><div className="fin-spinner" /></div>
      ) : (
        <>
          {isHome && (home && home.period === period ? (
            (home.entities ?? [entity]).map((ent) => (
              <HomeView key={`hm-${ent}`} home={home.byEntity[ent]} money={money}
                        period={period} owner={owner} onGo={setView}
                        onEditBudget={() => setBudgeting(true)}
                        onUpload={() => { setUploadKindPick("expense"); setUploading(true); }}
                        onAdd={() => setAdding(true)} />
            ))
          ) : <div className="fin-boot"><div className="fin-spinner" /></div>)}
          {view === "overview" && !isHome && dashFailed && (!dash || dash.period !== period) && (
            <div className="fin-warn">
              The overview could not be built for {monthLabel(period)}. The message
              above says which part failed; every other page is unaffected.
            </div>
          )}
          {view === "overview" && !isHome && dash && dash.period === period &&
            (dash.entities ?? [entity]).map((ent) => (
            <EntityBlock key={`ov-${ent}`} show={(dash.entities ?? []).length > 1}
                         label={dash.byEntity[ent].label}>
              <OverviewDash ov={dash.byEntity[ent]} money={money} period={period}
                            onGo={setView} />
            </EntityBlock>
          ))}
          {false && view === "overview" && entityList.map((ent) => (
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
          {personalOnly && view === "money" && (
            <MoneyView ex={spend?.period === period ? spend.byEntity[entity] : null}
                       inc={income?.period === period ? income.byEntity[entity] : null}
                       money={money} period={period} entity={entity}
                       categories={categories} currency={data?.baseCurrency || "USD"}
                       books={entityList} leftover={leftover}
                       onGo={setView}
                       onAdd={() => { setUploadKindPick(null); setAdding(true); }}
                       onUpload={() => { setUploadKindPick("expense"); setUploading(true); }}
                       onBooksDone={() => { load(period); loadForecast(); }}
                       onChanged={() => {
                         loadSpend(); loadIncome(); load(period); loadForecast();
                       }} />
          )}
          {view === "wealth" && (we ? (
            (we.entities ?? [entity]).map((ent) => (
              <WealthView key={`we-${ent}`} we={we.byEntity[ent]} money={money} entity={ent}
                          currency={data?.baseCurrency || "USD"}
                          onChanged={() => { loadWealth(); loadGoals(); }} />
            ))
          ) : <div className="fin-boot"><div className="fin-spinner" /></div>)}
          {view === "goals" && (go ? (
            (go.entities ?? [entity]).map((ent) => (
              <GoalsView key={`go-${ent}`} go={go.byEntity[ent]}
                         money={money} entity={ent} currency={data?.baseCurrency || "USD"}
                         onGo={setView}
                         onChanged={() => { loadGoals(); loadWealth(); }} />
            ))
          ) : <div className="fin-boot"><div className="fin-spinner" /></div>)}
          {view === "reports" && (rp && rp.period === period ? (
            (rp.entities ?? [entity]).map((ent) => (
              <ReportsView key={`rp-${ent}`} rp={rp.byEntity[ent]} money={money}
                           period={period} months={rpMonths}
                           onMonths={setRpMonths} onPeriod={setPeriod} />
            ))
          ) : <div className="fin-boot"><div className="fin-spinner" /></div>)}
          {!personalOnly && view === "revenue" && sides?.in && (sides.in.entities ?? [entity]).map((ent) => (
            <EntityBlock key={ent} show={(sides.in.entities ?? []).length > 1}
                         label={sides.in.byEntity[ent].label}>
              <SideView sd={sides.in.byEntity[ent]} money={money} period={period}
                        inLabel={inLabel} trend={trendFor(ent)} />
            </EntityBlock>
          ))}
          {!personalOnly && view === "revenue" && invoices && (
            <Panel title="Invoices raised"
                   sub="Money owed to you — becomes revenue when you record it as paid">
              <InvoiceList invoices={invoices.invoices} money={money} busy={busy}
                           onPay={setPaying} onDelete={removeInvoice} />
            </Panel>
          )}
          {view === "expenses" && sides?.out && (sides.out.entities ?? [entity]).map((ent) => (
            <EntityBlock key={ent} show={(sides.out.entities ?? []).length > 1}
                         label={sides.out.byEntity[ent].label}>
              <SideView sd={sides.out.byEntity[ent]} money={money} period={period}
                        inLabel={inLabel} trend={trendFor(ent)} />
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
              {/* The month's opening/movement/closing statement used to sit here.
                  The dashboard above already carries the position over time and
                  the month's movements, so it was saying the same thing twice.
                  Capital is different information, and only appears when there
                  is any — an empty panel asserting "no capital events" is
                  clutter on a page nobody visits to learn that. */}
              {statements && entityList.some(
                (ent) => (statements.byEntity[ent].capital?.items?.length ?? 0) > 0
              ) && (
                <div className={entityList.length > 1 ? "fin-sidebyside" : ""}>
                  {entityList
                    .filter((ent) => (statements.byEntity[ent].capital?.items?.length ?? 0) > 0)
                    .map((ent) => (
                      <EntityBlock key={ent} show={entityList.length > 1}
                                   label={statements.byEntity[ent].label}>
                        <Panel title="Capital" sub="Equity, loans and draws to date">
                          <CapitalList capital={statements.byEntity[ent].capital} money={money} />
                        </Panel>
                      </EntityBlock>
                    ))}
                </div>
              )}
            </>
          )}
          {view === "pnl" && (pl && pl.period === period ? (
            (pl.entities ?? [entity]).map((ent) => (
              <EntityBlock key={`pl-${ent}`} show={(pl.entities ?? []).length > 1}
                           label={pl.byEntity[ent].label}>
                <PlView pl={pl.byEntity[ent]} money={money} period={period}
                        span={plSpan} compare={pl.compare}
                        onSpan={setPlSpan} onCompare={setPlCompare}
                        categories={categories} entity={ent}
                        onBudgetSaved={loadPl} />
              </EntityBlock>
            ))
          ) : (
            <div className="fin-boot"><div className="fin-spinner" /></div>
          ))}
          {["budget", "bills"].includes(view) && (
            household && household.period === period ? (
              (household.entities ?? [entity]).map((ent) => (
                <EntityBlock key={`hh-${ent}`} show={(household.entities ?? []).length > 1}
                             label={household.byEntity[ent].label}>
                  {view === "budget" ? (
                    <BudgetView hh={household.byEntity[ent]} money={money} period={period}
                                onEditBudget={() => setBudgeting(true)} onGo={setView} />
                  ) : (
                    <BillsView hh={household.byEntity[ent]} money={money} period={period}
                               entity={ent} categories={categories}
                               schedule={schedule?.byEntity?.[ent]}
                               onScheduleChange={() => { loadForecast(); loadHousehold(); }}
                               currency={data?.baseCurrency || "USD"}
                               adding={addingSource}
                               onAdd={() => setAddingSource(true)}
                               onCloseAdd={() => setAddingSource(false)}
                               onUpload={() => { setUploadKindPick("expense"); setUploading(true); }}
                               onChanged={() => { loadHousehold(); loadForecast(); }}
                               onGo={setView} />
                  )}
                </EntityBlock>
              ))
            ) : <div className="fin-boot"><div className="fin-spinner" /></div>
          )}
          {budgeting && (
            <BudgetEditor entity={entity === "both" ? entityList[0] : entity}
                          period={period} categories={categories} money={money}
                          onClose={() => setBudgeting(false)}
                          onSaved={() => { setBudgeting(false); loadHousehold(); loadPl(); loadHome(); }} />
          )}
          {view === "ledger" && (
            <LedgerView entries={entries} categories={categories} money={money}
                        baseCurrency={data?.baseCurrency || "USD"} period={period}
                        showEntity={entityList.length > 1}
                        scope={ledgerScope} onScope={setLedgerScope}
                        onFix={fixEntry} onRemove={removeEntry} onCurrency={fixCurrency}
                        onAmount={fixAmount}
                        commitments={scheduledRows} onSchedule={scheduleActions}
                        showBooks={!views.some((v) => v[0] === "tools")}
                        entityList={entityList} leftover={leftover}
                        onDone={() => { load(period); loadForecast(); }} />
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
                             categories={categories}
                             showEntity={(vendors.entities ?? []).length > 1}
                             onRecord={(u) => { setView("contracts"); }}
                             onChange={() => { loadForecast(); load(period); }}
                             busy={busy} />
              </EntityBlock>
            ))
          ) : <div className="fin-boot"><div className="fin-spinner" /></div>)}
          {view === "contracts" && (schedule ? (
            (schedule.entities ?? [entity]).map((ent) => (
              <EntityBlock key={ent} show={(schedule.entities ?? []).length > 1}
                           label={schedule.byEntity[ent].label}>
                <ContractsView sched={schedule.byEntity[ent]} money={money} period={period}
                               onChange={() => { loadForecast(); load(period); }} />
              </EntityBlock>
            ))
          ) : <div className="fin-boot"><div className="fin-spinner" /></div>)}
          {view === "tools" && (
            <ToolsView period={period} entity={entity} entityList={entityList}
                       byEntity={data?.byEntity} leftover={leftover}
                       onDone={() => load(period)} />
          )}
          </>
        )}
      </div>

      {adding && (
        <NewRecord side={recordSide === "in" ? "in" : "out"} entity={entity}
                   currency={data?.baseCurrency || "USD"} categories={categories}
                   onClose={() => setAdding(false)}
                   onSaved={() => { loadForecast(); load(period); bumpTx(); }} />
      )}
      {uploading && (
        <UploadDialog kind={uploadKind} onKind={setUploadKindPick} onFiles={handleFiles}
                      busy={busy} feed={feed} money={money} onReplace={replaceFile}
                      onDismiss={dismiss} onClose={() => setUploading(false)} />
      )}
      {paying && (
        <PayInvoice invoice={paying} categories={categories} money={money}
                    onClose={() => setPaying(null)}
                    onSaved={() => { setPaying(null); loadForecast(); load(period); }} />
      )}
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
    title: "Drop receipts and payment confirmations here",
    body: "Proof that money arrived — a receipt, a remittance, a settled invoice. " +
          "Read and recorded as revenue automatically. For money owed to you that " +
          "has not arrived yet, use New invoice instead.",
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

// The drop zone used to sit permanently on four pages, taking a large block
// of the screen to say the same thing each time. It is a button now; the
// dialog it opens still accepts a drop, and asks what the file is rather than
// inferring it from which page you happened to be on.
function UploadDialog({ kind, onKind, onFiles, busy, feed, money, onReplace, onDismiss, onClose }) {
  return (
    <div className="ct-modal" role="dialog" aria-modal="true" aria-label="Upload documents">
      <div className="ct-dialog up-dialog">
        <h3>Upload a document</h3>
        <div className="nr-kinds" role="group" aria-label="What kind of document">
          {[["expense", "Bill or receipt", "Something you paid for"],
            ["revenue", "Proof of payment", "Money that arrived"],
            ["contract", "Contract or agreement", "Future payments, read into a schedule"]]
            .map(([k, label, hint]) => (
              <button key={k} type="button" className={`nr-kind${kind === k ? " on" : ""}`}
                      onClick={() => onKind(k)}>
                <b>{label}</b><em>{hint}</em>
              </button>
            ))}
        </div>
        <UploadZone kind={kind} onFiles={onFiles} busy={busy} feed={feed} money={money}
                    onReplace={onReplace} onDismiss={onDismiss} />
        <div className="ct-dialogactions">
          <button type="button" className="fin-btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

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

// The extraction feed, shown outside the upload dialog so a document being
// read is still watchable after the dialog is dismissed.
function UploadFeed({ feed, money, onReplace, onDismiss }) {
  return (
    <ul className="fin-feed fin-feed-loose">
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
              Contract read · {f.result.commitments?.length ?? 0} commitment
              {(f.result.commitments?.length ?? 0) === 1 ? "" : "s"} scheduled
            </span>
          )}
          {f.state === "done" && f.result?.extraction && (
            <span className="ff-ok">
              {fmtAmount(f.result.currency || f.result.extraction.currency,
                Math.round(f.result.extraction.total *
                  (ZERO_DECIMAL.has(f.result.currency || f.result.extraction.currency) ? 1 : 100)))}
              {" · "}{f.result.categoryName || "uncategorised"}
              {f.result.needsReview && " · needs a look"}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}


// ── The mark ─────────────────────────────────────────────────
// An instance shows its own logo where it has one, and sets its name in type
// where it does not. The fallback is on the image failing to load rather than
// on a flag, so dropping a file into client/public is the whole of adding a
// logo — nothing to configure, and never a broken image if the file is not
// there.
export function Brand({ brand, height }) {
  const [failed, setFailed] = useState(false);
  const words = brand.name.trim().split(/\s+/);
  if (brand.wordmarkSrc && !failed) {
    return (
      <>
        {/* The company's lockup is wide and short, so it is sized by height.
            A logo of unknown proportions is sized by the width it has to sit
            in — a stacked mark with a name and a tagline under it is
            unreadable at the height a wordmark wants. */}
        <img src={brand.wordmarkSrc} alt={brand.name}
             className={`fin-wordmark${brand.wordmark ? "" : " fin-logo"}`}
             style={brand.wordmark ? { height } : undefined}
             onError={() => setFailed(true)} />
        {/* A logo says who; the word under it says what. Where the name is one
            word the logo has already said it, and repeating it under the mark
            is noise. */}
        {words.length > 1 && <span className="fin-product">{words.at(-1)}</span>}
      </>
    );
  }
  return (
    <span className="fin-brandtype">
      {words.slice(0, -1).join(" ")}
      <b>{words.at(-1)}</b>
    </span>
  );
}
