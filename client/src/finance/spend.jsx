import { useState } from "react";
import { monthLabel } from "./format.js";

// ── Where the money goes ─────────────────────────────────────
// The donut answers "what shape is my spending"; the ranked list beside it
// answers "exactly how much on what". The list is the real record — the donut
// is a summary of it, which is why every slice is also a labelled row.
//
// Five named slices, then Other. The cap is the palette's, not a preference:
// every pair of slices has to stay distinguishable from every other pair,
// including under colour-blindness, because a donut is read across the ring
// and not only between neighbours. Five is what these five hues clear —
// worst all-pairs ΔE 9.1 under protanopia, 15.6 under normal vision — and
// orange had to go to get there: with orange in, yellow and orange fail the
// normal-vision floor at 13.7. The labelled rows beside the donut carry the
// contrast relief three of these hues need on a light surface.
export const SLICE_COLOURS = ["#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7"];
const OTHER_COLOUR = "#9C96AE";
const MAX_SLICES = 5;

const polar = (cx, cy, r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

// An annulus segment. Drawn as a path rather than a stroked circle so the 2px
// surface gap between neighbouring slices is a real gap, not a colour blend.
// Exported: every donut in the app uses this one, rather than each file
// carrying its own copy of the same trigonometry.
export function segment(cx, cy, rOuter, rInner, from, to) {
  const large = to - from > 180 ? 1 : 0;
  const [x1, y1] = polar(cx, cy, rOuter, from);
  const [x2, y2] = polar(cx, cy, rOuter, to);
  const [x3, y3] = polar(cx, cy, rInner, to);
  const [x4, y4] = polar(cx, cy, rInner, from);
  return `M${x1},${y1} A${rOuter},${rOuter} 0 ${large} 1 ${x2},${y2}
          L${x3},${y3} A${rInner},${rInner} 0 ${large} 0 ${x4},${y4} Z`;
}

export function SpendByCategory({ rows, money, period, total, title }) {
  const [hover, setHover] = useState(null);
  const clean = (rows || []).filter((r) => r.total > 0);
  const sum = total ?? clean.reduce((s, r) => s + r.total, 0);

  if (!clean.length || sum <= 0) {
    return <p className="fc-none">Nothing recorded for {monthLabel(period)} yet.</p>;
  }

  const sorted = [...clean].sort((a, b) => b.total - a.total);
  const named = sorted.slice(0, MAX_SLICES);
  const rest = sorted.slice(MAX_SLICES);
  const restTotal = rest.reduce((s, r) => s + r.total, 0);
  const slices = [
    ...named.map((r, i) => ({ ...r, colour: SLICE_COLOURS[i] })),
    ...(restTotal > 0
      ? [{ name: `Other · ${rest.length} ${rest.length === 1 ? "category" : "categories"}`,
           total: restTotal, colour: OTHER_COLOUR, isOther: true }]
      : []),
  ];

  const S = 210, C = S / 2, R = 92, RI = 60;
  const GAP = 1.6; // degrees of surface between slices
  let angle = 0;
  const arcs = slices.map((s) => {
    const sweep = (s.total / sum) * 360;
    const from = angle + (slices.length > 1 ? GAP / 2 : 0);
    const to = angle + sweep - (slices.length > 1 ? GAP / 2 : 0);
    angle += sweep;
    return { ...s, from, to: Math.max(from + 0.4, to), share: s.total / sum };
  });

  const focus = hover ? arcs.find((a) => a.name === hover) : null;

  return (
    <div className="sp-wrap">
      <div className="sp-donut">
        <svg viewBox={`0 0 ${S} ${S}`} role="img"
             aria-label={title || "Spending by category"}>
          {arcs.map((a) => (
            <path key={a.name} d={segment(C, C, focus?.name === a.name ? R + 4 : R, RI, a.from, a.to)}
                  fill={a.colour} className="sp-seg"
                  onMouseEnter={() => setHover(a.name)}
                  onMouseLeave={() => setHover(null)} />
          ))}
          <text x={C} y={C - 6} className="sp-centre-fig">
            {money.round(focus ? focus.total : sum)}
          </text>
          <text x={C} y={C + 14} className="sp-centre-lab">
            {focus ? `${Math.round(focus.share * 100)}% · ${focus.isOther ? "other" : focus.name}` : "total"}
          </text>
        </svg>
      </div>

      <ul className="sp-list">
        {arcs.map((a) => (
          <li key={a.name} className={hover === a.name ? "on" : ""}
              onMouseEnter={() => setHover(a.name)} onMouseLeave={() => setHover(null)}>
            <i style={{ background: a.colour }} aria-hidden="true" />
            <span className="sp-name">
              {a.name}
              {/* A heading you cannot open is a heading you have to trust.
                  What is inside it is named here, so "Tech" is answerable
                  without leaving the page. */}
              {a.parts?.length > 1 && (
                <em className="sp-parts">{a.parts.map((p) => p.name).join(" · ")}</em>
              )}
            </span>
            <span className="sp-share">{Math.round(a.share * 100)}%</span>
            <span className="sp-amt fin-fig">{money.round(a.total)}</span>
          </li>
        ))}
        {rest.length > 0 && (
          <li className="sp-rest">
            {rest.map((r) => (
              <span key={r.name}>{r.name} <b className="fin-fig">{money.round(r.total)}</b></span>
            ))}
          </li>
        )}
      </ul>
    </div>
  );
}

// ── What is due ──────────────────────────────────────────────
// Two lists that mean different things, so they are never added together.
// A committed payment has a date that was agreed; whether it has been paid is
// not known until payments are matched to commitments. An outstanding invoice
// is money genuinely owed, where overdue is a fact.
export function DueSoon({ due, money }) {
  if (!due) return null;
  if (!due.payable.length && !due.incoming.length) {
    return (
      <p className="fc-none">
        Nothing committed falls due in the next {due.days} days.
      </p>
    );
  }

  const when = (d) =>
    d.daysAway === 0 ? "today" : d.daysAway === 1 ? "tomorrow" : `in ${d.daysAway} days`;

  const list = (items, tone) => (
    <ul className="du-list">
      {items.map((u, i) => (
        <li key={`${u.commitmentId}-${u.date}-${i}`}>
          <span className="du-when">
            <b>{u.date.slice(8)}</b>
            <em>{u.date.slice(5, 7)}</em>
          </span>
          <span className="du-what">
            {u.description}
            <span className="du-sub">
              {u.counterparty ? `${u.counterparty} · ` : ""}{when(u)}
            </span>
          </span>
          <span className={`du-amt fin-fig ${tone}`}>
            {tone === "fe-in" ? "+" : "−"}{money.exact(u.amount)}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="du-wrap">
      {due.payable.length > 0 && (
        <section>
          <h4>
            To pay <span className="du-count">{due.payable.length}</span>
            <b className="fin-fig fe-out">{money.round(due.payableTotal)}</b>
          </h4>
          {list(due.payable, "fe-out")}
        </section>
      )}
      {due.incoming.length > 0 && (
        <section>
          <h4>
            Due in <span className="du-count">{due.incoming.length}</span>
            <b className="fin-fig fe-in">{money.round(due.incomingTotal)}</b>
          </h4>
          {list(due.incoming, "fe-in")}
        </section>
      )}
      <p className="fc-note">
        Scheduled payments show the date that was agreed. Whether one has already
        gone out is not tracked yet — matching real payments to commitments comes
        next, and until then nothing here is marked paid.
      </p>
    </div>
  );
}
