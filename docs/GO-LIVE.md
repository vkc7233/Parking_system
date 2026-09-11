# Go-live checklist

Everything in this document is a task for **you**, not for the codebase. All the code is written
and tested against working fakes; what remains is accounts, credentials, and two approvals that
take real-world time.

Read the "Start these today" section first — two of those have multi-week waits and nothing you
do later can shorten them.

---

## Start these today (they have waiting periods)

| #   | What                                          | Where                                                             | Typical wait               |
| --- | --------------------------------------------- | ----------------------------------------------------------------- | -------------------------- |
| 1   | **DLT registration + SMS template approval**  | [trai.gov.in DLT portal](https://smsheader.trai.gov.in) via MSG91 | **1–3 weeks**              |
| 2   | **WhatsApp Business API + template approval** | MSG91 dashboard → WhatsApp                                        | **1–2 weeks**              |
| 3   | **Razorpay merchant account (KYC)**           | [dashboard.razorpay.com](https://dashboard.razorpay.com)          | 2–5 working days           |
| 4   | **RazorpayX Payouts activation**              | Razorpay dashboard → RazorpayX                                    | Separate approval, ~1 week |
| 5   | **Email sending-domain verification**         | [resend.com](https://resend.com) → Domains                        | Minutes to a few hours     |
| 6   | **Legal review of the three policy pages**    | Your counsel                                                      | Depends on them            |

Nothing else on this list is blocked by anyone but you.

---

## 1. Razorpay Checkout — taking money

**What is already built:** order creation, server-side capture verification, the signed webhook,
the browser Checkout widget, refunds. The full loop runs today against a fake.

**What you do:**

1. Complete Razorpay KYC. You need: PAN, GST (if registered), bank account, and a website URL
   that shows your Terms, Privacy and Cancellation pages — they check these, which is why those
   pages must be live before you apply.
2. From **Settings → API Keys**, generate a key pair. You get `rzp_live_xxxx` and a secret shown
   **once**.
3. From **Settings → Webhooks**, add a webhook:
   - URL: `https://YOUR-DOMAIN/api/webhooks/razorpay`
   - Events: `payment.captured`, `payment.failed`
   - Copy the webhook secret it generates.
4. Set these environment variables:

```bash
PAYMENTS_PROVIDER=razorpay
RAZORPAY_KEY_ID=rzp_live_xxxxxxxx
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_xxxxxxxx   # same value, and it is meant to be public
RAZORPAY_KEY_SECRET=xxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxx
```

> `NEXT_PUBLIC_RAZORPAY_KEY_ID` is the _same string_ as `RAZORPAY_KEY_ID`. It is duplicated on
> purpose: the browser widget needs the key id to identify the merchant, and marking it
> `NEXT_PUBLIC_` makes that explicit rather than accidental. **Never** add `NEXT_PUBLIC_` to the
> secret.

**How you know it worked:** make one real ₹1 booking. The booking should reach `confirmed` and
the payment id on `/admin/bookings` should match what you see in the Razorpay dashboard. If the
app boots and immediately crashes with "NEXT_PUBLIC_RAZORPAY_KEY_ID is not set", that is the
guard working — set it.

**Code, if you need it:** [`razorpay-checkout.tsx`](../apps/web/src/app/bookings/[id]/checkout/razorpay-checkout.tsx),
[`payments.razorpay.ts`](../packages/api-client/src/adapters/payments.razorpay.ts).

---

## 2. RazorpayX — paying hosts

**What is already built:** the bank-details form, Contact + Fund Account creation, the payout run
with its double-pay guard, and the admin screen that refuses to pay a host with no registered
account.

**What you do:**

1. Activate **RazorpayX** in the Razorpay dashboard. This is a _separate_ approval from Checkout —
   applying for one does not start the other.
2. Fund the RazorpayX account. Payouts come from that balance, not from your Checkout settlements.
3. Find your RazorpayX **account number** (dashboard → RazorpayX → Account Details). It is a
   long numeric string, not your bank account.
4. Set:

```bash
RAZORPAY_PAYOUT_ACCOUNT_NUMBER=2323230000000000
```

**Then tell your hosts to register a bank account** at **Host → Onboarding → "Where we send your
money"**. Until a host does this, `/admin/payouts` shows them as **"No bank account"** and the Pay
button is disabled — deliberately, because a payout with no destination fails at the bank days
later instead of on screen.

> **On security:** the account number a host types is sent to Razorpay and **never stored by this
> platform**. We keep only the fund account id, the last four digits and the IFSC. If you are ever
> asked in a security review, `host_bank_accounts` has no column that could hold a full account
> number — that is verifiable, not a claim.

**Code:** [`bank-actions.ts`](../apps/web/src/app/host/onboarding/bank-actions.ts),
[`admin/payouts/actions.ts`](../apps/web/src/app/admin/payouts/actions.ts).

### When a transfer fails

Transfers do fail — a closed account, a wrong IFSC, a bank outage. When one does, the money is
held against the failed payout and **deliberately does not re-queue itself**, because re-queueing
a transfer that actually settled would pay the host twice.

It shows up in two places: a count on the **Payouts** tab in the admin navigation, and a **Failed
transfers** card at the top of `/admin/payouts`. Until someone clears it, that money is in neither
the payout queue nor the host's earnings screen, so the badge is the only thing telling you it
exists. Check it.

To clear one:

1. Open the transfer in your **RazorpayX dashboard** and confirm whether money actually left the
   account. This is the part only a human can do, and it is the whole reason the button asks you
   what you checked.
2. If nothing left: click **Return to queue**, type what you confirmed, and confirm. The bookings
   go back into "Owed to hosts" and you can pay them again with the ordinary **Pay** button.
3. If money _did_ leave despite the failure status, do **not** return it to the queue. Leave it,
   and reconcile with Razorpay support.

Fix the cause first — usually the host's bank details — or the second attempt fails the same way.

Paying again always creates a **new** payout; there is no retry of the old one. That is not an
omission: the payout row's id is sent to RazorpayX as the idempotency key, so a second call on the
same row would return the stored failure rather than attempting a transfer.

---

## 3. MSG91 — SMS, WhatsApp and OTP

**What is already built:** the adapter, the template bodies, per-template channel routing, and
the two scheduled messages (reminder and review request).

**What you do:**

1. Create an MSG91 account and get the **auth key**.
2. Register a **sender id** (6 characters, e.g. `PARKNG`) on the DLT portal.
3. Register each **SMS template** on DLT. The exact wording must match what the app sends — copy
   the bodies from [`notifications.ts`](../packages/api-client/src/adapters/notifications.ts)
   (`TEMPLATE_BODIES`). DLT rejects a template whose text differs even slightly from what you
   send, including punctuation.
4. Each approved template gives you a numeric **template id**. Collect them.
5. Do the same for WhatsApp templates in the MSG91 dashboard.
6. Set:

```bash
NOTIFICATIONS_PROVIDER=msg91
MSG91_AUTH_KEY=xxxxxxxx
MSG91_SENDER_ID=PARKNG
MSG91_OTP_TEMPLATE_ID=xxxxxxxx
MSG91_WHATSAPP_NUMBER=919000000000

# template=value pairs, comma-separated. Add each one as it clears approval.
MSG91_SMS_TEMPLATE_IDS=booking_confirmed=1707160000000000000,booking_cancelled=1707160000000000001,booking_refunded=1707160000000000002,payout_processed=1707160000000000003,listing_approved=1707160000000000004,listing_rejected=1707160000000000005
MSG91_WHATSAPP_TEMPLATES=booking_confirmed=booking_confirmed_v1,booking_reminder=booking_reminder_v1,review_request=review_request_v1
```

> **You do not need all of them at once.** Templates clear approval one at a time and out of
> order. A partial map is the normal state: an unmapped template fails on that channel and every
> other message keeps working. Add each pair as approval lands — no code change, no deploy of
> anything but the variable.

**The template names on the left** must be exactly these:
`booking_confirmed`, `booking_reminder`, `booking_cancelled`, `booking_refunded`,
`listing_approved`, `listing_rejected`, `payout_processed`, `review_request`.

**Still open, and it is a decision not a task:** there is **no transactional email provider**.
The email channel throws if anything routes to it. Today nothing does — every template routes to
SMS or WhatsApp — so this is not blocking launch, but booking receipts by email will need a
provider chosen (Resend, SES, Postmark) and an adapter written.

---

## 4. Transactional email — receipts by mail

§7.1 asks for "SMS/WhatsApp + email". SMS and WhatsApp come from MSG91; email is a separate
provider, and the code ships with [Resend](https://resend.com).

**Until you do this, email fails.** Not silently — every attempt is written to
`notification_log` with the reason, so the gap is visible rather than invisible. SMS and WhatsApp
still carry the message, so nothing is lost; recipients just get no email copy.

1. Create an account at **https://resend.com/signup** (free tier is 3,000 emails/month, enough
   for a pilot).
2. Go to **Domains → Add Domain** and enter the domain you send from, e.g. `yourdomain.in`.
3. Resend shows DNS records (an MX, a `TXT` for SPF, and `TXT` records for DKIM). Add them at
   your domain registrar, then click **Verify**. This usually takes minutes, occasionally an
   hour.

   > You cannot skip this. Sending from an unverified domain is rejected with 403, and the log
   > will read `Resend responded 403: The domain is not verified`.

4. Go to **API Keys → Create API Key**, permission **Sending access**, and copy it. It starts
   `re_` and is shown once.
5. Set:

```bash
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=Parking Marketplace <bookings@yourdomain.in>
EMAIL_REPLY_TO=help@yourdomain.in
```

`EMAIL_FROM` must use the domain you verified in step 3. `EMAIL_REPLY_TO` is optional but worth
setting — replies to a `bookings@` address otherwise go nowhere.

**Who gets email:** only users who have added an address. Sign-up is by phone and the address is
optional (**Account → Profile and settings → Email**), so a booking confirmation for someone who
never added one shows `email / failed / No email address on file` in the log. That is expected,
not a fault.

**Which events send email:** booking confirmed, booking cancelled, booking refunded, and payout
processed. Reminders and review requests are WhatsApp-only, to keep per-message cost down. The
map is `TEMPLATE_CHANNELS` in
[`notifications.ts`](../packages/api-client/src/adapters/notifications.ts).

**To switch providers** (Postmark, SES, Brevo), implement `EmailSender` in
[`email.ts`](../packages/api-client/src/adapters/email.ts) — one method, one HTTPS POST — and add
it to `createEmailSender`. Nothing else in the product knows which provider sends email.

---

## 5. Google Maps — real tiles

**What is already built:** geocoding, autocomplete, and a real Google map that replaces the drawn
one automatically when a key is present.

**What you do:**

1. Create a Google Cloud project and **enable billing** (there is a free monthly credit, but the
   APIs will not serve without a billing account attached).
2. Enable: **Maps JavaScript API**, **Geocoding API**, **Places API**.
3. Create an API key, then **restrict it** — this matters:
   - Application restriction: **HTTP referrers**, set to `https://YOUR-DOMAIN/*`
   - API restriction: only the three APIs above
4. Set:

```bash
NEXT_PUBLIC_MAPS_PROVIDER=google
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy...
```

> This key **is** visible in the browser, and that is unavoidable — the JavaScript SDK runs there.
> The referrer restriction in step 3 is what protects it, not secrecy. Do not skip it: an
> unrestricted Maps key found in a page source is somebody else's map bill.
>
> Set a **budget alert** in Google Cloud. Maps bills per map load, and §16 of the spec names this
> as a live cost risk.

---

## 6. Scheduling — two places, not one

**Already scheduled inside Postgres** (nothing to do): completing elapsed bookings and expiring
unpaid holds, both running every minute via `pg_cron`. Confirm after deploy with:

```sql
select jobname, schedule, active from cron.job;
```

**The third one sends messages, so it lives in the app, not the database**: the booking reminder
(2 hours before arrival) and the review request (2 hours after a stay). Nothing else sends these —
they are the only two messages no user action triggers.

**Step 1, whichever host you use.** Set a long random secret on the deployment:

```bash
CRON_SECRET=<a long random string>
```

Without it that route answers **404 to everyone**, including you. That is deliberate — an open
endpoint that sends messages from your sender id is a spam cannon — but it does mean a wrong
secret looks exactly like a wrong URL. If your scheduler reports 404, check the secret first.

**Step 2 — pick one.** Two are already written; you only enable one.

| If you deploy to  | Do this                                                                                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel**        | Nothing. [`apps/web/vercel.json`](../apps/web/vercel.json) already schedules it every 15 minutes, and Vercel sends the `CRON_SECRET` header for you. **Hobby plan only allows daily crons** — reminders need Pro.                                                                       |
| **Anywhere else** | Add two repository secrets and the workflow runs itself: **Settings → Secrets and variables → Actions** → `APP_BASE_URL` (`https://your-domain.in`, no trailing slash) and `CRON_SECRET` (the same value). See [`notifications-cron.yml`](../.github/workflows/notifications-cron.yml). |
| **Neither**       | Point [cron-job.org](https://cron-job.org) at the URL below every 15 minutes with that header.                                                                                                                                                                                          |

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-DOMAIN/api/cron/notifications
```

Do not enable two of them. A double-fire sends nothing twice — the run skips any booking that
already has a log row for that template, verified by calling it twice in a row — but two
schedulers means two places to look when reminders stop.

**Check it is working.** A healthy run answers:

```json
{ "reminders": 0, "reviews": 0 }
```

Zeros are normal — it means nothing was due in that 15-minute window. What you want to confirm is
that rows appear in `notification_log` on a day with bookings:

```sql
select template, channel, status, count(*)
  from notification_log
 where template in ('booking_reminder', 'review_request')
   and created_at > now() - interval '1 day'
 group by 1, 2, 3;
```

Nothing there after a day with confirmed bookings means the scheduler is not reaching the route.

> **On GitHub Actions specifically:** its scheduler is best-effort. Runs are delayed under load,
> and scheduled workflows are disabled automatically after 60 days with no repository activity.
> Both matter for a reminder that has to arrive before someone drives somewhere. It is the
> portable option, not the best one.

---

## 7. Error tracking

1. Create a Sentry project (platform: Next.js).
2. Copy the DSN and set `NEXT_PUBLIC_SENTRY_DSN=https://xxx@oyyy.ingest.sentry.io/zzz`.
3. Confirm one error arrives. With no DSN set, errors print to the server console instead —
   fine locally, useless in production.

---

## 8. Legal — before go-live, not after

The three pages exist and are linked from the footer, the booking form and the checkout screen.
**They are drafts and have not been reviewed by counsel.**

Have a lawyer review [`terms`](../apps/web/src/app/legal/terms), [`privacy`](../apps/web/src/app/legal/privacy)
and [`cancellation`](../apps/web/src/app/legal/cancellation) against the DPDP Act. Razorpay also
checks that these pages exist during merchant KYC, so this gates item 1 as well.

While you are there, sign off the open decisions in [`ASSUMPTIONS.md`](ASSUMPTIONS.md) — the
service fee, the cancellation tiers and the dispute window are all currently _my_ choices, and
they are commercial decisions, not technical ones.

---

## 9. Other environment variables

```bash
NEXT_PUBLIC_SITE_URL=https://YOUR-DOMAIN     # sitemap and social cards need absolute URLs
ACCESS_PASS_SECRET=<32+ random characters>   # signs QR passes; changing it invalidates live ones
SUPABASE_SERVICE_ROLE_KEY=<from Supabase>    # NEVER prefix this NEXT_PUBLIC_
```

Generate the pass secret with `openssl rand -base64 48`. Treat it like a private key: anyone
holding it can mint a valid parking pass.

---

## 10. Before you announce it

- [ ] One real ₹1 booking, end to end, on a real phone
- [ ] The host scans that pass at **Host → Check a pass**
- [ ] One real payout of a small amount to a real host account
- [ ] One dispute raised and resolved with a refund
- [ ] Confirm `select jobname, active from cron.job` returns two active rows
- [ ] Confirm a Sentry event arrives
- [ ] Test on a real budget Android phone on mobile data, not just a desktop browser
- [ ] Set the Google Cloud budget alert
- [ ] Recalibrate the §3 target numbers to Pune's actual size

---

## What is genuinely not built

Being straight with you, so nothing surprises you later:

- **No in-app support inbox.** The "Get help" link opens WhatsApp to the number in
  [`platform.ts`](../packages/config/src/platform.ts) (`SUPPORT.whatsappNumber`) — **change that
  placeholder before launch** or messages go nowhere.
- **Spec §11 names these as Supabase Edge Functions**; they are Next.js server actions and route
  handlers. Functionally equivalent and service-role gated. Worth correcting in the spec rather
  than rewriting working code.
