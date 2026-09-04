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
.fin{min-width:0;width:100%;max-width:1480px;margin:0 auto;padding:0 28px 96px;
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
/* Where there is no wordmark, the name is set in type: the qualifier light,
   the thing itself heavy, on two lines like the lockup it replaces. */
/* A logo of unknown proportions: fix the height, let the width follow, and
   never let it push the sidebar wider than itself. */
.fin-wordmark{width:auto;max-width:100%;object-fit:contain;object-position:left center}
/* A custom mark is sized by the width it has to live in, capped so a tall
   lockup cannot push the menu down the page. The width is set outright rather
   than as a percentage: the brand block is a flex column aligned to its start,
   so a percentage resolves against the image's own content width and the logo
   comes out at a third of the size it was given. */
.fin-wordmark.fin-logo{width:170px;max-width:100%;height:auto;max-height:130px;
  object-position:left center;margin:0 0 4px}
@media(max-width:1000px){.fin-wordmark.fin-logo{width:104px;max-height:52px}}
.fin-brandtype{display:flex;flex-direction:column;line-height:1.15;
  font-family:var(--fin-display);font-size:19px;font-weight:500;
  color:var(--fin-muted);letter-spacing:-.015em}
.fin-brandtype b{font-size:23px;font-weight:600;color:var(--fin-ink)}
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
/* A full-width row under the account block, with a word on it. It reads as a
   thing you can press, which the icon on its own never did. */
.fin-sideout{display:flex;align-items:center;justify-content:center;gap:8px;
  width:100%;margin-top:8px;border:1px solid var(--fin-line);background:var(--fin-surface);
  color:var(--fin-muted);font-family:inherit;font-size:12.5px;font-weight:600;
  cursor:pointer;padding:9px 12px;border-radius:11px;line-height:1;transition:.13s}
.fin-sideout:hover{color:var(--fin-accent);background:#F1ECFB;
  border-color:color-mix(in srgb, var(--fin-accent) 30%, var(--fin-line))}
.fin-sideout:focus-visible{outline:2px solid var(--fin-accent);outline-offset:2px}

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
  /* min-width:0 so the scroller actually contains its row. Without it the
     nav's own content width leaks out and the page picks up a few pixels of
     horizontal scroll that nothing on screen explains. */
  .fin-side nav{flex:1 0 100%;min-width:0;max-width:100%;overflow-x:auto}
  .fin-side nav ul{flex-direction:row;gap:4px}
  .fin-side nav button{width:auto;white-space:nowrap;padding:8px 12px}
  .fin-sideuser{margin:0}
  /* In the top-bar layout it sits beside the account block, not under it. */
  .fin-sideout{width:auto;margin-top:0}
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
  padding:20px 22px;margin-bottom:14px;scroll-margin-top:64px;
  container-type:inline-size;container-name:fin-panel}
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
.fin-legend i.fin-key-ahead{background:var(--fin-muted);opacity:.35;
  border:1.5px dashed var(--fin-muted)}
.fin-tip-ahead{color:var(--fin-muted);font-style:italic}
.fin-xlab{font-size:9.5px;fill:var(--fin-faint);text-anchor:middle;font-family:inherit}
.fin-xlab.ahead{font-style:italic}
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
.fin-twocol{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;align-items:start}

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
/* The donut and its legend sit side by side only where the legend has room
   for a category name. Below that the name is squeezed to nothing — a legend
   with no names identifies nothing — so the two stack instead. A container
   query, not a viewport one: what matters is the width of THIS panel, and the
   same panel appears at four different widths across the pages. The query is
   declared on the panel because a container cannot query itself. */
.sp-wrap{display:grid;grid-template-columns:auto minmax(0,1fr);gap:20px;align-items:center}
@container fin-panel (max-width: 470px){
  .sp-wrap{grid-template-columns:minmax(0,1fr)}
  .sp-donut{justify-self:center}
  .sp-name{overflow:visible;white-space:normal}
}
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
.sp-list li:has(.sp-parts){align-items:flex-start}
.sp-list li:has(.sp-parts) .sp-name{overflow:visible;text-overflow:clip;white-space:normal}
.sp-parts{display:block;font-style:normal;font-size:11px;line-height:1.45;
  color:var(--fin-faint);white-space:normal;margin-top:1px}
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

export const CASHFLOW_AHEAD_CSS = `
.cf-committed{margin-top:14px;padding-top:12px;border-top:1px dashed var(--fin-line)}
.cf-cmthead{margin:0 0 4px;font-size:10.5px;font-weight:700;letter-spacing:.08em;
  text-transform:uppercase;color:var(--fin-faint)}
.cf-committed .cf-row.cf-close{border-top:1px solid var(--fin-line);margin-top:6px}
`;

export const CF_NONE_CSS = `
.cf-none{margin:10px 0 2px;font-size:13px;color:var(--fin-faint);font-style:italic}
`;

// ── Vendor management ────────────────────────────────────────
export const VENDORS_CSS = `
.vm-kpis{grid-template-columns:repeat(6,minmax(0,1fr))}
@media(max-width:1500px){.vm-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:820px){.vm-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:460px){.vm-kpis{grid-template-columns:minmax(0,1fr)}}
.vm-stack{display:flex;flex-direction:column;gap:16px}
.vm-actions{display:inline-flex;align-items:center;gap:8px}
.vm-search{font-family:inherit;font-size:12.5px;padding:7px 11px;border-radius:9px;
  border:1px solid var(--fin-line);background:var(--fin-surface);color:var(--fin-ink);width:170px}
.vm-search:focus{outline:none;border-color:var(--fin-accent)}

/* Pending and expiring lists */
.vm-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px}
.vm-list li{display:flex;align-items:center;gap:11px;padding:9px 8px;border-radius:9px}
.vm-list li:hover{background:var(--fin-sunk)}
.vm-what{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.35}
.vm-what b{font-size:13.5px;font-weight:600;color:var(--fin-ink);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vm-what em{font-style:normal;font-size:11.5px;color:var(--fin-faint);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vm-right{display:flex;flex-direction:column;align-items:flex-end;line-height:1.35;flex:none}
.vm-right b{font-size:13.5px;font-weight:600;font-variant-numeric:tabular-nums}
.vm-right em{font-style:normal;font-size:11px;color:var(--fin-faint)}
.vm-late{color:var(--fin-neg)!important;font-weight:600}
/* The schedule under the ledger. Editing happens in the row itself, so the
   row becomes a form rather than opening a dialog somewhere else. */
/* Three money-in figures, then three money-out, so the row breaks 3-and-3
   rather than stranding one side's third card beside the other side's first. */
.ct-kpis{grid-template-columns:repeat(6,minmax(0,1fr))}
@media(max-width:1400px){.ct-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:760px){.ct-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:460px){.ct-kpis{grid-template-columns:minmax(0,1fr)}}
.lg-sched{min-width:820px}
.lg-sched .lg-ent{font-size:11.5px;color:var(--fin-muted)}
.lg-acts{white-space:nowrap;display:flex;gap:6px}
.lg-editing td{background:var(--fin-sunk)}
.lg-editgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));
  gap:10px 12px;align-items:end;padding:4px 0}
.lg-editgrid label{display:flex;flex-direction:column;gap:4px;min-width:0}
.lg-editgrid span{font-size:11px;font-weight:600;color:var(--fin-muted)}
.lg-editgrid input,.lg-editgrid select{font-family:inherit;font-size:13px;
  padding:7px 9px;border:1px solid var(--fin-line);border-radius:8px;
  background:var(--fin-surface);color:var(--fin-ink);min-width:0;width:100%;
  box-sizing:border-box}
.lg-editacts{display:flex;gap:8px;align-items:end}
.fc-dupe{background:color-mix(in srgb, var(--fin-out) 5%, transparent)}
.fc-dupetag{display:inline-block;margin-left:8px;padding:2px 7px;border-radius:6px;
  font-size:10.5px;font-weight:600;letter-spacing:.01em;
  color:var(--fin-out);background:color-mix(in srgb, var(--fin-out) 12%, transparent)}
.vm-rec.danger{color:var(--fin-out);border-color:color-mix(in srgb, var(--fin-out) 30%, var(--fin-line))}
.vm-cat{flex:none;max-width:190px;border:1px solid var(--fin-line);
  background:var(--fin-surface);font-family:inherit;font-size:11.5px;
  color:var(--fin-muted);padding:5px 8px;border-radius:8px;cursor:pointer}
@media(max-width:700px){
  .vm-cat{max-width:100%;width:100%;order:5}
  .vm-lib li .fc-dir{order:1}
  .vm-file{order:2;flex:1 1 100%}
  .vm-lib li b{order:3}
  .vm-lib li .vm-rec{order:6;flex:1 1 auto}
}
.vm-rec{flex:none;border:1px solid var(--fin-line);background:var(--fin-surface);
  font-family:inherit;font-size:11.5px;font-weight:600;color:var(--fin-muted);
  padding:5px 10px;border-radius:8px;cursor:pointer}
.vm-rec:hover{border-color:var(--fin-accent);color:var(--fin-accent)}
.vm-days{flex:none;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:700;
  background:var(--fin-sunk);color:var(--fin-muted);font-variant-numeric:tabular-nums}
.vm-days.soon{background:#FCE9F2;color:#A8225F}

/* Directory */
.vm-table{min-width:900px}
.vm-table td:first-child{display:flex;align-items:center;gap:10px}
.vm-avatar{width:30px;height:30px;flex:none;border-radius:9px;display:grid;place-items:center;
  background:linear-gradient(135deg,var(--fin-accent),var(--fin-in));color:#fff;
  font-weight:700;font-size:12.5px}
.vm-name{display:flex;flex-direction:column;line-height:1.3;min-width:0}
.vm-name em{font-style:normal;font-size:11px;color:var(--fin-faint);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:210px}
.vm-rel{display:inline-block;padding:3px 9px;border-radius:7px;font-size:11px;font-weight:700;
  letter-spacing:.02em}
.vm-rel.rel-in{background:#E4F6FA;color:#0B7C97}
.vm-rel.rel-out{background:#FCE9F2;color:#A8225F}
.vm-rel.rel-both{background:#F1ECFB;color:#5B21B6}
.vm-status{display:inline-block;padding:3px 9px;border-radius:7px;font-size:11px;font-weight:700}
.vm-status.s-paid{background:#E3F2F7;color:#12657F}
.vm-status.s-partial{background:#FDF3DC;color:#8A6A15}
.vm-status.s-due{background:var(--fin-sunk);color:var(--fin-muted)}
.vm-status.s-overdue{background:#FBE5E5;color:#A32A2A}
.vm-ends{display:block;font-style:normal;font-size:10.5px;color:var(--fin-faint)}
.vm-table .fe-out em.vm-late{display:block;font-style:normal;font-size:10.5px}

/* Contract folder */
.vm-lib section{margin-bottom:16px}
.vm-lib h4{display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:11.5px;
  font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--fin-muted)}
.vm-lib h4 span{background:var(--fin-sunk);border-radius:99px;padding:1px 7px;font-size:10.5px}
.vm-lib ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px}
/* Filename, category, amount and two buttons do not fit one line on a phone.
   The row wraps rather than pushing the page wider than the screen. */
.vm-lib li{display:flex;flex-wrap:wrap;align-items:center;gap:11px;padding:8px;
  border-radius:9px}
.vm-lib li:hover{background:var(--fin-sunk)}
.vm-file{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.35}
.vm-file a{font-size:13px;font-weight:600;color:var(--fin-accent);text-decoration:none;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vm-file a:hover{text-decoration:underline}
.vm-file em{font-style:normal;font-size:11.5px;color:var(--fin-faint);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vm-lib li b{font-variant-numeric:tabular-nums;font-size:13px;flex:none}
`;

