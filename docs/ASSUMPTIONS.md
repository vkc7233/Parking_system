# Assumptions Register

The MVP specification (`Parking_App_MVP_Preparation_Documentation.docx`) leaves the items below
unspecified. Each has been given a decided default so the build can proceed. **Every value here
is defined in exactly one place — `packages/config/src/platform.ts` — and can be changed there
without touching business logic.**

Two markers are used:

- **LEGAL** — needs counsel sign-off before go-live (spec §13, §16).
- **OWNER** — a commercial decision the Product Owner / founder should confirm (spec §15).

---

## Decision summary

| #   | Decision                                                  | Confirm by  | Bites in |
| --- | --------------------------------------------------------- | ----------- | -------- |
| A1  | 15% service fee, added on top, host paid in full          | OWNER LEGAL | Sprint 4 |
| A2  | Refund 100% ≥6h before, 50% 1–6h, 0% under 1h             | OWNER LEGAL | Sprint 5 |
| A3  | Charge hourly, capped at the daily rate per 24h window    | OWNER       | Sprint 4 |
| A4  | Capacity-aware concurrency, default capacity 1            | —           | Sprint 4 |
| A5  | HMAC-signed QR pass + a Host-side verify screen           | OWNER       | Sprint 5 |
| A6  | Typed name + checkbox + timestamp, IP, UA, agreement hash | LEGAL       | Sprint 2 |
| A7  | 30-min slots, 1h minimum, 7-day maximum, 90 days ahead    | OWNER       | Sprint 4 |
| A8  | Ahmedabad as the pilot city                               | OWNER       | Sprint 3 |
| A9  | Integer paise, UTC storage, explicit state machine        | —           | Sprint 0 |
| A10 | Unpaid bookings hold the slot for 10 minutes, then expire | —           | Sprint 4 |
| A11 | 48-hour dispute window; payouts held until it closes      | OWNER LEGAL | Sprint 6 |
| A12 | Payouts published weekly, run Mon + Thu, ₹200 minimum     | OWNER       | Sprint 6 |
| A13 | Host cancellation refunds in full and counts against them | OWNER       | Sprint 5 |
| A14 | Material edits need re-approval; price and text do not    | —           | Sprint 2 |
| A15 | OTP limits; 30-day sessions, 12 hours for Admin           | —           | Sprint 0 |
| A16 | Reviews accepted for 14 days after the booking ends       | —           | Sprint 5 |
| A17 | KYC and financial records retained 8 years; DPDP handling | LEGAL       | Sprint 7 |

---

## A1 — Platform fee

**Spec gap:** §6.1 says the total is shown "including any platform fee, shown transparently"
but never states the rate. §2.3 says the platform earns "a transaction fee on every completed
booking."

**Decision:** **15% service fee, added on top of the Host's price, charged to the Seeker.** The
Host receives 100% of their listed price; the fee is a separate checkout line item.

**Why this shape rather than host-side commission.** The spec's own top risk (§16) is host
cold-start: a marketplace with no listings has nothing to book. Supply is the bottleneck, not
demand, so the pricing should favour the side that is scarce. "You keep every rupee you ask
for" is a materially easier pitch for the City Ops lead (§15) recruiting the first 25–50 hosts
than "we take 15% of what you earn." It also makes §6.1's transparency requirement literal, and
makes the payout calculation a plain sum with no reverse-commission arithmetic.

**Why 15%.** At a typical pilot-city rate of ₹30–40/hour, 15% is ₹4.50–6.00 per hour — visible
but not deal-breaking, and in line with what Indian marketplaces charge on low-ticket
transactions. Below ~10% the unit economics do not cover payment gateway fees (roughly 2% on
UPI/cards) plus payout transfer costs plus support.

**Lever if seekers resist:** the cleanest split is to move part of the fee host-side rather
than cut it — set `feeBearer: 'host'` for full commission-style, or reduce `serviceFeeBps` and
accept thinner margin during the pilot. Both are one-line changes.

> **LEGAL — GST.** Expect two obligations that are **not modelled** in the current numbers:
> GST on the platform's service fee (likely 18%), and the e-commerce operator provisions,
> which may make the platform liable to collect TCS (1%) and, for unregistered hosts,
> potentially GST on the host's supply itself. `tax` is a distinct column on `bookings` and
> `FEE.taxBps` is a distinct config value, so introducing a rate is a config change and not a
> schema migration — but the **pricing must be re-run once counsel confirms**, because an 18%
> GST on the fee changes the Seeker's total.

