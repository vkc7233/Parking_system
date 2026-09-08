import { NextResponse } from 'next/server';
import { rupees, toCsv } from '@parking/core';
import { requireAdmin } from '@/lib/auth';
import { fetchReportBookings, resolveRange, toDateInput } from '../report';

/**
 * CSV export of bookings and revenue for a date range (spec §7.3, §8.3).
 *
 * The period, the status filter and the query all come from `../report`, which the Reports
 * screen also uses. That shared module is what makes §7.3's acceptance criterion — "exported
 * totals reconcile exactly with the dashboard figures for the same period" — true by
 * construction rather than by two implementations happening to agree.
 */

interface ExportRow extends Record<string, unknown> {
  reference: string;
  status: string;
  start_time: string;
  end_time: string;
  listing: string;
  locality: string;
  host: string;
  seeker: string;
  gross: string;
  service_fee: string;
  host_payout: string;
  refunded: string;
  net_to_platform: string;
  checked_in: string;
}

const COLUMNS: { key: keyof ExportRow & string; header: string }[] = [
  { key: 'reference', header: 'Reference' },
  { key: 'status', header: 'Status' },
  { key: 'start_time', header: 'Start' },
  { key: 'end_time', header: 'End' },
  { key: 'listing', header: 'Listing' },
  { key: 'locality', header: 'Locality' },
  { key: 'host', header: 'Host' },
  { key: 'seeker', header: 'Seeker' },
  { key: 'gross', header: 'Gross (INR)' },
  { key: 'service_fee', header: 'Service fee (INR)' },
  { key: 'host_payout', header: 'Host payout (INR)' },
  { key: 'refunded', header: 'Refunded (INR)' },
  { key: 'net_to_platform', header: 'Net to platform (INR)' },
  { key: 'checked_in', header: 'Checked in' },
];

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const range = resolveRange({
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
  });

  let bookings;
  try {
    bookings = await fetchReportBookings(range);
  } catch (error) {
    console.error('[reports] export failed', error);
    return NextResponse.json({ error: 'Could not build the report.' }, { status: 500 });
  }

  const rows: ExportRow[] = bookings.map((b) => {
    const refunded = Number(b.refund_amount ?? 0);

    return {
      reference: b.reference,
      status: b.status,
      start_time: new Date(b.start_time).toISOString(),
      end_time: new Date(b.end_time).toISOString(),
      listing: b.listings?.title ?? '',
      locality: b.listings?.locality ?? '',
      host: b.host?.name ?? '',
      seeker: b.seeker?.name ?? '',
      gross: rupees(b.total),
      service_fee: rupees(b.service_fee),
      host_payout: rupees(b.host_payout),
      refunded: rupees(refunded),
      // What the platform actually keeps: the fee, less anything refunded out of it.
      net_to_platform: rupees(Math.max(0, Number(b.service_fee) - refunded)),
      checked_in: b.checked_in_at ? new Date(b.checked_in_at).toISOString() : '',
    };
  });

  // Leading BOM so Excel reads the file as UTF-8. Without it a rupee sign, or a Marathi name in
  // a listing title, arrives as mojibake — and opening the report in Excel is the first thing
  // anyone does with it.
  const csv = '﻿' + toCsv(COLUMNS, rows);
  const name = `bookings-${toDateInput(range.from)}-to-${toDateInput(range.to)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
    },
  });
}
