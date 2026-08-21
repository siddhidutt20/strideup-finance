// Series colours are validated for colour-vision separation (deutan ΔE 10.7
// between revenue and expenses); both carry a legend and direct labels, so
// identity never rests on colour alone. One family throughout — Poppins, the
// geometric sans the StrideUp wordmark is drawn in. Page titles and financial
// figures use --fin-display, which is the same family at a heavier weight:
// hierarchy comes from weight and size rather than from a second typeface.
export const FIN_CSS = `
/* Tokens are declared on both the shell and the content column. The sidebar
   is a sibling of .fin, not a child, so a token block that lived only on .fin
   left every surface in the sidebar resolving to nothing — transparent
   backgrounds and invisible borders, with no error anywhere. */
.fin, .fin-app{
  --fin-in:#0FA3C7; --fin-out:#D43081; --fin-accent:#5B21B6;
  --fin-ink:#171326; --fin-muted:#6E6884; --fin-faint:#9C96AE;
  --fin-line:#EBE8F2; --fin-hair:#F2F0F7; --fin-surface:#fff;
  --fin-sunk:#FAF9FC; --fin-warn:#8A6A15; --fin-neg:#A8225F;
  --fin-display:'Poppins',system-ui,-apple-system,sans-serif}
/* Layout belongs to the content column alone — the shell is the grid.
   min-width:0 matters: a grid item defaults to min-width:auto, which is
   min-content, so a wide table inside an overflow-x:auto wrapper stretches
   the whole column instead of scrolling within it. Only the views with
   tables showed it, which is what made it look like a table bug. */
.fin{min-width:0;width:100%;max-width:1180px;margin:0 auto;padding:0 28px 96px;
  color:var(--fin-ink);font-size:15px;line-height:1.6;box-sizing:border-box}
.fin-boot{display:flex;justify-content:center;padding:96px}
.fin-spinner{width:32px;height:32px;border-radius:50%;border:2.5px solid var(--fin-line);
  border-top-color:var(--fin-accent);animation:fin-spin .8s linear infinite}
@keyframes fin-spin{to{transform:rotate(360deg)}}

/* ── Shell: a fixed sidebar, content scrolls beside it ── */
.fin-app{display:grid;grid-template-columns:236px minmax(0,1fr);min-height:100vh;
  background:#F4F3F8}
.fin-side{position:sticky;top:0;align-self:start;height:100vh;display:flex;
  flex-direction:column;gap:4px;padding:18px 14px;background:var(--fin-surface);
  border-right:1px solid var(--fin-line)}
/* The brand lockup: their wordmark, with the product name under it rather
   than beside it — "Finance" is what this app is, not part of the logo. */
.fin-sidebrand{display:flex;flex-direction:column;align-items:flex-start;gap:2px;
  padding:10px 10px 20px}
.fin-wordmark{display:block;width:auto;height:42px}
.fin-product{font-family:var(--fin-display);font-size:17px;font-weight:600;
  letter-spacing:-.01em;color:var(--fin-muted);padding-left:1px}
.fin-sidelabel{margin:0 0 6px;padding:0 10px;font-size:10.5px;font-weight:700;
  letter-spacing:.11em;text-transform:uppercase;color:var(--fin-faint)}
.fin-side nav ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.fin-side nav button{width:100%;display:flex;align-items:center;gap:11px;border:none;
  background:none;font-family:inherit;color:var(--fin-muted);font-size:13.5px;font-weight:500;
  padding:9px 11px;border-radius:10px;cursor:pointer;transition:.14s;text-align:left}
.fin-side nav button svg{flex:none;opacity:.75}
.fin-side nav button span{flex:1}
.fin-side nav button:hover{color:var(--fin-accent);background:#F5F1FD}
.fin-side nav button.on{color:#fff;background:var(--fin-accent);font-weight:600;
  box-shadow:0 5px 14px -5px rgba(91,33,182,.55)}
.fin-side nav button.on svg{opacity:1}
.fin-badge{min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:var(--fin-out);
  color:#fff;font-size:11px;font-weight:700;display:grid;place-items:center;
  font-variant-numeric:tabular-nums}
.fin-side nav button.on .fin-badge{background:rgba(255,255,255,.28)}
.fin-sideuser{margin-top:auto;display:flex;align-items:center;gap:9px;padding:10px;
  border-radius:12px;background:var(--fin-sunk);border:1px solid var(--fin-hair)}
.fin-avatar{width:30px;height:30px;flex:none;border-radius:9px;display:grid;place-items:center;
  background:linear-gradient(135deg,var(--fin-accent),var(--fin-in));color:#fff;
  font-weight:700;font-size:13px}
.fin-sidewho{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.25}
.fin-sidewho b{font-size:12.5px;font-weight:650;color:var(--fin-ink);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fin-sidewho em{font-style:normal;font-size:11px;color:var(--fin-faint);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fin-sideout{border:none;background:none;color:var(--fin-faint);font-size:15px;
  cursor:pointer;padding:4px 6px;border-radius:7px;line-height:1}
.fin-sideout:hover{color:var(--fin-accent);background:#F1ECFB}

.fin-headctl{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.fin-entnav{display:inline-flex;gap:2px;background:var(--fin-surface);
  border:1px solid var(--fin-line);border-radius:10px;padding:3px}
.fin-entnav button{border:none;background:none;font-family:inherit;font-size:12.5px;
  font-weight:500;color:var(--fin-muted);padding:6px 12px;border-radius:7px;cursor:pointer;
  transition:.14s}
.fin-entnav button:hover{color:var(--fin-accent)}
.fin-entnav button.on{color:var(--fin-accent);background:#F1ECFB;font-weight:600}
.fin-monthnav{display:inline-flex;align-items:center;gap:2px;background:var(--fin-surface);
  border:1px solid var(--fin-line);border-radius:10px;padding:3px 4px}
.fin-monthnav strong{min-width:124px;text-align:center;font-size:13px;font-weight:600;
  font-variant-numeric:tabular-nums}
.fin-monthnav button{border:none;background:none;font-size:16px;line-height:1;
  color:var(--fin-accent);cursor:pointer;padding:5px 9px;border-radius:7px}
.fin-monthnav button:hover:not(:disabled){background:#F1ECFB}
.fin-monthnav button:disabled{color:#D6D1E2;cursor:not-allowed}

@media(max-width:900px){
  /* minmax(0,1fr), not 1fr: a bare 1fr floors at the column's min-content
     width, so one wide table stretches the whole shell instead of scrolling
     inside its own container. */
  .fin-app{grid-template-columns:minmax(0,1fr)}
  .fin-side{position:static;height:auto;flex-direction:row;flex-wrap:wrap;align-items:center;
    gap:10px;border-right:none;border-bottom:1px solid var(--fin-line);padding:12px 15px}
  .fin-sidebrand{flex-direction:row;align-items:center;gap:8px;padding:0}
  .fin-wordmark{height:28px}
  .fin-product{font-size:15px;padding:0}
  .fin-sidelabel{display:none}
  .fin-side nav{flex:1 0 100%;overflow-x:auto}
  .fin-side nav ul{flex-direction:row;gap:4px}
  .fin-side nav button{width:auto;white-space:nowrap;padding:8px 12px}
  .fin-sideuser{margin:0}
}

/* ── Masthead ── */
.fin-head{padding:44px 0 26px}
.fin-head h1{font-family:var(--fin-display);font-weight:600;font-size:clamp(34px,5vw,46px);
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
.fin-empty h2{font-family:var(--fin-display);font-weight:600;font-size:24px;
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
.fin-kpi-value{font-family:var(--fin-display);font-weight:600;font-size:24px;line-height:1.08;
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
.fin-entblock{margin-bottom:6px}
.fin-entlabel{font-family:var(--fin-display);font-weight:600;font-size:15px;
  letter-spacing:.02em;text-transform:uppercase;color:var(--fin-faint);
  margin:22px 0 10px;padding-bottom:7px;border-bottom:1px solid var(--fin-line)}
.fin-sidebyside{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
@media(max-width:960px){.fin-sidebyside{grid-template-columns:1fr}}
.fin-sidebyside .st-wrap{max-width:none}
.fe-ent{display:inline-block;font-size:10px;font-weight:600;letter-spacing:.06em;
  text-transform:uppercase;padding:2px 6px;border-radius:4px}
.fe-ent.e-strideup{color:var(--fin-accent);background:#F1ECFB}
.fe-ent.e-personal{color:#0A7E96;background:#E6F5F8}
.fin-closebox{margin-top:22px;padding-top:18px;border-top:1px solid var(--fin-hair)}
.fin-closebox h3{font-family:var(--fin-display);font-weight:600;font-size:16px;margin:0 0 6px}
.fin-panel{background:var(--fin-surface);border:1px solid var(--fin-line);border-radius:14px;
  padding:20px 22px;margin-bottom:14px;scroll-margin-top:64px}
.fin-panel-head{display:flex;align-items:baseline;justify-content:space-between;gap:14px;
  margin-bottom:16px}
.fin-panel-head h2{font-family:var(--fin-display);font-weight:600;font-size:19px;
  letter-spacing:-.012em;margin:0}
.fin-panel-head>div>span{display:block;font-size:12.5px;color:var(--fin-faint);margin-top:2px}
.fin-none{color:var(--fin-muted);font-size:13.5px;margin:4px 0}
.fin-link{color:var(--fin-accent);font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap}
.fin-link:hover{text-decoration:underline}
.fin-link.asbtn{background:none;border:none;font-family:inherit;cursor:pointer;padding:0}
.fin-scope{display:inline-flex;align-items:center;gap:4px}
.fin-scope button{border:1px solid var(--fin-line);background:#fff;font-family:inherit;
  font-size:12px;font-weight:600;color:var(--fin-muted);padding:5px 10px;border-radius:8px;cursor:pointer}
.fin-scope button.on{color:var(--fin-accent);border-color:#D9CBF3;background:#F5F0FD}
.fin-scope .fin-link{margin-left:10px}
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
.fe-cur{font:inherit;font-size:10.5px;font-weight:600;letter-spacing:.04em;padding:2px 3px;
  border-radius:6px;border:1px solid transparent;background:transparent;color:#B9B3C8;
  appearance:none;-webkit-appearance:none;text-align:right;cursor:pointer;transition:.14s}
.fin-table tbody tr:hover .fe-cur{color:var(--fin-muted);border-color:var(--fin-line);background:#fff}
.fe-cur:hover,.fe-cur:focus{color:var(--fin-ink) !important;border-color:var(--fin-faint) !important;
  background:#fff !important}
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
.st-total td{font-family:var(--fin-display);font-size:19px;font-weight:600;padding:16px 0 8px;
  border-bottom:2px solid var(--fin-ink);border-top:1px solid var(--fin-line)}
.st-total td:first-child{letter-spacing:-.01em}
.st-pos td:last-child{color:#0A7E96}
.st-neg td:last-child{color:var(--fin-neg)}
.st-note{margin:14px 0 0;font-size:12.5px;color:var(--fin-faint)}
.st-empty{color:var(--fin-muted);font-size:13.5px;padding:8px 0}

/* Cash flow: opening, what moved, closing */
.cf-row{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:baseline;
  padding:11px 0;border-bottom:1px solid var(--fin-hair);font-size:14px}
.cf-row.cf-open,.cf-row.cf-close{font-family:var(--fin-display);font-size:20px;font-weight:600;
  padding:16px 0;border-bottom:2px solid var(--fin-ink)}
.cf-row.cf-close{border-top:1px solid var(--fin-line)}
.cf-row span:last-child{font-variant-numeric:tabular-nums;white-space:nowrap}
.cf-row .cf-in{color:#0A7E96}
.cf-row .cf-out{color:var(--fin-neg)}
.cf-sub{display:block;font-size:12px;font-weight:400;color:var(--fin-faint)}

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
.fin-viewhead h1{font-family:var(--fin-display);font-weight:600;
  font-size:clamp(30px,4.4vw,40px);letter-spacing:-.02em;line-height:1;margin:0 0 6px}
.fin-viewhead p{margin:0;color:var(--fin-muted);font-size:14.5px}
`;

