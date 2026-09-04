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

## 1 · The Vercel project for personal

The database comes second here, not first. Where Neon is managed through
Vercel — which it is if **New project** is greyed out on console.neon.tech with
"use the Neon Postgres integration in Vercel" — a database is created from
Vercel's Storage tab and attached to a project. So the project has to exist
first.

1. Go to **vercel.com/new**.
2. Under **Import Git Repository**, find `strideup-finance` and click
   **Import**. Importing the same repository twice is expected — the two
   projects deploy the same code with different settings.
3. **Project Name**: `strideup-personal`. This becomes the URL, so it is worth
   getting right: `strideup-personal.vercel.app`.
4. Leave **Framework Preset**, **Root Directory** and the build settings alone.
5. Expand **Environment Variables** and add these — **Key**, **Value**, then
   **Add** after every one. There is no `DATABASE_URL` here; step 2 supplies it.

   | Key | Value |
   |---|---|
   | `FINANCE_ENTITIES` | `personal` |
   | `SESSION_SECRET` | a fresh random string, **not** the business one |
   | `OWNER_EMAIL` | the address you will sign in with |
   | `OWNER_PASSWORD` | a password, at least 12 characters |
   | `OWNER_NAME` | your name |
   | `ANTHROPIC_API_KEY` | the same key is fine, or a separate one |
   | `FINANCE_BASE_CURRENCY` | `USD`, or whatever personal is kept in |

   The app names itself: a personal instance calls itself **Personal Finance**
   and drops the StrideUp wordmark without being told to. `FINANCE_APP_NAME`
   overrides that if you want something else.

   `SESSION_SECRET` must differ from the business instance. Sharing it would
   mean a session cookie issued by one app is accepted by the other, which is
   the one way the two could reach each other.

6. Click **Deploy**. It will build, and the app will come up reporting that it
   has no database. That is expected — step 2 gives it one.

## 2 · A database for personal, from inside Vercel

1. Open the **strideup-personal** project in Vercel.
2. Click the **Storage** tab.
3. Click **Create Database** (or **Connect Database** → **Create New**).
4. Choose **Neon — Serverless Postgres** from the marketplace list.
5. Name it `strideup-personal`. Take the default region and the free plan.
6. Click **Create**, then on the connect step make sure **strideup-personal**
   is the project selected, and that it applies to **Production, Preview and
   Development**.
7. Vercel writes the connection string into the project's environment variables
   for you — usually `DATABASE_URL`, sometimes `POSTGRES_URL` or a prefixed
   variant. The app looks for all of those, so whichever it chose is fine.
8. Go to **Deployments → ⋯ on the top one → Redeploy**. Environment variables
   are baked in at build time, so the app has to be built again to see the
   database.

If the marketplace refuses because a database already exists on the free plan,
that is a Neon plan limit rather than anything about this app: either upgrade
the Neon integration, or create the second database under a different Neon
account and paste its connection string in as `DATABASE_URL` by hand.

## 2b · Check it before going further

1. Open `strideup-personal.vercel.app` and sign in with the `OWNER_EMAIL` and
   `OWNER_PASSWORD` from step 1.5.
2. There should be **no StrideUp / Personal / Both switcher** in the header.
   That is how you know `FINANCE_ENTITIES` took.
3. If the switcher is there, or the app reports no database, check
   **Settings → Environment Variables**, then redeploy. Vercel bakes
   environment variables in at build time; a new variable needs a redeploy, a
   code change does not.

## 3 · Move the personal books across

Do this in the app, under **Import & close → Move a set of books to another
app**. No terminal and no database password: download the books from the
business app, upload the file into the personal app, and only then remove them
from the business one. The three steps are numbered on the page in the order
they must happen.

Upload only inserts, and matches on the keys the app already treats as identity
— a document by its content hash, a commitment by its dedup key, an entry by
its own. Uploading the same file twice adds nothing the second time, so it is
safe to repeat. A file of business books uploaded into the personal app is
refused rather than relabelled.

Removing asks you to type the name of the books first, and only offers itself
in an app that keeps more than one set — there is nothing sensible about
emptying an app that keeps only one.

### The same three steps from a terminal

For a bulk move, or if you would rather not click. Nothing is deleted until you
have opened the new instance and checked the figures yourself.

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
