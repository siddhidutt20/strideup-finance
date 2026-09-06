// Every figure the app shows, checked against the ledger it came from and
// against the same figure wherever else it appears. A dashboard whose pages
// disagree is worse than no dashboard.
// Which instance to check. A personal deployment runs the same audit against
// its own database — the checks are about the figures, not about whose they are.
const B = process.env.AUDIT_BASE || "http://localhost:4177/api";
const r=await fetch(B+"/auth/login",{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({
    email: process.env.AUDIT_EMAIL || "ceo@strideup.org",
    password: process.env.AUDIT_PASSWORD || "owner-pass-1234",
  })});
// Say so here rather than dying twenty lines later on an empty response —
// "cannot read properties of undefined" is not a login error message.
if (!r.ok) {
  console.error(`  could not sign in to ${B} (${r.status}). ` +
                `Set AUDIT_EMAIL and AUDIT_PASSWORD for this instance.`);
  process.exit(1);
}
const cookie=r.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
const g=async p=>(await (await fetch(B+p,{headers:{cookie}})).json());
const M=v=>(v/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
let pass=0, fail=0;
const check=(name,a,b,note="")=>{
  const ok = a===b;
  if (ok) pass++; else fail++;
  console.log(`  ${ok?"ok  ":"FAIL"} ${name.padEnd(52)} ${M(a).padStart(13)} ${ok?"=":"≠"} ${M(b).padStart(13)} ${note}`);
};
const near=(name,a,b,tol=1)=>{
  const ok=Math.abs(a-b)<=tol; if(ok)pass++; else fail++;
  console.log(`  ${ok?"ok  ":"FAIL"} ${name.padEnd(52)} ${M(a).padStart(13)} ${ok?"≈":"≠"} ${M(b).padStart(13)}`);
};

// The month under test is whichever month the server thinks it is in. Half
// these checks compare a page that takes a period against one that does not,
// and a hard-coded month passes until the clock rolls over and then fails
// everything at once for a reason that has nothing to do with the code.
// Which sets of books this deployment actually keeps. A business-only
// instance has no personal books to check, and asking for them anyway would
// compare one entity's figures against another's ledger.
const ENTS=(await g("/finance/categories")).entities.map(e=>e.id);
console.log(`  books: ${ENTS.join(", ")}`);
const P=(await g(`/finance/dashboard?entity=${ENTS[0]}`)).period;
const isoMonth=(p,n)=>
  `${new Date(Date.UTC(+p.slice(0,4), +p.slice(5,7)-1+n, 1)).toISOString().slice(0,7)}-01`;
console.log(`  reading ${P} — the month the server is in`);
for (const ent of ENTS) {
  console.log(`\n══ ${ent} ══`);
  const entries=(await g(`/finance/entries?limit=500`)).entries.filter(e=>e.entity===ent);
  const live=entries.filter(e=>e.review_status!=="rejected");
  const sum=(f)=>live.filter(f).reduce((t,e)=>t+Number(e.base_amount_minor),0);
  const inAll=sum(e=>e.direction==="in"), outAll=sum(e=>e.direction==="out");
  const month=(d)=>live.filter(e=>e.period.slice(0,10)===P&&e.direction===d)
                       .reduce((t,e)=>t+Number(e.base_amount_minor),0);

  const dash=(await g(`/finance/dashboard?entity=${ent}`)).byEntity[ent];
  const st=(await g(`/finance/statements?period=${P}&entity=${ent}`)).byEntity[ent];
  const ovw=(await g(`/finance/overview?period=${P}&entity=${ent}`)).byEntity[ent];
  const cash=(await g(`/finance/cash?entity=${ent}&months=3`)).byEntity[ent];
  const sin=(await g(`/finance/side/in?entity=${ent}&period=${P}`)).byEntity[ent];
  const sout=(await g(`/finance/side/out?entity=${ent}&period=${P}`)).byEntity[ent];
  const fc=(await g(`/finance/forecast?entity=${ent}&months=6`)).byEntity[ent];

  // Cash position must equal the ledger, ignoring transfers.
  const transfers=live.filter(e=>e.category_kind==="transfer");
  const tNet=transfers.reduce((t,e)=>t+(e.direction==="in"?1:-1)*Number(e.base_amount_minor),0);
  check("cash = ledger in − out (less transfers)", dash.cash.amount, inAll-outAll-tNet);

  // The same month figure, five places.
  check("overview revenue = ledger month in", dash.revenue, month("in"));
  check("overview revenue = statements P&L revenue", dash.revenue, st.pnl.revenue.total);
  check("overview revenue = revenue page", dash.revenue, sin.thisMonth);
  check("overview revenue = /overview summary", dash.revenue, ovw.summary.revenue);
  check("overview expenses = expenses page", dash.expenses, sout.thisMonth);
  check("net = revenue − expenses", dash.net, dash.revenue-dash.expenses);

  // Forecast and cash flow must agree on the projected position.
  check("cash page opening = overview cash", cash.cash.amount, dash.cash.amount);
  for (const m of fc.months.slice(0,4)) {
    const s2=(await g(`/finance/statements?period=${m.period}&entity=${ent}`)).byEntity[ent];
    check(`  projected close ${m.period.slice(0,7)} — cashflow vs forecast`,
          s2.committed.projectedClosing, m.closing===m.closing?
            (m.period===fc.months[0].period? s2.cashflow.closing + m.committedIn - m.committedOut : m.closing) : 0);
  }

  // The overview reads a month still ahead off the committed path. It must
  // open where the month before it closes, move only by what is agreed, and
  // land exactly where the forecast says — the same figure, four pages apart.
  // Each projected month must open where the one before it closes. The month
  // before is taken from the forecast's own closing, not from the recorded
  // closing of the month we are in — those differ by whatever that month still
  // has to come, and comparing against the wrong one passed only for as long
  // as the current month happened to have nothing left in it.
  for (let i = 1; i < 4 && i < fc.months.length; i++) {
    const m = fc.months[i];
    const before = fc.months[i - 1];
    const mp = m.period.slice(0, 7);
    const od = (await g(`/finance/dashboard?entity=${ent}&period=${m.period}`)).byEntity[ent];
    const pj = od.projected;
    check(`  overview ${mp} opens where ${before.period.slice(0, 7)} closes`,
          pj.opening, before.closing);
    check(`  overview ${mp} committed in = forecast`, pj.committedIn, m.committedIn);
    check(`  overview ${mp} committed out = forecast`, pj.committedOut, m.committedOut);
    check(`  overview ${mp} closes = opening + in − out`,
          pj.closing, pj.opening + pj.committedIn - pj.committedOut);
    check(`  overview ${mp} close = forecast close`, pj.closing, m.closing);
    check(`  overview ${mp} spend donut = committed out`,
          pj.byCategory.reduce((t, c) => t + c.total, 0), pj.committedOut);
    check(`  overview ${mp} rows sum to in − out`,
          pj.items.reduce((t, i) => t + (i.direction === "in" ? i.amount : -i.amount), 0),
          pj.committedIn - pj.committedOut);
  }

  // Side pages must decompose their own month.
  check("revenue: contract-linked + other = month", sin.fixed+sin.variable, sin.thisMonth);
  check("expenses: contract-linked + other = month", sout.fixed+sout.variable, sout.thisMonth);
  check("revenue categories sum to their own total",
        sin.categories.reduce((t,c)=>t+c.total,0), sin.categoryTotal);
  check("expense categories sum to their own total",
        sout.categories.reduce((t,c)=>t+c.total,0), sout.categoryTotal);
  check("overview expense donut = expenses page total", dash.expenseTotal, sout.categoryTotal);

  // Company spend is read under five headings. Folding categories into them
  // must not create or lose a cent, and must not invent a sixth heading.
  const GROUPS = ["Payroll", "Tech", "Marketing", "Operations", "G&A"];
  if (ent === "strideup") {
    const names = dash.expensesByCategory.map((c) => c.name);
    const stray = names.filter((n) => !GROUPS.includes(n));
    check(`spend headings are the five and only the five (${names.join(", ") || "none"})`,
          stray.length, 0);
    for (const g of dash.expensesByCategory.filter((c) => c.parts)) {
      check(`  "${g.name}" = the categories folded into it`,
            g.parts.reduce((t, p) => t + p.total, 0), g.total);
    }
  }
  check("spend headings sum to the month's expenses",
        dash.expensesByCategory.reduce((t, c) => t + c.total, 0), dash.expenseTotal);

  // Every supplier and customer row has to carry a real figure, and they have
  // to add up to the month. A row rendering as $0.00 when money moved is the
  // fault this catches.
  for (const [label, sd] of [["revenue", sin], ["expenses", sout]]) {
    const bad = sd.parties.filter((p) => !Number.isFinite(p.total) || !Number.isFinite(p.share));
    check(`${label} by party: every row has a figure`, bad.length, 0);
    check(`${label} by party sums to the month`,
          sd.parties.reduce((t, p) => t + (p.total || 0), 0), sd.thisMonth);
  }

  // The two detail pages, on their own figures.
  for (const [label, sd] of [["revenue", sin], ["expenses", sout]]) {
    // The month the page headlines must be the month the split chart plots.
    const here = sd.split.find((m) => m.period === P);
    check(`${label} split chart agrees with the month`, here.total, sd.thisMonth);
    check(`${label} split: fixed + variable = total`, here.fixed + here.variable, here.total);
    check(`${label} split: fixed = the contract-linked figure`, here.fixed, sd.fixed);

    // Fixed against variable must not count one payment on both sides.
    check(`${label} variable parties sum to the variable half`,
          sd.variableParties.reduce((t, p) => t + p.total, 0), sd.variable);

    // Ranked categories are the same rows the donut draws. With one heading the
    // total is that heading again, which reads as the same payment counted
    // twice — the table drops the footer there, so the sum still has to hold.
    check(`${label} ranked = category total`,
          sd.ranked.reduce((t, r) => t + r.total, 0), sd.categoryTotal);
    if (sd.ranked.length === 1) {
      check(`${label} single heading = the whole month`, sd.ranked[0].total, sd.categoryTotal);
    }

    // Due and late are disjoint, and together they are everything in the window.
    const both = [...sd.upcoming, ...sd.overdue];
    check(`${label}: nothing is both upcoming and late`,
          new Set(both.map((u) => `${u.commitmentId}:${u.date}`)).size, both.length);
    check(`${label} upcoming total = its own rows`,
          sd.upcoming.reduce((t, u) => t + u.amount, 0), sd.upcomingTotal);
    check(`${label} late total = its own rows`,
          sd.overdue.reduce((t, u) => t + u.amount, 0), sd.overdueTotal);
  }
  // Committed months on the expenses chart must match the forecast's.
  for (const m of sout.split.filter((x) => x.ahead)) {
    const f = fc.months.find((x) => x.period === m.period);
    if (f) check(`  expenses chart ${m.period.slice(0, 7)} = forecast committed out`,
                 m.total, f.committedOut);
  }
  for (const m of sin.split.filter((x) => x.ahead)) {
    const f = fc.months.find((x) => x.period === m.period);
    if (f) check(`  revenue chart ${m.period.slice(0, 7)} = forecast committed in`,
                 m.total, f.committedIn);
  }

  // The payment schedule's headline figures must be the rows beneath them.
  // "Late" counted only money owed TO the business, so a payment the business
  // was late paying read as $0 late while its own row said Overdue.
  const sc = (await g(`/finance/schedule?entity=${ent}&period=${P}`)).byEntity[ent];
  const occs = sc.rows.flatMap((r) =>
    (r.months.find((m) => m.period === (sc.focus || sc.period))?.occurrences ?? [])
      .map((o) => ({ ...o, direction: r.direction })));
  const occSum = (dir, st) => occs.filter((o) => o.direction === dir && o.status === st)
                                  .reduce((t, o) => t + o.amount, 0);
  check("schedule: arrived = paid incoming rows", sc.tally.paidIn, occSum("in", "paid"));
  check("schedule: still to arrive = due incoming rows", sc.tally.dueIn, occSum("in", "due"));
  check("schedule: overdue in = overdue incoming rows", sc.tally.overdueIn, occSum("in", "overdue"));
  check("schedule: paid out = paid outgoing rows", sc.tally.paidOut, occSum("out", "paid"));
  check("schedule: still to pay = due outgoing rows", sc.tally.dueOut, occSum("out", "due"));
  check("schedule: overdue out = overdue outgoing rows", sc.tally.overdueOut, occSum("out", "overdue"));
  // Every overdue row on either side has to land in one of the two late figures.
  const lateRows = occs.filter((o) => o.status === "overdue")
                       .reduce((t, o) => t + o.amount, 0);
  check("schedule: no overdue row is missing from a late figure",
        (sc.tally.overdueIn + sc.tally.overdueOut), lateRows);

  // ── Profit and loss ──
  // The statement has to be the same arithmetic as the pages it summarises,
  // and the plan column has to stay a plan: never added into a position, and
  // never standing in for a figure the ledger should have supplied.
  const plr = (await g(`/finance/pl?entity=${ent}&period=${P}&span=month`)).byEntity[ent];
  const S = plr.statement;
  check("P&L revenue = the revenue page's month", S.revenue.actual, sin.thisMonth);
  check("P&L gross profit = revenue − cost of revenue",
        S.grossProfit.actual, S.revenue.actual - S.cogs.actual);
  check("P&L opex lines sum to their total",
        S.opex.reduce((t, l) => t + l.actual, 0), S.opexTotal.actual);
  check("P&L operating profit = gross − opex",
        S.operatingProfit.actual, S.grossProfit.actual - S.opexTotal.actual);
  check("P&L net profit = operating − tax",
        S.netProfit.actual, S.operatingProfit.actual - S.tax.actual);
  check("P&L expenses = the expenses page's month",
        S.opexTotal.actual + S.cogs.actual + S.tax.actual, sout.thisMonth);
  check("P&L expense donut = cost of sales + opex + tax",
        plr.expenseMix.reduce((t, r) => t + r.total, 0),
        S.opexTotal.actual + S.cogs.actual + S.tax.actual);
  check("P&L revenue donut = revenue", plr.revenueMix.reduce((t, r) => t + r.total, 0),
        S.revenue.actual);
  const last = plr.trend.at(-1);
  check("P&L trend ends on the month being read", last.revenue, S.revenue.actual);
  check("P&L trend net profit = the statement's", last.netProfit, S.netProfit.actual);

  // The plan, if there is one, must hold together the same way.
  if (S.hasBudget) {
    check("P&L plan: gross = revenue − cost of revenue",
          S.grossProfit.budget, S.revenue.budget - S.cogs.budget);
    check("P&L plan: opex lines sum to their total",
          S.opex.reduce((t, l) => t + (l.budget ?? 0), 0), S.opexTotal.budget);
    check("P&L plan: operating = gross − opex",
          S.operatingProfit.budget, S.grossProfit.budget - S.opexTotal.budget);
    check("P&L plan: net = operating − tax",
          S.netProfit.budget, S.operatingProfit.budget - S.tax.budget);
    for (const l of [S.revenue, S.cogs, S.opexTotal, S.netProfit]) {
      check(`  P&L variance on "${l.name}" = actual − plan`, l.variance, l.actual - l.budget);
    }
    // Under plan is good for a cost and bad for revenue; one sign convention
    // cannot serve both, so the flag must follow the line's own direction.
    const wrong = [S.revenue, S.grossProfit, S.netProfit].filter(
      (l) => l.budget != null && l.favourable !== (l.actual >= l.budget)
    ).length + S.opex.filter(
      (l) => l.budget != null && l.favourable !== (l.actual <= l.budget)
    ).length;
    check("P&L favourable follows the line's direction", wrong, 0);
  }
  // A quarter is three months of the same statement, added.
  const q = (await g(`/finance/pl?entity=${ent}&period=${P}&span=quarter`)).byEntity[ent];
  let qRev = 0;
  for (const p2 of q.statement.periods) {
    const one = (await g(`/finance/pl?entity=${ent}&period=${p2}&span=month`)).byEntity[ent];
    qRev += one.statement.revenue.actual;
  }
  check("P&L quarter revenue = its three months", q.statement.revenue.actual, qRev);

  // Receivables ageing must sum to the total.
  const b=dash.receivables.buckets;
  check("receivable buckets sum to total",
        b.current+b.d1_30+b.d31_60+b.d61_90+b.d90plus, dash.receivables.total);
  check("receivables overdue = total − current", dash.receivables.overdue,
        dash.receivables.total-b.current);
  check("overview receivables = revenue page", dash.receivables.total, sin.receivables.total);

  // P&L must close.
  check("gross profit = revenue − cost of sales", st.pnl.grossProfit,
        st.pnl.revenue.total-st.pnl.cogs.total);
  check("operating profit = gross − opex", st.pnl.operatingProfit,
        st.pnl.grossProfit-st.pnl.opex.total);

  // Cash flow statement must close.
  const cf=st.cashflow;
  check("closing = opening + movement", cf.closing, cf.opening+cf.movement);
  check("movement = in − out − capex + capital", cf.movement,
        cf.operatingIn-cf.operatingOut-cf.capex+cf.capital);

  // Breakdown table totals.
  const bd=cash.breakdown;
  for (const row of bd.rows) check(`  breakdown "${row.label}" row sums to its total`,
        row.values.reduce((t,v)=>t+v,0), row.total);
  const netFromRows = bd.columns.map((_,i)=>
    bd.rows.filter(r=>r.group==="in").reduce((t,r)=>t+r.values[i],0) -
    bd.rows.filter(r=>r.group==="out").reduce((t,r)=>t+r.values[i],0));
  check("breakdown net row = in rows − out rows",
        netFromRows.reduce((t,v)=>t+v,0), bd.netTotal);
}
// ── The export ───────────────────────────────────────────────
// A downloaded ledger that does not add up to the ledger it came from is
// worse than no download: it gets pasted into a board pack.
console.log("\n══ export.csv ══");
{
  const text = await (await fetch(B + "/finance/export.csv", { headers: { cookie } })).text();
  const lines = text.trim().split("\n");
  const cells = (line) => line.match(/"(?:[^"]|"")*"/g).map((c) => c.slice(1, -1).replace(/""/g, '"'));
  const head = cells(lines[0]);
  const rows = lines.slice(1).map(cells);
  const col = (n) => head.findIndex((h) => h === n || h.startsWith(n + " "));

  const entries = (await g(`/finance/entries?limit=500`)).entries.filter((e) => e.review_status !== "rejected");
  check("csv row count = live ledger entries", rows.length, entries.length);

  const csvBase = rows.reduce((t, r) => t + Math.round(Number(r[col("base_amount")]) * 100), 0);
  const ledgerBase = entries.reduce((t, e) => t + Number(e.base_amount_minor), 0);
  check("csv base_amount sums to the ledger", csvBase, ledgerBase);

  // Every link must be absolute and point at the document the row names.
  const linked = rows.filter((r) => r[col("document_link")]);
  const wellFormed = linked.filter((r) => /^https?:\/\/[^/]+\/api\/finance\/documents\/\d+$/.test(r[col("document_link")]));
  check("csv document links are absolute urls", linked.length, wellFormed.length);
  const named = linked.filter((r) => r[col("document")]);
  check("csv every linked row names its document", linked.length, named.length);
  // And one of them must actually serve a document.
  if (linked.length) {
    const res = await fetch(linked[0][col("document_link")], { headers: { cookie } });
    check("csv first document link resolves", res.status, 200);
  }
}