// ── Cash flow dashboard ──────────────────────────────────────
export const CASH_CSS = `
/* Fixed column counts, not auto-fit. auto-fit packs as many as will fit and
   drops the rest onto a second row, which on a six-card row leaves most of a
   row empty — the exact complaint that started this. */
.ch-kpis{grid-template-columns:repeat(6,minmax(0,1fr))}
@media(max-width:1500px){.ch-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:820px){.ch-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:460px){.ch-kpis{grid-template-columns:minmax(0,1fr)}}
.ch-kpi-spark{margin-top:6px}
.ch-spark{display:block;width:100%;height:24px;margin-top:8px;overflow:visible}
.ch-sparkline{fill:none;stroke:var(--fin-in);stroke-width:1.6;stroke-linejoin:round;
  stroke-linecap:round}
.ch-sparkfill{fill:var(--fin-in);opacity:.1}

/* Recorded months read differently from projected ones. */
.ch-line-rec{fill:none;stroke:var(--fin-ink);stroke-width:2;stroke-linejoin:round;
  stroke-linecap:round;opacity:.72}
.ch-dot-rec{fill:var(--fin-surface);stroke:var(--fin-ink);stroke-width:1.8;opacity:.8}
.ch-today{stroke:var(--fin-faint);stroke-width:1;stroke-dasharray:2 4}
.ch-todaylab{font-size:9px;fill:var(--fin-faint);font-weight:700;letter-spacing:.09em;
  text-transform:uppercase}
.fin-legend i.ch-key-rec{width:15px;height:3px;border-radius:2px;background:var(--fin-ink);
  opacity:.72}

/* Alerts. Tone is carried by an icon and a word as well as a colour. */
.ch-alerts{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.ch-alerts li{display:flex;gap:11px;padding:11px 13px;border-radius:12px;
  border:1px solid var(--fin-line);background:var(--fin-sunk)}
.ch-alerticon{flex:none;width:22px;height:22px;border-radius:7px;display:grid;
  place-items:center;font-size:12px;font-weight:800;color:#fff}
.ch-alerts li.t-critical{background:#FDF0F0;border-color:#F3D6D6}
.ch-alerts li.t-critical .ch-alerticon{background:#d03b3b}
.ch-alerts li.t-serious{background:#FEF4EF;border-color:#F6DECE}
.ch-alerts li.t-serious .ch-alerticon{background:#ec835a}
.ch-alerts li.t-warning{background:#FFFAEC;border-color:#F3E5C2}
.ch-alerts li.t-warning .ch-alerticon{background:#c8901a}
.ch-alerttext{display:flex;flex-direction:column;gap:2px;min-width:0}
.ch-alerttext b{font-size:13px;font-weight:600;color:var(--fin-ink);line-height:1.35}
.ch-alerttext em{font-style:normal;font-size:12px;color:var(--fin-muted);line-height:1.5}

.ch-runway{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:4px}
.ch-runway div{background:var(--fin-sunk);border:1px solid var(--fin-hair);border-radius:12px;
  padding:11px 13px;display:flex;flex-direction:column;gap:3px}
.ch-runway span{font-size:11px;font-weight:600;color:var(--fin-muted)}
.ch-runway strong{font-size:20px;font-weight:600;letter-spacing:-.02em}

.ch-table{min-width:640px}
.ch-table td:first-child{white-space:nowrap}
.ch-table td em{font-style:normal;font-size:11.5px;color:var(--fin-faint)}
.ch-dot{display:inline-block;width:8px;height:8px;border-radius:3px;margin-right:8px}
.ch-dot.in{background:var(--fin-in)}
.ch-dot.out{background:var(--fin-out)}
.ch-est td{background:var(--fin-sunk)}
.ch-net td{border-top:1.5px solid var(--fin-line);font-weight:600;padding-top:11px}

.ch-costs{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px}
.ch-costs li{display:flex;align-items:center;gap:11px;padding:8px;border-radius:9px}
.ch-costs li:hover{background:var(--fin-sunk)}
.ch-costs li b{flex:none;font-variant-numeric:tabular-nums;font-size:13px}
@media(max-width:520px){.ch-runway{grid-template-columns:1fr}}
`;

export const CONTRACTS_GROUP_CSS = `
.ct-group td{padding-top:14px!important;padding-bottom:6px!important;
  border-bottom:1px solid var(--fin-hair)}
.ct-group .fc-cat{display:inline;margin-left:8px}
.ct-line .ct-who{padding-left:26px!important;font-size:12.5px}
.ct-line .fc-cat{display:block;margin-top:2px}
`;

export const SIDE_CSS = `
.sd-kpis{grid-template-columns:repeat(6,minmax(0,1fr))}
@media(max-width:1500px){.sd-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:820px){.sd-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:460px){.sd-kpis{grid-template-columns:minmax(0,1fr)}}
.sd-up{color:#12657F;font-weight:600}
.sd-down{color:var(--fin-neg);font-weight:600}
.sd-flat{color:var(--fin-faint)}
.sd-table{min-width:380px}
.sd-table td:last-child{white-space:nowrap}
.sd-bar{display:inline-block;width:60px;height:6px;border-radius:99px;
  background:var(--fin-sunk);margin-right:8px;vertical-align:middle;overflow:hidden}
.sd-bar i{display:block;height:100%;border-radius:99px}
.sd-bar i.in{background:var(--fin-in)}
.sd-bar i.out{background:var(--fin-out)}
.sd-windows{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.sd-windows div{background:var(--fin-sunk);border:1px solid var(--fin-hair);
  border-radius:12px;padding:11px 13px;display:flex;flex-direction:column;gap:3px}
.sd-windows span{font-size:11px;font-weight:600;color:var(--fin-muted)}
.sd-windows strong{font-size:18px;font-weight:600;letter-spacing:-.02em}
.sd-upcoming{border-top:1px solid var(--fin-hair);padding-top:8px!important}
@media(max-width:520px){.sd-windows{grid-template-columns:1fr}}

/* Five headline figures, then five performance figures under the chart. Both
   rows step down the same way, so the page keeps one rhythm at every width. */
.sd-kpis,.sd-stats{grid-template-columns:repeat(5,minmax(0,1fr))}
.sd-stats{margin:0 0 18px}
@media(max-width:1320px){.sd-kpis,.sd-stats{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:820px){.sd-kpis,.sd-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:460px){.sd-kpis,.sd-stats{grid-template-columns:minmax(0,1fr)}}

.sd-was{color:var(--fin-faint)}
.sd-fv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.sd-fv h5{margin:0 0 8px;padding-bottom:7px;border-bottom:1px solid var(--fin-hair);
  font-size:12px;font-weight:600;color:var(--fin-muted);display:flex;
  align-items:baseline;justify-content:space-between;gap:10px}
.sd-fv h5 b{font-size:16px;font-weight:600;color:var(--fin-ink);letter-spacing:-.015em}
/* Two lists side by side leave no room for a long vendor name on one line;
   wrapping beats truncating to "Pathworks Experience N…". */
.sd-fv .vm-what b{white-space:normal;overflow:visible;text-overflow:clip}
/* Two lists of vendor names side by side need real width, and this panel is
   half the page at 1400px but a third of it at 1100. The panel's own width is
   what decides, not the window's. */
@container fin-panel (max-width: 460px){
  .sd-fv{grid-template-columns:minmax(0,1fr)}
  .sd-windows{grid-template-columns:minmax(0,1fr)}
}

.sd-insights{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}
.sd-insights li{position:relative;padding-left:24px;font-size:13px;line-height:1.6;
  color:var(--fin-ink)}
.sd-insights li::before{content:"";position:absolute;left:0;top:6px;width:14px;height:14px;
  border-radius:5px;background:color-mix(in srgb, var(--fin-accent) 14%, transparent)}
.sd-insights li::after{content:"";position:absolute;left:4.5px;top:9.5px;width:4px;height:7px;
  border:solid var(--fin-accent);border-width:0 1.8px 1.8px 0;transform:rotate(45deg)}

/* The multi-series chart. The gutter holds a compact axis label, and the
   divider says where recorded stops and committed starts. */
.ml-svg{overflow:visible}
.ml-ylab{font-size:9.5px;fill:var(--fin-faint);text-anchor:end;font-family:inherit;
  font-variant-numeric:tabular-nums}
.ml-divide{stroke:var(--fin-line);stroke-width:1;stroke-dasharray:3 3}
.ml-band{font-size:9px;fill:var(--fin-faint);font-family:inherit;letter-spacing:.04em;
  text-transform:uppercase}
.fin-legend i.ml-key{width:15px;height:3px;border-radius:2px}
.fin-legend i.ml-key.ahead{background:none;height:0;
  border-top:2px dashed var(--fin-faint);border-radius:0}
`;

