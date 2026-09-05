# Build status

Tracks the sprint plan in specification §14. Update the status column as work lands.

| Sprint     | Focus                                                            | Status                   |
| ---------- | ---------------------------------------------------------------- | ------------------------ |
| 0 (Week 1) | Foundation                                                       | **Complete** — see below |
| 1 (Week 2) | Host onboarding, create/edit listing, photo upload               | Not started              |
| 2 (Week 3) | Host Listing Agreement e-signature, Admin approval queue         | Not started              |
| 3 (Week 4) | Map + list search, filters, listing detail                       | Not started              |
| 4 (Week 5) | Slot selection, availability, Razorpay Checkout, access pass     | Not started              |
| 5 (Week 6) | Notifications, My Bookings, cancellation + refund, rate & review | Not started              |
| 6 (Week 7) | Admin dashboard, user management, disputes, payout triggering    | Not started              |
| 7 (Week 8) | QA bug bash, legal pages, analytics verification, launch         | Not started              |

## Sprint 0 — delivered

- **Monorepo** — Turborepo with `apps/web`, a placeholder `apps/mobile`, and
  `packages/{core,config,types,api-client,ui}` (spec §9.3).
- **Schema v1** — eight migrations covering all eight spec §10 entities plus the evidence,
  dispute and audit tables the acceptance criteria imply. PostGIS geography points with GiST
  indexes, RLS on every table, and lifecycle rules enforced by trigger rather than by UI.
- **Domain logic** — pricing, refunds, the booking state machine, access-pass issue/verify,
  checkout holds, payout eligibility and phone parsing, in `packages/core` with 63 passing
  tests and no
  framework dependency, so Phase 2 reuses it as-is.
- **Vendor adapters** — Razorpay, MSG91, and Google Maps, each behind an interface with a
  working fake (spec §16 lead-time risk).
- **Auth** — phone-OTP sign-up and login end to end, with role-aware route protection in
  middleware backed by RLS at the database.
- **CI** — lint, typecheck, test, build, plus a job that applies every migration to a real
  Postgres and fails the build if any public table has RLS disabled.
- **Design system basics** — Tailwind v4 tokens, `Button`, and a `Money` component that is the
  only place paise become rupees.

- **Assumption hardening** — the register now covers A1–A17. A10–A17 close gaps that would
  otherwise have surfaced mid-sprint: the checkout hold (a real defect — unpaid bookings held
  slots forever), the dispute window and the payout hold that depends on it, payout cadence
  and minimum, host-cancellation consequences, listing re-approval rules, auth rate limits,
  the review window, and data retention.

Verified locally: 63/63 unit tests pass, 47/47 schema checks pass, lint and typecheck clean
across all 7 packages, production build succeeds.

**Database verified.** All 8 migrations and the seed apply cleanly to Postgres 17.6 with
PostGIS. All 14 public tables have RLS enabled. `supabase/tests/schema_checks.sql` runs 47
behavioural assertions against a freshly reset database and all 47 pass — capacity limits,
checkout holds, the payout dispute hold, listing re-approval, the review window, host
suspension and the cancellation limit. Run it with `pnpm db:check`; CI runs it on every pull
request.

End-to-end through PostgREST with the anon key: the nearby search returns the 4 live seed
listings ordered by distance, and direct reads of `bookings` and `users` return nothing —
RLS holds against the auto-generated API, which is what spec §11 asks for.

### Auth verified in a browser

Phone-OTP sign-in works end to end against the live stack: sign in as a seeded host and the
app shows their real name and `host` role; resend keeps the number; a signed-in host hitting
`/admin` gets "Page not found" rather than a 403 that would reveal the panel exists (§8.4).
Local sign-in needs no SMS provider — `config.toml` maps the seeded numbers to fixed codes.

### Bugs the database run caught

Both were invisible to type-checking and unit tests, which is the argument for running the
schema behaviour suite in CI rather than trusting that the SQL parses:

1. **`NEW.time_range` was always NULL inside the availability trigger.** `time_range` is a
   STORED generated column, and Postgres computes those _after_ before-row triggers run. Every
   overlap test evaluated to NULL, so the capacity limit, the host-blocked-window check and the
   double-booking guard all silently passed everything through. The read-only
   `listing_available_slots` was correct throughout, which is why it would have looked fine
   from the UI right up until two people paid for the same slot. Fixed by building the range
   from `start_time`/`end_time` inside the trigger.
2. **`payout_eligible_at` could not be a generated column.** `timestamptz + interval` is STABLE,
   not IMMUTABLE, so the migration was rejected outright. Replaced with a plain index on
   `end_time` and the window expressed in the queries.

### Bugs the browser run caught

Three more, none of which any automated check would have found, because they only appear when
a real person signs in:

3. **Local phone auth was disabled entirely.** Supabase local ships with no SMS provider, so
   every sign-in returned `phone_provider_disabled`. The Sprint 0 deliverable "phone-OTP auth
   working end to end" was never actually exercised. Fixed by configuring `[auth.sms]` with
   `test_otp` codes for the seeded numbers.
4. **Seeded accounts were unreachable.** Supabase Auth stores phone numbers _without_ the
   leading `+`; the seed wrote them with one. Signing in as a seeded host silently created a
   _second_, empty seeker account instead of logging into theirs — so the host and admin seed
   data could never have been used.
5. **Seeded `auth.users` rows crashed GoTrue.** Its token columns are scanned into Go strings,
   and the seed left them NULL, so every sign-in for a seeded account returned a 500
   ("converting NULL to string is unsupported").

Plus one React bug in the login form: the "Send a new code" button carried `name`/`value`
alongside a `formAction`, which React overrides — so resending would have submitted without a
phone number. Assertions for 4 and 5 are now in the schema check suite.

## Deliberate additions beyond the specification

Each is small, each is justified in `ASSUMPTIONS.md`, and each can be removed on request.

- **Access pass verification** (A5) — the spec issues a QR pass but never validates one. A
  Host-side verify screen is planned for Sprint 5.
- **`packages/core`** — the spec names `ui`, `api-client`, and `types`. Pricing and refund
  logic belong in none of those and must be shared with the Edge Functions, so they have their
  own package.
- **`listing_agreements`, `notification_log`, `admin_audit_log`** — evidence tables the spec's
  own acceptance criteria require but its data model does not list.
- **`payout_bookings`** — makes "a payout cannot be triggered twice for the same booking"
  (§7.3) a database constraint rather than admin-panel logic.
- **`draft` listing status** — the spec's four states start at `pending`; a listing being
  composed needs somewhere to live before submission.
- **`disputes` table** — §6.3 and §7.3 both require dispute handling, but §10's data model has
  nowhere to record one. Payout eligibility depends on it (A11).

## Open items carried into Sprint 1

- Confirm or replace the assumption defaults, especially the platform fee (A1) and
  cancellation policy (A2) — both need to match what legal counsel publishes.
- Open the vendor accounts in spec §13, starting with Razorpay merchant KYC and the WhatsApp
  Business API, since those have the longest lead times.
- Choose the pilot city (A8) if it is not Ahmedabad.
