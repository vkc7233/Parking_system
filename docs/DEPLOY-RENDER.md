# Deploying a temporary demo on Render

A throwaway deployment to show the client, with no vendor accounts. Everything runs against the
working fakes: payments capture, notifications are recorded, maps return real Pune fixtures. The
whole booking loop works end to end.

**Roughly 45 minutes**, most of it waiting for Supabase and the first build.

Two pieces, in this order. The app cannot start without the database, so do Supabase first.

| Piece                     | Where           | Why not Render                                |
| ------------------------- | --------------- | --------------------------------------------- |
| Postgres + Auth + Storage | Supabase (free) | Needs PostGIS, row-level security and pg_cron |
| The Next.js web app       | Render (free)   | —                                             |

## Before you start

**Three free accounts**, all of which can sign in with GitHub:

| Account  | Sign up                                | Used for                         |
| -------- | -------------------------------------- | -------------------------------- |
| GitHub   | You have it — `vkc7233/Parking_system` | Render builds from it            |
| Supabase | https://supabase.com/dashboard         | Database, sign-in, photo storage |
| Render   | https://dashboard.render.com           | Runs the web app                 |

**On your machine:** Node 20 and git, which you already use to run the project locally. The
Supabase CLI comes with the repository, so there is nothing else to install.

**Push your work first**, or Render builds an older commit:

```bash
git push origin main
```

The repository's CI (lint, typecheck, tests, formatting, and the 84 database checks) passes on
the current `main`, so the push should come up green on GitHub.

---

## Part 1 — The database (Supabase)

### 1.1 Create the project

1. Go to **https://supabase.com/dashboard** and sign in.
2. **New project**. Name it `parking-marketplace-demo`.
3. **Database Password** — click **Generate a password** and save it somewhere. You need it in
   step 1.3, and a password you invent yourself will contain characters that break the connection
   string.
4. **Region: Singapore** (`ap-southeast-1`) — nearest to Pune, and it must match the Render region
   or every query pays an intercontinental round trip.
5. Create, then wait ~2 minutes for it to finish provisioning.

### 1.2 Enable PostGIS and pg_cron

**Database → Extensions**, search and enable:

- **postgis** — the entire search feature is a PostGIS distance query.
- **pg_cron** — runs the two lifecycle sweeps (completing elapsed bookings, expiring unpaid
  holds). Without it, bookings never complete, so no host is ever paid.

The migrations create these too, but enabling them here first avoids a permissions error on push.

### 1.3 Apply the schema

From the project folder on your machine:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref YOUR-PROJECT-REF
```

Your **project ref** is the random string in your dashboard URL:
`https://supabase.com/dashboard/project/`**`abcdefghijklmnop`**. It asks for the database password
from step 1.3.

```bash
npx supabase db push
```

This applies every file in `supabase/migrations`, in order. Expect about a minute and a list of
applied filenames. It asks you to confirm before it writes — type `Y`.

> **If pg_cron errors**, it was not enabled in 1.2. Enable it, then run `db push` again — the
> migrations are idempotent.

### 1.4 Load the demo data

`db push` creates the schema but no rows. Without this there are no listings to show.

Open **SQL Editor → New query**, paste the entire contents of `supabase/seed.sql`, and **Run**.

That creates 3 hosts, 2 seekers, 6 Pune listings with photos, and one closed period. It also
creates the matching `auth.users` rows, which is what makes sign-in work in the next step.

### 1.5 Make sign-in work without an SMS provider

This is the one step people miss, and the symptom is that nobody can log in.

Locally, `supabase/config.toml` maps the seeded phone numbers to fixed codes. Hosted Supabase has
the same feature in the dashboard.

