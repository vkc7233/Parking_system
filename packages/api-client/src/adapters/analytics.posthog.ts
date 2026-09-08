import {
  AnalyticsAdapterError,
  type AnalyticsAdapter,
  type AnalyticsEvent,
  type AnalyticsProperties,
} from './analytics';

/**
 * PostHog adapter, over its HTTP capture API.
 *
 * No SDK. The capture API is one JSON POST, and the browser SDK's real value — autocapture,
 * session replay, feature flags — is not what §7.4 asks for, while its cost is a third-party
 * script on every page of a checkout flow. Events are sent from the server, where they are
 * emitted at the moment the state actually changed rather than when a browser got round to it.
 *
 * The reason this is server-side matters for correctness, not just weight: `payment_completed`
 * fires after the payment is verified against the provider. A browser-side event would count
 * bookings that a closed tab or a failed capture never actually completed, and the metric §3
 * cares about most would read high.
 */
export class PostHogAnalyticsAdapter implements AnalyticsAdapter {
  readonly name = 'posthog';

  private readonly apiKey: string;
  private readonly host: string;

  constructor(config: { apiKey: string; host?: string }) {
    if (!config.apiKey) {
      throw new AnalyticsAdapterError('PostHog adapter requires an API key');
    }
    this.apiKey = config.apiKey;
    this.host = (config.host ?? 'https://app.posthog.com').replace(/\/$/, '');
  }

  async capture(input: {
    distinctId: string;
    event: AnalyticsEvent;
    properties?: AnalyticsProperties;
    timestamp?: Date;
  }): Promise<void> {
    await this.post('/capture/', {
      api_key: this.apiKey,
      event: input.event,
      distinct_id: input.distinctId,
      properties: input.properties ?? {},
      timestamp: (input.timestamp ?? new Date()).toISOString(),
    });
  }

  async identify(input: {
    distinctId: string;
    traits: AnalyticsProperties;
  }): Promise<void> {
    await this.post('/capture/', {
      api_key: this.apiKey,
      event: '$identify',
      distinct_id: input.distinctId,
      properties: { $set: input.traits },
    });
  }

  private async post(path: string, body: unknown): Promise<void> {
    // Analytics must never be able to delay a booking. A slow vendor is a vendor outage as far
    // as a seeker holding a payment screen is concerned, so the request is capped hard and its
    // failure is the caller's to swallow.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);

    try {
      const response = await fetch(`${this.host}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new AnalyticsAdapterError(`PostHog returned ${response.status}`);
      }
    } catch (error) {
      if (error instanceof AnalyticsAdapterError) throw error;
      throw new AnalyticsAdapterError('PostHog capture failed', error);
    } finally {
      clearTimeout(timeout);
    }
  }
}