// ── Carrying a month forward ─────────────────────────────────
// A month opens where the one before it closed. Only the flows inside it
// start at zero — nothing is copied, so opening plus what this month moved
// has to land exactly on the position, in every month.
for (const ent of ENTS) {
  console.log(`\n══ carry forward · ${ent} ══`);
  const live=(await g("/finance/entries?limit=500")).entries
    .filter(e=>e.entity===ent&&e.review_status!=="rejected");
  const netBefore=(p)=>live.filter(e=>e.period.slice(0,10)<p&&e.category_kind!=="transfer")
    .reduce((t,e)=>t+(e.direction==="in"?1:-1)*Number(e.base_amount_minor),0);
  for (const p of [P, isoMonth(P,-1), isoMonth(P,1)]) {
    const o=(await g(`/finance/dashboard?period=${p}&entity=${ent}`)).byEntity[ent];
    check(`${p} opens at what was recorded before it`, o.carry.opening, netBefore(p));
    check(`${p} opening + movement = the position`,
          o.carry.opening + o.carry.movement,
          netBefore(p) + live.filter(e=>e.period.slice(0,10)===p&&e.category_kind!=="transfer")
            .reduce((t,e)=>t+(e.direction==="in"?1:-1)*Number(e.base_amount_minor),0));
    // The whole point: a quiet month keeps its charts, its position and its
    // commitments. Only a book with nothing in it at all is empty.
    const keeps = o.entriesEver === live.length && o.trend.length > 0;
    keeps?pass++:fail++;
    console.log(`  ${keeps?"ok  ":"FAIL"} ${(p+" keeps its history when quiet").padEnd(52)} ` +
                `entriesEver=${o.entriesEver} trend=${o.trend.length}`);
  }
}

