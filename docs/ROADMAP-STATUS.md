# Build status

Tracks the sprint plan in specification §14. Update the status column as work lands.

| Sprint | Focus | Status |
| --- | --- | --- |
| 0 (Week 1) | Foundation | **Complete** — see below |
| 1 (Week 2) | Host onboarding, create/edit listing, photo upload | Not started |
| 2 (Week 3) | Host Listing Agreement e-signature, Admin approval queue | Not started |
| 3 (Week 4) | Map + list search, filters, listing detail | Not started |
| 4 (Week 5) | Slot selection, availability, Razorpay Checkout, access pass | Not started |
| 5 (Week 6) | Notifications, My Bookings, cancellation + refund, rate & review | Not started |
| 6 (Week 7) | Admin dashboard, user management, disputes, payout triggering | Not started |
| 7 (Week 8) | QA bug bash, legal pages, analytics verification, launch | Not started |

## Sprint 0 — delivered

- **Monorepo** — Turborepo with `apps/web`, a placeholder `apps/mobile`, and
  `packages/{core,config,types,api-client,ui}` (spec §9.3).
- **Schema v1** — seven migrations covering all eight spec §10 entities plus the evidence and
  audit tables the acceptance criteria imply. PostGIS geography points with GiST indexes,
  RLS on every table, and lifecycle rules enforced by trigger rather than by UI.
- **Domain logic** — pricing, refunds, the booking state machine, and access-pass
  issue/verify, in `packages/core` with 36 passing tests and no framework dependency, so
  Phase 2 reuses it as-is.
- **Vendor adapters** — Razorpay, MSG91, and Google Maps, each behind an interface with a
  working fake (spec §16 lead-time risk).
- **Auth** — phone-OTP sign-up and login end to end, with role-aware route protection in
  middleware backed by RLS at the database.
- **CI** — lint, typecheck, test, build, plus a job that applies every migration to a real
  Postgres and fails the build if any public table has RLS disabled.
- **Design system basics** — Tailwind v4 tokens, `Button`, and a `Money` component that is the
  only place paise become rupees.

Verified locally: 36/36 tests pass, lint and typecheck clean across all 7 packages, production
build succeeds.

**Not yet verified:** the migrations have not been applied to a running Postgres on this
machine — Docker Desktop needs the WSL2 backend, which is not installed (`wsl --install`, then
reboot). The CI `database` job runs exactly this check on every pull request. Until then, treat
the SQL as unexecuted.

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

## Open items carried into Sprint 1

- Apply migrations against a real Postgres (blocked on Docker/WSL2 locally; CI covers it).
- Confirm or replace the assumption defaults, especially the platform fee (A1) and
  cancellation policy (A2) — both need to match what legal counsel publishes.
- Open the vendor accounts in spec §13, starting with Razorpay merchant KYC and the WhatsApp
  Business API, since those have the longest lead times.
- Choose the pilot city (A8) if it is not Ahmedabad.