**Authentication → Sign In / Providers → Phone** → enable it, then find **Test OTP** (you may need
to expand the provider's settings) and add these pairs:

```
919000000001:100001
919000000002:100002
919000000003:100003
919000000004:100004
919000000005:100005
```

The rule is `1000` plus the last two digits of the number. These short-circuit before any SMS
provider is called, so no Twilio account is needed and no message is ever sent.

| Number       | Code     | Who they are                                |
| ------------ | -------- | ------------------------------------------- |
| 919000000001 | `100001` | Priya Deshmukh — **Admin** (reach `/admin`) |
| 919000000002 | `100002` | Meena Kulkarni — Host, 3 listings           |
| 919000000003 | `100003` | Kiran Joshi — Host, 3 listings              |
| 919000000004 | `100004` | Rohan Bhosale — Seeker                      |
| 919000000005 | `100005` | Anjali Sathe — Seeker                       |

> **If Supabase refuses to enable Phone without SMS credentials:** create a free
> [Twilio trial](https://www.twilio.com/try-twilio), paste its Account SID, Auth Token and a
> Messaging Service SID into the provider settings, and still use the test numbers above. The
> trial is never actually charged because test numbers never reach it.

### 1.6 Tell Supabase Auth where the app lives

**Authentication → URL Configuration**:

- **Site URL**: `https://parking-marketplace.onrender.com` (your real Render URL, once you have it)
- **Redirect URLs**: add the same URL followed by `/**`

Phone sign-in does not follow a link, so login works without this. It matters for anything Auth
ever emails, which otherwise points at `localhost:3000`. Come back and correct it after Part 2 if
your Render URL differs.

### 1.7 Copy the three keys

**Project Settings → API** (newer dashboards call it **API Keys**). You need:

| Dashboard label       | Render variable                 |
| --------------------- | ------------------------------- |
| Project URL           | `NEXT_PUBLIC_SUPABASE_URL`      |
| `anon` `public`       | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` secret | `SUPABASE_SERVICE_ROLE_KEY`     |

> `service_role` bypasses every row-level security policy. It is a server-only value — never give
> it a `NEXT_PUBLIC_` name, or it ships to the browser and anyone can read every booking on the
> platform.

---

## Part 2 — The web app (Render)

### 2.1 Create the service from the blueprint

1. **https://dashboard.render.com** → **New** → **Blueprint**.
2. Connect the GitHub repository and pick it. Render reads [`render.yaml`](../render.yaml) and
   proposes one web service, `parking-marketplace`.
3. It prompts for the values marked `sync: false`. Fill in:

| Variable                        | Value                                                           |
| ------------------------------- | --------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Project URL from 1.7                                            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon public` key from 1.7                                      |
| `SUPABASE_SERVICE_ROLE_KEY`     | `service_role` key from 1.7                                     |
| `NEXT_PUBLIC_SITE_URL`          | `https://parking-marketplace.onrender.com` — see the note below |
| `NEXT_PUBLIC_SUPPORT_WHATSAPP`  | **Your own WhatsApp number**, e.g. `+91 98765 43210`            |
| `NEXT_PUBLIC_SUPPORT_EMAIL`     | Your email                                                      |

`ACCESS_PASS_SECRET` and `CRON_SECRET` are generated by Render — leave them alone.

> **`NEXT_PUBLIC_SITE_URL` is a chicken-and-egg.** You do not know the URL until the service
> exists. Guess `https://<service-name>.onrender.com` now; after the first deploy, check the real
> URL at the top of the service page and correct it if it differs. It must include `https://` —
> the value is parsed as a URL and a bare hostname fails validation at boot.

4. **Apply**. The first build takes 5–8 minutes.

### 2.2 What the build does, and where it fails

| Stage          | Roughly | If it fails                                                             |
| -------------- | ------- | ----------------------------------------------------------------------- |
| `pnpm install` | 1–2 min | `ERR_PNPM_OUTDATED_LOCKFILE` → run `pnpm install` locally, commit, push |
| `next build`   | 3–5 min | See the two traps below                                                 |
| Boot           | ~20 s   | See 2.3                                                                 |

**`NEXT_PUBLIC_*` variables are baked in at build time, not read at runtime.** Verified on this
app, not assumed: setting `NEXT_PUBLIC_SUPPORT_WHATSAPP` and restarting a build made without it
still fails at boot with the same message, because the value was compiled in as empty.

So if you change any `NEXT_PUBLIC_*` variable after a deploy, a restart will not pick it up —
use **Manual Deploy → Clear build cache & deploy**. Render passes environment variables to the
build, so filling them in at blueprint time (2.1) is enough; it is only later edits that need
this. This catches everyone once.

**If the build is killed around 90%**, it ran out of memory on the free instance's 512 MB. Add:

```
NODE_OPTIONS = --max-old-space-size=460
```

as an environment variable and redeploy.

### 2.3 If it builds but will not start

Open **Logs**. The app deliberately refuses to boot when it is misconfigured, rather than starting
and failing later in front of a user. Each message names the variable:

| Log line                                                 | Fix                                                       |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_SUPPORT_WHATSAPP is not set…`               | Set it, then **rebuild** — see 2.2. A restart will not do |
| `Invalid client environment: NEXT_PUBLIC_SUPABASE_URL…`  | Missing or not a full `https://` URL                      |
| `Invalid server environment: SUPABASE_SERVICE_ROLE_KEY…` | Missing                                                   |
| `ACCESS_PASS_SECRET must be at least 32 characters`      | Let Render generate it rather than typing one             |

### 2.4 Check it works

Open the Render URL. In order:

1. **The search page lists Pune spaces.** If it is empty, the seed in 1.4 did not run.
2. **Tap "Use my location".** Your browser asks permission. From outside Pune it tells you the pilot
   is Pune-only, which is the correct answer — so to show it working in a demo, search an area
   instead, or run the demo from Pune. It needs HTTPS, which Render provides.
3. **Sign in** as `9000000004` with code `100004`.
4. **Book something** — pick a listing, a time, and pay. The fake provider captures instantly, and
   you land on a booking page with a QR access pass.
5. **Sign out, sign in as `9000000003`** (Kiran, a host) → **Calendar** shows the booking you just
   made.
6. **Sign in as `9000000001`** and go to **`/admin`** — reached by typing the URL, never linked.
   The dashboard shows live counts and GMV.

If all six work, the demo is ready.

---

## Part 3 — Things to know before you show anyone

### The free instance sleeps

Render's free tier spins down after **15 minutes** of no traffic, and the next request takes
**about 50 seconds** to wake it. That is a bad first impression.

**Open the URL yourself 2–3 minutes before the demo** and leave the tab open. For anything beyond
a one-off demo, the $7/month Starter plan removes the spin-down entirely.

### The notification sweep is not scheduled here

`render.yaml` does not schedule `/api/cron/notifications` — Render Cron Jobs are a paid feature,
and the booking reminder and review request are not part of a live demo anyway.

If you want them: the repo already ships
[`.github/workflows/notifications-cron.yml`](../.github/workflows/notifications-cron.yml). Add two
GitHub repository secrets — `APP_BASE_URL` (your Render URL) and `CRON_SECRET` (copy it from
Render's environment tab) — and it runs every 15 minutes.

The two **database** sweeps do run, because pg_cron lives in Supabase. Confirm with:

```sql
select jobname, schedule, active from cron.job;
```

### Seeded listings show drawings, not photos

The seed creates photo _records_ but no image files — there are no photographs of real Pune
properties in the repository to upload, and inventing some would be misleading. Each listing
shows an illustration of its spot type instead, which is the same fallback a real listing uses
if its photo fails to load.

For a more convincing demo, add real photos to one or two listings before the call: sign in as
a host (`9000000002`), open **My listings → Edit**, and upload. They go to Supabase Storage and
appear immediately.

### Updating it after the first deploy

Render redeploys automatically on every push to `main`:

```bash
git push origin main
```

Two exceptions. A changed **`NEXT_PUBLIC_*`** variable needs **Clear build cache & deploy** (2.2).
A new **migration** is not applied by Render at all — run `npx supabase db push` again from your
machine, before you push the code that depends on it.

### What is deliberately fake

Payments, SMS/WhatsApp, email and maps all run on the working fakes. That is the right setting for
a demo and is worth saying out loud to the client rather than being asked:

- **Payments** capture instantly and refunds work, including the cancellation tiers — no money moves.
- **Notifications** are recorded in `notification_log` rather than sent. You can show the table.
- **Maps** return real Pune coordinates and the schematic map draws real geometry; there are no
  Google tiles until a billing account exists.

Every one of these is a full implementation behind the same interface as the real vendor, so
switching is an environment variable, not a rewrite. See [GO-LIVE.md](GO-LIVE.md) for each.

### Taking it down

**Settings → Delete Service** on Render, and **Settings → General → Delete project** on Supabase.
Nothing else is left running, and neither free tier charges anything.