export const CASH_BAND_CSS = `
/* The reference packs the chart, the summary and the alerts into one band
   rather than stacking a full-width chart above two half-width panels. */
.ch-band{display:grid;grid-template-columns:minmax(0,1.85fr) minmax(0,1.05fr) minmax(0,1fr);
  gap:16px;align-items:start}
.ch-band2{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:16px;
  align-items:start}
@media(max-width:1280px){
  .ch-band{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .ch-band > :first-child{grid-column:1 / -1}
}
@media(max-width:820px){
  .ch-band,.ch-band2{grid-template-columns:minmax(0,1fr)}
  .ch-band > :first-child{grid-column:auto}
}
.ch-summary{display:flex;flex-direction:column;gap:12px}
.ch-summary .sp-donut{align-self:center}
.ch-summary .sp-donut svg{width:170px;height:170px}
.sp-centre-fig.neg{fill:var(--fin-out)}
.ch-spark.s-accent .ch-sparkline{stroke:var(--fin-accent)}
.ch-spark.s-accent .ch-sparkfill{fill:var(--fin-accent)}
.ch-spark.s-out .ch-sparkline{stroke:var(--fin-out)}
.ch-spark.s-out .ch-sparkfill{fill:var(--fin-out)}
.ch-runway div em{font-style:normal;font-size:11px;font-weight:600}
`;

export const NARROW_FIX_CSS = `
/* Both of these are flex rows that never wrapped, so on a narrow screen they
   pushed the page sideways by a few pixels — small enough to look like a
   rendering quirk rather than a layout fault. */
.fin-legend{flex-wrap:wrap}
/* A panel header carrying a title plus controls has to be allowed to stack. */
.fin-panel-head{flex-wrap:wrap;gap:10px}
.vm-actions{flex-wrap:wrap}
.vm-search{flex:1 1 130px;min-width:0;width:auto}
.cf-row{flex-wrap:wrap;gap:2px 12px}
.cf-row > span:first-child{min-width:0;flex:1 1 60%}
.cf-row > span:last-child{flex:0 0 auto;margin-left:auto}
.fin-chart,.fin-svg{max-width:100%}
`;

export const INVOICE_CSS = `
.fin-headacts{display:inline-flex;align-items:center;gap:8px}
.fin-headacts .fin-btn{padding:8px 14px;font-size:13px;white-space:nowrap;
  text-decoration:none;display:inline-flex;align-items:center}
.iv-dialog{max-width:520px}
.iv-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.iv-grid label.wide{grid-column:1 / -1}
.iv-grid label{display:flex;flex-direction:column;gap:5px;font-size:12.5px;
  font-weight:600;color:var(--fin-muted)}
.iv-grid label em{font-style:normal;font-weight:400;color:var(--fin-faint)}
.iv-grid input,.iv-grid select{font-family:inherit;font-size:14px;padding:9px 11px;
  border-radius:10px;border:1px solid var(--fin-line);background:var(--fin-surface);
  color:var(--fin-ink)}
.iv-grid input:focus,.iv-grid select:focus{outline:none;border-color:var(--fin-accent)}
.iv-table{min-width:760px}
.iv-actions{white-space:nowrap;display:flex;gap:6px;align-items:center}
.iv-table td em.vm-late{display:block;font-style:normal;font-size:10.5px}
@media(max-width:520px){.iv-grid{grid-template-columns:1fr}}
`;

export const RECORD_CSS = `
/* One "New" button, kind chosen first. */
.nr-dialog,.up-dialog{max-width:640px;width:100%}
.nr-kinds{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.nr-kind{text-align:left;border:1px solid var(--fin-line);background:var(--fin-surface);
  border-radius:12px;padding:10px 12px;cursor:pointer;font-family:inherit;
  display:flex;flex-direction:column;gap:3px;transition:.14s}
.nr-kind:hover{border-color:var(--fin-accent)}
.nr-kind.on{border-color:var(--fin-accent);background:#F6F2FE;
  box-shadow:0 0 0 1px var(--fin-accent) inset}
.nr-kind b{font-size:12.5px;font-weight:600;color:var(--fin-ink)}
.nr-kind em{font-style:normal;font-size:11px;color:var(--fin-muted);line-height:1.45}
.nr-body{max-height:52vh;overflow-y:auto;margin-top:4px;padding-right:2px}
.nr-body .fin-form{padding:0}
.up-dialog .fin-drop{margin:0}
.fin-feed-loose{margin:0 0 18px}
.iv-form{padding:0!important}

/* The schedule, one month at a time. */
.ct-month{min-width:640px}
.ct-what{color:var(--fin-muted)}
.ct-part{display:block;font-style:normal;font-size:11px;color:var(--fin-faint);margin-top:3px}
@media(max-width:520px){.nr-kinds{grid-template-columns:1fr}}
`;

export const OVERVIEW_CSS = `
/* A month still ahead reads as a projection, not as a record. The tint is the
   same one the future-month banner uses, so the two say "not yet" alike. */
.ov-ahead{background:#F6F2FE;border:1px solid #E3D8FA;border-radius:14px;
  padding:13px 16px;margin:0 0 16px;font-size:13px;line-height:1.6;
  color:var(--fin-muted)}
.ov-ahead b{color:var(--fin-accent);font-weight:600}
/* A quiet month carries a position, not a warning. Same shape as the
   ahead-of-time note, in the neutral tint rather than the accent one. */
.ov-carry{background:var(--fin-sunk);border-color:var(--fin-line)}
.ov-carry b{color:var(--fin-ink)}
/* Books left behind in a database this app no longer reads them from. A note,
   not an alarm — but it has to be visible enough to act on. */
.fin-stalebooks{background:#FFF8E9;border:1px solid #F6E7C4;border-radius:12px;
  padding:11px 14px;margin:0 0 14px;color:var(--fin-warn)}
.ov-kpis{grid-template-columns:repeat(6,minmax(0,1fr))}
@media(max-width:1500px){.ov-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:820px){.ov-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:460px){.ov-kpis{grid-template-columns:minmax(0,1fr)}}
.ov-band{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(0,1fr);gap:16px;
  align-items:start}
.ov-band3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start}
@media(max-width:1200px){.ov-band3{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:900px){.ov-band,.ov-band3{grid-template-columns:minmax(0,1fr)}}
/* In a third-width panel the donut and its legend side by side leave no room
   for a category name, and every label truncated to one letter is a legend
   that identifies nothing. Stacked, the names get the full width. */
.ov-band3 .sp-wrap{grid-template-columns:minmax(0,1fr)}
.ov-band3 .sp-donut{justify-self:center}
.ov-band3 .sp-name{overflow:visible;white-space:normal}
.ov-quad{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}
.ov-quad div{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.ov-quad span{font-size:12.5px;color:var(--fin-muted)}
.ov-quad b{font-size:17px;font-weight:600;letter-spacing:-.015em;font-variant-numeric:tabular-nums}
.ov-quad-total{border-top:1px solid var(--fin-line);padding-top:8px}
.ov-bar{display:flex;height:9px;border-radius:99px;overflow:hidden;gap:2px;margin-bottom:12px}
.ov-bar span{display:block}
.ov-ageing{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px}
.ov-ageing li{display:flex;align-items:center;gap:8px;font-size:12.5px}
.ov-ageing i{width:9px;height:9px;border-radius:3px;flex:none}
.ov-ageing span{flex:1;color:var(--fin-muted)}
.ov-ageing b{font-variant-numeric:tabular-nums;font-weight:600}
.ov-ageing em{font-style:normal;font-size:11px;color:var(--fin-faint);min-width:30px;
  text-align:right}
.ag-ok{background:#1785a8}.ag-warn{background:#eda100}
.ag-bad{background:#e07a3a}.ag-worst{background:#d03b3b}
.ch-alerts li .vm-rec{margin-left:auto;align-self:center;flex:none}
`;