// ── The home page ────────────────────────────────────────────
// One call feeds the whole first screen, so every figure on it has to agree
// with the page it was taken from. If they diverge, the home page is lying
// about the same month twice.
for (const ent of ENTS) {
  console.log(`\n══ home · ${ent} ══`);
  const home=(await g(`/finance/home?entity=${ent}&period=${P}`)).byEntity[ent];
  const hh=(await g(`/finance/household?entity=${ent}&period=${P}`)).byEntity[ent];
  const dash=(await g(`/finance/dashboard?entity=${ent}`)).byEntity[ent];
  const live=(await g(`/finance/entries?limit=500`)).entries
    .filter(e=>e.entity===ent&&e.review_status!=="rejected");
  const monthNet=(d)=>live.filter(e=>e.period.slice(0,10)===P&&e.direction===d)
                          .reduce((t,e)=>t+Number(e.base_amount_minor),0);

  check("home income = household income", home.savings.income, hh.savings.income);
  check("home spending = household spending", home.savings.spent, hh.savings.spent);
  check("home bills total = household bills", home.bills.total, hh.bills.total);
  check("home income = the ledger for the month", home.savings.income, monthNet("in"));
  check("home total cash = the dashboard's cash", home.cash.amount, dash.cash.amount);
  check("home cash movement = the month's net",
        home.cash.movement, monthNet("in") - monthNet("out"));
  // Five tiles at most, and they must add up to the month's spending — an
  // "Others" that quietly drops a category is worse than no tile.
  check("home category tiles sum to the month's spending",
        home.topCategories.reduce((t,c)=>t+c.amount,0), home.spendTotal);
  check("home spending total = the month's spending", home.spendTotal, home.savings.spent);
  const last=home.series[home.series.length-1];
  check("home chart's last month = the month on the page", last.revenue, home.savings.income);
  const shares=home.topCategories.reduce((t,c)=>t+c.share,0);
  const sharesOk=!home.spendTotal||Math.abs(shares-1)<1e-6;
  sharesOk?pass++:fail++;
  console.log(`  ${sharesOk?"ok  ":"FAIL"} ${"home category shares add to 100%".padEnd(52)} ${(shares*100).toFixed(2)}%`);
}

