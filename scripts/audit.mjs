// Every figure the app shows, checked against the ledger it came from and
// against the same figure wherever else it appears. A dashboard whose pages
// disagree is worse than no dashboard.
const B="http://localhost:4177/api";
const r=await fetch(B+"/auth/login",{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({email:"ceo@strideup.org",password:"owner-pass-1234"})});
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

const P="2026-08-01";
for (const ent of ["strideup","personal"]) {
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
  let prevClose = st.cashflow.closing;
  for (const m of fc.months.slice(1, 4)) {
    const mp = m.period.slice(0, 7);
    const od = (await g(`/finance/dashboard?entity=${ent}&period=${m.period}`)).byEntity[ent];
    const pj = od.projected;
    check(`  overview ${mp} opens where ${prevClose === st.cashflow.closing ? "this month" : "the month before"} closes`,
          pj.opening, prevClose);
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
    prevClose = pj.closing;
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
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
