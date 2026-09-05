# Supabase

## Migrations

Applied in filename order by `pnpm db:reset`.

| File                                  | Contents                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `*_extensions_and_enums.sql`          | PostGIS, btree_gist, pgcrypto; every enum; the updated_at helper           |
| `*_users_and_documents.sql`           | Profiles, auth trigger, role helpers, KYC-lite documents                   |
| `*_listings.sql`                      | Listings, photos, agreement evidence, availability blocks, lifecycle rules |
| `*_bookings_and_payments.sql`         | Bookings, capacity enforcement, state machine, payments                    |
| `*_payouts_reviews_notifications.sql` | Payouts, reviews, notification log, admin audit log                        |
| `*_rls_policies.sql`                  | Row-Level Security on every table (spec section 11)                        |
| `*_search_and_storage.sql`            | Nearby search, availability RPC, storage buckets and policies              |
| `*_holds_disputes_and_lifecycle.sql`  | Checkout holds, disputes, payout eligibility, re-approval rules            |

Never edit an applied migration. Add a new one:

```bash
pnpm exec supabase migration new describe_the_change
```

Then regenerate the types and commit both:

```bash
pnpm db:types
```

## Schema behaviour checks

`tests/schema_checks.sql` asserts that the rules in `docs/ASSUMPTIONS.md` are actually enforced
by triggers and constraints, not merely that the SQL parses. Run against a freshly reset
database:

```bash
pnpm db:reset && pnpm db:check
```

It runs as the postgres superuser, so RLS is bypassed by design - these test triggers and
constraints. RLS is asserted separately by CI, which fails the build if any public table has
row security disabled.

Add a check here whenever you add a rule. The suite caught two real bugs on its first run,
both invisible to type-checking: see "Bugs the database run caught" in
`docs/ROADMAP-STATUS.md`.

**Note:** the checks mutate data (they suspend a host and pause listings on purpose), so run
`pnpm db:reset` again before using the app afterwards.

## Scheduled jobs

Two jobs need pg_cron enabled on the hosted project.

`complete_elapsed_bookings()` moves confirmed bookings past their end time to completed, which
is what makes spec 7.1's "a completed booking correctly moves from upcoming to past
automatically" true.

`expire_unpaid_bookings()` releases slots held by abandoned checkouts (assumption A10). The
availability checks ignore lapsed holds directly, so a late sweep delays cleanup but never
causes an overbooking or a wrongly-blocked slot - still, run it often, because a lapsed hold
left in `pending_payment` looks like an active booking on the Host's calendar.

```sql
select cron.schedule(
  'complete-elapsed-bookings',
  '*/15 * * * *',
  $$select public.complete_elapsed_bookings()$$
);
```

```sql
select cron.schedule(
  'expire-unpaid-bookings',
  '* * * * *',
  $$select public.expire_unpaid_bookings()$$
);
```

Local development has no scheduler; call the functions directly when testing.

## Edge Functions (spec section 11)

Not yet implemented - they arrive with the sprints that need them.

| Function            | Sprint | Responsibility                                                                           |
| ------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `create-booking`    | 4      | Validates the slot, prices it server-side, creates a pending booking and a payment order |
| `razorpay-webhook`  | 4      | Verifies the signature, confirms or reverts the booking, fires notifications             |
| `send-notification` | 5      | One wrapper over MSG91 and email, called by every event that notifies                    |
| `trigger-payout`    | 6      | Calculates a host's payable amount for a period and initiates the payout                 |

These run on the service role and are the only writers of bookings, payments, and payouts.

## Auth

Phone-OTP only. In production, configure Supabase Auth's custom SMS hook to route through
MSG91 (spec section 9.5) rather than the default carrier integration. Locally, Supabase prints
the code:

```bash
pnpm exec supabase logs auth
```
