import 'server-only';

import { AGREEMENT, DISPUTE, FEE, PAYOUT } from '@parking/config';
import { paiseToRupees } from '@parking/core';

/**
 * The Host Listing Agreement (spec §6.2 step 4, §7.2).
 *
 * Spec §7.2 requires a recorded, timestamped signature before any listing can be approved, and
 * the database enforces it. What is signed has to be reproducible, so the text lives here as
 * data rather than as JSX: the SHA-256 of the exact string served is stored alongside the
 * signature, which is what lets you prove a year from now *which wording* a Host agreed to
 * (assumption A6).
 *
 * Change the text and you must bump AGREEMENT.version in packages/config. The unique index on
 * (listing_id, agreement_version) then treats it as a new agreement needing a fresh signature.
 *
 * LEGAL: this is a working draft written to make the flow real, NOT reviewed wording. Spec §13
 * and §16 both call for counsel to draft and approve this before go-live. The clauses that most
 * need review are the liability allocation (clause 5) and the indemnity (clause 6).
 */

export interface AgreementClause {
  heading: string;
  body: string[];
}

export interface HostAgreement {
  version: string;
  title: string;
  preamble: string;
  clauses: AgreementClause[];
  /** SHA-256 of the canonical text, hex encoded. Stored with the signature. */
  hash: string;
  /** The exact string the hash was taken over. */
  canonicalText: string;
}

function buildClauses(): AgreementClause[] {
  const feePercent = FEE.serviceFeeBps / 100;
  const minimumPayout = paiseToRupees(PAYOUT.minimumPayout);

  return [
    {
      heading: '1. Who you are and what you are confirming',
      body: [
        'You confirm that you own the parking space you are listing, or that you have the ' +
          'owner’s permission to rent it out, and that doing so does not breach any lease, ' +
          'society rule, or other agreement that applies to the space.',
        'You confirm that the details you give — location, size, access, availability and ' +
          'photographs — describe the actual space, and that you will keep them accurate.',
      ],
    },
    {
      heading: '2. Listing and approval',
      body: [
        'Every listing is reviewed before it becomes visible. We may decline a listing, or ' +
          'remove one that is already live, if it is inaccurate, unsafe, or does not meet the ' +
          'standards published on the platform.',
        'Changing the address, photographs, spot type or capacity of a live listing returns it ' +
          'for review, and it is hidden from search until that review completes. Changes to ' +
          'price, description or house rules take effect immediately.',
      ],
    },
    {
      heading: '3. Honouring bookings',
      body: [
        'A confirmed booking is a commitment. The space must be available, accessible and ' +
          'usable for the whole of the period booked.',
        'If you cancel a confirmed booking, the seeker is refunded in full, including our ' +
          'service fee. Repeated cancellations may result in your listings being paused and ' +
          'your account reviewed.',
        'You may block out periods in advance at any time. Blocking a period does not affect ' +
          'bookings already made for it.',
      ],
    },
    {
      heading: '4. What you earn, and when you are paid',
      body: [
        `You set your own price and you receive it in full. Our service fee of ${feePercent}% ` +
          'is added on top of your price and paid by the seeker, so it is never deducted from ' +
          'what you have asked for.',
        // Built from the same constants the payout run reads, so the agreement cannot promise
        // one thing while the platform does another.
        `Earnings are released after a booking completes and its ` +
          `${DISPUTE.windowHoursAfterBookingEnd}-hour dispute window has closed with no dispute ` +
          `open. Payouts are made on a ${PAYOUT.publishedCycle} cycle to the bank account you ` +
          'provided during onboarding.',
        `Where your released balance is below ₹${minimumPayout}, it carries forward to the ` +
          'next cycle rather than being sent as a very small transfer. Nothing is held ' +
          `indefinitely: a balance waiting more than ${PAYOUT.forceOutAfterDays} days is paid ` +
          'regardless.',
        'You are responsible for any tax due on what you earn.',
      ],
    },
    {
      heading: '5. Responsibility for the space and for vehicles',
      body: [
        'You remain responsible for the space itself — its condition, its safety, and any ' +
          'permissions needed to let others use it.',
        'We provide the platform that connects you with seekers and handles payment. We are ' +
          'not the owner, occupier or insurer of the space, and we do not take custody of any ' +
          'vehicle parked in it.',
        'Nothing in this agreement removes any liability that cannot lawfully be excluded.',
      ],
    },
    {
      heading: '6. If something goes wrong',
      body: [
        'Disputes raised by a seeker within 48 hours of a booking ending are reviewed by our ' +
          'team. Where a dispute is upheld, the seeker may be refunded and the corresponding ' +
          'amount withheld from your earnings for that booking.',
        'You agree to cover losses we incur that arise from your breach of this agreement or ' +
          'from your listing being inaccurate or unauthorised.',
      ],
    },
    {
      heading: '7. Your information',
      body: [
        'The identity, address and bank documents you upload are used to verify you and to pay ' +
          'you. They are stored privately, are not shown to seekers, and are handled in line ' +
          'with our Privacy Policy and the Digital Personal Data Protection Act, 2023.',
        'Booking, payment and payout records are retained for as long as financial ' +
          'record-keeping law requires, even if you later close your account.',
      ],
    },
    {
      heading: '8. Ending this agreement',
      body: [
        'You may stop listing at any time by pausing or deleting your listings. Bookings ' +
          'already confirmed must still be honoured, or cancelled under clause 3.',
        'We may suspend or end your access if you breach this agreement, or if we are required ' +
          'to by law. Earnings already released to you are unaffected.',
      ],
    },
  ];
}

/** Renders the clauses into the exact string that gets hashed and signed. */
function canonicalise(
  title: string,
  preamble: string,
  clauses: AgreementClause[],
  version: string,
) {
  const parts = [`${title} (version ${version})`, '', preamble, ''];

  for (const clause of clauses) {
    parts.push(clause.heading);
    for (const paragraph of clause.body) parts.push(paragraph);
    parts.push('');
  }

  return parts.join('\n').trim();
}

export async function getHostAgreement(): Promise<HostAgreement> {
  const title = 'Host Listing Agreement';
  const preamble =
    'This agreement is between you (the Host) and the operator of the Parking Marketplace ' +
    'platform. It covers listing your parking space, honouring bookings made for it, and how ' +
    'and when you are paid. Please read it before signing — you are asked to sign once per ' +
    'listing.';

  const clauses = buildClauses();
  const canonicalText = canonicalise(title, preamble, clauses, AGREEMENT.version);

  // Web Crypto rather than node:crypto so the same function works unchanged inside a Supabase
  // Edge Function if agreement handling ever moves there.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalText));
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return { version: AGREEMENT.version, title, preamble, clauses, hash, canonicalText };
}
