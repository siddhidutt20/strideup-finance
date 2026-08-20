// Series colours are validated for colour-vision separation (deutan ΔE 10.7
// between revenue and expenses); both carry a legend and direct labels, so
// identity never rests on colour alone. Newsreader is reserved for the page
// title and the financial figures — the register of a printed statement —
// with Instrument Sans carrying every piece of interface around them.
export const FIN_CSS = `
.fin{
  --fin-in:#0FA3C7; --fin-out:#D43081; --fin-accent:#5B21B6;
  --fin-ink:#171326; --fin-muted:#6E6884; --fin-faint:#9C96AE;
  --fin-line:#EBE8F2; --fin-hair:#F2F0F7; --fin-surface:#fff;
  --fin-sunk:#FAF9FC; --fin-warn:#8A6A15; --fin-neg:#A8225F;
  --fin-serif:'Newsreader',Georgia,'Times New Roman',serif;
  max-width:1160px;margin:0 auto;padding:0 24px 96px;color:var(--fin-ink);
  font-size:15px;line-height:1.6}
.fin-boot{display:flex;justify-content:center;padding:96px}
.fin-spinner{width:32px;height:32px;border-radius:50%;border:2.5px solid var(--fin-line);
  border-top-color:var(--fin-accent);animation:fin-spin .8s linear infinite}
@keyframes fin-spin{to{transform:rotate(360deg)}}

/* ── Section nav ── */
.fin-nav{position:sticky;top:0;z-index:15;margin:0 -24px 0;padding:0 24px;
  background:rgba(247,246,250,.88);backdrop-filter:blur(10px);
  border-bottom:1px solid var(--fin-line)}
.fin-nav-inner{max-width:1112px;margin:0 auto;display:flex;align-items:center;
  justify-content:space-between;gap:16px;flex-wrap:wrap;padding:9px 0}
.fin-nav ul{list-style:none;display:flex;gap:2px;margin:0;padding:0;flex-wrap:wrap}
.fin-nav button{border:none;background:none;font-family:inherit;color:var(--fin-muted);
  font-size:13px;font-weight:500;padding:6px 11px;border-radius:8px;cursor:pointer;transition:.14s}
.fin-nav button:hover{color:var(--fin-accent);background:#F1ECFB}
.fin-nav button.on{color:var(--fin-accent);background:#F1ECFB;font-weight:600}
.fin-monthnav{display:inline-flex;align-items:center;gap:2px;background:var(--fin-surface);
  border:1px solid var(--fin-line);border-radius:9px;padding:3px 4px}
.fin-monthnav strong{min-width:124px;text-align:center;font-size:13px;font-weight:600;
  font-variant-numeric:tabular-nums}
.fin-monthnav button{border:none;background:none;font-size:16px;line-height:1;
  color:var(--fin-accent);cursor:pointer;padding:4px 9px;border-radius:6px}
.fin-monthnav button:hover:not(:disabled){background:#F1ECFB}
.fin-monthnav button:disabled{color:#D6D1E2;cursor:not-allowed}

/* ── Masthead ── */
.fin-head{padding:44px 0 26px}
.fin-head h1{font-family:var(--fin-serif);font-weight:400;font-size:clamp(34px,5vw,46px);
  letter-spacing:-.021em;line-height:1;margin:0 0 8px}
.fin-head p{margin:0;color:var(--fin-muted);font-size:15px}

.fin-error,.fin-warn,.fin-ok{padding:11px 15px;border-radius:10px;font-size:13.5px;margin-bottom:14px}
.fin-error{background:#FDF1F3;border:1px solid #F3CBD5;color:#8E1F3F}
.fin-warn{background:#FDF8EA;border:1px solid #EDE0BC;color:var(--fin-warn)}
.fin-ok{background:#EAF7F1;border:1px solid #C2E5D6;color:#0A6B4C;margin:14px 0 0}
.fin code{background:var(--fin-sunk);border:1px solid var(--fin-line);padding:1px 5px;
  border-radius:4px;font-size:12.5px}

/* ── Upload ── */
.fin-drop{background:var(--fin-surface);border:1.5px dashed #DED8EC;border-radius:14px;
  padding:20px 22px;margin-bottom:26px;transition:border-color .15s,background .15s}
.fin-drop.over{border-color:var(--fin-accent);background:#FBF9FE}
.fin-drop.busy{opacity:.9}
.fin-drop-main{display:flex;align-items:center;gap:16px}
.fin-drop-icon{width:42px;height:42px;flex:none;border-radius:11px;background:#F3EEFC;
  color:var(--fin-accent);display:grid;place-items:center;font-size:20px}
.fin-drop-main strong{display:block;font-size:15px;font-weight:600;letter-spacing:-.005em}
.fin-drop-main p{margin:3px 0 0;color:var(--fin-muted);font-size:13.5px}
.fin-drop-main button{border:none;background:none;color:var(--fin-accent);font:inherit;
  font-size:13.5px;font-weight:600;text-decoration:underline;cursor:pointer;padding:0}
.fin-feed{list-style:none;margin:16px 0 0;padding:14px 0 0;border-top:1px solid var(--fin-hair);
  display:flex;flex-direction:column;gap:9px}
.fin-feed-item{display:flex;align-items:center;gap:10px;font-size:13px;flex-wrap:wrap}
.ff-name{font-weight:600;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ff-note{color:var(--fin-muted)}
.ff-ok{color:#0A6B4C;font-variant-numeric:tabular-nums}
.ff-err{color:#8E1F3F}
.ff-dup{color:var(--fin-warn)}
.ff-actions{display:inline-flex;gap:7px;margin-left:auto}
.ff-btn{border:1px solid var(--fin-accent);background:var(--fin-accent);color:#fff;
  font:inherit;font-size:12px;font-weight:600;padding:5px 12px;border-radius:8px;cursor:pointer}
.ff-btn.ghost{background:#fff;color:var(--fin-muted);border-color:var(--fin-line)}
.ff-btn.ghost:hover{color:var(--fin-ink);border-color:var(--fin-faint)}

.fin-empty{background:var(--fin-surface);border:1px solid var(--fin-line);border-radius:14px;
  padding:44px 34px;text-align:center}
.fin-empty h2{font-family:var(--fin-serif);font-weight:400;font-size:24px;
  letter-spacing:-.015em;margin:0 0 10px}
.fin-empty p{margin:0 auto;max-width:430px;color:var(--fin-muted);font-size:14.5px}

/* ── KPI tiles ── */
.fin-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));
  gap:11px;margin-bottom:26px}
@media(min-width:1040px){.fin-kpis{grid-template-columns:repeat(7,1fr)}}
.fin-kpi{background:var(--fin-surface);border:1px solid var(--fin-line);border-radius:12px;
  padding:14px 14px 13px;min-width:0;display:flex;flex-direction:column;gap:6px}
.fin-kpi.emph{border-color:#D9CBF3;box-shadow:0 1px 3px rgba(91,33,182,.06),0 8px 24px -16px rgba(91,33,182,.4)}
.fin-kpi-label{font-size:10.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;
  color:var(--fin-faint)}
.fin-kpi-value{font-family:var(--fin-serif);font-weight:400;font-size:24px;line-height:1.08;
  letter-spacing:-.015em;font-variant-numeric:tabular-nums}
.fin-kpi.t-in .fin-kpi-value{color:#0A7E96}
.fin-kpi.t-out .fin-kpi-value{color:var(--fin-neg)}
.fin-kpi.t-warn .fin-kpi-value{color:var(--fin-warn)}
.fin-kpi-delta,.fin-kpi-hint{font-size:11.5px;color:var(--fin-muted)}
.fin-kpi-delta.up{color:#0A6B4C}
.fin-kpi-delta.down{color:var(--fin-neg)}

/* ── Panels ── */
.fin-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
@media(max-width:900px){.fin-grid{grid-template-columns:1fr}}
.fin-panel{background:var(--fin-surface);border:1px solid var(--fin-line);border-radius:14px;
  padding:20px 22px;margin-bottom:14px;scroll-margin-top:64px}
.fin-panel-head{display:flex;align-items:baseline;justify-content:space-between;gap:14px;
  margin-bottom:16px}
.fin-panel-head h2{font-family:var(--fin-serif);font-weight:400;font-size:19px;
  letter-spacing:-.012em;margin:0}
.fin-panel-head>div>span{display:block;font-size:12.5px;color:var(--fin-faint);margin-top:2px}
.fin-none{color:var(--fin-muted);font-size:13.5px;margin:4px 0}
.fin-link{color:var(--fin-accent);font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap}
.fin-link:hover{text-decoration:underline}
.fin-link.asbtn{background:none;border:none;font-family:inherit;cursor:pointer;padding:0}
.fin-dash{color:#D6D1E2}
.fin-total{margin:14px 0 0;font-size:13.5px;font-weight:600;text-align:right;
  font-variant-numeric:tabular-nums}

/* ── Charts ── */
.fin-legend{display:flex;gap:16px;font-size:12px;color:var(--fin-muted);margin-bottom:8px}
.fin-legend span{display:inline-flex;align-items:center;gap:6px}
.fin-legend i,.fin-tip i{width:9px;height:9px;border-radius:2.5px;display:inline-block}
.fin-svg{width:100%;height:auto;display:block;overflow:visible}
.fin-grid-line{stroke:var(--fin-hair);stroke-width:1}
.fin-axis{stroke:var(--fin-line);stroke-width:1}
.fin-xlab{font-size:9.5px;fill:var(--fin-faint);text-anchor:middle;font-family:inherit}
.fin-xlab.now{fill:var(--fin-accent);font-weight:700}
.fin-svg g:hover rect[fill="transparent"]{fill:rgba(91,33,182,.04)}
.fin-tip{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:10px;padding-top:10px;
  border-top:1px solid var(--fin-hair);font-size:12.5px;min-height:20px;
  font-variant-numeric:tabular-nums}
.fin-tip span{display:inline-flex;align-items:center;gap:6px}
.fin-tip-net{color:var(--fin-muted)}
.fin-tip-idle{color:#B9B3C8}

.fin-cats{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.fin-cats li{display:grid;grid-template-columns:minmax(96px,1.15fr) 2fr auto;align-items:center;
  gap:12px;font-size:13px}
.fc-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#4A4360}
.fc-track{background:var(--fin-hair);border-radius:4px;height:8px;overflow:hidden}
.fc-fill{display:block;height:100%;border-radius:0 4px 4px 0}
.fc-val{font-variant-numeric:tabular-nums;font-weight:600;font-size:12.5px}
.fin-aging .fc-name{color:var(--fin-ink)}

.fin-invoices{list-style:none;margin:14px 0 0;padding:13px 0 0;border-top:1px solid var(--fin-hair);
  display:flex;flex-direction:column;gap:9px}
.fin-invoices li{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:baseline;
  font-size:13px}
.fin-invoices li span:nth-child(2){color:var(--fin-faint);font-size:12px}
.fin-invoices li span.od{color:var(--fin-neg);font-weight:600}
.fin-invoices strong{font-variant-numeric:tabular-nums;font-weight:600}

/* ── Manual entry form ── */
.fin-form{display:grid;grid-template-columns:repeat(3,1fr);gap:13px;
  padding-top:4px;border-top:1px solid var(--fin-hair)}
@media(max-width:720px){.fin-form{grid-template-columns:1fr 1fr}}
.fin-form label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;
  color:var(--fin-muted)}
.fin-form label.wide{grid-column:1/-1}
.fin-form label span em{font-style:normal;font-weight:400;color:var(--fin-faint)}
.fin-form input,.fin-form select{font:inherit;font-size:14px;padding:9px 11px;border-radius:9px;
  border:1px solid var(--fin-line);background:var(--fin-surface);color:var(--fin-ink);width:100%}
.fin-form input:focus,.fin-form select:focus{outline:none;border-color:var(--fin-accent);
  box-shadow:0 0 0 3px rgba(91,33,182,.12)}
.fin-form-foot{grid-column:1/-1;display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:2px}
.fin-ok-inline{color:#0A6B4C;font-size:13px}
.fin-err-inline{color:#8E1F3F;font-size:13px}

/* ── Ledger ── */
.fin-tablewrap{overflow-x:auto}
.fin-table{width:100%;border-collapse:collapse;font-size:13px;min-width:660px}
.fin-table th{text-align:left;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;
  color:var(--fin-faint);font-weight:600;padding:0 10px 9px;border-bottom:1px solid var(--fin-line)}
.fin-table td{padding:11px 10px;border-bottom:1px solid var(--fin-hair);vertical-align:top}
.fin-table .r{text-align:right}
.fin-table .nowrap{white-space:nowrap}
.fin-table tbody tr:hover{background:var(--fin-sunk)}
.fin-table tr.flagged{background:#FEFBF2}
.fin-table tr.flagged:hover{background:#FDF8E9}
.fe-desc{display:block}
.fe-cp{display:block;color:var(--fin-faint);font-size:11.5px;margin-top:1px}
.fe-why{display:block;color:var(--fin-warn);font-size:11.5px;margin-top:3px}
.fe-note{display:block;color:var(--fin-faint);font-size:11.5px;margin-top:3px;font-style:italic}
.fe-amt{white-space:nowrap}
.fe-fx{display:flex;align-items:center;justify-content:flex-end;gap:7px;margin-top:3px}
.fe-fx em{font-style:normal;color:var(--fin-faint);font-size:11.5px;font-variant-numeric:tabular-nums}
.fe-cur{font:inherit;font-size:10.5px;font-weight:600;letter-spacing:.04em;padding:2px 4px;
  border-radius:6px;border:1px solid var(--fin-line);background:#fff;color:var(--fin-muted)}
.fe-cur:hover{border-color:var(--fin-faint);color:var(--fin-ink)}
.fin-amtrow{display:flex;gap:6px}
.fin-amtrow input{flex:1;min-width:0}
.fin-amtrow select{width:auto;flex:none;font-size:13px;padding:9px 6px}
.amt-in{color:#0A7E96;font-weight:600;font-variant-numeric:tabular-nums}
.amt-out{color:var(--fin-ink);font-variant-numeric:tabular-nums}
.fe-sel{font:inherit;font-size:12.5px;padding:5px 8px;border-radius:8px;
  border:1px solid var(--fin-line);background:#fff;color:var(--fin-ink);max-width:100%;width:186px}
.fe-sel.warn{border-color:#E4CE8E;background:#FFFDF6}
.fe-del{border:1px solid transparent;background:none;color:#C9C3D6;font:inherit;font-size:12px;
  line-height:1;padding:5px 7px;border-radius:7px;cursor:pointer;transition:.14s}
.fe-del:hover{color:var(--fin-neg);border-color:#F0CEDD;background:#FDF3F7}

/* ── Tools ── */
.fin-tools textarea{width:100%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:12px;padding:11px 13px;border-radius:10px;border:1px solid var(--fin-line);
  resize:vertical;color:var(--fin-ink);background:var(--fin-surface)}
.fin-tools textarea:focus{outline:none;border-color:var(--fin-accent);
  box-shadow:0 0 0 3px rgba(91,33,182,.12)}
.fin-help{color:var(--fin-muted);font-size:13px;margin:0 0 11px}
.fin-tools-row{display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap}
.fin-spacer{flex:1}
.fin-btn{border:none;background:var(--fin-accent);color:#fff;font:inherit;font-weight:600;
  font-size:13.5px;padding:10px 17px;border-radius:10px;cursor:pointer;transition:.14s}
.fin-btn:hover:not(:disabled){background:#4C1D95}
.fin-btn:disabled{background:#DCD4EC;cursor:not-allowed}
.fin-btn.ghost{background:#fff;color:var(--fin-muted);border:1px solid var(--fin-line)}
.fin-btn.ghost:hover:not(:disabled){color:var(--fin-accent);border-color:var(--fin-accent);background:#fff}
.fin-filebtn{font-size:13.5px;font-weight:600;color:var(--fin-accent);cursor:pointer;
  border:1px solid var(--fin-line);padding:10px 15px;border-radius:10px;background:#fff}
.fin-filebtn:hover{border-color:var(--fin-accent)}

button:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible,input:focus-visible{
  outline:2px solid var(--fin-accent);outline-offset:2px}
@media(max-width:600px){.fin{padding:0 15px 64px}.fin-head{padding:30px 0 20px}}
`;