// ── Forecast, spending and what is due ───────────────────────
// The committed line and the estimated line share a hue on purpose: they are
// the same quantity under two assumptions, not two different things. Dash and
// weight carry the difference, so the distinction survives greyscale, print
// and every kind of colour vision.
export const FORECAST_CSS = `
.fin-twocol{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px}

/* KPI cards */
.fc-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin:0 0 18px}
.fc-kpi{background:var(--fin-surface);border:1px solid var(--fin-line);border-radius:16px;
  padding:15px 17px 13px;box-shadow:0 1px 2px rgba(23,19,38,.04)}
.fc-kpi header{display:flex;align-items:center;justify-content:space-between}
.fc-kpi header span{font-size:12px;font-weight:600;color:var(--fin-muted);
  letter-spacing:.01em}
.fc-kpi p{margin:7px 0 5px;font-size:25px;line-height:1.1;font-weight:600;
  letter-spacing:-.022em}
.fc-kpi footer{font-size:11.5px;color:var(--fin-faint);line-height:1.4}
.fc-kpi.warn{border-color:#F0D9C8;background:linear-gradient(#FFFBF7,var(--fin-surface))}

/* Scenario switch */
.fc-scen{display:inline-flex;gap:2px;background:var(--fin-sunk);border:1px solid var(--fin-line);
  border-radius:9px;padding:3px}
.fc-scen button{border:none;background:none;font-family:inherit;font-size:12px;font-weight:500;
  color:var(--fin-muted);padding:5px 11px;border-radius:6px;cursor:pointer;transition:.14s}
.fc-scen button:hover{color:var(--fin-accent)}
.fc-scen button.on{background:var(--fin-surface);color:var(--fin-accent);font-weight:600;
  box-shadow:0 1px 2px rgba(23,19,38,.07)}

/* Projection chart */
.fc-line{fill:none;stroke:var(--fin-accent);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.fc-line-est{fill:none;stroke:var(--fin-accent);stroke-width:2;stroke-dasharray:6 5;
  stroke-linecap:round;opacity:.85}
.fc-band{fill:var(--fin-accent);opacity:.09}
.fc-dot{fill:var(--fin-surface);stroke:var(--fin-accent);stroke-width:2}
.fc-dot.neg{stroke:var(--fin-out)}
.fc-dot-est{fill:var(--fin-accent);opacity:.5}
.fc-zero{stroke:var(--fin-out);stroke-width:1;stroke-dasharray:3 4;opacity:.55}
.fc-zerolab{font-size:9.5px;fill:var(--fin-out);font-weight:600;letter-spacing:.05em;
  text-transform:uppercase}
.fc-endlab{font-size:12.5px;font-weight:700;fill:var(--fin-accent);
  font-variant-numeric:tabular-nums}
.fc-endlab.neg{fill:var(--fin-out)}
.fc-endlab.est{font-weight:600;opacity:.72}
.fin-legend i.fc-key-solid{width:15px;height:3px;border-radius:2px;background:var(--fin-accent)}
.fin-legend i.fc-key-dash{width:15px;height:0;border-radius:0;background:none;
  border-top:2.5px dashed var(--fin-accent);opacity:.85}
.fin-legend i.fc-key-band{width:15px;height:9px;border-radius:2px;background:var(--fin-accent);
  opacity:.18}

/* Coverage and method */
.fc-cov{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin-bottom:4px}
.fc-covtop{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.fc-covtop span{font-size:13px;font-weight:600;color:var(--fin-ink)}
.fc-covtop strong{font-size:17px;font-weight:600;letter-spacing:-.015em}
.fc-covbar{height:7px;border-radius:99px;background:var(--fin-sunk);margin:8px 0 7px;overflow:hidden}
.fc-covfill{display:block;height:100%;border-radius:99px}
.fc-covfill.in{background:var(--fin-in)}
.fc-covfill.out{background:var(--fin-out)}
.fc-covsub{margin:0;font-size:12px;color:var(--fin-muted);line-height:1.5}
.fc-note{margin:14px 0 0;font-size:12px;color:var(--fin-faint);line-height:1.6;
  padding-top:12px;border-top:1px solid var(--fin-hair)}
.fc-flag{margin:12px 0 0;font-size:12.5px;line-height:1.6;color:var(--fin-warn);
  background:#FFFBF0;border:1px solid #F2E6C7;border-radius:11px;padding:10px 13px}
.fc-none{margin:6px 0;font-size:13px;color:var(--fin-muted);line-height:1.6}
.fc-histwrap{overflow-x:auto;margin-top:16px}
.fc-hist{margin-top:0;min-width:420px}
.fc-hist td,.fc-hist th{font-size:12.5px}

/* Commitments */
.fc-table td{vertical-align:top}
.fc-dir{display:inline-block;margin-right:8px;padding:2px 7px;border-radius:6px;font-size:10.5px;
  font-weight:700;letter-spacing:.03em;text-transform:uppercase;vertical-align:1px}
.fc-dir.in{background:#E4F6FA;color:#0B7C97}
.fc-dir.out{background:#FCE9F2;color:#A8225F}
.fc-cat{display:block;font-size:11.5px;color:var(--fin-faint);margin-top:3px}
.fc-who{color:var(--fin-muted)}
.fc-date{font-variant-numeric:tabular-nums;font-size:12.5px;color:var(--fin-muted)}
.fc-open{color:var(--fin-faint);font-style:italic}

/* Spending donut */
.sp-wrap{display:grid;grid-template-columns:auto minmax(0,1fr);gap:20px;align-items:center}
.sp-donut svg{width:190px;height:190px;display:block}
.sp-seg{transition:.14s;cursor:default}
.sp-centre-fig{text-anchor:middle;font-size:19px;font-weight:600;fill:var(--fin-ink);
  font-family:var(--fin-display);letter-spacing:-.02em}
.sp-centre-lab{text-anchor:middle;font-size:10px;fill:var(--fin-faint);font-weight:600;
  letter-spacing:.06em;text-transform:uppercase}
.sp-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px}
.sp-list li{display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:8px;
  font-size:12.5px;transition:.12s}
.sp-list li.on{background:var(--fin-sunk)}
.sp-list i{width:9px;height:9px;border-radius:3px;flex:none}
.sp-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:var(--fin-ink)}
.sp-share{color:var(--fin-faint);font-variant-numeric:tabular-nums;font-size:11.5px}
.sp-amt{font-weight:600;font-variant-numeric:tabular-nums;min-width:74px;text-align:right}
.sp-rest{display:flex!important;flex-wrap:wrap;gap:4px 12px;font-size:11.5px;
  color:var(--fin-faint);padding-top:8px!important;margin-top:4px;
  border-top:1px solid var(--fin-hair)}
.sp-rest b{font-weight:600;color:var(--fin-muted)}
@media(max-width:620px){.sp-wrap{grid-template-columns:1fr}.sp-donut{justify-self:center}}

/* Due soon */
.du-wrap section{margin-bottom:16px}
.du-wrap h4{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:12px;
  font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--fin-muted)}
.du-count{background:var(--fin-sunk);border-radius:99px;padding:1px 7px;font-size:11px;
  font-weight:700;color:var(--fin-muted);letter-spacing:0}
.du-wrap h4 b{margin-left:auto;font-size:13.5px;letter-spacing:-.01em;text-transform:none}
.du-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px}
.du-list li{display:flex;align-items:center;gap:11px;padding:7px 8px;border-radius:9px}
.du-list li:hover{background:var(--fin-sunk)}
.du-when{display:flex;flex-direction:column;align-items:center;justify-content:center;
  width:34px;height:34px;flex:none;border-radius:9px;background:var(--fin-sunk);
  border:1px solid var(--fin-hair);line-height:1}
.du-when b{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}
.du-when em{font-style:normal;font-size:9px;color:var(--fin-faint);font-weight:600}
.du-pill{flex:none;padding:3px 8px;border-radius:7px;font-size:10.5px;font-weight:700;
  letter-spacing:.03em;text-transform:uppercase}
.du-pill.ok{background:#E4F6FA;color:#0B7C97}
.du-pill.late{background:#FCE9F2;color:#A8225F}
.du-what{flex:1;min-width:0;display:flex;flex-direction:column;font-size:13px;
  color:var(--fin-ink);line-height:1.35}
.du-sub{font-size:11.5px;color:var(--fin-faint)}
.du-amt{font-weight:600;font-variant-numeric:tabular-nums;font-size:13px}
`;