// ── Income ───────────────────────────────────────────────────
// The income page reads the same ledger as everything else. What arrived is
// recorded; what recurs is an arrangement. The two must never be added.
for (const ent of ENTS) {
  console.log(`\n══ income · ${ent} ══`);
  const inc=(await g(`/finance/income?entity=${ent}&period=${P}`)).byEntity[ent];
  const hh=(await g(`/finance/household?entity=${ent}&period=${P}`)).byEntity[ent];
  const st=(await g(`/finance/statements?period=${P}&entity=${ent}`)).byEntity[ent];
  const live=(await g("/finance/entries?limit=500")).entries
    .filter(e=>e.entity===ent&&e.review_status!=="rejected");
  const monthIn=live.filter(e=>e.period.slice(0,10)===P&&e.direction==="in"
                               &&e.category_kind!=="capital"&&e.category_kind!=="transfer")
                    .reduce((t,e)=>t+Number(e.base_amount_minor),0);

  check("income total = the ledger for the month", inc.total, monthIn);
  check("income total = the household page", inc.total, hh.savings.income);
  check("income recurring = the household page", inc.recurringMonthly, hh.income.recurringMonthly);
  check("income by category sums to the total",
        inc.byCategory.reduce((t,c)=>t+c.total,0), inc.total);
  check("income chart's last month = the month", inc.series.at(-1).amount, inc.total);
  // A deposit that already has an arrangement behind it must never be offered
  // as a new one — that is how a household ends up with the same salary twice.
  const sourceNames=new Set(inc.sources.map(s=>s.name.toLowerCase()));
  const clean=inc.detected.every(d=>!sourceNames.has(d.who.toLowerCase()));
  clean?pass++:fail++;
  console.log(`  ${clean?"ok  ":"FAIL"} ${"detected deposits exclude known sources".padEnd(52)} ` +
              `${inc.detected.length} offered, ${inc.sources.length} known`);
  // Every source must be readable: a rate, not a total.
  const sane=inc.sources.every(s=>s.amount>0&&s.monthlyEquivalent>0&&s.type);
  sane?pass++:fail++;
  console.log(`  ${sane?"ok  ":"FAIL"} ${"every source has an amount, rate and type".padEnd(52)} ` +
              `${inc.sources.length} source(s)`);
}

