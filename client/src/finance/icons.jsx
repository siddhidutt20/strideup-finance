// Nav icons. Stroke-only and inherit currentColor, so the active state is a
// single colour change rather than a second set of assets.
const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.6,
            strokeLinecap: "round", strokeLinejoin: "round" };

const wrap = (children) => (
  <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true" {...S}>{children}</svg>
);

export const ICONS = {
  overview: wrap(<><rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.6" />
                   <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.6" />
                   <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.6" />
                   <rect x="11" y="11" width="6.5" height="6.5" rx="1.6" /></>),
  revenue: wrap(<><path d="M3 13.5 7.5 9l3.5 3L17 5.5" /><path d="M13 5.5h4v4" /></>),
  expenses: wrap(<><path d="M3 6.5 7.5 11l3.5-3 6 6.5" /><path d="M13 14.5h4v-4" /></>),
  cashflow: wrap(<><path d="M4 7h9" /><path d="M10.5 4.5 13 7l-2.5 2.5" />
                   <path d="M16 13H7" /><path d="M9.5 10.5 7 13l2.5 2.5" /></>),
  forecast: wrap(<><path d="M2.5 15.5h15" /><path d="M4 12.5 8 8l3 2.5 5-6" />
                   <circle cx="8" cy="8" r="1.1" /><circle cx="11" cy="10.5" r="1.1" /></>),
  pnl: wrap(<><rect x="3.5" y="2.5" width="13" height="15" rx="2" />
              <path d="M6.5 7h7M6.5 10h7M6.5 13h4" /></>),
  ledger: wrap(<><rect x="3" y="3" width="14" height="14" rx="2" />
                 <path d="M3 7.5h14M7.5 7.5v9.5" /></>),
  tools: wrap(<><path d="M10 2.5v9" /><path d="M6.5 8 10 11.5 13.5 8" />
                <path d="M3.5 13v3.5h13V13" /></>),
};