export const PL_CSS = `
/* The budget form is a dialog, not a section of the page — it is a thing you
   open, fill in and close. Built on the same overlay the contract dialog uses
   so both behave the same way. */
.fin-modal{position:fixed;inset:0;z-index:45;display:grid;place-items:center;padding:20px;
  background:rgba(23,19,38,.42);backdrop-filter:blur(3px)}
.fin-modalbox{width:100%;background:var(--fin-surface);border-radius:18px;padding:20px 22px;
  box-shadow:0 30px 70px -25px rgba(23,19,38,.5);display:flex;flex-direction:column;
  gap:14px;max-height:90vh}
.fin-modalhead{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
.fin-modalhead h2{margin:0 0 4px;font-family:var(--fin-display);font-weight:600;font-size:19px}
.fin-modalhead span{display:block;font-size:12.5px;color:var(--fin-muted);line-height:1.55}
.fin-modalfoot{display:flex;align-items:center;gap:8px;padding-top:4px;
  border-top:1px solid var(--fin-hair);flex-wrap:wrap}

.pl-controls{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:0 0 16px}
.pl-compare{display:flex;align-items:center;gap:8px;font-size:12.5px;
  color:var(--fin-muted)}
.pl-compare select{font-family:inherit;font-size:13px;padding:7px 10px;
  border:1px solid var(--fin-line);border-radius:9px;background:var(--fin-surface);
  color:var(--fin-ink);cursor:pointer}
.pl-controls .fin-btn{margin-left:auto}
@media(max-width:560px){.pl-controls .fin-btn{margin-left:0;width:100%;text-align:center}}
.pl-kpis{grid-template-columns:repeat(6,minmax(0,1fr))}
@media(max-width:1400px){.pl-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:820px){.pl-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:460px){.pl-kpis{grid-template-columns:minmax(0,1fr)}}
.pl-kpis .fc-kpi{position:relative;overflow:hidden}
.pl-spark{position:absolute;right:0;bottom:0;width:52%;height:26px;opacity:.5;
  pointer-events:none}

/* The statement is the page's centre of gravity, so it gets the wide column
   and the trend sits beside it rather than under it. */
.pl-band{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:16px;
  align-items:start}
.pl-band3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start}
@media(max-width:1300px){.pl-band3{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:1100px){.pl-band{grid-template-columns:minmax(0,1fr)}}
@media(max-width:820px){.pl-band3{grid-template-columns:minmax(0,1fr)}}

.pl-table{min-width:560px}
.pl-table td:first-child{white-space:nowrap}
/* The plan is the only column here that is not a fact, so it is tinted and
   set apart rather than sitting flush with the recorded figures. */
.pl-plan{background:color-mix(in srgb, var(--fin-accent) 4%, transparent);
  color:var(--fin-muted)}
.pl-table thead th.pl-plan{color:var(--fin-accent)}
.pl-table tr.pl-strong td{font-weight:600}
.pl-table tr.pl-head td{padding-top:14px;font-size:11px;font-weight:700;
  letter-spacing:.06em;text-transform:uppercase;color:var(--fin-faint);
  border-bottom:0}
.pl-table tr.pl-total td{font-weight:600;background:var(--fin-sunk)}
.pl-table tr.pl-net td{font-weight:700;background:color-mix(in srgb, var(--fin-accent) 8%, transparent)}
.pl-table tr.pl-sub td{font-size:12.5px;color:var(--fin-muted);padding-top:2px;padding-bottom:8px}
.pl-table tr.pl-sub td:first-child{padding-left:16px}

.ml-ylab.cb-right{text-anchor:start}
.fin-legend i.ml-key.cb-line{background:none;height:0;border-top:2px solid #4a3aa7;
  border-radius:0}

.pl-var li em{font-size:11.5px;font-style:normal}
.pl-ins section{margin-bottom:14px}
.pl-ins section:last-child{margin-bottom:0}
.pl-ins h5{margin:0 0 6px;font-size:11.5px;font-weight:700;letter-spacing:.05em;
  text-transform:uppercase;color:var(--fin-faint)}
.pl-ins h5.ok{color:#12657F}
.pl-ins h5.warn{color:var(--fin-out)}
.pl-ins p{margin:0 0 6px;font-size:13px;line-height:1.6}
.pl-watch{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}
.pl-watch li{position:relative;padding-left:24px;font-size:13px;line-height:1.6}
.pl-watch li::before{content:"!";position:absolute;left:0;top:2px;width:15px;height:15px;
  border-radius:5px;background:color-mix(in srgb, var(--fin-out) 14%, transparent);
  color:var(--fin-out);font-size:10px;font-weight:700;text-align:center;line-height:15px}

/* The budget form. Every category you could plan for, grouped the way the
   dashboards read them, so a blank is as visible as a figure. */
.pl-budget{max-width:760px}
.pl-budgetbody{max-height:60vh;overflow-y:auto;padding:4px 2px}
.pl-budgetbody section{margin-bottom:16px}
.pl-budgetbody h5{display:flex;align-items:baseline;justify-content:space-between;gap:12px;
  margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid var(--fin-hair);
  font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
  color:var(--fin-faint)}
.pl-budgetbody h5 b{font-size:14px;font-weight:600;letter-spacing:0;
  text-transform:none;color:var(--fin-ink)}
.pl-budgetbody label{display:flex;align-items:center;justify-content:space-between;
  gap:12px;padding:5px 0}
.pl-budgetbody label span{font-size:13px;color:var(--fin-ink);min-width:0}
.pl-budgetbody input{width:140px;flex:none;font-family:inherit;font-size:13px;
  padding:7px 9px;border:1px solid var(--fin-line);border-radius:8px;
  background:var(--fin-surface);color:var(--fin-ink);text-align:right}
.fin-spacer{flex:1}
`;

export const BOOKS_CSS = `
.fin-books{margin-top:16px}
.fin-steps{list-style:none;counter-reset:step;margin:14px 0 0;padding:0;
  display:flex;flex-direction:column;gap:16px}
.fin-steps li{counter-increment:step;position:relative;padding-left:38px;
  display:flex;flex-direction:column;gap:7px}
.fin-steps li::before{content:counter(step);position:absolute;left:0;top:0;
  width:26px;height:26px;border-radius:9px;display:grid;place-items:center;
  background:color-mix(in srgb, var(--fin-accent) 12%, transparent);
  color:var(--fin-accent);font-size:12.5px;font-weight:700}
.fin-steps li b{font-size:13.5px;font-weight:600;color:var(--fin-ink)}
.fin-steps li > span{font-size:12.5px;line-height:1.6;color:var(--fin-muted)}
.fin-steps .fin-tools-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:2px}
.fin-btn.danger{background:var(--fin-out);border-color:var(--fin-out);color:#fff}
.fin-btn.ghost.danger{background:var(--fin-surface);color:var(--fin-out);
  border-color:color-mix(in srgb, var(--fin-out) 32%, var(--fin-line))}
.fin-confirm{display:flex;flex-direction:column;gap:9px}
.fin-confirm label{display:flex;flex-direction:column;gap:5px;font-size:12.5px;
  color:var(--fin-muted)}
.fin-confirm code{background:var(--fin-sunk);padding:1px 6px;border-radius:6px;
  font-size:12px;color:var(--fin-ink)}
.fin-confirm input{max-width:260px;font-family:inherit;font-size:13px;padding:8px 10px;
  border:1px solid var(--fin-line);border-radius:9px;background:var(--fin-surface);
  color:var(--fin-ink)}
`;

export const HOUSEHOLD_CSS = `
.hh-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}
@media(max-width:900px){.hh-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:460px){.hh-kpis{grid-template-columns:minmax(0,1fr)}}

/* One figure against one limit, so a ring rather than a donut of parts. */
.hh-budget{display:grid;grid-template-columns:auto minmax(0,1fr);gap:22px;align-items:center}
@container fin-panel (max-width: 560px){.hh-budget{grid-template-columns:minmax(0,1fr)}}
.hh-ringwrap{display:flex;flex-direction:column;align-items:center;gap:8px}
.hh-ring{width:130px;height:130px;display:block}
.hh-ringfig{text-anchor:middle;font-family:var(--fin-display);font-size:26px;
  font-weight:600;fill:var(--fin-ink)}
.hh-ringlabel{display:flex;flex-direction:column;align-items:center;gap:2px;
  font-size:11.5px;color:var(--fin-muted);text-align:center}
.hh-ringlabel b{font-size:17px;font-weight:600;color:var(--fin-ink)}

.hh-table{min-width:480px}
.hh-table tr.hh-over td,.hh-table tr.hh-stale td{
  background:color-mix(in srgb, var(--fin-out) 5%, transparent)}
.hh-barcell{white-space:nowrap}
.hh-barcell em{font-style:normal;font-size:11.5px;color:var(--fin-muted);
  margin-left:8px;font-variant-numeric:tabular-nums}
.hh-bar{display:inline-block;width:84px;height:7px;border-radius:99px;
  background:var(--fin-sunk);overflow:hidden;vertical-align:middle}
.hh-bar i{display:block;height:100%;border-radius:99px;background:#1baf7a}
.hh-bar i.over{background:var(--fin-out)}
.hh-when{display:block;font-style:normal;font-size:11px;color:var(--fin-faint)}
`;

