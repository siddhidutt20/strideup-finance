# Running your own copy

This app is one person's finances, on one deployment. There is no sign-up
page and no "create an account" button — deliberately. Every row in the
database belongs to the deployment rather than to a user, so a second account
on someone else's copy would not give you your own books. It would give you
theirs.

So you get your own copy instead: your own database, your own login, your own
URL. Nothing is shared with anybody else's. That is stronger isolation than
separate logins on one server, and it takes about twenty minutes.

---

## Before you start

You will need:

- A **GitHub** account — [github.com/signup](https://github.com/signup)
- A **Vercel** account — [vercel.com/signup](https://vercel.com/signup); sign
  in with GitHub and the two are already connected
- About **20 minutes**

Both have free tiers that are enough for this. Nothing here needs a credit
card, and nothing needs a terminal.

**Optional:** an Anthropic API key, if you want the app to read uploaded
bills and invoices for you. Everything else works without one — see
[Reading documents](#reading-documents-optional) at the end.

---

## 1 · Take a copy of the code

1. Go to
   [github.com/siddhidutt20/strideup-finance](https://github.com/siddhidutt20/strideup-finance).
2. Click **Fork**, top right.
3. Leave the name as `strideup-finance` or rename it — yours to choose.
4. Click **Create fork**.

You now have your own copy of the code. It has no data in it: the app's
database is created in step 3 and starts empty.

Renaming it later is fine. Vercel follows the repository, not the name.

---

## 2 · Create the Vercel project

1. Go to [vercel.com/new](https://vercel.com/new).
2. Find your fork under **Import Git Repository** and click **Import**.
3. **Project Name** becomes your URL, so it is worth a moment:
   `alex-finance` gives you `alex-finance.vercel.app`.
4. Leave **Framework Preset**, **Root Directory** and every build setting
   alone. The repository already tells Vercel how to build it.
5. Expand **Environment Variables** and add the ones below. Type the **Key**,
   type the **Value**, click **Add**, and repeat — it is one at a time.

   | Key | Value | |
   |---|---|---|
   | `SESSION_SECRET` | a random string of 32+ characters | required |
   | `OWNER_EMAIL` | the address you will sign in with | required |
   | `OWNER_PASSWORD` | a password, 12 characters or more | required |
   | `OWNER_NAME` | your name | recommended |
   | `FINANCE_ENTITIES` | `personal` | recommended |
   | `FINANCE_BASE_CURRENCY` | `USD`, `INR`, `GBP` … | optional |
   | `ANTHROPIC_API_KEY` | your own key | optional |

   **`SESSION_SECRET`** signs your login cookie. Any long random string will
   do — mash the keyboard, or run `openssl rand -base64 32` if you have a
   terminal handy. Do not reuse one from another app.

   **`FINANCE_ENTITIES=personal`** makes it a household app: one set of books,
   no company/personal switcher, Income rather than Revenue, no profit-and-loss
   statement. Leave it out and you get the business version instead.

   **`OWNER_PASSWORD`** is also how you reset a forgotten password: change it
   here and redeploy. That is on purpose — an app that could change its own way
   in is an app that can lock you out of it.

6. Click **Deploy** and wait. Two to four minutes is normal.

When it finishes, open the URL. It will tell you it has no database. **That is
expected** — step 3 gives it one.

---

## 3 · Add a database

The database is created from inside the project, which is why the project had
to exist first.

1. Open your project in Vercel and click the **Storage** tab.
2. Click **Create Database** (or **Connect Database → Create New**).
3. Choose **Neon — Serverless Postgres**.
4. Take the default region and the **free** plan.
5. On the connect step, make sure your project is selected and that it applies
   to **Production, Preview and Development**.
6. Vercel writes the connection string into your environment variables itself,
   as `DATABASE_URL` or `POSTGRES_URL`. The app accepts either, so whichever
   it picked is fine.

Then **redeploy**: **Deployments → ⋯ on the top one → Redeploy**. Vercel bakes
environment variables in at build time, so a new one needs a new build. This
catches everybody once.

---

## 4 · Sign in

Open your URL and sign in with the `OWNER_EMAIL` and `OWNER_PASSWORD` you set.

Then go to **My profile**, in the menu behind your name in the top right, and
add a picture. Everything else can wait.

### Put it on your phone

The app is built for a phone as much as a laptop.

- **iPhone (Safari):** Share → *Add to Home Screen*
- **Android (Chrome):** ⋮ → *Add to Home screen*

It gets an icon and opens without browser bars.

---

## Where to start once you are in

| | |
|---|---|
| **Money → Transactions** | Add what you spend and what comes in |
| **Money → Income** | Set up a salary or a rent, so it is expected each month |
| **Bills** | Add anything that leaves on a schedule — rent, loans, subscriptions |
| **Budget** | Set what the month is meant to cost |
| **Wealth** | What you own and what you owe. Nothing is connected to a bank, so these are figures you enter |
| **Goals** | What you are saving toward, and what that asks of each month |

Nothing has to be filled in before anything else works. Every page says
plainly when it has nothing to show yet.

---

## Reading documents (optional)

With an Anthropic API key the app can read an uploaded bill, receipt,
invoice or contract and pull the figures out of it. Without one, everything
else works exactly the same — you type the figures in yourself, and the app
says so rather than failing quietly.

To add one:

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign in.
2. **Settings → API Keys → Create Key**. Copy it — it is shown once.
3. Add credit under **Billing**. This is pay-as-you-go and separate from a
   Claude subscription; reading a few documents a month costs very little.
4. In Vercel: **Settings → Environment Variables**, add `ANTHROPIC_API_KEY`,
   then **redeploy**.

Use your own key. Sharing one means sharing the bill.

---

## Your data is yours

Worth being explicit, because it is the reason for doing it this way:

- Your database is created under **your** Vercel account. Nobody else has the
  connection string.
- Your login exists only in your database.
- The person who wrote this cannot see your figures, and nor can anyone else
  who forked it.
- Uploaded documents are stored in your database and served only to your
  signed-in session.

The code is shared. The data is not, and cannot be — there is no path between
two deployments.

---

## When something goes wrong

**"The server isn't fully configured yet. No database connection found."**
The database is missing, or it was added and the app has not been rebuilt
since. Do step 3, then redeploy.

**A setting you changed has not taken effect.**
Environment variables are read at build time. Change one, then
**Deployments → ⋯ → Redeploy**. Code changes deploy themselves; settings do
not.

**"You have exceeded the free plan limit" when creating the database.**
Neon's free plan allows one database per account. Either upgrade the Neon
integration, or make a Neon account at
[neon.tech](https://neon.tech), create a database there, and paste its
connection string into Vercel by hand as `DATABASE_URL`.

**You cannot sign in.**
Check `OWNER_EMAIL` and `OWNER_PASSWORD` in Vercel's environment variables —
they are exactly what the app expects, character for character. Change
`OWNER_PASSWORD` and redeploy to reset it.

**The build fails.**
Open the failed deployment and read the log. If it mentions a missing
dependency, the fork is incomplete — delete it and fork again.

---

## Keeping up with changes

Your fork is a snapshot. To pick up later work:

1. Open your fork on GitHub.
2. Click **Sync fork → Update branch**.
3. Vercel redeploys on its own.

Your data is untouched by this. The code changes; the database does not.

---

## The settings, in full

Everything the app reads. Only the first three are required.

| Key | What it does |
|---|---|
| `SESSION_SECRET` | Signs your login cookie. 32+ random characters |
| `OWNER_EMAIL` | The address you sign in with |
| `OWNER_PASSWORD` | Your password. Change it here to reset it |
| `OWNER_NAME` | Your name, until you set one in My profile |
| `FINANCE_ENTITIES` | `personal` for a household app, `strideup` for a business one, both names for one app holding two sets of books |
| `FINANCE_BASE_CURRENCY` | The currency totals are shown in. Default `USD` |
| `ANTHROPIC_API_KEY` | Lets the app read uploaded documents |
| `ANTHROPIC_MODEL` | Which model does the reading. There is a sensible default |
| `FINANCE_APP_NAME` | Overrides the name in the corner |
| `FINANCE_LOGO`, `FINANCE_ICON` | Point at your own logo and favicon |
| `FINANCE_LABEL_PERSONAL`, `FINANCE_LABEL_STRIDEUP` | Rename the two sets of books |
| `FINANCE_CONFIDENCE_FLOOR` | How sure a document reading must be before it is accepted without review |
| `DATABASE_URL` | Written by Vercel when you add the database. Do not set it yourself |

---

## Links

| | |
|---|---|
| The code | [github.com/siddhidutt20/strideup-finance](https://github.com/siddhidutt20/strideup-finance) |
| Vercel | [vercel.com](https://vercel.com) · [docs](https://vercel.com/docs) |
| Neon Postgres | [neon.tech](https://neon.tech) |
| Anthropic console | [console.anthropic.com](https://console.anthropic.com) |
