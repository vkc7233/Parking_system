# Parking Marketplace Platform

A two-sided marketplace connecting people with spare private parking ("Hosts") to drivers who
need it ("Seekers"), for one pilot Indian city.

The authoritative specification is
[`docs/Parking_App_MVP_Preparation_Documentation.docx`](docs/Parking_App_MVP_Preparation_Documentation.docx).
Everything the spec left open is decided and justified in
[`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md); current build progress is in
[`docs/ROADMAP-STATUS.md`](docs/ROADMAP-STATUS.md).

## Running it

You need **Node 20+**, **pnpm 10+**, and **Docker Desktop running**. Nothing else — no Supabase
account, no API keys, no SMS provider.

Four commands, in order:

```bash
pnpm install
```

```bash
pnpm bootstrap
```

```bash
pnpm db:start
```

```bash
pnpm db:reset
```

```bash
pnpm dev
```

> **Windows PowerShell:** run those as separate lines, as written above. PowerShell 5.1 (the
> default on Windows) does not support `&&` between commands — it fails with "The token '&&' is
> not a valid statement separator in this version". Use `;` if you want them on one line.

The app is at **http://localhost:3000**, Supabase Studio at **http://localhost:54323**, and
the inbox for local email at **http://localhost:54324**.

What each step does:

| Step             | What happens                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install`   | Installs the workspace                                                                                                                     |
| `pnpm bootstrap` | Writes `apps/web/.env.local` from `.env.example` and generates an access-pass secret. Safe to re-run; it never overwrites an existing file |
| `pnpm db:start`  | Starts Postgres + PostGIS, Auth, Storage and Studio in Docker. Slow the first time while images download                                   |
| `pnpm db:reset`  | Applies all 9 migrations, then the seed — 5 users and 5 listings around Ahmedabad                                                          |
| `pnpm dev`       | Runs the web app with hot reload                                                                                                           |

Afterwards, `pnpm dev` on its own is enough — the database keeps running in Docker until you
stop it with `pnpm db:stop`.

### If something goes wrong

**Docker Desktop will not start** (it opens and immediately reports "an unexpected error
occurred"): run `pnpm docker:up`. Docker leaves unix-socket files behind after an unclean
shutdown that Windows then refuses to delete, and it crashes on them at startup. The script
clears them and waits for the engine.

**The app returns 500 on every page** after a lot of editing: the dev bundle has gone stale.
Stop the server, `rm -rf apps/web/.next`, and start it again. If `pnpm build` succeeds, the code
is fine and it is only the dev cache.

**Port 3000 is in use:** `pnpm dev` stops with an explanation rather than starting on 3001.
The app has to be on 3000 — the local Supabase Auth config pins its redirect URLs there, so
sign-in breaks anywhere else. Find and stop the process it names, then start again. A dev
server left running from an earlier session is the usual cause.

**Docker is required** for the local database. On Windows, Docker Desktop needs the WSL2
backend (`wsl --install`, then reboot).

If Docker Desktop starts and immediately reports "an unexpected error occurred", run
`pnpm docker:up`, which clears the usual cause automatically. To diagnose it by hand, check
`%LOCALAPPDATA%\Docker\log\host\com.docker.backend.exe.log`. Orphaned unix-socket files
under `%LOCALAPPDATA%\Docker\run` and `%LOCALAPPDATA%\docker-secrets-engine` survive an
unclean shutdown and cannot be deleted normally; renaming the containing directory clears
them, and Docker recreates them on the next start.

### Signing in locally

Auth is phone-OTP only, no passwords (spec §7.1). Locally there is no SMS provider at all —
`supabase/config.toml` maps the seeded numbers to fixed codes under `[auth.sms.test_otp]`, so
sign-in works offline. Enter the 10-digit number; the code is `1000` plus its last two digits.

| Sign in as   | Number       | Code     | Role   |
| ------------ | ------------ | -------- | ------ |
| Priya Admin  | `9000000001` | `100001` | admin  |
| Meena Shah   | `9000000002` | `100002` | host   |
| Kiran Patel  | `9000000003` | `100003` | host   |
| Rohan Desai  | `9000000004` | `100004` | seeker |
| Anjali Mehta | `9000000005` | `100005` | seeker |

**Where to go once you are in.** The home page is seeker search and works signed out. Sign in as
**Meena** and open **List your space** for the host experience — onboarding, listings, photos and
the Host Listing Agreement. Sign in as **Priya** and type **`/admin`** for the approval queue,
document review and user management; nothing links to `/admin`, by design (§8.4), and a
non-admin gets a 404 there rather than a 403.

In production none of this applies: Supabase Auth routes OTP delivery through a custom SMS
hook to MSG91 (spec §9.5).

**Two things to know if you ever hand-seed an `auth.users` row.** Supabase Auth stores phone
numbers _without_ the leading `+`, and it scans its token columns (`confirmation_token`,
`recovery_token`, and friends) into Go strings, so they must be `''` rather than NULL. Get
either wrong and sign-in either creates a silent duplicate account or returns a 500. Both are
guarded by assertions in `supabase/tests/schema_checks.sql`.

## Repository layout

```
apps/
  web/        Next.js App Router - Seeker, Host, and Admin in one application
  mobile/     Placeholder for Phase 2 (spec 9.3). Nothing is built here yet.
packages/
  core/       Pure domain logic: pricing, refunds, booking states, access passes
  config/     Every value the spec left open, in one file
  types/      Shared types; database.types.ts is generated, not hand-written
  api-client/ Vendor adapters and typed query helpers
  ui/         Design system primitives
supabase/
  migrations/ Schema, triggers, and RLS policies
  seed.sql    Local development data - a working Ahmedabad marketplace
docs/         Specification, assumptions, build status
```

## Commands

| Command                                      | What it does                                            |
| -------------------------------------------- | ------------------------------------------------------- |
| `pnpm dev`                                   | Runs the web app with hot reload                        |
| `pnpm build`                                 | Production build                                        |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | The three CI gates                                      |
| `pnpm db:start` / `pnpm db:stop`             | Local Supabase stack                                    |
| `pnpm db:reset`                              | Reapplies every migration, then the seed                |
| `pnpm db:types`                              | Regenerates `packages/types/src/database.types.ts`      |
| `pnpm db:check`                              | Runs the 58 schema behaviour assertions                 |
| `pnpm format`                                | Prettier across the repo                                |
| `pnpm bootstrap`                             | Writes `apps/web/.env.local` for a fresh checkout       |
| `pnpm docker:up`                             | Starts Docker, clearing the stale sockets that block it |

Run `pnpm db:types` after every migration and commit the result, so CI type-checks against the
same schema you developed against.

## Two things worth knowing before changing code

**Money is integer paise, everywhere.** Never a float, never rupees, until the display edge —
use `<Money paise={...} />` or `formatPaise()`. A `bigint` column and a `number` of paise are
the same thing; `1250` means ₹12.50.

**Nothing that decides an amount of money is client-writable.** Bookings, payments, and
payouts are written only by server code holding the service-role key. RLS gives clients read
access scoped to the rows that concern them, and no write path at all. If a browser could
insert a booking row, it could choose its own price — no amount of UI validation would fix
that. See the header comment in
[`supabase/migrations/20260905000600_rls_policies.sql`](supabase/migrations/20260905000600_rls_policies.sql).

## Working without vendor accounts

Razorpay merchant KYC takes 1–2 weeks and WhatsApp Business API approval 3–5 days (spec §13),
and the spec names both as risks to sprints 4–5 (§16). So every vendor sits behind an adapter
with a working fake:

| Variable                    | Default | Real value |
| --------------------------- | ------- | ---------- |
| `PAYMENTS_PROVIDER`         | `fake`  | `razorpay` |
| `NOTIFICATIONS_PROVIDER`    | `fake`  | `msg91`    |
| `NEXT_PUBLIC_MAPS_PROVIDER` | `fake`  | `google`   |

The fakes are real implementations, not stubs — the fake payment adapter tracks orders,
verifies HMAC signatures, and enforces refund limits, so code written against it works
unchanged against Razorpay. Selecting a real provider without its credentials fails at server
boot rather than at the moment someone tries to pay.

To provoke failures against the fake payment adapter: a total ending in `13` paise fails
capture, and a payout ending in `07` paise fails.

## Status

Sprint 0 (Foundation) is complete and verified against a real database: monorepo, schema with
PostGIS and RLS, domain logic with tests, vendor adapters, phone-OTP auth, and CI.

Sprint 1 (host onboarding, listings, photo upload) and Sprint 2 (Host Listing Agreement
e-signature, admin approval queue, document review, user management) are complete and verified
in a browser. Sprint 3 has seeker search, listing detail and My Bookings; the map and booking
itself are next.

The whole chain works end to end today: a host lists a space and signs the agreement, an admin
approves it, and it appears in seeker search with a transparent price breakdown.

63 unit tests, 58 schema behaviour checks, lint and typecheck clean, production build green.
The phone-OTP sign-in flow is verified end to end in a browser against the live database.
Sprints 2–7 are outlined in spec §14 and tracked in
[`docs/ROADMAP-STATUS.md`](docs/ROADMAP-STATUS.md).