// ── The transaction list ─────────────────────────────────────
// Filtering narrows; it never changes what a row is. And a page of results
// has to be a page of the same list, not a fresh one.
{
  console.log(`\n══ transactions ══`);
  const all=await g("/finance/entries?limit=500");
  const p1=await g("/finance/entries?limit=5&offset=0");
  const p2=await g("/finance/entries?limit=5&offset=5");
  check("paged total = the whole ledger", p1.total, all.total ?? all.entries.length);
  const overlap=p1.entries.some(a=>p2.entries.some(b=>a.id===b.id));
  !overlap?pass++:fail++;
  console.log(`  ${!overlap?"ok  ":"FAIL"} ${"page two does not repeat page one".padEnd(52)}`);
  const seq=[...p1.entries,...p2.entries].map(e=>e.id);
  const same=seq.every((id,i)=>id===all.entries[i]?.id);
  same?pass++:fail++;
  console.log(`  ${same?"ok  ":"FAIL"} ${"paging keeps the order of the whole list".padEnd(52)}`);

  const ins=await g("/finance/entries?limit=500&direction=in");
  check("money-in filter sums to money in", 
    ins.entries.reduce((t,e)=>t+Number(e.base_amount_minor),0),
    all.entries.filter(e=>e.direction==="in").reduce((t,e)=>t+Number(e.base_amount_minor),0));
  const outs=await g("/finance/entries?limit=500&direction=out");
  check("in and out add back to everything", ins.total+outs.total, all.total);
  // A search term must narrow, never invent.
  const q=await g("/finance/entries?limit=500&q=e");
  const subset=q.entries.every(e=>all.entries.some(a=>a.id===e.id));
  subset&&q.total<=all.total?pass++:fail++;
  console.log(`  ${subset&&q.total<=all.total?"ok  ":"FAIL"} ${"search returns a subset of the ledger".padEnd(52)} ` +
              `${q.total} of ${all.total}`);
}

