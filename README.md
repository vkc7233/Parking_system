# Parking Marketplace Platform

A two-sided marketplace connecting people with spare private parking ("Hosts") to drivers who
need it ("Seekers"), for one pilot Indian city.

The authoritative specification is
[`docs/Parking_App_MVP_Preparation_Documentation.docx`](docs/Parking_App_MVP_Preparation_Documentation.docx).
Everything the spec left open is decided and justified in
[`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md); current build progress is in
[`docs/ROADMAP-STATUS.md`](docs/ROADMAP-STATUS.md).

## Quick start

```bash
pnpm install
```

```bash
cp .env.example .env.local
```

Then start the database and the app:

```bash
pnpm db:start && pnpm db:reset && pnpm dev
```

`pnpm db:start` prints the local anon and service-role keys — paste them into `.env.local`.
The app runs at http://localhost:3000 and Supabase Studio at http://localhost:54323.

**Docker is required** for the local database. On Windows, Docker Desktop needs the WSL2
backend (`wsl --install`, then reboot).

### Signing in locally

Auth is phone-OTP only, no passwords (spec §7.1). In local development Supabase prints the
code to its own logs rather than sending an SMS:

```bash
pnpm exec supabase logs auth
```

The seed creates `+919000000001` (admin), `+919000000002` and `+919000000003` (hosts), and
`+919000000004` and `+919000000005` (seekers).

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

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs the web app with hot reload |
| `pnpm build` | Production build |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | The three CI gates |
| `pnpm db:start` / `pnpm db:stop` | Local Supabase stack |
| `pnpm db:reset` | Reapplies every migration, then the seed |
| `pnpm db:types` | Regenerates `packages/types/src/database.types.ts` |
| `pnpm format` | Prettier across the repo |

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

| Variable | Default | Real value |
| --- | --- | --- |
| `PAYMENTS_PROVIDER` | `fake` | `razorpay` |
| `NOTIFICATIONS_PROVIDER` | `fake` | `msg91` |
| `NEXT_PUBLIC_MAPS_PROVIDER` | `fake` | `google` |

The fakes are real implementations, not stubs — the fake payment adapter tracks orders,
verifies HMAC signatures, and enforces refund limits, so code written against it works
unchanged against Razorpay. Selecting a real provider without its credentials fails at server
boot rather than at the moment someone tries to pay.

To provoke failures against the fake payment adapter: a total ending in `13` paise fails
capture, and a payout ending in `07` paise fails.

## Status

Sprint 0 (Foundation) is complete: monorepo, schema with PostGIS and RLS, domain logic with
tests, vendor adapters, phone-OTP auth, and CI. Sprints 1–7 are outlined in spec §14 and
tracked in [`docs/ROADMAP-STATUS.md`](docs/ROADMAP-STATUS.md).