// ── Contracts grid ───────────────────────────────────────────
// Status is never carried by colour alone: every chip has a word on it, so
// paid, due and overdue survive greyscale and colour vision deficiency.
export const CONTRACTS_CSS = `
.ct-table{min-width:820px}
.ct-table th.num{text-align:center;min-width:96px}
.ct-table th.now{color:var(--fin-accent)}
.ct-who{min-width:230px;vertical-align:top}
.ct-cell{text-align:center;vertical-align:middle;padding:6px 4px!important}
.ct-cell.empty span{color:#DCD8E6}
.ct-chip{display:flex;flex-direction:column;align-items:center;gap:1px;width:100%;
  border:1px solid transparent;background:none;font-family:inherit;cursor:pointer;
  padding:5px 6px;border-radius:9px;transition:.14s;line-height:1.2}
.ct-chip:disabled{cursor:wait;opacity:.6}
.ct-chip i{display:none}
.ct-chipamt{font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums}
.ct-chip em{font-style:normal;font-size:9.5px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase}
.ct-chip.paid{background:#E4F6FA;border-color:#BEE7F0;color:#0B7C97}
.ct-chip.paid:hover{background:#D5F0F7}
.ct-chip.due{background:var(--fin-sunk);border-color:var(--fin-line);color:var(--fin-muted)}
.ct-chip.due:hover{border-color:var(--fin-accent);color:var(--fin-accent)}
.ct-chip.overdue{background:#FCE9F2;border-color:#F5CDE0;color:#A8225F}
.ct-chip.overdue:hover{background:#F9DDEA}
.ct-chip.waived{background:transparent;border-color:var(--fin-hair);color:var(--fin-faint);
  text-decoration:line-through}

/* Recording a payment asks two questions, because "it arrived" is rarely
   exactly the due date and not always exactly the amount. */
.ct-modal{position:fixed;inset:0;z-index:40;display:grid;place-items:center;padding:20px;
  background:rgba(23,19,38,.42);backdrop-filter:blur(3px)}
.ct-dialog{width:100%;max-width:400px;background:var(--fin-surface);border-radius:18px;
  padding:22px;box-shadow:0 30px 70px -25px rgba(23,19,38,.5);display:flex;
  flex-direction:column;gap:12px}
.ct-dialog h3{margin:0;font-family:var(--fin-display);font-weight:600;font-size:19px}
.ct-dialogsub{margin:-6px 0 2px;font-size:12.5px;color:var(--fin-muted);line-height:1.5}
.ct-dialog label{display:flex;flex-direction:column;gap:5px;font-size:12.5px;
  font-weight:600;color:var(--fin-muted)}
.ct-dialog input{font-family:inherit;font-size:14px;padding:9px 11px;border-radius:10px;
  border:1px solid var(--fin-line);background:var(--fin-surface);color:var(--fin-ink)}
.ct-dialog input:focus{outline:none;border-color:var(--fin-accent)}
.ct-dialognote{margin:0;font-size:11.5px;color:var(--fin-faint);line-height:1.55}
.ct-dialogactions{display:flex;gap:8px;justify-content:flex-end;margin-top:2px}
`;