## A2 — Cancellation & refund policy

**Spec gap:** §7.1 requires "a cancellation inside the free-cancellation window issues a full
refund automatically" but the window and the outside-window treatment are undefined.

**Decision — tiered on time before booking start:**

| Cancelled                           | Booking refund | Service fee refund |
| ----------------------------------- | -------------- | ------------------ |
| 6 hours or more before start        | 100%           | 100%               |
| 1 to 6 hours before start           | 50%            | 0%                 |
| Under 1 hour before start, or after | 0%             | 0%                 |

Host-initiated cancellations and Admin dispute resolutions always refund 100% regardless of
timing (see A13).

**Why not the more common 24-hour free window.** Parking is frequently booked same-day or a few
hours ahead. A 24-hour rule would make the majority of bookings non-refundable at the moment
they are made, which is a worse experience than having no cancellation policy at all. Six hours
preserves a real free window for the typical booking horizon while still protecting a Host who
has turned other business away.

**Why the fee is not refunded in the middle tier.** The platform has already done its work —
matched, collected, notified — and a late cancellation is a cost the platform absorbs. Keeping
the fee in that tier is what makes a 50% refund viable at all rather than pushing it to 0%.

> **LEGAL** — this table must match the published Cancellation & Refund Policy page (§7.4) word
> for word. Publish the page before the first paid booking, not before launch day.

## A3 — Hourly vs. daily pricing

**Spec gap:** `listings` carries both `price_per_hour` and `price_per_day` (§10) with no rule
for which applies.

**Decision:** **charge hourly, capped daily.** Billable time is the booking duration rounded up
to the slot increment (A7). The charge for any rolling 24-hour window is capped at
`price_per_day`. If `price_per_day` is null, no cap applies and the booking is purely hourly.

**Why:** one field is authoritative and the other is a discount ceiling. Hosts naturally think
of the daily rate as "the most I want to charge for a whole day," and Seekers are never charged
more than a day rate for a long stay — which is the behaviour that makes an all-day commuter
booking feel fair rather than punitive.

A database constraint enforces `price_per_day <= price_per_hour × 24`, so a daily rate can only
ever be a discount, never a surcharge.

## A4 — Capacity vs. double-booking

**Spec conflict:** `listings.capacity` (§10) implies several vehicles at once, but §7.2's
acceptance criterion says the calendar "blocks out booked time slots from being double-booked."

**Decision:** **capacity-aware concurrency.** A listing accepts up to `capacity` overlapping
bookings. `capacity` defaults to **1**, at which point the behaviour is exactly the §7.2
criterion. Both statements hold; neither is violated.

**How it is guaranteed.** Postgres `EXCLUDE` constraints can forbid _any_ overlap but cannot
express "at most N," so the rule is enforced by a trigger that takes a row lock on the listing
(`SELECT ... FOR UPDATE`) before counting overlaps. Two simultaneous checkouts for the same
listing serialise on that lock, and the second sees the first. The application performs the
same check earlier only to produce a good error message.

## A5 — Digital access pass validation

**Spec gap:** §7.1 requires the QR pass to be generated and delivered, but no screen in §7 or §8
ever _validates_ one. As specified, the pass is decorative.

**Decision — scope addition:** a Host-side **Verify Pass** screen in Sprint 5. The Host scans
the QR (or types the 8-character reference) and the system checks the signature, the booking
status, and whether the current time falls in the booked window, then records arrival.

The pass is an HMAC-signed token (booking id + validity window), not a bare booking id, so it
cannot be forged by guessing a reference. Valid from 30 minutes before start until 60 minutes
after end, so early arrivals and overruns are not turned away at the gate.

**Why it is worth the extra screen.** §5 names the single thing that would make Rohan leave:
"booking a spot that turns out to be unavailable or misdescribed on arrival." A pass nobody
checks does nothing to prevent that, and check-in data is also what tells you whether people
actually used the spots they booked — which §3 has no other way to measure.

## A6 — Host Listing Agreement e-signature evidence

**Spec gap:** §7.2 requires "a recorded, timestamped signature on file" without defining what is
recorded.