// ── The home page ────────────────────────────────────────────
// The first screen a household sees. Four figures, then the month in three
// panels, then what actually happened, then the plan at the foot — kept last
// and kept apart, because a plan is not a position.
export const HOME_CSS = `
/* The bar above everything: find a row, see what wants a decision, get out. */
.fin-topbar{display:flex;align-items:center;gap:10px;margin:0 0 18px}
.tb-search{position:relative;flex:1;min-width:0;display:flex;align-items:center;gap:9px;
  background:var(--fin-surface);border:1px solid var(--fin-line);border-radius:999px;
  padding:0 14px;height:42px;color:var(--fin-faint)}
.tb-search:focus-within{border-color:color-mix(in srgb,var(--fin-accent) 45%,var(--fin-line));
  box-shadow:0 0 0 3px #F1ECFB}
.tb-search input{flex:1;min-width:0;border:0;background:none;font-family:inherit;
  font-size:14px;color:var(--fin-ink);outline:none}
.tb-search input::placeholder{color:var(--fin-faint)}
.tb-clear{border:0;background:none;color:var(--fin-faint);font-size:19px;line-height:1;
  cursor:pointer;padding:0 2px}
.tb-clear:hover{color:var(--fin-out)}
.tb-results,.tb-menu{position:absolute;z-index:40;top:calc(100% + 6px);
  background:var(--fin-surface);border:1px solid var(--fin-line);border-radius:14px;
  box-shadow:0 14px 40px rgba(23,19,38,.13);padding:6px;min-width:240px;max-height:340px;
  overflow:auto}
.tb-results{left:0;right:0}
.tb-menu{right:0}
.tb-results button,.tb-menu button{display:grid;grid-template-columns:1fr auto;
  gap:0 10px;width:100%;text-align:left;border:0;background:none;font-family:inherit;
  padding:8px 10px;border-radius:10px;cursor:pointer;color:var(--fin-ink)}
.tb-results button:hover,.tb-menu button:hover{background:#F5F1FD}
.tb-results b,.tb-menu b{font-size:13.5px;font-weight:600;display:block;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tb-results em,.tb-menu em{grid-column:1;font-style:normal;font-size:11.5px;
  color:var(--fin-faint)}
.tb-results span{grid-row:1/3;align-self:center;font-family:var(--fin-display);
  font-weight:650;font-size:16px}
.tb-hint{margin:0;padding:9px 11px;font-size:12.5px;color:var(--fin-muted)}
.tb-me{border-bottom:1px solid var(--fin-hair);margin-bottom:4px}
.tb-me b{display:block;font-size:13px;color:var(--fin-ink)}
.tb-me em{font-style:normal;font-size:11.5px;color:var(--fin-faint)}
.tb-bell{position:relative}
.tb-bell>button,.tb-who>button{display:flex;align-items:center;gap:8px;height:42px;
  border:1px solid var(--fin-line);background:var(--fin-surface);border-radius:999px;
  color:var(--fin-muted);cursor:pointer;font-family:inherit;padding:0 12px}
.tb-bell>button{width:42px;justify-content:center;padding:0}
.tb-bell>button:hover,.tb-who>button:hover{color:var(--fin-accent);
  border-color:color-mix(in srgb,var(--fin-accent) 35%,var(--fin-line))}
.tb-dot{position:absolute;top:9px;right:11px;width:8px;height:8px;border-radius:50%;
  background:var(--fin-out);border:2px solid var(--fin-surface)}
.tb-who{position:relative}
.tb-who b{font-size:13.5px;font-weight:600;color:var(--fin-ink)}
.tb-caret{font-style:normal;font-size:10px;color:var(--fin-faint)}
.tb-alerts{width:280px}

/* The greeting. The name carries the colour, so the sentence reads as one. */
.fin-viewhead.fin-greet{align-items:flex-start}
.fin-eyebrow{margin:0 0 4px!important;font-size:11px;font-weight:650;letter-spacing:.14em;
  text-transform:uppercase;color:var(--fin-faint)}
.fin-greet h1 i{font-style:italic;color:var(--fin-accent)}
.fin-motto{margin:6px 0 0;text-align:right;font-style:italic;font-size:13.5px;
  line-height:1.5;color:var(--fin-muted);white-space:nowrap}
.fin-motto::after{content:"";display:block;width:34px;height:2px;border-radius:2px;
  background:var(--fin-out);margin:8px 0 0 auto}

.hm{display:flex;flex-direction:column;gap:16px}

/* Four figures, tinted by what they are. Colour is a label here, not decoration. */
.hm-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.hm-kpi{display:flex;align-items:flex-start;gap:12px;padding:16px 17px;border-radius:16px;
  border:1px solid var(--fin-hair)}
.hm-kpi.t-cash{background:#FDF1F7;border-color:#F7DEEB}
.hm-kpi.t-in{background:#EDF9F3;border-color:#D5EFE3}
.hm-kpi.t-out{background:#FEF0F2;border-color:#FADDE2}
.hm-kpi.t-save{background:#FFF8E9;border-color:#F6E7C4}
.hm-kpi-icon{flex:none;display:grid;place-items:center;width:38px;height:38px;
  border-radius:12px;background:#fff;color:var(--fin-accent);
  box-shadow:0 1px 2px rgba(23,19,38,.06)}
.hm-kpi.t-in .hm-kpi-icon{color:#128a5e}
.hm-kpi.t-out .hm-kpi-icon{color:var(--fin-out)}
.hm-kpi.t-save .hm-kpi-icon{color:#a37711}
.hm-kpi-body{min-width:0;display:flex;flex-direction:column;gap:2px}
.hm-kpi-label{font-size:12.5px;font-weight:550;color:var(--fin-muted)}
.hm-kpi-fig{font-family:var(--fin-display);font-weight:600;font-size:clamp(21px,2.3vw,27px);
  letter-spacing:-.02em;color:var(--fin-ink);line-height:1.15;
  overflow:hidden;text-overflow:ellipsis}
.hm-kpi-fig.fe-out{color:var(--fin-neg)}
.hm-change{font-style:normal;font-size:11.5px;font-weight:600}
.hm-change.good{color:#128a5e}
.hm-change.bad{color:var(--fin-neg)}
.hm-flat{font-style:normal;font-size:11.5px;color:var(--fin-muted)}

/* Two rows of panels, in the proportions the eye needs: the chart is the
   widest thing on the page, the standing card the narrowest. */
.hm-row{display:grid;gap:14px;align-items:stretch}
.hm-row-a{grid-template-columns:minmax(0,5.2fr) minmax(0,3.4fr) minmax(0,2.6fr)}
.hm-row-b{grid-template-columns:minmax(0,4.4fr) minmax(0,3fr) minmax(0,4.6fr)}
.hm .fin-panel{margin:0;height:100%}
.fin-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0 0 0 0);white-space:nowrap;border:0}
.hm-pick select{font-family:inherit;font-size:12.5px;font-weight:550;color:var(--fin-ink);
  background:var(--fin-surface);border:1px solid var(--fin-line);border-radius:9px;
  padding:6px 9px;cursor:pointer}

.hm-chart{margin-top:2px}
.hm-legend{margin-bottom:2px}
.hm-ylab{font-size:10.5px;fill:var(--fin-faint);text-anchor:end}

/* Bills, categories and transactions are all "a disc, a name, a figure". Same
   shape three times, so the eye learns it once. */
.hm-disc{flex:none;display:grid;place-items:center;width:32px;height:32px;border-radius:10px;
  background:#F5F1FD;color:var(--fin-accent);font-family:var(--fin-display);
  font-weight:650;font-size:13px}
.hm-disc.sm{width:26px;height:26px;border-radius:8px}
.hm-disc svg{width:17px;height:17px}
.hm-disc.sm svg{width:14px;height:14px}

.hm-bills{list-style:none;margin:2px 0 0;padding:0;display:flex;flex-direction:column;gap:2px}
.hm-bills li{display:flex;align-items:center;gap:10px;padding:8px 2px;
  border-bottom:1px solid var(--fin-hair)}
.hm-bills li:last-child{border-bottom:0}
.hm-bill-who{flex:1;min-width:0;display:flex;flex-direction:column}
.hm-bill-who b{font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap}
.hm-bill-who em{font-style:normal;font-size:11.5px;color:var(--fin-faint)}
.hm-bill-amt{flex:none;font-size:14px;font-weight:650}
.hm-when{flex:none;font-size:11px;font-weight:600;padding:4px 9px;border-radius:999px;
  background:var(--fin-sunk);color:var(--fin-muted);white-space:nowrap}
.hm-when.soon{background:#FEF0F2;color:var(--fin-neg)}
.hm-when.late{background:var(--fin-out);color:#fff}

/* The standing card. A drawn horizon, not a photograph — nothing here needs a
   megabyte of stock imagery to say "you are doing fine". */
.hm-standing{position:relative;overflow:hidden;padding:0;border:0;min-height:280px;
  background:linear-gradient(168deg,#E7DEFA 0%,#F2E4F2 44%,#FCEBDD 100%)}
.hm-standing-art{position:absolute;inset:auto 0 0 0;height:46%}
.hm-standing-art svg{display:block;width:100%;height:100%}
.hm-standing-body{position:relative;display:flex;flex-direction:column;
  height:100%;padding:20px 20px 18px}
.hm-standing h2{margin:0;padding-right:42px;font-family:var(--fin-display);
  font-weight:600;font-size:clamp(17px,1.55vw,20px);line-height:1.3;
  letter-spacing:-.02em;color:var(--fin-ink)}
.hm-standing-go{position:absolute;top:20px;right:20px;width:34px;height:34px;
  border-radius:50%;border:0;background:#fff;color:var(--fin-accent);font-size:16px;
  cursor:pointer;box-shadow:0 2px 8px rgba(23,19,38,.12)}
.hm-standing-go:hover{background:var(--fin-accent);color:#fff}
.hm-standing hr{width:34px;height:2px;border:0;border-radius:2px;background:var(--fin-out);
  margin:auto 0 10px}
.hm-quote{margin:0;font-style:italic;font-size:13.5px;line-height:1.55;color:var(--fin-muted)}

.hm-cats{list-style:none;margin:2px 0 0;padding:0;display:flex;flex-direction:column;gap:2px}
.hm-cats li{display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;
  gap:4px 10px;padding:8px 2px}
.hm-cat-name{grid-column:2;font-size:13.5px;font-weight:600;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.hm-cat-amt{font-size:14px;font-weight:650}
.hm-cats em{font-style:normal;font-size:11.5px;color:var(--fin-faint);
  min-width:32px;text-align:right}
.hm-cat-bar{grid-column:2/-1;height:5px;border-radius:3px;background:var(--fin-sunk);
  overflow:hidden}
.hm-cat-bar i{display:block;height:100%;border-radius:3px;
  background:linear-gradient(90deg,var(--fin-accent),var(--fin-in))}

.hm-insights{list-style:none;margin:2px 0 0;padding:0;display:flex;flex-direction:column;
  gap:11px;font-size:13px;line-height:1.5}
.hm-insights li{display:flex;align-items:flex-start;gap:10px}
.hm-ins-icon{flex:none;display:grid;place-items:center;width:26px;height:26px;
  border-radius:50%;background:var(--fin-sunk);color:var(--fin-muted)}
.hm-ins-icon.t-up{background:#EDF9F3;color:#128a5e}
.hm-ins-icon.t-down{background:#FEF0F2;color:var(--fin-neg)}
.hm-ins-icon.t-note{background:#F5F1FD;color:var(--fin-accent)}

.hm-recent{list-style:none;margin:2px 0 0;padding:0;display:flex;flex-direction:column;gap:2px}
.hm-recent li{display:flex;align-items:center;gap:10px;padding:7px 2px;
  border-bottom:1px solid var(--fin-hair)}
.hm-recent li:last-child{border-bottom:0}
.hm-rec-date{flex:none;font-style:normal;font-size:11.5px;color:var(--fin-faint);
  width:46px}
.hm-rec-who{flex:1;min-width:0;font-size:13.5px;font-weight:600;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.hm-rec-cat{flex:none;font-size:11.5px;color:var(--fin-muted);max-width:96px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hm-rec-amt{flex:none;font-size:13.5px;font-weight:650;white-space:nowrap}

/* The plan, last and separate. Never added into anything above it. */
.hm-plan{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:16px 20px;
  margin:0;background:var(--fin-surface)}
.hm-plan-icon{flex:none;display:grid;place-items:center;width:42px;height:42px;
  border-radius:14px;background:#F5F1FD;color:var(--fin-accent)}
.hm-plan-what{display:flex;flex-direction:column;min-width:150px}
.hm-plan-what em{font-style:normal;font-size:11.5px;color:var(--fin-faint)}
.hm-plan-what b{font-family:var(--fin-display);font-weight:600;font-size:16px;
  letter-spacing:-.01em}
.hm-plan-none{flex:1;min-width:180px;margin:0;font-size:12.5px;color:var(--fin-muted)}
.hm-plan-bar{flex:1;min-width:150px;height:11px;border-radius:6px;background:var(--fin-sunk);
  overflow:hidden}
.hm-plan-bar i{display:block;height:100%;border-radius:6px;
  background:linear-gradient(90deg,var(--fin-accent),var(--fin-in))}
.hm-plan-bar i.over{background:var(--fin-out)}
.hm-plan-fig{display:flex;flex-direction:column;align-items:flex-end;flex:none}
.hm-plan-fig b{font-size:13.5px;font-weight:650;white-space:nowrap}
.hm-plan-fig em{font-style:normal;font-size:11.5px;color:var(--fin-faint)}
.hm-plan-fig em.over{color:var(--fin-neg)}
.hm-plan-tag{flex:none;font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:999px;
  background:linear-gradient(120deg,#FDF0E4,#FBE6F1);color:#8a5b12}
.hm-plan-tag.over{background:#FEF0F2;color:var(--fin-neg)}
.hm-foot{margin:0}
.hm-foot .fin-link{font-size:inherit}

@media(max-width:1240px){
  .hm-kpis{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .hm-row-a,.hm-row-b{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .hm-row-a>*:nth-child(3),.hm-row-b>*:nth-child(3){grid-column:1/-1}
  /* Full width, the standing card becomes a band: the headline and the line
     under it side by side, with the horizon behind both. Stretching a tall
     card across the page turns it into a poster. */
  .hm-standing{min-height:0}
  .hm-standing-art{height:100%}
  .hm-standing-body{flex-direction:row;align-items:center;gap:22px;
    padding:18px 20px}
  .hm-standing h2{flex:1;padding-right:0}
  .hm-standing-go{position:static;flex:none;order:3}
  .hm-standing hr{display:none}
  .hm-quote{flex:none;max-width:46%;margin:0}
}
@media(max-width:900px){
  .hm-row-a,.hm-row-b{grid-template-columns:minmax(0,1fr)}
  .hm-row-a>*:nth-child(3),.hm-row-b>*:nth-child(3){grid-column:auto}
  .fin-motto{display:none}
  .fin-topbar{flex-wrap:wrap}
  .tb-search{order:3;flex-basis:100%}
}
@media(max-width:520px){
  .hm-kpis{grid-template-columns:minmax(0,1fr)}
  .hm-rec-cat{display:none}
  .hm-standing-body{flex-direction:column;align-items:flex-start;gap:10px}
  .hm-standing-go{align-self:flex-end}
  .hm-quote{max-width:none}
  .hm-plan{gap:10px}
  .hm-plan-bar{flex-basis:100%}
}
`;

