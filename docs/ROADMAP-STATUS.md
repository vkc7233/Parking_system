# Build status

Tracks the sprint plan in specification §14. Update the status column as work lands.

| Sprint     | Focus                                                            | Status                   |
| ---------- | ---------------------------------------------------------------- | ------------------------ |
| 0 (Week 1) | Foundation                                                       | **Complete** — see below |
| 1 (Week 2) | Host onboarding, create/edit listing, photo upload               | **Complete** — see below |
| 2 (Week 3) | Host Listing Agreement e-signature, Admin approval queue         | **Complete** — see below |
| 3 (Week 4) | Map + list search, filters, listing detail                       | **Complete** — see below |
| 4 (Week 5) | Slot selection, availability, Razorpay Checkout, access pass     | **Complete** — see below |
| 5 (Week 6) | Notifications, My Bookings, cancellation + refund, rate & review | **Complete** — see below |
| 6 (Week 7) | Admin dashboard, user management, disputes, payout triggering    | **Complete** — see below |
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

Verified locally: 63/63 unit tests pass, 58/58 schema checks pass, lint and typecheck clean
across all 7 packages, production build succeeds.

**Database verified.** All 8 migrations and the seed apply cleanly to Postgres 17.6 with
PostGIS. All 14 public tables have RLS enabled. `supabase/tests/schema_checks.sql` runs 58
behavioural assertions against a freshly reset database and all 58 pass — capacity limits,
checkout holds, the payout dispute hold, listing re-approval, the review window, host
suspension and the cancellation limit. Run it with `pnpm db:check`; CI runs it on every pull
request.

End-to-end through PostgREST with the anon key: the nearby search returns the live seed
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
- **Map pin** (spec §7.2 "Address (map pin)") — once an address is chosen, a draggable pin on
  real tiles, because a geocoder lands on a plot centroid or the road frontage and a parking
  entrance is often neither. Dragging moves only the coordinates, never the address text, and
  never re-runs the geocoder: reverse geocoding is billed per request, a drag emits many, and it
  would overwrite a street address the host refined by hand. Renders only when
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set; without it the address lookup still sets exact
  coordinates and the form is unchanged.
- **Closed periods** — a host closes a date range on **Calendar → Closed periods** (spec §7.2,
  §10). Opening hours answer "when am I normally open"; this answers "I am away next Tuesday",
  which hours cannot express. The database refuses a block covering a booking the seeker has
  already paid for and names the reference, so the host cancels that booking first rather than
  leaving someone to arrive at a space the host thinks is shut. Times are read and displayed in
  Asia/Kolkata regardless of the host's device, so a host abroad reads back what they typed.
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

## Sprint 3 — delivered

- **Seeker search** (§7.1, §8.1) — distance-ordered results with radius, spot type and price
  filters. Filters live in the URL, so a result set is shareable, survives a refresh, and is
  crawlable (§7.4). Applying one re-renders on the server inside a transition, so results never
  blank out.
- **Listing detail** (§7.1, §8.1) — photos, description, address, house rules, host identity and
  a transparent price breakdown showing the service fee before checkout exists (§6.1). Readable
  signed out; a paused or pending listing 404s rather than showing something unbookable.
- **My Bookings** (§8.1) — real page with upcoming/past split, replacing the 404 that the header
  had been linking to.

### Completed later, alongside the Pune pilot work

- **Destination search** (§8.1) — the screen previously centred every search on the middle of
  Pune, so "parking near Koregaon Park" could not be asked. A geocoder-backed field now sets
  the centre, with the eight Pune micro-markets §16 names offered as one-tap chips. Autocomplete
  runs as a server action, not from the browser: the Maps key never ships to the client, and
  once this is Google rather than the fixture set, a keystroke would otherwise be a billed call.
- **Time-of-arrival filter** (§8.1) — the search RPC already took a window; nothing passed one,
  so a space already taken at 7pm looked identical to a free one. Verified against the database
  that filling a listing's capacity for a window removes it from a search for that window and
  leaves it in an unfiltered one.
