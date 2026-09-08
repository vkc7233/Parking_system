import { CANCELLATION, DISPUTE, FEE } from '@parking/config';
import { Clause, LegalPage } from '../legal-content';

export const metadata = {
  title: 'Cancellation and Refund Policy',
  description: 'When you can cancel a parking booking and what you get back.',
};

/**
 * Spec §7.4, assumption A2.
 *
 * The tiers are rendered from the same configuration the refund calculator reads, so the
 * published policy and the money actually returned cannot disagree — which is the failure this
 * page exists to prevent.
 */
export default function CancellationPolicyPage() {
  const percent = (bps: number) => `${bps / 100}%`;

  return (
    <LegalPage title="Cancellation and Refund Policy" updated="September 2026">
      <Clause heading="Cancelling a booking">
        <p>
          You can cancel any confirmed booking from your booking page. What you get back depends on
          how long before your arrival time you cancel.
        </p>
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="py-2 font-medium text-slate-900">If you cancel</th>
              <th className="py-2 font-medium text-slate-900">Booking amount</th>
              <th className="py-2 font-medium text-slate-900">Service fee</th>
            </tr>
          </thead>
          <tbody>
            {CANCELLATION.tiers.map((tier, i) => (
              <tr key={tier.minHoursBeforeStart} className="border-b border-slate-100">
                <td className="py-2 text-slate-700">
                  {i === 0
                    ? `${tier.minHoursBeforeStart} hours or more before arrival`
                    : tier.minHoursBeforeStart > 0
                      ? `Between ${tier.minHoursBeforeStart} and ${CANCELLATION.tiers[i - 1]?.minHoursBeforeStart} hours before`
                      : 'Less than 1 hour before, or after arrival time'}
                </td>
                <td className="py-2 text-slate-700">{percent(tier.refundBookingBps)} refunded</td>
                <td className="py-2 text-slate-700">{percent(tier.refundFeeBps)} refunded</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Refunds are issued to the original payment method. They usually appear within five to
          seven working days, depending on your bank.
        </p>
      </Clause>

      <Clause heading="If the host cancels">
        <p>
          You are refunded in full, including the service fee, however close to your arrival the
          cancellation happens. Hosts who cancel repeatedly have their listings paused.
        </p>
      </Clause>

      <Clause heading="If something is wrong when you arrive">
        <p>
          If the space is not available, not accessible, or not as described, raise it with us
          within {DISPUTE.windowHoursAfterBookingEnd} hours of your booking ending. Where we uphold
          the complaint you are refunded in full, and the host is not paid for that booking.
        </p>
        <p>
          This is also why hosts are not paid immediately: earnings are held until the dispute
          window closes, so a refund we owe you is still with us when we owe it.
        </p>
      </Clause>

      <Clause heading="If you do not turn up">
        <p>
          A booking you do not use is not refunded. The host kept the space free for you and turned
          other drivers away.
        </p>
      </Clause>

      <Clause heading="The service fee">
        <p>
          Our service fee is {FEE.serviceFeeBps / 100}% of the booking amount, added on top of the
          price the host sets and shown separately before you pay. The host receives the full price
          they listed.
        </p>
      </Clause>
    </LegalPage>
  );
}