// ── Income, transactions, budget and bills ───────────────────
// A household's four working pages. They share one grammar: a disc, a name, a
// figure — so the eye learns it once and reads all four the same way.
export const MONEY_CSS = `
/* Category pills and discs. A category keeps its colour everywhere it
   appears; a colour that moves between pages is worse than no colour. */
.fin-pill{display:inline-block;padding:4px 11px;border-radius:999px;font-size:11.5px;
  font-weight:600;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.fin-pill.p-0{background:#FDF0E4;color:#8a5b12}
.fin-pill.p-1{background:#EDF9F3;color:#0f7551}
.fin-pill.p-2{background:#FDEFF6;color:#a8225f}
.fin-pill.p-3{background:#EEF2FE;color:#3a4fa8}
.fin-pill.p-4{background:#F5F1FD;color:#5B21B6}
.fin-pill.p-5{background:#E9F6FB;color:#0a6f8c}
.fin-pill.p-6{background:#FFF6E0;color:#8a6a15}
.fin-pill.p-7{background:#F1F3F6;color:#4b5563}
.hm-disc.d-0{background:#FDF0E4;color:#8a5b12}
.hm-disc.d-1{background:#EDF9F3;color:#0f7551}
.hm-disc.d-2{background:#FDEFF6;color:#a8225f}
.hm-disc.d-3{background:#EEF2FE;color:#3a4fa8}
.hm-disc.d-4{background:#F5F1FD;color:#5B21B6}
.hm-disc.d-5{background:#E9F6FB;color:#0a6f8c}
.hm-disc.d-6{background:#FFF6E0;color:#8a6a15}
.hm-disc.d-7{background:#F1F3F6;color:#4b5563}
.fe-good{color:#0f7551}

/* A name with its mark, used in every table on these four pages. */
.ic-who{display:inline-flex;align-items:center;gap:9px;min-width:0}
.ic-who b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.ic,.tx,.hh{display:flex;flex-direction:column;gap:16px}
.ic .fin-panel,.tx .fin-panel,.hh .fin-panel{margin:0}

/* ── Income ── */
.ic-top{display:flex;align-items:center;gap:26px;flex-wrap:wrap}
.ic-fig{flex:1;min-width:230px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.ic-fig .fin-fig{font-family:var(--fin-display);font-weight:600;letter-spacing:-.025em;
  font-size:clamp(30px,4vw,42px);line-height:1.05}
.ic-pill{font-size:12px;font-weight:600;padding:6px 12px;border-radius:999px}
.ic-pill.up{background:#EDF9F3;color:#0f7551}
.ic-pill.down{background:#FEF0F2;color:var(--fin-neg)}
.ic-pill.flat{background:var(--fin-sunk);color:var(--fin-muted)}
.ic-rate{font-style:normal;font-size:12px;line-height:1.55;color:var(--fin-muted);max-width:34ch}
.ic-chart{flex:1;min-width:260px}
.ic-chart .fin-svg{width:100%;height:auto}
.ic-tip{margin:2px 0 0;font-size:12px;color:var(--fin-muted);min-height:18px}
.ic-tip b{font-weight:650;color:var(--fin-ink)}
.ic-table td{vertical-align:middle}
.ic-ended{opacity:.62}
.ic-endtag{font-size:11.5px;color:var(--fin-faint)}

/* Money that arrived with nothing set up behind it. An offer, not an alarm. */
.ic-detect{display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;
  background:#EDF9F3;border:1px solid #D5EFE3;border-radius:16px;padding:15px 18px}
.ic-detect-icon{flex:none;display:grid;place-items:center;width:34px;height:34px;
  border-radius:11px;background:#fff;color:#0f7551}
.ic-detect-body{flex:1;min-width:230px;display:flex;flex-direction:column;gap:3px}
.ic-detect-body b{font-size:14px;font-weight:650;color:#0f7551}
.ic-detect-body em{font-style:normal;font-size:12.5px;line-height:1.55;color:var(--fin-muted)}
.ic-detect-acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.fin-btn.go{background:#128a5e;border-color:#128a5e}
.fin-btn.go:hover{background:#0f7551}
.hm-cat-bar i.in{background:linear-gradient(90deg,#128a5e,#6ecfa8)}

/* ── Transactions ── */
.tx-filters{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.tx-search{flex:2 1 220px;height:40px}
.tx-pick{flex:0 1 auto}
.tx-pick select,.tx-pick input{font-family:inherit;font-size:13px;color:var(--fin-ink);
  background:var(--fin-surface);border:1px solid var(--fin-line);border-radius:999px;
  padding:0 13px;height:40px;cursor:pointer;max-width:170px}
.tx-pick input[type=date]{cursor:text}
.tx-pick select:focus-visible,.tx-pick input:focus-visible{outline:2px solid var(--fin-accent);
  outline-offset:1px}
.tx-clear{margin-left:2px}
.tx-clear:disabled{opacity:.4;cursor:default}
.tx-add{margin-left:auto;display:inline-flex;gap:8px}
.fin-twoline i{font-style:italic;color:var(--fin-accent)}
.fin-viewhead.fin-greet h1{line-height:1.06}
.tx-table td{vertical-align:middle}
.tx-date{white-space:nowrap}
.tx-busy{opacity:.5;transition:opacity .15s}
.tx-src{font-size:11.5px;font-weight:600;padding:4px 10px;border-radius:999px;
  white-space:nowrap;background:var(--fin-sunk);color:var(--fin-muted)}
.tx-src.s-doc{background:#F5F1FD;color:#5B21B6}
.tx-src.s-sched{background:#E9F6FB;color:#0a6f8c}
.tx-src.s-inv{background:#EDF9F3;color:#0f7551}
.tx-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;
  flex-wrap:wrap;margin-top:12px;font-size:12.5px;color:var(--fin-muted)}
.tx-pages{display:inline-flex;align-items:center;gap:3px}
.tx-pages button{min-width:30px;height:30px;padding:0 8px;border-radius:8px;
  border:1px solid var(--fin-line);background:var(--fin-surface);font-family:inherit;
  font-size:12.5px;font-weight:600;color:var(--fin-muted);cursor:pointer}
.tx-pages button:hover:not(:disabled){color:var(--fin-accent);
  border-color:color-mix(in srgb,var(--fin-accent) 35%,var(--fin-line))}
.tx-pages button.on{background:var(--fin-out);border-color:var(--fin-out);color:#fff}
.tx-pages button:disabled{opacity:.35;cursor:default}
.tx-pages em{font-style:normal;padding:0 3px;color:var(--fin-faint)}

/* ── Budget ── */
.hh-overview{display:flex;align-items:center;gap:30px;flex-wrap:wrap;padding:4px 0}
.hh-overview .hh-ring{width:130px;height:130px;flex:none}
.hh-ovfig{display:flex;flex-direction:column;gap:2px}
.hh-ovfig .fin-fig{font-family:var(--fin-display);font-weight:600;letter-spacing:-.025em;
  font-size:clamp(24px,2.6vw,32px);line-height:1.1}
.hh-ovfig em{font-style:normal;font-size:12.5px;color:var(--fin-muted)}
.hh-ovsplit{width:1px;align-self:stretch;background:var(--fin-line);margin:4px 0}
.hh-bar{display:block;height:8px;border-radius:5px;background:var(--fin-sunk);
  overflow:hidden;min-width:90px}
.hh-bar i{display:block;height:100%;border-radius:5px;background:#1baf7a}
.hh-bar i.warm{background:#eda100}
.hh-bar i.hot{background:#e8697d}
.hh-bar i.over{background:var(--fin-out)}
.hh-barcell{display:flex;align-items:center;gap:10px}
.hh-barcell em{font-style:normal;font-size:12px;color:var(--fin-muted);min-width:36px;
  text-align:right}
.hh-noplan{color:var(--fin-faint);min-width:0;text-align:left;font-size:11.5px}
.hh-unplanned{background:#FFFCF4}
.hh-unplanned td:first-child b{color:#8a6a15}

/* Editing, wherever a row can be corrected. The button stays quiet until the
   row is under the pointer — a table of Edit buttons reads as a form. */
.ic-editcell{width:1%;white-space:nowrap;text-align:right;display:flex;gap:6px;
  justify-content:flex-end;align-items:center}
.ic-duenow{display:block;font-style:normal;font-size:11px;color:var(--fin-neg);
  font-weight:600;margin-top:2px}
.fin-btn.sm{padding:5px 11px;font-size:12px}
.ic-editcell .fin-btn{opacity:.45;transition:opacity .12s}
tr:hover .ic-editcell .fin-btn,.ic-editcell .fin-btn:focus-visible{opacity:1}
.fin-formacts{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:4px}
.ic-spacer{flex:1}
.ic-confirm{flex:1;min-width:200px;font-size:12.5px;line-height:1.5;color:var(--fin-neg)}
.fin-btn.ghost.danger{color:var(--fin-neg);
  border-color:color-mix(in srgb,var(--fin-out) 35%,var(--fin-line))}
.fin-btn.ghost.danger:hover{background:#FEF0F2}
.fin-hint{display:block;font-style:normal;font-size:11.5px;line-height:1.5;
  color:var(--fin-faint);margin-top:4px}

/* One line about the month, in the tone the month deserves. */
.hh-note{display:flex;align-items:flex-start;gap:13px;flex-wrap:wrap;
  border-radius:16px;padding:14px 17px;border:1px solid var(--fin-hair);
  background:var(--fin-sunk)}
.hh-note.warn{background:#FFF8E9;border-color:#F6E7C4}
.hh-note.good{background:#EDF9F3;border-color:#D5EFE3}
.hh-note-icon{flex:none;display:grid;place-items:center;width:30px;height:30px;
  border-radius:50%;background:#fff;color:var(--fin-muted)}
.hh-note.warn .hh-note-icon{color:#a37711}
.hh-note.good .hh-note-icon{color:#0f7551}
.hh-note-body{flex:1;min-width:220px;display:flex;flex-direction:column;gap:2px}
.hh-note-body b{font-size:13.5px;font-weight:650;color:var(--fin-ink)}
.hh-note-body em{font-style:normal;font-size:12.5px;line-height:1.55;color:var(--fin-muted)}

/* ── Bills ── */
.hh-tabs{display:flex;align-items:center;justify-content:space-between;gap:12px;
  flex-wrap:wrap}
.hh-tabrow button{font-size:13px;padding:8px 15px}
.hh-live{font-size:11.5px;font-weight:600;padding:4px 11px;border-radius:999px}
.hh-live.on{background:#EDF9F3;color:#0f7551}
.hh-live.cold{background:#FFF8E9;color:#8a6a15}
.hh-when{display:block;font-style:normal;font-size:11px;color:var(--fin-faint)}

/* The month as a month. Which days money leaves is a spatial question. */
.hh-cal{display:flex;flex-direction:column;gap:6px}
.hh-calhead,.hh-calgrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.hh-calhead span{font-size:11px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;
  color:var(--fin-faint);text-align:center;padding-bottom:2px}
.hh-cell{min-height:78px;border:1px solid var(--fin-hair);border-radius:10px;padding:6px;
  display:flex;flex-direction:column;gap:4px;background:var(--fin-surface)}
.hh-cell.empty{border:0;background:none}
.hh-cell.has{background:#F5F1FD;border-color:#E3D8FA}
.hh-cell.late{background:#FEF0F2;border-color:#FADDE2}
.hh-cell>b{font-size:11.5px;font-weight:650;color:var(--fin-muted)}
.hh-cell.has>b{color:var(--fin-accent)}
.hh-cell.late>b{color:var(--fin-neg)}
.hh-calbill{display:block;font-size:10.5px;line-height:1.35;font-weight:600;
  color:var(--fin-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hh-calbill em{display:block;font-style:normal;font-weight:500;color:var(--fin-muted)}

/* A form in a sheet, for adding a source or a bill without leaving the page. */
.fin-modal{position:fixed;inset:0;z-index:60;background:rgba(23,19,38,.34);
  display:grid;place-items:center;padding:20px}
.fin-sheet{background:var(--fin-surface);border-radius:18px;max-width:720px;width:100%;
  max-height:88vh;overflow:auto;box-shadow:0 24px 70px rgba(23,19,38,.28)}
.fin-sheethead{display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:18px 22px 0}
.fin-sheethead h2{margin:0;font-family:var(--fin-display);font-weight:600;font-size:19px;
  letter-spacing:-.015em}
.fin-sheet .fin-form{padding:14px 22px 22px}

@media(max-width:900px){
  /* A row of tabs is a row. Wrapping them reads as two groups of tabs, so it
     scrolls sideways instead — and min-width:0 keeps the scroller from
     leaking its content width onto the page. */
  .hh-tabs{align-items:stretch}
  .hh-tabrow{flex:1 0 100%;min-width:0;max-width:100%;overflow-x:auto;
    justify-content:flex-start}
  .hh-tabrow button{flex:none}
  .hh-overview{gap:18px}
  .hh-ovsplit{display:none}
  .tx-add{margin-left:0}
  .tx-pick select,.tx-pick input{max-width:none;width:100%}
  .tx-pick{flex:1 1 140px}
  .hh-cell{min-height:56px}
  .hh-calbill em{display:none}
}
@media(max-width:560px){
  .ic-top{gap:14px}
  .hh-calbill{font-size:0}
  .hh-calbill::after{content:"•";font-size:14px;color:var(--fin-accent)}
}
`;

