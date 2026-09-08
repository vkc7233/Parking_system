import { BOOKING, FEE, PILOT_CITY } from '@parking/config';
import { Clause, LegalPage } from '../legal-content';

export const metadata = {
  title: 'Terms of Service',
  description: 'The terms you agree to when using the Parking Marketplace platform.',
};

/** Spec §7.4. */
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="September 2026">
      <Clause heading="What this platform is">
        <p>
          Parking Marketplace connects people who have a parking space they are not using with
          drivers who need one. We provide the platform, handle the payment, and support both sides.
          We do not own, occupy or insure any of the spaces listed, and we do not take custody of
          any vehicle.
        </p>
        <p>We currently operate in {PILOT_CITY.name} only.</p>
      </Clause>

      <Clause heading="Your account">
        <p>
          You sign in with your mobile number and a one-time code. There is no password. Keep access
          to your number secure — anyone who can receive your codes can use your account.
        </p>
        <p>
          One account covers both booking spaces and listing your own. You must be old enough to
          enter a contract, and the details you give us must be accurate.
        </p>
      </Clause>

      <Clause heading="Booking a space">
        <p>
          Bookings are instant: there is no host approval step. A booking is confirmed only once
          payment has been captured, and you receive a digital pass to show on arrival.
        </p>
        <p>
          You can book from {BOOKING.minDurationMinutes / 60} hour up to{' '}
          {BOOKING.maxDurationMinutes / (24 * 60)} days at a time, in {BOOKING.slotMinutes}-minute
          steps, and up to {BOOKING.maxAdvanceDays} days ahead.
        </p>
        <p>
          Use the space only for the period booked, only for parking, and in line with the house
          rules on the listing.
        </p>
      </Clause>

      <Clause heading="Prices and payment">
        <p>
          Hosts set their own prices. We add a service fee of {FEE.serviceFeeBps / 100}%, shown
          separately before you pay, and the host receives their full listed price. The total you
          see before confirming is the total you are charged.
        </p>
        <p>
          Payments are processed by our payment provider. Card and UPI details are entered inside
          their systems and never reach ours.
        </p>
      </Clause>

      <Clause heading="Listing a space">
        <p>
          If you list a space you must own it or have permission to rent it out, and listing it must
          not breach any lease or society rule. Listings are reviewed before they go live and you
          sign a separate Host Listing Agreement covering your obligations and how you are paid.
        </p>
      </Clause>

      <Clause heading="Cancellations and refunds">
        <p>
          Set out in full in our Cancellation and Refund Policy, which forms part of these terms.
        </p>
      </Clause>

      <Clause heading="Conduct">
        <p>
          Do not misrepresent a space, block access, damage property, or use the platform to arrange
          anything other than parking. We may suspend an account that does. Suspending a host
          immediately removes their listings from search.
        </p>
      </Clause>

      <Clause heading="Our responsibility">
        <p>
          We are responsible for operating the platform and for handling your payment correctly. We
          are not responsible for the condition or safety of a space, for damage to or theft from a
          vehicle, or for a dispute between a host and a driver beyond the resolution process we
          operate.
        </p>
        <p>Nothing here removes any liability that cannot lawfully be excluded.</p>
      </Clause>

      <Clause heading="Changes and contact">
        <p>
          We may change these terms; material changes are notified before they take effect.
          Questions go to our support contact, which is linked from the app.
        </p>
      </Clause>
    </LegalPage>
  );
}
