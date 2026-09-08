# Build status

Tracks the sprint plan in specification §14. Update the status column as work lands.

| Sprint     | Focus                                                            | Status                      |
| ---------- | ---------------------------------------------------------------- | --------------------------- |
| 0 (Week 1) | Foundation                                                       | **Complete** — see below    |
| 1 (Week 2) | Host onboarding, create/edit listing, photo upload               | **Complete** — see below    |
| 2 (Week 3) | Host Listing Agreement e-signature, Admin approval queue         | **Complete** — see below    |
| 3 (Week 4) | Map + list search, filters, listing detail                       | **Partly done** — see below |
| 4 (Week 5) | Slot selection, availability, Razorpay Checkout, access pass     | Not started                 |
| 5 (Week 6) | Notifications, My Bookings, cancellation + refund, rate & review | Not started                 |
| 6 (Week 7) | Admin dashboard, user management, disputes, payout triggering    | Not started                 |
| 7 (Week 8) | QA bug bash, legal pages, analytics verification, launch         | Not started                 |

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

Verified locally: 63/63 unit tests pass, 58/58 schema checks pass, lint and typecheck clean
across all 7 packages, production build succeeds.

**Database verified.** All 8 migrations and the seed apply cleanly to Postgres 17.6 with
PostGIS. All 14 public tables have RLS enabled. `supabase/tests/schema_checks.sql` runs 58
behavioural assertions against a freshly reset database and all 58 pass — capacity limits,
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

## Sprint 1 — delivered

Verified end to end in a browser, signing in as a seeker with no listings and going all the way
to a listing submitted for approval.

- **Host onboarding (KYC-lite)** — three documents (identity, address, bank) uploaded to a
  **private** Storage bucket namespaced by user id, recorded as `pending` for Admin review
  (spec §6.2 step 2, §7.2). Re-uploading replaces the previous attempt rather than leaving an
  Admin to guess which of several files is current. A rejection shows its reason.
- **Create / edit listing** — full form with address lookup, spot type, capacity, hourly price
  and optional daily cap, availability hours and house rules. Saved as a draft first; nothing is
  visible to anyone else until it is submitted and approved.
- **Photo upload** — browser-direct to Supabase Storage (a server action body is capped at 1MB
  and photos are allowed 5MB), then recorded by a server action that re-checks the path. Cover
  photo, removal, and position re-packing so a deletion cannot collide with the next insert.
- **Lifecycle controls** — submit for approval, pause, reactivate, delete. Which buttons exist
  is driven by status, so a Host is never offered an action the database would refuse; the
  remaining blockers ("add 1 more photo", "finish onboarding") are named before they click.
- **Role promotion** — a Seeker becomes a Host by listing a space (spec §8.4), through a narrow
  `promote_to_host()` that can only ever move `seeker` to `host` and never grants admin.

Schema additions: `upsert_listing` and `promote_to_host` RPCs, photo position re-packing, and
generated `lat`/`lng` columns (PostgREST returns a geography column as WKB hex, which cannot
re-populate an edit form).

### What is deliberately not here yet

- **A visual map pin.** Spec §6.2 describes pinning on a map. The picker captures an exact,
  confirmed lat/lng from a real address lookup — which is what the schema needs — but drawing
  the map waits for Sprint 3, when the Maps JavaScript API arrives for Seeker search. Loading
  and paying for a map before then buys nothing.
- **The Host Listing Agreement e-signature.** That is Sprint 2, and the database already
  refuses to let any listing go live without one.

### Bugs found by running the flow

- **The street address never prefilled.** Choosing an address from the lookup set the
  coordinates but left the address field blank, because the input was keyed on the resolved
  address while still reading its default from the _initial_ value. Every new listing would
  have been saved with an empty street address unless the Host retyped it.
- A test-harness trap worth recording: `document.querySelector('[name="description"]')` matches
  Next's `<meta name="description">` in the head, not the form field. Anything scripting these
  forms must scope its queries to the form.

## Sprint 2 — delivered

The whole chain was walked in a browser: a host signs, an admin approves, and the listing
appears in seeker search.

- **Host Listing Agreement e-signature** (§6.2 step 4, §7.2). The agreement text lives in
  `apps/web/src/lib/agreement.ts` as data, not JSX, so the exact string signed can be hashed and
  reproduced. Signing records the typed name, server timestamp, IP, user agent, agreement
  version and the SHA-256 of the text served — the hash being the part that proves _which
  wording_ was agreed to after the wording changes. The signing button is gated on scrolling to
  the end of the text.
- **Admin panel** (§8.3) — a separate, darker shell at `/admin`, linked from nowhere. A
  non-admin gets 404, not 403.
- **Approval queue** (§6.3 step 1, §7.3) — every check §6.3 asks for on one card: the photos,
  the address with its coordinates, the price and capacity, and whether the agreement is signed.
  Approve is disabled without a signature, because the database would refuse anyway.