**Decision:** typed full legal name + an explicit affirmative checkbox, captured with the server
timestamp, client IP, user agent, the agreement **version**, and a **SHA-256 hash of the exact
agreement text displayed**. Stored in a dedicated append-only evidence table
(`listing_agreements`, no update or delete policy); `listings.agreement_signed_at` remains the
enforcement point a trigger checks before a listing can go live.

**Why the text hash matters.** It lets you prove _which wording_ a Host agreed to after the
agreement has been revised. Without it, a dispute about the liability-allocation clause a year
from now has no answer, because the only copy of the agreement is the current one.

> **LEGAL** — confirm this evidence set satisfies the Information Technology Act's electronic
> record requirements for the liability and indemnity clauses, or whether a licensed e-sign
> vendor (Aadhaar eSign / DSC) is required. Swapping in a vendor later does not change the
> schema — only who produces the signature blob.

## A7 — Booking granularity

**Spec gap:** unspecified throughout.

**Decision:** 30-minute slot increments; minimum booking 1 hour; maximum 7 days; bookable up to
90 days ahead; no mandatory buffer between consecutive bookings (`bufferMinutes: 0`).

**Why these numbers.** 30 minutes keeps the slot picker to a manageable number of options while
still fitting a "quick errand" booking. A 1-hour minimum stops ₹15 bookings whose payment
gateway fee eats the margin. Seven days is well past any realistic parking need and caps the
damage from a mis-set end date. The zero buffer is deliberate for MVP: back-to-back commuter
bookings on the same slot are a feature, not a conflict — introduce a buffer only if arrival
overlap turns out to be a real support burden.

## A8 — Pilot city

**Spec gap:** §16 flags the choice as a risk but leaves it open.

**Decision:** **Ahmedabad** as the placeholder. It sets the map's initial centre, the default
search radius, and the geocoding viewport bias, and nothing else in the codebase depends on it.
The seed data uses real high-parking-pressure micro-markets — Navrangpura/CG Road, Prahlad
Nagar, Ellisbridge, Bodakdev, Maninagar.

Change `PILOT_CITY` in config when the real choice is made. §16 asks that the choice be driven
by actual parking scarcity near transit hubs and commercial districts rather than convenience.

## A9 — Cross-cutting engineering defaults

Not spec gaps, but decisions taken now because retrofitting them after payments ship is
expensive:

- **Money is integer paise**, never floats. `bigint` in Postgres, `number` (paise) in
  TypeScript. Formatting to "₹1,250.00" happens only at the display edge, via `<Money />`.
- **Currency is INR**; the column exists but is constrained to INR for the MVP.
- **All timestamps are `timestamptz`, stored UTC**, rendered in `Asia/Kolkata`. India observes
  no DST, so no booking can land in a skipped or repeated hour — but storing UTC keeps that
  true if a second city in another timezone is ever added.
- **The booking state machine is explicit** — `pending_payment → confirmed → completed`, with
  `cancelled` and `payment_failed` as terminal branches — and enforced by a database trigger,
  not only by application code.
- **Vendor integrations sit behind adapter interfaces** with working fakes, so the booking loop
  is buildable and testable before Razorpay KYC and WhatsApp Business API approval clear
  (§13 lead times, §16 risk row).
- **Nothing that decides an amount of money is client-writable.** Bookings, payments and payouts
  are written only by server code holding the service-role key.

## A10 — Unpaid booking hold

**Spec gap:** §7.1 requires that "a booking is only confirmed after successful payment capture,"
which means an unpaid booking must exist while the Seeker is at the payment screen. The spec
never says what happens to it if they walk away.

**Decision:** an unpaid booking **holds its slot for 10 minutes**, then expires automatically to
`payment_failed` and releases the capacity. The availability check ignores pending bookings
whose hold has lapsed, so a slot is freed the instant it expires even if the sweep has not run
yet.

**Why this is not optional.** A `pending_payment` booking counts against capacity — it has to,
or two people could pay for the same slot simultaneously. Without an expiry, every abandoned
checkout permanently removes a slot from the marketplace. On a listing with `capacity: 1`, a
single abandoned checkout would take that listing off the market forever.

**Why 10 minutes.** Razorpay checkout sessions and UPI collect requests normally complete inside
five; ten leaves headroom for a Seeker who has to switch apps to approve a UPI mandate, without
holding a slot hostage for long. A webhook that arrives after expiry is still reconciled
correctly — the payment is refunded rather than silently kept, and the notification log records
why.

## A11 — Dispute window and the payout hold

