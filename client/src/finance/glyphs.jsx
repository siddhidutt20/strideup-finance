// ── Category glyphs and tints ────────────────────────────────
// A picture is faster to scan than a word, but only if it is the right
// picture. Anything not recognised keeps its initial rather than being given
// a symbol that means something else.

const GLYPHS = [
  [/food|grocer|dining|restaurant|eat|cafe|coffee/i,
   <><path d="M5 3v7a2 2 0 0 0 4 0V3" /><path d="M7 10v7" /><path d="M14.5 3c-1.4 1.2-2 3-2 5s.6 2.5 2 2.5V17" /></>],
  [/shop|retail|cloth|amazon|store|purchase/i,
   <><path d="M4 6.5h12l-1 10.5H5Z" /><path d="M7.5 6.5V5a2.5 2.5 0 0 1 5 0v1.5" /></>],
  [/transport|travel|fuel|petrol|car|uber|taxi|train/i,
   <><path d="M3.5 12.5h13l-1.2-4.2A2 2 0 0 0 13.4 7H6.6a2 2 0 0 0-1.9 1.3Z" /><path d="M3.5 12.5v3h2.5v-3" /><path d="M14 12.5v3h2.5v-3" /></>],
  [/rent|home|hous|mortgage|landlord|lease/i,
   <><path d="M3.5 9 10 3.5 16.5 9" /><path d="M5.5 8.5V16h9V8.5" /></>],
  [/utilit|electric|water|gas|power/i,
   <><path d="M11 2.5 5 11h4l-1 6.5L15 9h-4l1-6.5Z" /></>],
  [/health|medic|doctor|dentist|pharma|insur/i,
   <><path d="M10 4v12" /><path d="M4 10h12" /></>],
  [/tech|software|subscription|phone|internet|netflix|stream|spotify/i,
   <><rect x="3" y="4.5" width="14" height="9" rx="1.6" /><path d="M7 16.5h6" /></>],
  [/salary|wage|payroll|work study|drawings/i,
   <><rect x="3" y="6" width="14" height="10" rx="1.8" /><path d="M7.5 6V4.5h5V6" /></>],
  // A percent sign, not a circle with a line through it — the ringed version
  // reads as "forbidden" at 17px, which is the opposite of what it means.
  [/interest|bank|loan|deposit/i,
   <><path d="M4.5 15.5 15.5 4.5" /><circle cx="6.8" cy="6.8" r="2.1" /><circle cx="13.2" cy="13.2" r="2.1" /></>],
  [/freelance|consult|contract work/i,
   <><rect x="3" y="5.5" width="14" height="10" rx="1.8" /><path d="M7 5.5V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 13 4v1.5" /></>],
  [/education|school|tuition|course/i,
   <><path d="M10 4 2.5 7.5 10 11l7.5-3.5Z" /><path d="M5.5 9.2v4c0 1.2 2 2.3 4.5 2.3s4.5-1.1 4.5-2.3v-4" /></>],
  [/other|misc|sundr/i,
   <><circle cx="6" cy="6" r="2" /><circle cx="14" cy="6" r="2" /><circle cx="6" cy="14" r="2" /><circle cx="14" cy="14" r="2" /></>],
];

export function Glyph({ name }) {
  const hit = GLYPHS.find(([re]) => re.test(String(name ?? "")));
  if (!hit) return <b>{String(name ?? "?").trim().charAt(0).toUpperCase() || "?"}</b>;
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor"
         strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {hit[1]}
    </svg>
  );
}

// Eight tints for category pills. Chosen by name, so a category keeps the same
// colour everywhere it appears — a colour that moves between pages is worse
// than no colour at all.
export const TINTS = 8;
export function tintOf(name) {
  const s = String(name ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % TINTS;
}

export function CategoryPill({ name }) {
  if (!name) return <span className="fin-dash">—</span>;
  return <span className={`fin-pill p-${tintOf(name)}`}>{name}</span>;
}

export function Disc({ name, size }) {
  return (
    <span className={`hm-disc${size === "sm" ? " sm" : ""} d-${tintOf(name)}`} aria-hidden="true">
      <Glyph name={name} />
    </span>
  );
}
