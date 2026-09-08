import { Card, CardBody, CardHeader } from '@parking/ui';
import { requireHost } from '@/lib/auth';
import { VerifyForm } from './verify-form';

export const metadata = { title: 'Check a pass' };

/**
 * Host-side arrival check (assumption A5).
 *
 * Beyond the documented scope: the specification issues a QR pass but never validates one. This
 * is what turns it from decoration into proof, and it is also the only source of data on whether
 * people actually used the spaces they booked — which §3 otherwise has no way to measure.
 */
export default async function VerifyPassPage() {
  await requireHost('/host/verify');

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Check a pass</h1>
        <p className="mt-1 text-slate-600">
          Confirm a driver has really booked before you let them in.
        </p>
      </header>

      <Card>
        <CardHeader title="Scan or type" />
        <CardBody>
          <VerifyForm />
        </CardBody>
      </Card>

      <p className="text-xs text-slate-500">
        A valid pass is checked against the booking, the time window, and a signature only this
        platform can produce — a screenshot of someone else&apos;s pass will not pass.
      </p>
    </div>
  );
}