**Spec gap:** §6.3 has Admin "monitoring the bookings and disputes queue daily" and §7.3 has
dispute management, but nothing says how long a Seeker has to complain, or how disputes interact
with paying the Host.

**Decision:** a Seeker may raise a dispute up to **48 hours after the booking's end time**. A
completed booking becomes payout-eligible only once that window has closed **and** no dispute on
it is open.

**Why this pairing is the important part.** These two rules have to be decided together. If the
Host is paid on day one and the Seeker disputes on day two, the platform is refunding money it
no longer holds and must chase a Host to claw it back — which is exactly the situation that
destroys host trust. Holding the payout for the length of the dispute window means every refund
the platform might owe is still in the platform's account when it owes it.

**Why 48 hours.** Long enough that someone who parked on Friday evening can complain on Sunday;
short enough that it does not push the payout past the §3 target of seven days (see A12 for the
arithmetic).

> **LEGAL** — the dispute window and the payout hold both belong in the Terms of Service and in
> the Host Listing Agreement. A Host needs to know before they list why their money arrives when
> it does.

## A12 — Payout cycle, cadence and minimum

**Spec gap:** §6.2 says "weekly, in the MVP" and §3 targets "payout processed within 7 days of
booking completion," but the mechanics — which bookings fall in which run, and whether tiny
amounts are worth transferring — are undefined.

**Decision:**

- **Published cycle: weekly.** That is what Hosts are told and what the Host Listing Agreement
  states.
- **Operational cadence: twice weekly, Monday and Thursday.** A run settles every booking whose
  dispute window (A11) closed before the run.
- **Minimum payout ₹200.** Below that the balance carries to the next run.
- **Force-out after 30 days.** If the oldest unpaid booking is older than 30 days, the payout
  runs regardless of the minimum, so nothing is ever stuck.

**Why run twice a week when the promise is weekly.** With a 48-hour dispute hold, a strictly
weekly run misses the §3 target: a booking completing on Sunday evening has its window close on
Tuesday, misses that week's Monday run, and waits eight days. Running Monday and Thursday caps
the worst case at about five days and makes the median about three. Promising weekly and
delivering in three days is the right way round — the reverse generates support tickets.

**Why a ₹200 minimum.** Each payout transfer costs the platform a per-transaction fee. Settling
₹40 of earnings burns a meaningful fraction of it in transfer costs, for both sides. Carrying
forward is not withholding — the money is still the Host's and is visible in the Earnings screen
as pending; it is only batched into a transfer worth making.

## A13 — Host cancellation and Seeker no-show

**Spec gap:** §7.1 covers Seeker cancellation. Nothing covers a Host cancelling a confirmed
booking, or a Seeker who books and never turns up.

**Decision:**

- **Host cancels a confirmed booking:** the Seeker is refunded 100% including the service fee,
  whatever the timing. The cancellation is recorded against the Host, and **three in a rolling
  90 days automatically pauses the listing** and raises it for Admin review.
- **Seeker no-show** (never verified a pass, booking window elapsed): the booking completes
  normally and the Host is paid in full. No automatic refund.

**Why the host-cancellation counter.** A Host who accepts bookings and then cancels is worse for
the marketplace than one who never listed — they consume a Seeker's trust and their time. §5
names this as the thing that makes Rohan leave. Instant-book (§4.2) removes the Host's chance to
decline up front, so cancellation is the only lever they have, and it needs a consequence
attached or it becomes the default behaviour.

**Why no-shows pay in full.** The Host held the space and turned away other business. This is
also the standard every parking and hospitality operator uses, so it needs no explaining.

## A14 — Re-approval when a live listing is edited

**Spec gap:** §7.3 requires Admin to "approve/reject new **or edited** listings before they go
live" without saying which edits count.

**Decision:** edits split into two classes.

| Class            | Fields                                                | Effect                                           |
| ---------------- | ----------------------------------------------------- | ------------------------------------------------ |
| **Material**     | location/address, photos, spot type, capacity         | Returns to `pending`, delisted until re-approved |
| **Non-material** | title, description, rules, prices, availability hours | Applies immediately, listing stays live          |

**Why the split.** Sending a ₹5 price change through an approval queue wastes the Admin's day
and teaches Hosts not to keep their pricing current. Changing the address or the photos changes
what the Seeker is actually buying, and that is precisely what the approval step exists to
check.

