import type {
  AnalyticsAdapter,
  AnalyticsEvent,
  AnalyticsProperties,
} from './analytics';

export interface RecordedEvent {
  distinctId: string;
  event: AnalyticsEvent;
  properties: AnalyticsProperties;
  timestamp: Date;
}

/**
 * In-memory analytics adapter for local development, CI and tests.
 *
 * It keeps what it was given so a test can assert the funnel actually fires — the acceptance
 * criterion in §7.4 is about events existing, which is exactly the kind of thing that rots
 * silently, because nothing breaks when an event stops being sent.
 *
 * It also keeps CI from posting fabricated funnel data into the real analytics project, which
 * would quietly corrupt the numbers the pilot is judged on.
 */
export class FakeAnalyticsAdapter implements AnalyticsAdapter {
  readonly name = 'fake';

  readonly events: RecordedEvent[] = [];
  readonly identities = new Map<string, AnalyticsProperties>();

  async capture(input: {
    distinctId: string;
    event: AnalyticsEvent;
    properties?: AnalyticsProperties;
    timestamp?: Date;
  }): Promise<void> {
    this.events.push({
      distinctId: input.distinctId,
      event: input.event,
      properties: input.properties ?? {},
      timestamp: input.timestamp ?? new Date(),
    });
  }

  async identify(input: {
    distinctId: string;
    traits: AnalyticsProperties;
  }): Promise<void> {
    this.identities.set(input.distinctId, {
      ...this.identities.get(input.distinctId),
      ...input.traits,
    });
  }

  /** Test helper: every recorded event of one kind. */
  eventsOfType(event: AnalyticsEvent): RecordedEvent[] {
    return this.events.filter((e) => e.event === event);
  }

  /**
   * Test helper: the booking-to-payment completion rate §3 tracks, computed the way the real
   * dashboard would, so a test can prove the two events are actually comparable.
   */
  completionRate(): number | null {
    const started = this.eventsOfType('booking_started').length;
    if (started === 0) return null;
    return this.eventsOfType('payment_completed').length / started;
  }

  reset(): void {
    this.events.length = 0;
    this.identities.clear();
  }
}