// ── Statement views ──────────────────────────────────────────
export const STATEMENT_CSS = `
.fin-narrow{max-width:760px}
.fin-narrow .fin-panel-head{margin-bottom:20px}
.st-table{width:100%;border-collapse:collapse;font-size:14px}
.st-table td{padding:8px 0;border-bottom:1px solid var(--fin-hair)}
.st-table td:last-child{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.st-line td:first-child{padding-left:18px;color:#4A4360}
.st-head td{padding-top:20px;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;
  color:var(--fin-faint);font-weight:600;border-bottom:1px solid var(--fin-line)}
.st-sub td{font-weight:600;border-bottom:1px solid var(--fin-line)}
.st-total td{font-family:var(--fin-serif);font-size:19px;font-weight:400;padding:16px 0 8px;
  border-bottom:2px solid var(--fin-ink);border-top:1px solid var(--fin-line)}
.st-total td:first-child{letter-spacing:-.01em}
.st-pos td:last-child{color:#0A7E96}
.st-neg td:last-child{color:var(--fin-neg)}
.st-note{margin:14px 0 0;font-size:12.5px;color:var(--fin-faint)}
.st-empty{color:var(--fin-muted);font-size:13.5px;padding:8px 0}

/* Cash flow: opening, what moved, closing */
.cf-row{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:baseline;
  padding:11px 0;border-bottom:1px solid var(--fin-hair);font-size:14px}
.cf-row.cf-open,.cf-row.cf-close{font-family:var(--fin-serif);font-size:20px;font-weight:400;
  padding:16px 0;border-bottom:2px solid var(--fin-ink)}
.cf-row.cf-close{border-top:1px solid var(--fin-line)}
.cf-row span:last-child{font-variant-numeric:tabular-nums;white-space:nowrap}
.cf-row .cf-in{color:#0A7E96}
.cf-row .cf-out{color:var(--fin-neg)}
.cf-sub{display:block;font-size:12px;color:var(--fin-faint);font-family:'Instrument Sans',sans-serif}

/* Ranked list — customers, vendors */
.rk{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:11px}
.rk li{display:grid;grid-template-columns:1.4fr 2fr auto;gap:12px;align-items:center;font-size:13px}
.rk-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rk-name em{font-style:normal;color:var(--fin-faint);font-size:11.5px;margin-left:6px}
.rk-track{background:var(--fin-hair);border-radius:4px;height:8px;overflow:hidden}
.rk-fill{display:block;height:100%;border-radius:0 4px 4px 0}
.rk-val{font-variant-numeric:tabular-nums;font-weight:600;font-size:12.5px}

.fin-viewhead{display:flex;align-items:baseline;justify-content:space-between;
  gap:16px;flex-wrap:wrap;padding:36px 0 22px}
.fin-viewhead h1{font-family:var(--fin-serif);font-weight:400;
  font-size:clamp(30px,4.4vw,40px);letter-spacing:-.02em;line-height:1;margin:0 0 6px}
.fin-viewhead p{margin:0;color:var(--fin-muted);font-size:14.5px}
`;