- **The map.** Street tiles still need a billing account (§13), but the geometry does not: pins
  placed by true bearing and distance, rings at half and full reach, tap a price to see the
  space. Longitude is scaled by cos(latitude) — raw degrees stretch the plot east-west by about
  5% at Pune's latitude, enough to reorder two pins. Tiles replace the backdrop in one file when
  they arrive. §9.6 keeps rendering outside the maps adapter precisely so these can land apart.

Slot selection, Razorpay checkout and the access pass shipped in Sprint 4.

## Sprints 4 and 5 — delivered and verified

Walked end to end in a browser against the live stack: search → book → pay → QR pass → host
verifies the pass → cancel with the refund the policy says.

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

### What the run proved

- A 2-hour booking at ₹30/hour quoted **₹60 + ₹9 fee = ₹69**, and the row stored exactly that,
  with `host_payout` at the full ₹60 (assumption A1).
- The checkout hold counted down from 10:00 (A10), and the booking confirmed only after the
  payment was verified server-side.
- The QR pass rendered with reference `57N7X3AZ`, and the host's **Check a pass** screen returned
  "Let them in — Valid. Checked in.", recording the arrival.
- A non-existent reference was refused, and a **forged signed token** was refused with "This pass
  was not issued by us" — the HMAC check doing its job (A5).
- Notifications logged SMS and WhatsApp as sent and email as **failed**, correctly, because no
  email provider is configured — the gap is visible rather than hidden (§9.9).
- Cancelling 12 minutes before arrival returned **nothing**, stated plainly before confirming,
  and recorded "Cancelled 0.2h before start" — the under-1-hour tier of assumption A2.

### Bugs the run caught

1. **Nobody could have booked anything.** The `datetime-local` input had `step="1800"` and
   `min` set to the raw current time. A browser computes step alignment relative to `min`, not to
   midnight, so with `min="15:08"` the only valid times were 15:08, 15:38, 16:08 — and every
   sensible :00 or :30 value failed constraint validation. The form then refused to submit
   **silently**: no error, no message, a real click and `requestSubmit()` both did nothing.
   Fixed by aligning `min` to the same slot grid as the values.
2. **The fake payment adapter lost orders across a dev-server reload.** Its store is in memory, so
   an order created before a hot reload was gone by the time checkout tried to capture it, and the
   failure looked like a payment bug rather than a wiring one. `simulateCheckout` now rehydrates
   from the amount the caller already holds; the captured amount is still checked against the
   booking before anything is confirmed.

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
- Choose the pilot city (A8) if it is not Pune.

## Sprint 6 — delivered

Settlement: the half of the marketplace that decides whether a Host ever lists a second space.

- **Host earnings** (`/host/earnings`, spec §7.2) — three figures rather than one balance:
  ready to pay out, still held, and paid out so far. Each is computed from the bookings
  themselves, never from a running total that could drift, which is what §7.2's acceptance
  criterion asks for. The per-booking badge is derived from the same `isPayoutEligible` the
  payout run uses, so a booking can never read as "held" here while the Admin screen offers
  to pay it.
- **Admin payout run** (`/admin/payouts`, spec §6.3 step 3, §7.3) — per-host amounts owed, how
  old the oldest is, and their KYC state, because §6.3 asks an Admin to exercise judgement
  before releasing money. Sending is confirm-then-act.
- **Double-pay is impossible by construction** — §7.3's criterion is that a payout cannot be
  triggered twice for the same booking. That is a `UNIQUE` constraint on
  `payout_bookings.booking_id`, not an `if` in the action, so a double-click, a retry and two
  Admins clicking at once all end with one payout and a failed second attempt.
- **Disputes** — a Seeker raises one from their own booking within the 48-hour window (A11),
  through their own session so RLS applies. The Admin queue leads with the facts the decision
  turns on: what they said, what is at stake, and whether the access pass was ever scanned.
  Resolving in the Seeker's favour refunds through the payments adapter and records the
  reasoning in the audit log.
