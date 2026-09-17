#!/usr/bin/env bash
# Builds the two handover packages from the current commit.
#
#   bash scripts/build-packages.sh [output-dir]
#
# The two editions are the SAME CODE. Everything in the repository is identical
# between them except one line — the default in schema.js — plus the .env.example
# default, the README's first paragraph, and which set-up PDF travels in docs/.
#
# That one line is what earns the separate package: with it, the person opening
# the zip never has to know FINANCE_ENTITIES exists. Without it they have to be
# told which app they are holding, and their guide needs a fork in it.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
# Resolved to an absolute path so an absolute argument is not appended to $REPO.
OUT="$(mkdir -p "${1:-dist-packages}" && cd "${1:-dist-packages}" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

python3 scripts/build-setup-pdf.py household >/dev/null
python3 scripts/build-setup-pdf.py business  >/dev/null

build() {
  local edition="$1" folder="$2" entities="$3" keep_pdf="$4" drop_pdf="$5" title="$6" blurb="$7"
  local dir="$WORK/$folder"
  rm -rf "$dir"; mkdir -p "$dir"
  git archive HEAD | tar -x -C "$dir"

  # The one line of code that differs.
  python3 - "$dir" "$entities" <<'PY'
import io, sys
d, ent = sys.argv[1], sys.argv[2]
p = f"{d}/server/src/finance/schema.js"
s = io.open(p, encoding="utf-8").read()
old = 'export const ENTITIES = configured.length ? configured : ["strideup"];'
assert old in s, "the ENTITIES default moved — update build-packages.sh"
s = s.replace(old, f'export const ENTITIES = configured.length ? configured : ["{ent}"];', 1)
io.open(p, "w", encoding="utf-8").write(s)

p = f"{d}/.env.example"
s = io.open(p, encoding="utf-8").read()
s = s.replace("FINANCE_ENTITIES=strideup,personal", f"FINANCE_ENTITIES={ent}", 1)
io.open(p, "w", encoding="utf-8").write(s)
PY

  # Each package carries only its own guide. The PDFs are build outputs, so they
  # are copied in from docs/ rather than taken from `git archive` — which only
  # sees tracked files and silently shipped a package with no guide at all.
  rm -f "$dir"/docs/*.pdf
  cp "$REPO/docs/$keep_pdf" "$dir/docs/$keep_pdf"
  [ -f "$dir/docs/$keep_pdf" ] || { echo "missing $keep_pdf" >&2; exit 1; }

  # And says on the first line which app it is.
  python3 - "$dir" "$title" "$blurb" "$keep_pdf" <<'PY'
import io, sys
d, title, blurb, pdf = sys.argv[1:5]
p = f"{d}/README.md"
s = io.open(p, encoding="utf-8").read()
head = s[:s.index("\n\n", s.index("# "))]
s = s.replace(head, f"# {title}\n\n{blurb}\n\nNew here? **docs/{pdf}** is four printable\npages that hand the set-up to Claude.", 1)
io.open(p, "w", encoding="utf-8").write(s)
PY

  (cd "$WORK" && zip -qr "$OUT/$folder.zip" "$folder")
  echo "  $folder.zip   ($(du -h "$OUT/$folder.zip" | cut -f1))"
}

echo "Building:"
build household myfinance-household personal \
  myfinance-setup.pdf strideup-setup.pdf \
  "myFinance" \
  "A private finance app for your own money: what comes in, what goes out, what you own and owe, what you have agreed to pay, and what the next six months look like."

build business strideup-business strideup \
  strideup-setup.pdf myfinance-setup.pdf \
  "StrideUp Finance" \
  "A private finance app for a company: revenue, expenses, cash, outstanding invoices, vendor commitments, profit and loss, and how long the money lasts."