export const CONTRACTS_EXTRA_CSS = `
.fc-empty{background:#F6F2FE;border:1px solid #E3D8FA;border-radius:14px;
  padding:15px 18px;margin:0 0 18px}
.fc-empty strong{display:block;font-size:14px;font-weight:600;color:var(--fin-accent);
  margin-bottom:5px}
.fc-empty p{margin:0 0 6px;font-size:13px;line-height:1.6;color:var(--fin-muted)}
.fc-empty p:last-child{margin-bottom:0}
.ct-outside{display:block;font-size:10.5px;font-weight:700;letter-spacing:.05em;
  text-transform:uppercase;color:var(--fin-faint);margin-bottom:4px}
`;

export const LEDGER_EDIT_CSS = `
.fe-amtbtn{border:1px solid transparent;background:none;font-family:inherit;font-size:inherit;
  font-weight:600;padding:2px 6px;margin:-2px -6px;border-radius:7px;cursor:pointer;
  font-variant-numeric:tabular-nums;transition:.13s}
.fe-amtbtn:hover{border-color:var(--fin-line);background:var(--fin-sunk)}
.fe-amtbtn.amt-in{color:var(--fin-in)}
.fe-amtbtn.amt-out{color:var(--fin-ink)}
.fe-amtin{width:120px;font-family:inherit;font-size:13px;font-weight:600;text-align:right;
  padding:4px 7px;border-radius:8px;border:1px solid var(--fin-accent);
  background:var(--fin-surface);color:var(--fin-ink);font-variant-numeric:tabular-nums}
.fe-amtin:focus{outline:none;box-shadow:0 0 0 3px #EDE4FC}
`;

export const FUTURE_CSS = `
.fin-future{background:#F6F2FE;border:1px solid #E3D8FA;border-radius:14px;
  padding:15px 18px;margin:0 0 18px}
.fin-future strong{display:block;font-size:14px;font-weight:600;color:var(--fin-accent);
  margin-bottom:5px}
.fin-future p{margin:0 0 8px;font-size:13px;line-height:1.6;color:var(--fin-muted)}
.fin-future ul{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-direction:column;gap:5px}
.fin-future li{display:flex;align-items:baseline;gap:12px;font-size:13.5px}
.fin-future li b{min-width:78px;font-weight:600;color:var(--fin-ink);font-size:12.5px}
.fin-future li span{font-weight:600;font-variant-numeric:tabular-nums}
.fin-future-go{margin:0!important}
.fin-help.warn{color:var(--fin-warn)}
`;
