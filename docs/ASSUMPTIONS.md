# Assumptions Register

The MVP specification (`Parking_App_MVP_Preparation_Documentation.docx`) leaves the items
below unspecified. Each has been given a working default so the build can proceed. **Every
value here is defined in exactly one place — `packages/config/src/platform.ts` — and can be
changed there without touching business logic.**

Items marked **LEGAL** need counsel sign-off before go-live (spec §13, §16).

---

## A1 — Platform fee

**Spec gap:** §6.1 says the total price is shown "including any platform fee, shown
transparently" but never states the rate. §2.3 says the platform earns "a transaction fee on
every completed booking."

**Default:** **15% service fee, added on top of the Host's price, charged to the Seeker.**
The Host receives 100% of their listed price; the fee is a separate line item at checkout.

**Why this shape:** it makes §6.1's transparency requirement literal (the Seeker sees exactly
what the Host charges and what the platform charges), and it makes the payout calculation in
`trigger-payout` a plain sum of host subtotals with no reverse-commission arithmetic.

**Alternative if you prefer host-side commission:** set `feeBearer: 'host'` in config — the
booking total then equals the Host's price and the fee is deducted at payout instead.

> **LEGAL — GST.** Whether the service fee attracts GST, at what rate, and whether the
> platform is liable to collect tax on the Host's supply under the e-commerce operator
> provisions is not modelled here. `tax` is a distinct field on `bookings` so a rate can be
> introduced without a schema change.

## A2 — Cancellation & refund policy

**Spec gap:** §7.1 requires "a cancellation inside the free-cancellation window issues a full
refund automatically" but the window and the outside-window treatment are undefined.

**Default — tiered on time before booking start:**

| Cancelled                                 | Refund                                   |
| ----------------------------------------- | ---------------------------------------- |
| 6 hours or more before start              | 100% (booking + service fee)             |
| 1 to 6 hours before start                 | 50% of booking, service fee not refunded |
| Under 1 hour before start, or after start | 0%                                       |

Host-initiated cancellation and Admin dispute resolution always refund 100% regardless of
timing.

**Why not the more common 24h free window:** parking is frequently booked same-day or a few
hours ahead, so a 24-hour rule would make most bookings non-refundable at the moment they are
made. 6 hours preserves a real free window for the typical booking horizon.

> **LEGAL** — this must match the published Cancellation & Refund Policy page (§7.4).

## A3 — Hourly vs. daily pricing

**Spec gap:** `listings` carries both `price_per_hour` and `price_per_day` (§10) with no rule
for which applies.

**Default:** **charge hourly, capped daily.** Billable hours are the booking duration rounded
up to the slot increment (A7). The charge for any rolling 24-hour window is capped at
`price_per_day`. If `price_per_day` is null, no cap applies and the booking is purely hourly.

**Why:** one field is authoritative (`price_per_hour`), the other is a discount ceiling. Hosts
set the daily rate as "the most I want to charge for a full day," which is how they naturally
think about it, and Seekers are never charged more than a day rate for a long booking.

## A4 — Capacity vs. double-booking

**Spec conflict:** `listings.capacity` (§10) implies a listing can hold several vehicles at
once, but §7.2's acceptance criterion says the calendar "blocks out booked time slots from
being double-booked."

**Default:** **capacity-aware concurrency.** A listing accepts up to `capacity` overlapping
confirmed bookings. `capacity` defaults to **1**, at which point the behaviour is exactly the
§7.2 criterion. Both statements hold; neither is violated.

The availability check counts confirmed, non-cancelled overlapping bookings and rejects when
that count has reached `capacity`. This is enforced in the database, not just the UI (see A9).

## A5 — Digital access pass validation

**Spec gap:** §7.1 requires the QR pass to be generated and delivered, but no screen in §7 or
§8 ever _validates_ one. As specified, the pass is decorative.

**Default — scope addition:** a Host-side **Verify Pass** screen is added in Sprint 5. The
Host scans the QR (or types the 8-character booking reference) and the system checks the
signature, the booking status, and whether the current time falls inside the booked window,
then records arrival.

The pass payload is an HMAC-signed token (booking id + expiry), not a bare booking id, so a
pass cannot be forged by guessing a reference.

**This is beyond the documented scope.** It is small, and without it the pass proves nothing
on arrival — which is the exact failure Rohan's persona (§5) names as the reason he would
leave. Flagged rather than assumed: say the word and it comes out.

## A6 — Host Listing Agreement e-signature evidence

**Spec gap:** §7.2 requires "a recorded, timestamped signature on file" without defining what
is recorded.

**Default:** typed full legal name + an explicit affirmative checkbox, captured together with
the server timestamp, client IP, user agent, the agreement **version**, and a **SHA-256 hash
of the exact agreement text that was displayed**. Stored in a dedicated evidence table; the
spec's `listings.agreement_signed_at` column is retained as the enforcement point.

**Why the text hash:** it lets you prove _which wording_ a Host agreed to after the agreement
has been revised — the part that actually matters in a dispute.

> **LEGAL** — confirm this satisfies the Information Technology Act's electronic-record
> requirements for the liability-allocation clauses, or whether a licensed e-sign vendor
> (Aadhaar eSign / DSC) is required. Swapping in a vendor later does not change the schema.

## A7 — Booking granularity

**Spec gap:** unspecified throughout.

**Default:** 30-minute slot increments; minimum booking 1 hour; maximum booking 7 days; no
mandatory buffer between consecutive bookings on the same slot (`bufferMinutes: 0`).

## A8 — Pilot city

**Spec gap:** §16 flags the choice as a risk but leaves it open.

**Default:** **Ahmedabad** as the placeholder — it sets the map's initial centre, the default
search radius, and the geocoding viewport bias. Nothing else in the codebase depends on it.
Change `pilotCity` in config when the real choice is made.

## A9 — Cross-cutting engineering defaults

Not spec gaps, but decisions taken now because retrofitting them after payments ship is
expensive:

- **Money is stored as integer paise**, never floats. All amounts are `bigint` in Postgres and
  `number` (paise) in TypeScript. Formatting to "₹1,250.00" happens only at the display edge.
- **Currency is INR**; a `currency` column exists but is fixed to INR for the MVP.
- **All timestamps are `timestamptz`, stored UTC**, rendered in `Asia/Kolkata`.
- **Booking state machine is explicit**: `pending_payment → confirmed → completed`, with
  `cancelled` and `payment_failed` as terminal branches. Illegal transitions are rejected by a
  database trigger, not only by application code.
- **Availability is enforced by a Postgres exclusion constraint**, so a race between two
  simultaneous checkouts cannot produce an overbooking even if the application check passes for
  both. The application check exists for a good error message; the constraint is the guarantee.
- **Vendor integrations sit behind adapter interfaces** (`packages/api-client/src/adapters`)
  with working fake implementations, so the whole booking loop is buildable and testable before
  Razorpay KYC and the WhatsApp Business API approval clear (§13 lead times, §16 risk row).
