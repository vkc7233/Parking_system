import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getServerEnv } from '@/lib/env';
import { notify } from '@/lib/notifications';
import { captureError } from '@/lib/observability';

/**
 * Sends the two time-based notifications (spec §7.1 "transactional notifications").
 *
 * `booking_reminder` and `review_request` were defined, given templates and channels, and never
 * sent by anything — the only sends in the codebase were the ones a user action triggered
 * directly. A reminder that nothing schedules is a reminder that does not exist.
 *
 * A route rather than a pg_cron job because sending goes through the notifications adapter, which
 * lives in the application and not in the database. The two database sweeps stay in pg_cron
 * because they are pure SQL.
 *
 * Idempotent by construction: `notifications` rows are the record of what was sent, and each pass
 * skips bookings that already have one of that template. A double-fire sends nothing twice, which
 * matters because a scheduler retrying on a timeout is normal.
 */

export const dynamic = 'force-dynamic';

const REMINDER_LEAD_HOURS = 2;
/** Long enough that the stay is genuinely over, short enough that they still remember it. */
const REVIEW_DELAY_HOURS = 2;
/** Bounded so a first run after downtime does not message every past seeker at once. */
const REVIEW_LOOKBACK_HOURS = 72;

export async function GET(request: Request) {
  const env = getServerEnv();

  // Shared-secret auth. This endpoint sends messages to real people from our sender id, so an
  // open version of it is a spam cannon. No secret configured means nobody gets in.
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!env.CRON_SECRET || provided !== env.CRON_SECRET) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const service = createServiceClient();
  const now = Date.now();
  let reminders = 0;
  let reviews = 0;

  try {
    const { data: upcoming } = await service
      .from('bookings')
      .select('id, reference, seeker_id, start_time, listings(title), notifications(template)')
      .eq('status', 'confirmed')
      .gte('start_time', new Date(now).toISOString())
      .lte('start_time', new Date(now + REMINDER_LEAD_HOURS * 3_600_000).toISOString());

    for (const booking of (upcoming ?? []) as unknown as {
      id: string;
      reference: string;
      seeker_id: string;
      start_time: string;
      listings: { title: string } | null;
      notifications: { template: string }[] | null;
    }[]) {
      if ((booking.notifications ?? []).some((n) => n.template === 'booking_reminder')) continue;

      await notify({
        userId: booking.seeker_id,
        bookingId: booking.id,
        template: 'booking_reminder',
        variables: {
          listing: booking.listings?.title ?? 'your space',
          start: new Date(booking.start_time).toLocaleString('en-IN'),
          reference: booking.reference,
        },
      });
      reminders += 1;
    }

    const { data: finished } = await service
      .from('bookings')
      .select('id, seeker_id, end_time, listings(title), notifications(template), reviews(id)')
      .eq('status', 'completed')
      .lte('end_time', new Date(now - REVIEW_DELAY_HOURS * 3_600_000).toISOString())
      .gte('end_time', new Date(now - REVIEW_LOOKBACK_HOURS * 3_600_000).toISOString());

    for (const booking of (finished ?? []) as unknown as {
      id: string;
      seeker_id: string;
      listings: { title: string } | null;
      notifications: { template: string }[] | null;
      reviews: { id: string }[] | null;
    }[]) {
      if ((booking.notifications ?? []).some((n) => n.template === 'review_request')) continue;
      // Asking someone to rate a stay they already rated is the kind of message people mute a
      // whole sender over.
      if ((booking.reviews ?? []).length > 0) continue;

      await notify({
        userId: booking.seeker_id,
        bookingId: booking.id,
        template: 'review_request',
        variables: { listing: booking.listings?.title ?? 'your space' },
      });
      reviews += 1;
    }
  } catch (error) {
    await captureError(error, { source: 'cron/notifications' });
    return NextResponse.json({ error: 'Send run failed' }, { status: 500 });
  }

  return NextResponse.json({ reminders, reviews });
}