- **The hold is real** — earnings on a disputed booking are excluded from
  `unpaid_host_earnings` for as long as the dispute is open, so the Admin decision always
  precedes the money.

### Verified against the live stack

Not just type-checked — driven in a browser against the running database:

- Admin signed in, `/admin/payouts` showed Meena Kulkarni owed ₹270 across 2 bookings, KYC
  verified, "above the minimum". Sending it produced `pout_fake0000000001`, status `paid`,
  the queue emptied, and `admin_audit_log` recorded `process_payout` with the amount and
  booking count.
- A Seeker raised a dispute on a booking that ended an hour earlier; the Admin queue showed it
  with "Checked in — Never scanned". Resolved with a refund: `rfnd_fake0000000001`, payment
  moved to `refunded`, `refunded_amount` 10350, and Meena is now owed 0 — the refunded booking
  never becomes payable.

Two defects this found, neither of which typecheck or unit tests could have:

- **The earnings query crashed on every host.** PostgREST decides an embed's shape from the
  constraint behind it: `disputes.booking_id` is not unique so it returns an array, but
  `payout_bookings.booking_id` _is_ unique — that is the double-pay guard — so it returns an
  object or `null`. Reading `.length` off it threw.
- **No refund could be processed locally.** The fake payments adapter holds its state in
  memory, so any payment made before the last dev-server reload was unknown to it and every
  refund failed at the provider. That silently made cancellation refunds and dispute refunds —
  the two paths most worth exercising — untestable. The adapter now rehydrates from the amount
  our own `payments` row recorded, keeping the over-refund cap.

## Pune pilot and interface pass

The platform now names its pilot city everywhere it matters, and the seeker screens were
measured on the device seekers use.

- **Pune throughout** — `PILOT_CITY` centres on Shivajinagar with a 5 km default radius, the
  geocoder fixture holds fourteen real Pune localities chosen for genuine parking pressure, and
  the seed describes six spaces across the micro-markets at ₹25–₹60/hour.
- **Mobile.** On a 375px viewport the first search result sat at y=812 — exactly one screen
  down. The eight area chips wrapped into a 244px block and "List your space" wrapped onto three
  lines in the header. Chips became one scrolling row, the header carries short labels below
  `sm`, and the hero steps down. First result now lands at y=466, with no horizontal overflow on
  the search, listing or booking screens.
- **Photos.** A grid of identical grey "No image" boxes reads as a broken page rather than a new
  marketplace, and early listings will have no photo for days. Both cases a seeker cannot tell
  apart — no photo row, and a photo row whose object no longer loads — now draw the same artwork
  for the spot type.
- **Directions.** The listing page printed raw coordinates, which is developer output dressed as
  information. Both the listing and the access pass now link into the seeker's own maps app, by
  coordinates rather than address: these are unmarked bays inside gated societies, which address
  search routes to the wrong side of the block often enough to matter.

## Sprint 7 and the design pass

### Product analytics (§7.4, §3)

§7.4 asks that "every funnel step in Section 3's metrics has a corresponding tracked event".
Each of §3's six metrics now maps to named events, and `packages/api-client` holds a test that
transcribes the metrics table — delete an event because nothing appears to use it and the test
fails naming the metric that goes dark.

Three decisions worth recording:

- **The event names are a closed union, not strings.** A funnel is only as good as the spelling;
  one `bookingStarted` among a million `booking_started` makes the completion rate quietly wrong
  with nothing failing anywhere.
- **`track()` can never throw or block.** A lost event costs a slightly wrong denominator; a
  thrown one costs a booking. The guard is in the wrapper so no call site can forget it.
- **`payment_completed` fires server-side, after the provider confirms.** A browser-side event
  would count bookings that a closed tab or a failed capture never completed, and §3's headline
  metric would read high.

