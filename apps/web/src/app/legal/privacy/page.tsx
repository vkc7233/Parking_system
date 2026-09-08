import { AUTH, RETENTION } from '@parking/config';
import { Clause, LegalPage } from '../legal-content';

export const metadata = {
  title: 'Privacy Policy',
  description: 'What personal data we collect, why, and how long we keep it.',
};

/** Spec §7.4 and §12 — drafted against the DPDP Act 2023 (assumption A17). */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="September 2026">
      <Clause heading="What we collect">
        <p>
          <span className="font-medium">Everyone:</span> your mobile number, and your name and email
          if you give them. Your bookings, payments and any reviews you leave.
        </p>
        <p>
          <span className="font-medium">Hosts additionally:</span> identity proof, address proof and
          bank details, and the address and photographs of the space you list.
        </p>
        <p>
          We also record technical information such as your IP address and browser when you sign a
          Host Listing Agreement, because that is what makes the signature evidence of anything.
        </p>
      </Clause>

      <Clause heading="Why we collect it">
        <p>
          To let you sign in, to take and settle payments, to verify that hosts are who they say
          they are, to resolve disputes, and to meet our legal and financial record-keeping
          obligations. We do not sell your data, and we do not use it for advertising.
        </p>
      </Clause>

      <Clause heading="Who can see what">
        <p>
          A driver sees a host&apos;s first name, their listing and their rating — never their phone
          number, email or documents. A host sees the name and booking details of a driver who has
          booked their space. Identity and bank documents are visible only to the small internal
          team that reviews them.
        </p>
      </Clause>

      <Clause heading="How it is protected">
        <p>
          Identity and bank documents are held in private storage, encrypted at rest, and are never
          served publicly. Access is restricted at the database itself rather than only in the
          application. All traffic is encrypted in transit.
        </p>
        <p>
          Sessions last {AUTH.sessionDays} days; staff accounts with access to documents and payouts
          are signed out after {AUTH.adminSessionHours} hours.
        </p>
      </Clause>

      <Clause heading="How long we keep it">
        <p>
          Booking, payment and payout records, and the identity documents behind them, are kept for{' '}
          {RETENTION.financialRecordYears} years, which is the period Indian financial
          record-keeping law requires. Notification logs are kept for{' '}
          {RETENTION.notificationLogDays} days.
        </p>
      </Clause>

      <Clause heading="Your rights">
        <p>
          You can ask us for a copy of your data, ask us to correct it, or ask us to delete your
          account. On deletion we remove your name, email and phone number, but keep the underlying
          booking and payment records for the period above — we are required to retain those and
          cannot delete them on request.
        </p>
        <p>You can also withdraw consent, and complain to the Data Protection Board of India.</p>
      </Clause>

      <Clause heading="Who to contact">
        <p>
          Our grievance officer handles privacy requests and complaints. Contact details are
          published in the app and answered within the period the DPDP Act requires.
        </p>
      </Clause>
    </LegalPage>
  );
}