**Existing bookings are never affected by an edit.** Prices, times and amounts are copied onto
the booking row when it is created (A9), so a Host re-pricing their listing cannot change what
someone has already paid — or what they are owed.

## A15 — Authentication limits

**Spec gap:** §7.1 specifies phone-OTP login but no limits; §12 requires DPDP-aligned handling
and role-based access control.

**Decision:**

- OTP is 6 digits, valid for **10 minutes**.
- **5 send requests per phone per hour**, with a **30-second resend cooldown**.
- **5 verify attempts per code**, after which the code is burned and a new one must be requested.
- Sessions last **30 days** (rolling) for Seekers and Hosts, and **12 hours for Admin accounts**.

**Why Admin sessions are shorter.** An Admin session can trigger payouts, suspend Hosts, and read
KYC documents. A month-long session on a shared or lost laptop is a materially different risk
from a Seeker's session, and re-authenticating twice a day is a small cost against it.

**Why rate limits are listed as an assumption at all.** OTP endpoints are the standard target for
SMS-pumping fraud, where an attacker triggers thousands of sends to premium-rate numbers. The
cost lands on the platform's MSG91 bill, not the attacker's. This is cheap to add now and
expensive to discover later.

## A16 — Review window and visibility

**Spec gap:** §7.1 says the rating prompt appears after the booking's end time, but not for how
long, nor how ratings are displayed before a listing has many.

**Decision:**

- Reviews are accepted from the booking's end time until **14 days** after it.
- Reviews appear immediately — there is no moderation queue in the MVP — but Admin can hide one
  from the dispute screen.
- A listing shows its average rating only once it has at least one review, and **always shows the
  review count beside it**, so "5.0 (1)" cannot be mistaken for "5.0 (200)".

**Why 14 days.** Long enough to catch people who meant to review and forgot; short enough that
the review still reflects the visit rather than a vague memory of it.

**Why the count is not optional.** §3 tracks average rating as the trust signal for the whole
marketplace. During a pilot with 50 bookings, most listings will have one or two reviews, and an
average shown without its count is actively misleading at that sample size.

## A17 — Data retention

**Spec gap:** §12 says records are "retained per the Terms of Service and applicable financial
record-keeping requirements" without stating periods.

**Decision:**

| Data                        | Retention                              |
| --------------------------- | -------------------------------------- |
| KYC documents               | While the Host is active, then 8 years |
| Booking and payment records | 8 years from the transaction           |
| Payout records              | 8 years                                |
| Notification log            | 90 days                                |
| Admin audit log             | 8 years                                |

**Account deletion:** on request, the profile is **anonymised** — name, email and phone replaced
with tombstone values — while booking, payment and payout rows are retained for the periods
above. §12 explicitly contemplates this: records are "not deleted on user request where legally
required to retain."

**Why 8 years.** It is the longest of the plausible statutory periods for books of account under
Indian company law, so a single retention rule satisfies all of them without needing per-record
analysis.

> **LEGAL** — confirm the periods, and confirm that anonymisation-rather-than-deletion is the
> correct DPDP position for a platform with financial record-keeping obligations. This wording
> needs to appear in the Privacy Policy before go-live.

---

## Sign-off checklist

Nothing below blocks development — the defaults are live and the build runs. Each does need an
answer before real money moves.

**Product Owner / founder (OWNER):**

- [ ] A1 — is 15%, seeker-borne, the right commercial call?
- [ ] A2 — do the refund tiers match what you want published?
- [ ] A3, A7 — pricing model and slot granularity
- [ ] A5 — keep the Host-side pass verification screen, or drop it?
- [ ] A8 — is Ahmedabad the pilot city?
- [ ] A11, A12 — dispute window, payout cadence, ₹200 minimum
- [ ] A13 — host cancellation consequences

**Legal counsel (LEGAL) — engage in Sprint 0, per §16:**

- [ ] A1 — GST on the service fee, TCS, and e-commerce operator liability
- [ ] A2 — Cancellation & Refund Policy page wording
- [ ] A6 — is typed-name e-signature sufficient, or is a licensed e-sign vendor required?
- [ ] A11 — dispute window and payout hold, in both the ToS and the Host Listing Agreement
- [ ] A17 — retention periods and the anonymisation position, in the Privacy Policy
- [ ] Payment flow against the RBI Payment Aggregator Master Directions (§9.7)