The default adapter is the in-memory fake, so CI never posts fabricated data into the real
project. PostHog is reached over its HTTP capture API — no SDK, no third-party script on a
checkout page.

### Screens completed from §8

- **Profile & Settings** (§8.1, §8.2 — one screen, per §8.4's one-account rule). Saved payment
  methods are described as what they are: held by Razorpay, never seen by this platform. An
  empty "no cards saved" panel would imply a broken feature rather than a deliberate design.
- **Host bookings calendar** (§8.2). Four weeks of arrivals with times and references rather
  than a month grid — a host's real question is "is anyone coming and when", which a grid of
  numbered boxes answers only after you click one. Quiet days collapse to a single line, and
  `?listing=` narrows to one space.
- **Admin reports with CSV export** (§7.3, §8.3). Totals are shown on screen before the download,
  because an export you must open in Excel to sanity-check is one nobody sanity-checks.

### SEO (§7.4)

`sitemap.xml`, `robots.txt` and real metadata. The eight Pune area pages carry a higher priority
than individual listings on purpose: "parking in Koregaon Park" is the search people run, and a
single listing ranks for nothing on its own.

### Two defects the acceptance criteria caught

- **The CSV did not reconcile with the dashboard**, which is precisely what §7.3 requires. The
  screen defaulted its end date to _now_ while the download link carried today's date, which the
  route parsed as end-of-day — so a booking later that evening appeared in the export and not in
  the totals it was supposed to match. The period, the status filter and the query now live in
  one module both consumers import.
- **The sitemap shipped empty.** It read cookies through the server client, which throws during
  a static build, and the catch around it turned that into a sitemap containing no listings —
  indistinguishable from a working one until rankings quietly fail to appear. It reads with an
  anonymous client now, and logs loudly when it cannot.

### The design pass

The palette is two-note and the second note is rationed. Indigo carries everything the platform
does on the seeker's behalf; amber means scarcity or money owed — "1 left", a payout waiting, a
document unreviewed — and nothing else may use it, which is what makes it register.

One infrastructure note that cost an hour: Tailwind v4 auto-detects sources from the app and
skips `node_modules`, where the workspace packages are symlinked. Any utility used **only**
inside `packages/ui` was therefore never generated — the class lands in the HTML, matches no
rule, and the component renders unstyled with nothing failing anywhere. The `@source`
declarations at the top of `globals.css` are what make the shared component library shareable.

### Error tracking (§7.4)

§7.4 asks for "automatic capture of application errors in production". The word doing the work
is _automatic_: reporting from each `catch` only ever covers the failures someone remembered to
wrap. Capture is wired to Next's `onRequestError` instrumentation hook instead, which sees every
uncaught error from server components, server actions, route handlers and middleware alike.

No Sentry SDK. `@sentry/nextjs` installs a build plugin, wraps the server runtime and ships a
client bundle — a large amount of machinery for one criterion that a single JSON POST to the
Store endpoint satisfies. If distributed tracing is wanted later, `errors.sentry.ts` is the one
file that changes.

Two rules the adapter enforces:

- **It cannot throw.** The caller is already in a failure path; an exception raised while
  reporting replaces a handled error with an unhandled one and loses the original — the thing
  actually worth knowing. Requests are capped at two seconds and failures are swallowed.
- **It never carries a phone number or an email**, only the platform user id. Otherwise the
  error tracker accumulates a second copy of the user directory, in a third-party system chosen
  for debugging rather than for holding personal data (§12, and the DPDP obligations §7.4 is
  drafted against).

A malformed DSN falls back to the console adapter rather than throwing, so a typo in an
environment variable costs error reporting and not the ability to boot.

**Verified end to end.** A deliberately throwing route was added, hit, and removed: the hook
fired and the adapter recorded `[error-tracking] [App Router:route] instrumentation smoke test`
with the route path and method as tags. With a DSN set, that same call POSTs to Sentry.

### QA pass

Against a freshly reset database:

- 59 of 59 schema behaviour checks pass — capacity limits, checkout holds, the payout dispute
  hold, listing re-approval, the review window, host suspension and the cancellation limit.
- 101 unit tests, lint, typecheck and the production build are green.
- The booking loop was walked in a browser: sign in by OTP, open a listing, pick a slot (no
  `stepMismatch` — the bug that once made booking impossible), hold the slot, pay, and land on a
  confirmed booking with its QR pass. Cancellation quoted ₹35.00 of ₹80.50 for a booking four
  hours out, which is the A2 tier applied to the subtotal with the service fee retained.
- The host pass check was run on that booking and correctly refused it: **"Do not let them in —
  this booking has not started yet."** The pass is valid only from shortly before arrival, so a
  driver turning up four hours early is not admitted.
- Every screen measured at 1265px and 375px: no horizontal overflow, no element past the
  viewport, correct active navigation tab.

**Still open for launch:** pointing `NEXT_PUBLIC_SENTRY_DSN` at a real Sentry project and
confirming the first event lands there, and a device-matrix pass on real handsets — neither is
something local verification can stand in for.

## Spec audit, 9 September 2026

Every Must and Should feature in §7, and every screen in §8, was checked against what is
actually built rather than against what the commit messages claimed. This section is the honest
state afterwards. The headline: **a green build had been hiding four Must-feature failures**,
none of which broke anything visibly.

### Fixed

| Failure                                                                                                                                              | Criterion it broke                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A host could not pause, reprice or edit a live listing — RLS required `approved_by is null` and approval sets it                                     | §7.2 "pausing a listing immediately removes it from Seeker search results"; A14            |
| A booking refunded through a dispute was still paid to the host — the platform paid both sides                                                       | §7.2 "earnings total always matches the sum of completed, non-refunded bookings"           |
| Nothing ever moved a booking to `completed`; the sweeps were scheduled only in a README sentence, so no review ever opened and no host was ever paid | §7.1 "a completed booking correctly moves from upcoming to past automatically at end time" |
| Published opening hours were never enforced — a 02:00 booking was accepted on an 07:00–23:30 listing                                                 | §7.2 available hours                                                                       |
| Money was summed by fetching rows, which PostgREST truncates at 1000 silently                                                                        | §7.3 export reconciliation; §12 volumes                                                    |
| "Paid out so far" counted payouts that had **failed**                                                                                                | §7.2 earnings                                                                              |
| No admin screen showed booking status with the provider payment reference; no admin could cancel                                                     | §7.3 "every booking's status and payment reference visible from one screen"                |
| `/host/suspended` did not exist, so a suspended host got a 404 on every host page                                                                    | §7.3                                                                                       |
| No support contact existed, while the Terms claimed one was "linked from the app"                                                                    | §7.1 basic support contact                                                                 |
| Client-side errors reached no tracker; `assertProvidersConfigured()` was never called                                                                | §7.4 error tracking                                                                        |
| The booking page threw once a booking had a second dispute                                                                                           | —                                                                                          |
| Checkout had no legal links; the host calendar showed no past bookings; no min-price filter or sort control                                          | §7.4 legal; §7.2 calendar; §7.1 filters                                                    |

Eleven regression checks were added to `supabase/tests/schema_checks.sql` (70 total). Every one
of these defects passed a green build, so the checks are the point, not the fixes.

### Still blocked on vendor credentials — adapters ready, client halves absent

These are not oversights; each is waiting on an account named in §13, and the server side of
each is already written and tested against a fake.

- **Razorpay Checkout (§7.1, Must).** Order creation, capture verification and the webhook are
  complete. The browser half — loading `checkout.razorpay.com` and opening the widget — is not
  written, so against a real provider nothing can currently be paid. Needs the merchant account.
- **Razorpay payouts (§7.3, Must).** `createPayout` sends the platform's host id as
  `fund_account_id`, which is not a Razorpay fund account. Host bank details are captured as an
  uploaded document, so there is no structured account/IFSC and no contact/fund-account creation
  step. Needs the RazorpayX account, and a structured bank-details form.
- **MSG91 delivery (§7.1, Must).** `createNotificationsAdapter` hard-codes empty template maps,
  so with `NOTIFICATIONS_PROVIDER=msg91` every SMS and WhatsApp send throws
  `template_not_approved`, and the email branch always throws — there is no transactional email
  provider at all. Needs DLT and WhatsApp template approval, and an email provider decision.
  `booking_reminder` and `review_request` templates exist and are never sent.
- **Google Maps tiles (§7.1, Must).** `result-map.tsx` draws real geometry with no street tiles,
  and the listing form captures coordinates without a map. Needs the billing account.

### Known deviations, accepted

- **§11's Edge Functions are Next.js server actions and a route handler.** Functionally
  equivalent and service-role gated. Worth restating in the spec rather than rewriting the code.
- **The Maps key is `NEXT_PUBLIC_`**, so it reaches the browser. That is required for the
  JavaScript SDK and is why Google restricts keys by HTTP referrer instead. An earlier note in
  this file implied otherwise.
- **Refunds are netted off the host's share**, not split between the host payout and the
  platform fee. Conservative and exact for the only flow that refunds a completed booking; a
  partial refund meant to come out of the fee alone would need the split recorded on the booking.

---

## Blocked features completed, 11 September 2026

The 9 September audit above listed four Must features as blocked. Three of the four were not
actually blocked on a vendor — they were blocked on code nobody had written — and are now done.
The audit section is left as it was written; this records what changed after it.

### A failed payout no longer strands the host's money

`unpaid_host_earnings` excludes any booking attached to a payout **regardless of that payout's
status**. Correct while a failed transfer is unresolved; catastrophic without a way out. Measured
in a rolled-back transaction before the fix: a host owed 54000 paise, one payout marked `failed`
with its line item attached — `unpaid_host_earnings` returned nothing, and
`hosts_with_unpaid_earnings` did not list the host at all. The money was invisible on every
screen, permanently.

`processHostPayout` already promised "an admin retries it explicitly". No such control existed.
There is now a **Failed transfers** card on `/admin/payouts` with a count on the nav tab, and
`void_failed_payout` returns the bookings to the queue in one transaction.

Retrying the same payout row is impossible by design and the code now says so: the row id is the
RazorpayX idempotency key, so a repeat call replays the stored failure. Paying again is a new
payout row with a new key, re-checked against eligibility, the minimum and the bank account.

### Hosts can close a date

`availability_blocks` had been honoured by the booking trigger, the slot function and search since
the first listings migration, and nothing ever wrote to it. **Calendar → Closed periods** does.

The database gap that only mattered once a screen existed: blocks stopped new bookings, and
nothing stopped a block covering a booking that already existed. A trigger now refuses that and
names the booking reference. Completed stays are exempt, so old dates can still be tidied up.

Times are read and displayed in `Asia/Kolkata` rather than the browser's zone — the host most
likely to need this screen is the one who is abroad. The seed had the same bug: `date_trunc('day',
now())` truncates to midnight UTC, so the seeded maintenance window read as 2:30pm–11:30pm.

### The listing form has a map pin (§7.2, Must)

Previously coordinate capture only. A geocoder lands on a plot centroid or the road frontage, and
a parking entrance is often neither — sixty metres and one turn away, which is the difference
between a seeker arriving and a seeker phoning the host.

Dragging never re-runs the geocoder: reverse geocoding is billed per request, a drag emits many,
and it would overwrite a street address the host refined by hand. **Verified only on the no-key
path locally** — the map itself needs a billable Maps key.

### Transactional email exists (§7.1, §9.9, Must)

The audit's "there is no transactional email provider at all" is fixed. `EmailSender` is a
one-method interface with a Resend implementation, injected into the notification adapters rather
than folded into MSG91, because it genuinely is a different vendor account.

Verified end to end on the running app: a real booking wrote
`email / booking_confirmed / sent / email_fake_1` to `notification_log`, where the provider id
comes from the email sender rather than the notification adapter — before this it read
`failed / Email provider not configured`.

The fake notification adapter accepts a real email sender on purpose. DLT and WhatsApp approval
take one to three weeks; verifying an email sending domain takes hours. `EMAIL_PROVIDER=resend`
with notifications still faked sends real email through the real path weeks before SMS can be
tested at all.

### The notification run is scheduled, not just documented

`/api/cron/notifications` existed and nothing called it. `booking_reminder` and `review_request`
are the only two messages no user action triggers, so an unscheduled route meant neither had ever
been sent in production.

Two schedulers ship, and only one is enabled: `apps/web/vercel.json` for a Vercel deployment, and
`.github/workflows/notifications-cron.yml` as the portable fallback. The workflow skips rather
than fails when its secrets are absent, so an unconfigured repository does not collect a red X
every fifteen minutes.

Verified against the running app: no header and a wrong header both return 404 (the deliberate
"a wrong secret looks like a wrong URL" behaviour), the correct header returns
`{"reminders":0,"reviews":0}`, and with a confirmed booking 90 minutes out the first call returned
`{"reminders":1,...}` and the second `{"reminders":0,...}` — idempotent, which is what makes a
scheduler's retry-on-timeout safe.

---

## The last three open items, closed — 11 September 2026

### The webhook now reverts, without breaking retries

§11 asks `razorpay-webhook` to "confirm or revert the booking accordingly". It only ever
confirmed. The obvious fix — fail the booking on `payment.failed` — would have been worse than
the gap:

`payment.failed` fires per **attempt**, not per order. Razorpay Checkout lets the same order be
retried with another card, and `payment_failed` is a terminal booking status (the transition
trigger allows nothing out of it). Failing on attempt one would leave a seeker who then succeeds
with a captured payment and a booking that can never be confirmed — money taken, nothing given.
Releasing the slot on a decline is also hostile: reaching for a second card and finding the space
gone.

So: every failed attempt records the provider's reason on the payments row, the slot stays held
while a retry is possible, and the booking is reverted only once the hold has lapsed. The part
that was genuinely missing was the recording — `payments.failure_reason` existed and nothing ever
wrote it, so neither the seeker nor support could say why a payment had not worked. The checkout
screen now says, and tells them the space is still held.

Exercised against the running app with signed payloads: declined-while-held returns
`{recorded, retryable}` and leaves the booking payable; declined-after-lapse returns
`{recorded, reverted}`; a retry then **confirms the held booking**; an unknown order, a stale
failure arriving after capture, and a forged signature are each handled. The transition this
depends on is pinned in `schema_checks.sql`.

### The support number cannot ship as a placeholder

It is now `NEXT_PUBLIC_SUPPORT_WHATSAPP`, normalised from whatever shape someone pastes, and a
**production boot throws** while it is unset. §7.1's five-minute criterion cannot be met by a
number that reaches nobody, and the old failure was silent.

Read with dot notation, not `process.env['...']` — Next only substitutes the literal text into
the client bundle, so bracket access would have left the server with the real number and the
browser with the placeholder. Verified in the browser: `+91 98220 11223` reached the client as
`919822011223`. Eleven tests pin the formats.

### The map pin is verified, short of billable tiles

Driven in the browser against a stubbed Maps API: the component builds the map at zoom 18 with
cooperative gestures, creates a **draggable** marker, and registers both `dragend` and map
`click`. Dragging 0.0018° north reported "Pin moved 200 m"; tapping reported 109 m; the hidden
`lat`/`lng` the form posts followed both. The address text was unchanged by either gesture, which
is the design promise — the pin moves coordinates, never the address.

What remains unexercised is Google's own tile rendering, which needs a billable key.