// ── Spending ─────────────────────────────────────────────────
// The whole page rests on one split: what a standing agreement caused, and
// what did not. If those two stop adding to the month, every figure above
// them is wrong, so that is checked in every month the page draws.
for (const ent of ENTS) {
  console.log(`\n══ spending · ${ent} ══`);
  const ex=(await g(`/finance/expenses?entity=${ent}&period=${P}`)).byEntity[ent];
  const hh=(await g(`/finance/household?entity=${ent}&period=${P}`)).byEntity[ent];
  const st=(await g(`/finance/statements?period=${P}&entity=${ent}`)).byEntity[ent];

  check("spending = the household page", ex.total, hh.savings.spent);
  check("agreed + decided = the month", ex.split.fixed + ex.split.variable, ex.total);
  check("headings add up to the month",
        ex.categories.reduce((t,c)=>t+c.total,0), ex.total);
  check("income = the household page", ex.income, hh.savings.income);
  check("left = income less spending", ex.left, ex.income - ex.total);
  check("after the agreed part = income less that part", ex.afterFixed, ex.income - ex.split.fixed);
  const shares=ex.categories.reduce((t,c)=>t+c.share,0);
  const sOk=!ex.total||Math.abs(shares-1)<1e-6;
  sOk?pass++:fail++;
  console.log(`  ${sOk?"ok  ":"FAIL"} ${"heading shares add to 100%".padEnd(52)} ${(shares*100).toFixed(2)}%`);
  // Every month on the chart, not just this one.
  const splitOk=ex.series.every(m=>m.fixed+m.variable===m.total);
  splitOk?pass++:fail++;
  console.log(`  ${splitOk?"ok  ":"FAIL"} ${"every month's split adds to its total".padEnd(52)} ${ex.series.length} months`);
  // Nothing already under an agreement may be offered as something to set up.
  const covered=new Set(ex.recurring.map(r=>r.name.toLowerCase()));
  const clean=ex.detected.every(d=>!covered.has(d.who.toLowerCase()));
  clean?pass++:fail++;
  console.log(`  ${clean?"ok  ":"FAIL"} ${"nothing already agreed is offered again".padEnd(52)} ${ex.detected.length} offered`);
  // And everything offered really has been seen more than once.
  const twice=ex.detected.every(d=>d.months>=2);
  twice?pass++:fail++;
  console.log(`  ${twice?"ok  ":"FAIL"} ${"only repeats are offered as a bill".padEnd(52)}`);
}

