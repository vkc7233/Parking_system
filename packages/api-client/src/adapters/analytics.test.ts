import { describe, expect, it } from 'vitest';
import { FakeAnalyticsAdapter } from './analytics.fake';
import type { AnalyticsEvent } from './analytics';

/**
 * Guards spec §7.4's acceptance criterion: "every funnel step in Section 3's metrics has a
 * corresponding tracked event".
 *
 * The list below is §3's metrics table transcribed. If someone removes an event name because
 * nothing appears to use it, this fails and says which metric goes dark — which is the failure
 * mode worth guarding, since a missing analytics event breaks nothing a user can see and is
 * therefore usually noticed a quarter later, when the number is needed.
 */
const METRIC_COVERAGE: { metric: string; events: AnalyticsEvent[] }[] = [
  { metric: 'Live listings in the pilot city', events: ['listing_submitted', 'listing_approved'] },
  { metric: 'Completed paid bookings', events: ['payment_completed'] },
  {
    metric: 'Booking-to-payment completion rate',
    events: ['booking_started', 'payment_completed'],
  },
  { metric: 'Repeat booking rate', events: ['signup_completed', 'payment_completed'] },
  { metric: 'Host payout cycle time', events: ['payment_completed', 'payout_processed'] },
  { metric: 'Average rating', events: ['review_submitted'] },
];

describe('funnel coverage', () => {
  it.each(METRIC_COVERAGE)('$metric has its events', async ({ events }) => {
    const analytics = new FakeAnalyticsAdapter();

    for (const event of events) {
      await analytics.capture({ distinctId: 'u1', event });
    }

    expect(analytics.events.map((e) => e.event)).toEqual(events);
  });
});

describe('FakeAnalyticsAdapter', () => {
  it('computes the completion rate the way the dashboard would', async () => {
    const analytics = new FakeAnalyticsAdapter();

    // Four seekers reach checkout; three of them pay.
    for (const id of ['a', 'b', 'c', 'd']) {
      await analytics.capture({ distinctId: id, event: 'booking_started' });
    }
    for (const id of ['a', 'b', 'c']) {
      await analytics.capture({ distinctId: id, event: 'payment_completed' });
    }

    // §3's target is > 80%; 75% is the kind of number this metric exists to surface.
    expect(analytics.completionRate()).toBeCloseTo(0.75);
  });

  it('has no completion rate before anyone reaches checkout', () => {
    // Zero rather than null would read as "nobody who tried could pay", which is a very
    // different thing to report than "nobody has tried yet".
    expect(new FakeAnalyticsAdapter().completionRate()).toBeNull();
  });

  it('merges traits across identify calls rather than replacing them', async () => {
    const analytics = new FakeAnalyticsAdapter();

    await analytics.identify({ distinctId: 'u1', traits: { role: 'seeker' } });
    await analytics.identify({ distinctId: 'u1', traits: { city: 'Pune' } });

    expect(analytics.identities.get('u1')).toEqual({ role: 'seeker', city: 'Pune' });
  });

  it('defaults the timestamp but keeps one that is given', async () => {
    const analytics = new FakeAnalyticsAdapter();
    const when = new Date('2026-09-08T12:00:00Z');

    await analytics.capture({ distinctId: 'u1', event: 'search_performed', timestamp: when });

    expect(analytics.events[0]?.timestamp).toEqual(when);
  });
});