- **Rejection with a reason** (§6.3 step 2) — mandatory and shown to the host on their listing.
  A rejected host "can resubmit", which is impossible if nobody says what was wrong.
- **Document review** (§4.2, §7.2) — KYC documents opened through a two-minute signed URL rather
  than rendered on page load, and `users.kyc_status` rolled up from the three documents.
- **User management** (§7.3) — search by name or phone, suspend and restore. Suspending delists
  every live listing, via the database trigger.
- **Audit trail** — every approval, rejection, suspension and document ruling writes to
  `admin_audit_log` through the service role, so an admin cannot author their own trail.

## Sprint 3 — partly delivered

- **Seeker search** (§7.1, §8.1) — distance-ordered results with radius, spot type and price
  filters. Filters live in the URL, so a result set is shareable, survives a refresh, and is
  crawlable (§7.4). Applying one re-renders on the server inside a transition, so results never
  blank out.
- **Listing detail** (§7.1, §8.1) — photos, description, address, house rules, host identity and
  a transparent price breakdown showing the service fee before checkout exists (§6.1). Readable
  signed out; a paused or pending listing 404s rather than showing something unbookable.
- **My Bookings** (§8.1) — real page with upcoming/past split, replacing the 404 that the header
  had been linking to.

**Not done in Sprint 3:** the visual map, and booking itself. The map needs the Google Maps
JavaScript API and a billing account (§13); the list is the half of §8.1 that drives the
decision, so it ships first. Slot selection, Razorpay checkout and the access pass are Sprint 4.

## Sprints 4 and 5 — code complete, NOT yet verified

Everything below compiles, type-checks and lints, and the domain logic under it is unit-tested.
**None of it has been exercised against a running database**, because Docker went down partway
through and the elevation prompt needed to restart its privileged service was declined twice.
Treat this section as unproven until someone walks it — see "Before trusting Sprint 4/5" below.

- **Slot selection and live quoting** (§6.1 step 4, §7.1) — the total is quoted by the server on
  every change and recomputed independently when the booking is created, so a tampered form
  cannot buy at a price the server did not calculate.
- **Booking creation** — holds the slot for ten minutes (A10), priced from the listing, with the
  availability trigger as the actual guarantee against double-booking.
- **Payment** — Razorpay Checkout when the merchant account is live; against the fake adapter it
  captures locally. Both paths end at the same verification, which asks the provider directly
  whether the money arrived. §7.1's "confirmed only after successful payment capture" is
  enforced by never trusting the browser's word for it.
- **Webhook** (§11's `razorpay-webhook`) — signature-verified, idempotent, and the authoritative
  confirmation path for when a browser is closed mid-redirect.
- **Digital access pass** (§7.1, A5) — QR encoding an HMAC-signed token, generated on the
  confirmation page so it exists the moment payment lands.
- **Host verify screen** (A5) — the arrival check the specification never had. Scans or accepts a
  typed reference, checks signature, status and time window, and records check-in.
- **Cancellation and refunds** (§7.1, A2) — the refund amount is stated before confirming, and
  computed by the same policy function that issues it.
- **Rate and review** (§7.1, A16) — opens only after the booking ends, closes after 14 days, both
  enforced by database trigger.
- **Notifications** (§9.9) — one `notify()` entry point that fans out to every channel a template
  needs and logs every attempt, so §7.1's "100% of successful bookings" is evidenceable.
- **Legal pages** (§7.4) — Terms, Privacy and Cancellation & Refunds, linked from the footer and
  from checkout. The cancellation tiers, fee, retention periods and dispute window are rendered
  from the same configuration the code enforces, so the published policy cannot drift from
  behaviour. Marked as drafts pending counsel, per §13.

### Before trusting Sprint 4/5

Get Docker running (`pnpm docker:up`, approving the elevation prompt), then:

1. `pnpm db:reset && pnpm db:check` — 58 schema assertions should still pass.
2. Sign in as a seeker, book a live listing, pay on the checkout screen, and confirm the QR pass
   appears on the booking page.
3. Sign in as that listing's host, open **Check a pass**, and type the reference — it should
   report valid and check the driver in.
4. Cancel a booking and confirm the refund shown matches what lands on the booking record.

Until that is done, the honest status of the booking loop is "written, not witnessed".

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

## Known issues

- The "session dropped" symptom seen during Sprint 1 was a **stale Next.js dev bundle**, not an
  auth problem: `__webpack_modules__[moduleId] is not a function` in the dev server log, with the
  anonymous home page returning 500. Clearing `apps/web/.next` fixes it. The production build
  was compiling cleanly throughout, which is the tell.

## Open items carried into Sprint 2

- Confirm or replace the assumption defaults, especially the platform fee (A1) and
  cancellation policy (A2) — both need to match what legal counsel publishes.
- Open the vendor accounts in spec §13, starting with Razorpay merchant KYC and the WhatsApp
  Business API, since those have the longest lead times.
- Choose the pilot city (A8) if it is not Ahmedabad.