// ── What you own, what you are saving toward, and the reports ──
// These three pages add the only claims the ledger cannot make on its own.
// They still have to be internally consistent, and Reports must never
// disagree with the pages it is summarising.
for (const ent of ENTS) {
  console.log(`\n══ wealth · goals · reports · ${ent} ══`);
  const w=(await g(`/finance/wealth?entity=${ent}`)).byEntity[ent];
  const go=(await g(`/finance/goals?entity=${ent}`)).byEntity[ent];
  const rp=(await g(`/finance/reports?entity=${ent}&period=${P}&months=6`)).byEntity[ent];
  const hh=(await g(`/finance/household?entity=${ent}&period=${P}`)).byEntity[ent];

  check("net worth = what you own less what you owe",
        w.netWorth, w.totalAssets - w.totalLiabilities);
  check("allocation adds up to what you own",
        w.allocation.reduce((t,a)=>t+a.total,0), w.totalAssets);
  check("debt total = total liabilities", w.debt.total, w.totalLiabilities);
  const shares=w.allocation.reduce((t,a)=>t+a.share,0);
  const sharesOk=!w.totalAssets||Math.abs(shares-1)<1e-6;
  sharesOk?pass++:fail++;
  console.log(`  ${sharesOk?"ok  ":"FAIL"} ${"allocation shares add to 100%".padEnd(52)} ${(shares*100).toFixed(2)}%`);
  // The newest month of the carried-forward series is the position itself.
  if (w.series.length) {
    check("the net worth line ends at today's position", w.series.at(-1).net, w.netWorth);
  }
  // A return can only be claimed where a cost was entered.
  const priced=w.assets.filter(a=>a.cost!=null);
  const returnsOk=w.assets.every(a=>(a.cost==null)===(a.returnPct==null));
  returnsOk?pass++:fail++;
  console.log(`  ${returnsOk?"ok  ":"FAIL"} ${"a return is claimed only where a cost was given".padEnd(52)} ${priced.length}/${w.assets.length} priced`);

  // A goal is arithmetic against a date, and every part of it has to agree.
  const goalsOk=go.items.every(x=>
    x.remaining===Math.max(0,x.target-x.saved) &&
    (x.progress==null||(x.progress>=0&&x.progress<=1)) &&
    (x.perMonth==null||x.monthsLeft==null||x.perMonth*x.monthsLeft>=x.remaining));
  goalsOk?pass++:fail++;
  console.log(`  ${goalsOk?"ok  ":"FAIL"} ${"every goal's figures agree with each other".padEnd(52)} ${go.items.length} goal(s)`);
  check("goals' saved total = the sum of them",
        go.totalSaved, go.items.reduce((t,x)=>t+x.saved,0));

  // Reports summarises other pages and must not disagree with them.
  check("report spending = the household page", rp.spending.total, hh.savings.spent);
  check("report income = the household page", rp.income.total, hh.savings.income);
  check("report kept = income less spending", rp.savings.saved,
        hh.savings.income - hh.savings.spent);
  check("report categories add to its spending",
        rp.spending.byCategory.reduce((t,c)=>t+c.total,0), rp.spending.total);
  const rShares=rp.spending.byCategory.reduce((t,c)=>t+c.share,0);
  const rOk=!rp.spending.total||Math.abs(rShares-1)<1e-6;
  rOk?pass++:fail++;
  console.log(`  ${rOk?"ok  ":"FAIL"} ${"report category shares add to 100%".padEnd(52)} ${(rShares*100).toFixed(2)}%`);
  check("the report's last month is the month asked for",
        rp.series.at(-1).expenses, hh.savings.spent);
  // Every sentence the page writes must carry its currency, not a bare number.
  const cur=(await g(`/finance/reports?entity=${ent}&period=${P}&months=6`)).baseCurrency;
  const money=[...rp.advice,...rp.insights].filter(a=>/\d{3,}/.test(a.text));
  const named=money.every(a=>a.text.includes(cur)||/%/.test(a.text));
  named?pass++:fail++;
  console.log(`  ${named?"ok  ":"FAIL"} ${"figures in sentences carry their currency".padEnd(52)} ${money.length} line(s)`);
}