// ── Wealth, goals and reports ────────────────────────────────
// The three pages that are about longer than a month. They reuse the money
// pages' grammar — a disc, a name, a figure — and add only what a position,
// a plan against a date, and a run of months actually need.
export const LONG_CSS = `
.we,.go,.rp{display:flex;flex-direction:column;gap:16px}
.we .fin-panel,.go .fin-panel,.rp .fin-panel{margin:0}

.we-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.we-kpis .hm-kpi{padding:16px 18px}
.we-chart .fin-svg{width:100%;height:auto}
.we-split{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.we-tile{display:flex;flex-direction:column;gap:3px;padding:16px 18px}
.we-tile .fin-fig{font-family:var(--fin-display);font-weight:600;letter-spacing:-.02em;
  font-size:clamp(20px,2.2vw,26px)}
.we-tile em{font-style:normal;font-size:12px;color:var(--fin-muted)}
.we-table td{vertical-align:middle}
.we-stale{display:block;font-style:normal;font-size:11px;color:#8a6a15;font-weight:600}

/* A donut and the rows it summarises, side by side. The rows are the record —
   the ring is a summary of them, which is why every slice is also a row. */
.we-alloc{display:flex;align-items:center;gap:26px;flex-wrap:wrap}
.we-alloc .sp-donut{flex:none;width:200px}
.we-alloc .sp-donut svg{width:100%;height:auto}
.we-legend{flex:1;min-width:220px;list-style:none;margin:0;padding:0;
  display:flex;flex-direction:column;gap:2px}
.we-legend li{display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;
  gap:10px;padding:7px 2px;border-bottom:1px solid var(--fin-hair);font-size:13.5px}
.we-legend li:last-child{border-bottom:0}
.we-legend i{width:11px;height:11px;border-radius:3px}
.we-legend span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.we-legend b{font-weight:650}
.we-legend em{font-style:normal;font-size:12px;color:var(--fin-faint);min-width:34px;
  text-align:right}

/* ── Goals ── */
.go-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.go-summary article{background:var(--fin-surface);border:1px solid var(--fin-hair);
  border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;gap:3px}
.go-summary .fin-fig{font-family:var(--fin-display);font-weight:600;letter-spacing:-.02em;
  font-size:clamp(20px,2.2vw,26px)}
.go-summary em{font-style:normal;font-size:12px;color:var(--fin-muted)}
.go-list{list-style:none;margin:2px 0 0;padding:0;display:flex;flex-direction:column;gap:2px}
.go-list li{display:flex;align-items:center;gap:14px;padding:12px 2px;
  border-bottom:1px solid var(--fin-hair)}
.go-list li:last-child{border-bottom:0}
.go-list li.done{opacity:.72}
.go-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.go-body b{font-size:14px;font-weight:650;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap}
.go-body em{font-style:normal;font-size:12px;color:var(--fin-muted)}
.go-bar{display:block;height:7px;border-radius:4px;background:var(--fin-sunk);overflow:hidden}
.go-bar i{display:block;height:100%;border-radius:4px;
  background:linear-gradient(90deg,var(--fin-accent),var(--fin-in))}
.go-bar i.done{background:#1baf7a}
.go-bar i.late{background:var(--fin-out)}
.go-pct{flex:none;font-family:var(--fin-display);font-weight:600;font-size:15px;
  min-width:44px;text-align:right}
.go-when{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:2px;
  min-width:118px}
.go-when em{font-style:normal;font-size:11px;color:var(--fin-faint)}
.go-when b{font-size:12.5px;font-weight:600}
.go-tag{font-style:normal;font-size:10.5px;font-weight:600;padding:3px 9px;
  border-radius:999px;background:var(--fin-sunk);color:var(--fin-muted);white-space:nowrap}
.go-tag.done{background:#EDF9F3;color:#0f7551}
.go-tag.late{background:#FEF0F2;color:var(--fin-neg)}
.go-timeline{list-style:none;margin:2px 0 0;padding:0;display:flex;gap:10px;
  overflow-x:auto;padding-bottom:4px}
.go-timeline li{flex:1;min-width:150px;display:flex;flex-direction:column;gap:4px;
  padding:14px;border:1px solid var(--fin-hair);border-radius:14px;background:var(--fin-sunk)}
.go-timeline b{font-size:13.5px;font-weight:650}
.go-timeline em{font-style:normal;font-size:11.5px;color:var(--fin-faint)}
.go-timeline span{font-size:12px;color:var(--fin-accent);font-weight:600}
.go-calc{display:flex;flex-direction:column;gap:16px}
.go-calcform{padding:0}
.go-calcout{display:flex;align-items:center;gap:26px;flex-wrap:wrap;
  background:var(--fin-sunk);border:1px solid var(--fin-hair);border-radius:16px;
  padding:16px 20px}
.go-calcout>div{display:flex;flex-direction:column;gap:2px}
.go-calcout .fin-fig{font-family:var(--fin-display);font-weight:600;letter-spacing:-.02em;
  font-size:clamp(22px,2.4vw,28px)}
.go-calcout em{font-style:normal;font-size:12px;color:var(--fin-muted)}
.go-calcout button{margin-left:auto}

/* ── Reports ── */
.rp-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;
  align-items:stretch}
.rp-row>*{height:100%}
.rp-chart .fin-svg{width:100%;height:auto}
.rp-fig{display:flex;flex-direction:column;gap:8px;align-items:flex-start;
  justify-content:center;height:100%}
.rp-fig .fin-fig{font-family:var(--fin-display);font-weight:600;letter-spacing:-.025em;
  font-size:clamp(26px,3.4vw,38px);line-height:1.05}
.rp-fig em{font-style:normal;font-size:12.5px;color:var(--fin-muted)}
.rp-savings{display:flex;align-items:center;gap:26px;flex-wrap:wrap}
.rp-savings .hh-ring{width:130px;height:130px;flex:none}
.rp-months,.rp-export{list-style:none;margin:2px 0 0;padding:0;
  display:flex;flex-direction:column;gap:2px}
.rp-months li,.rp-export li{display:flex;align-items:center;gap:11px;padding:9px 2px;
  border-bottom:1px solid var(--fin-hair)}
.rp-months li:last-child,.rp-export li:last-child{border-bottom:0}
.rp-months b{flex:1;font-size:13.5px;font-weight:600}
.rp-export span{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.rp-export b{font-size:13.5px;font-weight:600}
.rp-export em{font-style:normal;font-size:11.5px;line-height:1.5;color:var(--fin-muted)}

@media(max-width:1100px){
  .we-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .rp-row{grid-template-columns:minmax(0,1fr)}
}
@media(max-width:820px){
  .we-split,.go-summary{grid-template-columns:minmax(0,1fr)}
  .we-legend{min-width:0}
  .rp-savings{gap:16px}
  .go-list li{flex-wrap:wrap}
  .go-when{min-width:0;align-items:flex-start}
  .we-alloc{gap:16px}
  .we-alloc .sp-donut{width:150px}
}
@media(max-width:560px){
  .we-kpis{grid-template-columns:minmax(0,1fr)}
  .go-calcout button{margin-left:0}
}
`;
