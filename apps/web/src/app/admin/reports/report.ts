import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';

/**
 * The reporting period and the rows in it (spec §7.3).
 *
 * §7.3's acceptance criterion is that "exported totals reconcile exactly with the dashboard
 * figures for the same period". The screen and the CSV were originally two implementations of
 * "the same period" and they disagreed on the first try: the screen defaulted its end to *now*
 * while the download link carried today's date, which the route read as end-of-day. A booking
 * later the same evening appeared in the CSV and not in the totals it was supposed to match.
 *
 * So the period, the status filter and the query all live here, and both consumers import them.
 * There is no longer a second place for them to drift apart.
 */

/** A pending_payment booking is a shopping cart, not revenue. */
export const REVENUE_STATUSES = ['confirmed', 'completed'] as const;

export interface ReportRange {
  from: Date;
  /** Inclusive, and always the last instant of its day. */
  to: Date;
}

/** `YYYY-MM-DD` in local time. `toISOString().slice(0, 10)` would be a day out in IST. */
export function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Resolves the range from query parameters, defaulting to this calendar month so far.
 *
 * Both ends are snapped to local day boundaries. That is what makes the two callers agree: an
 * end of "today" means the end of today for both of them, whatever time it happens to be when
 * either one runs.
 */
export function resolveRange(params: { from?: string | null; to?: string | null }): ReportRange {
  const now = new Date();

  const parse = (value: string | null | undefined, fallback: Date): Date | null => {
    if (!value) return fallback;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  };

  const from = parse(params.from, new Date(now.getFullYear(), now.getMonth(), 1))!;
  const toDay = parse(params.to, now)!;

  const to = new Date(toDay);
  to.setHours(23, 59, 59, 999);

  from.setHours(0, 0, 0, 0);

  return { from, to };
}

export interface ReportBooking {
  reference: string;
  status: string;
  start_time: string;
  end_time: string;
  service_fee: number;
  total: number;
  host_payout: number;
  refund_amount: number | null;
  checked_in_at: string | null;
  listings: { title: string; locality: string | null } | null;
  host: { name: string | null } | null;
  seeker: { name: string | null } | null;
}

/**
 * Every booking counted in the period.
 *
 * A booking belongs to the period its **start_time** falls in — not when it was created or paid
 * — because that is the period the space was actually occupied, which is what an operator
 * reconciling a month is asking about.
 *
 * Read with the service role because it aggregates across every host, which no client-scoped
 * query is allowed to do.
 */
export async function fetchReportBookings(range: ReportRange): Promise<ReportBooking[]> {
  const service = createServiceClient();

  const { data, error } = await service
    .from('bookings')
    .select(
      'reference, status, start_time, end_time, service_fee, total, host_payout, refund_amount, checked_in_at, ' +
        'listings(title, locality), host:users!bookings_host_id_fkey(name), seeker:users!bookings_seeker_id_fkey(name)',
    )
    .in('status', REVENUE_STATUSES)
    .gte('start_time', range.from.toISOString())
    .lte('start_time', range.to.toISOString())
    .order('start_time');

  if (error) throw new Error(`Report query failed: ${error.message}`);

  return (data ?? []) as unknown as ReportBooking[];
}

export interface ReportTotals {
  bookings: number;
  gross: number;
  fees: number;
  payouts: number;
  refunded: number;
  scanned: number;
}

/** The figures shown on screen and, necessarily, the ones the CSV columns add up to. */
export function summarise(bookings: ReportBooking[]): ReportTotals {
  return {
    bookings: bookings.length,
    gross: bookings.reduce((sum, b) => sum + Number(b.total), 0),
    fees: bookings.reduce((sum, b) => sum + Number(b.service_fee), 0),
    payouts: bookings.reduce((sum, b) => sum + Number(b.host_payout), 0),
    refunded: bookings.reduce((sum, b) => sum + Number(b.refund_amount ?? 0), 0),
    scanned: bookings.filter((b) => b.checked_in_at).length,
  };
}
