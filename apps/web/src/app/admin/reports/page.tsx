import { formatPaise } from '@parking/core';
import { Card, CardBody, CardHeader } from '@parking/ui';
import { requireAdmin } from '@/lib/auth';
import { fetchReportTotals, resolveRange, toDateInput } from './report';
import { RangePicker } from './range-picker';

export const metadata = { title: 'Reports' };

/**
 * Operational reporting (spec §7.3, §8.3 "Reports — CSV export").
 *
 * The totals are shown here *before* the download, and both come from the same `report` module,
 * so §7.3's "exported totals reconcile exactly with the dashboard figures" holds by
 * construction. Showing them first matters on its own: an export you have to open in Excel to
 * sanity-check is one nobody sanity-checks.
 */
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const range = resolveRange(params);

  let totals;
  try {
    totals = await fetchReportTotals(range);
  } catch (error) {
    console.error('[reports] summary failed', error);
    totals = null;
  }

  const query = `from=${toDateInput(range.from)}&to=${toDateInput(range.to)}`;

  const tiles = totals
    ? [
        { label: 'Bookings', value: String(totals.bookings), hint: 'Confirmed and completed.' },
        { label: 'Gross booked', value: formatPaise(totals.gross), hint: 'What seekers paid.' },
        {
          label: 'Service fees',
          value: formatPaise(totals.fees),
          hint: 'The platform’s share before refunds.',
        },
        {
          label: 'Owed to hosts',
          value: formatPaise(totals.payouts),
          hint: 'Their share of these bookings.',
        },
        { label: 'Refunded', value: formatPaise(totals.refunded), hint: 'Returned to seekers.' },
        {
          label: 'Passes scanned',
          value:
            totals.bookings === 0
              ? '—'
              : `${Math.round((totals.scanned / totals.bookings) * 100)}%`,
          hint: 'Bookings where the seeker actually arrived.',
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reports</h1>
        <p className="mt-1 text-slate-600">
          Bookings and revenue for a date range. A booking counts in the period it was due to start,
          which is the period the space was occupied.
        </p>
      </header>

      <Card>
        <CardHeader title="Date range" description="Both dates are inclusive, in local time." />
        <CardBody>
          <RangePicker
            initialFrom={toDateInput(range.from)}
            initialTo={toDateInput(range.to)}
            downloadHref={`/admin/reports/download?${query}`}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Totals for this range"
          description="These are the figures the CSV adds up to — check them here before exporting."
        />
        <CardBody>
          {totals === null ? (
            <p className="text-sm text-red-700">
              Could not read the bookings for this range. Try again, or narrow the dates.
            </p>
          ) : (
            <>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tiles.map((tile) => (
                  <div
                    key={tile.label}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                  >
                    <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                      {tile.label}
                    </dt>
                    <dd className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
                      {tile.value}
                    </dd>
                    <dd className="mt-1 text-xs text-slate-500">{tile.hint}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600">
                Gross {formatPaise(totals.gross)} = hosts {formatPaise(totals.payouts)} + fees{' '}
                {formatPaise(totals.fees)}
                {totals.refunded > 0
                  ? `, of which ${formatPaise(totals.refunded)} was refunded`
                  : ''}
                .
              </p>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