// ── Foreign currency ─────────────────────────────────────────
// The bug this guards against: a rate lookup fails, the amount is stored at
// face value, and 15,000 dirhams are counted as 15,000 dollars. Nothing on
// any page shows it — the sum is simply wrong. So check the ledger directly:
// a foreign amount whose converted figure equals its face value either had no
// conversion, or sat at a rate of exactly 1.0000, and neither is plausible.
{
  console.log("\n══ foreign currency ══");
  const base = (await g("/finance/overview")).baseCurrency;
  const all = (await g("/finance/entries?limit=500")).entries ?? [];
  const foreign = all.filter((e) => e.currency && e.currency !== base);
  const unconverted = foreign.filter(
    (e) => Number(e.base_amount_minor) === Number(e.amount_minor)
  );
  const clean = unconverted.length === 0;
  if (clean) pass++; else fail++;
  console.log(
    `  ${clean ? "ok  " : "FAIL"} ` +
    `${"no foreign amount is counted at face value".padEnd(52)} ` +
    `${unconverted.length} of ${foreign.length} foreign`
  );
  for (const e of unconverted.slice(0, 5)) {
    console.log(`         ${e.entry_date}  ${e.currency} ${M(e.amount_minor)}  ` +
                `counted as ${base} ${M(e.base_amount_minor)}  — ${e.description}`);
  }

  // A currency the reader can pick but the rate source cannot price is the
  // same bug waiting to happen, so prove the pegged ones resolve offline.
  const pegs = { AED: 3.6725, SAR: 3.75, QAR: 3.64, BHD: 0.376, OMR: 0.3845 };
  if (base === "USD") {
    for (const [code, peg] of Object.entries(pegs)) {
      const e = foreign.find((x) => x.currency === code);
      if (!e) continue;
      near(`${code} converts at its peg`,
           Math.round(Number(e.amount_minor) / peg), Number(e.base_amount_minor), 2);
    }
  }
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
