# Running a second instance, for personal

One codebase, two deployments. The business keeps its URL, its login and its
database; personal gets its own of each. Nothing is shared — not a row, not a
session, not a document. A personal receipt cannot appear in the StrideUp app
because the StrideUp database does not contain it.

`FINANCE_ENTITIES` is what makes an instance one thing or the other. It names
the books that deployment keeps. Where it names one, that entity is the only
one the app will read, write or accept an upload for: the switcher disappears,
the reader is told there is only one set of books, and a request naming the
other entity is answered with this one's data rather than refused, because
there is nothing else in the database to serve.

---

## 1 · A database for personal

1. Go to **console.neon.tech** and sign in.
2. Top left, click the **project dropdown** → **New Project**.
3. Name it `strideup-personal`. Leave the Postgres version and region as they
   are. Click **Create project**.
4. On the project page click **Connect** (top right of the Connection Details
   box).
5. Make sure **Connection pooling** is ticked, then click the copy icon on the
   connection string. It looks like
   `postgresql://…@ep-….pooler.…neon.tech/neondb?sslmode=require`.
6. Keep that on the clipboard for step 2.6.

## 2 · A Vercel project for personal

1. Go to **vercel.com/new**.
2. Under **Import Git Repository**, find `strideup-finance` and click
   **Import**. Importing the same repository twice is expected — the two
   projects deploy the same code with different settings.
3. **Project Name**: `strideup-personal`. This becomes the URL, so it is worth
   getting right: `strideup-personal.vercel.app`.
4. Leave **Framework Preset**, **Root Directory** and the build settings alone.
5. Expand **Environment Variables**.
6. Add each of these — **Key**, then **Value**, then **Add** after every one:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Neon string from step 1.5 |
   | `FINANCE_ENTITIES` | `personal` |
   | `SESSION_SECRET` | a fresh random string, **not** the business one |
   | `OWNER_EMAIL` | the address you will sign in with |
   | `OWNER_PASSWORD` | a password, at least 12 characters |
   | `OWNER_NAME` | your name |
   | `ANTHROPIC_API_KEY` | the same key is fine, or a separate one |
   | `FINANCE_BASE_CURRENCY` | `USD`, or whatever personal is kept in |

   `SESSION_SECRET` must differ from the business instance. Sharing it would
   mean a session cookie issued by one app is accepted by the other, which is
   the one way the two could reach each other.

7. Click **Deploy** and wait for it to finish.
8. Open the new URL and sign in with `OWNER_EMAIL` / `OWNER_PASSWORD`. There
   should be **no StrideUp / Personal / Both switcher** in the header. If there
   is, `FINANCE_ENTITIES` did not take — check the spelling in
   **Settings → Environment Variables**, then **Deployments → ⋯ → Redeploy**.
   Vercel bakes environment variables in at build time, so a new variable needs
   a redeploy; a code change does not.

## 3 · Move the personal books across

Three separate steps. Nothing is deleted until you have opened the new
instance and checked the figures yourself.

```bash
# From the repo, pointed at the BUSINESS database
DATABASE_URL='<business connection string>' \
  node scripts/move-entity.mjs export personal personal-books.json

# Same file, pointed at the PERSONAL database
DATABASE_URL='<personal connection string>' \
  node scripts/move-entity.mjs import personal-books.json
```

Import only inserts, and it matches on the keys the app already treats as
identity — a document by its content hash, a commitment by its dedup key, an
entry by its own. Running it twice adds nothing the second time.

**Now open the personal instance and check it.** Same figures, same
commitments, same documents. Compare a month or two against the business app
before going further.

```bash
# Only once you are satisfied. Pointed at the BUSINESS database.
DATABASE_URL='<business connection string>' \
  node scripts/move-entity.mjs purge personal --yes-delete
```

Purge refuses to run without `--yes-delete` and prints what it would remove.
It takes the personal entries, commitments and their payments, documents,
invoices, budgets and closed-period records out of the business database. It
leaves every StrideUp row alone. An entry that pointed at a document being
removed has its link cleared rather than being deleted — an entry is a fact
about money, the document is only its evidence.

## 4 · Afterwards

Set `FINANCE_ENTITIES=strideup` on the business project and redeploy. Its
switcher goes too, and from then on neither app has a concept of the other.

## Running both locally

```bash
# business, on 4177
npm start

# personal, on 4188, with its own database
FINANCE_ENTITIES=personal PGLITE_DIR=./data/pg-personal PORT=4188 \
  OWNER_EMAIL=you@personal OWNER_PASSWORD=… npm start
```

`PGLITE_DIR` is what keeps the two local databases apart. Without it both
instances would open the same folder, which is the one mistake that would put
the books back together.
