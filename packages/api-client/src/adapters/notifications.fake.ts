/**
 * In-memory notifications adapter.
 *
 * Every message is rendered and recorded rather than discarded, so tests can assert on what a
 * Seeker would actually have received - which is how spec 7.1's "a confirmation message is
 * sent for 100% of successful bookings" gets verified without a provider account.
 *
 * In local development it also prints to the console, so the OTP needed to log in is visible
 * in the dev server output.
 */
import {
  renderTemplate,
  TEMPLATE_CHANNELS,
  type ChannelResult,
  type NotificationsAdapter,
  type SendNotificationInput,
  type SendNotificationResult,
} from './notifications';

export interface RecordedNotification {
  channel: string;
  template: string;
  destination: string;
  body: string;
  bookingId?: string;
  sentAt: Date;
}

export class FakeNotificationsAdapter implements NotificationsAdapter {
  readonly name = 'fake';

  readonly sent: RecordedNotification[] = [];
  readonly otps: { phone: string; code: string; sentAt: Date }[] = [];

  constructor(private readonly options: { log?: boolean } = { log: true }) {}

  async send(input: SendNotificationInput): Promise<SendNotificationResult> {
    const channels = input.channels ?? TEMPLATE_CHANNELS[input.template];
    const body = renderTemplate(input.template, input.variables);

    const results: ChannelResult[] = channels.map((channel) => {
      const destination =
        channel === 'email' ? (input.recipient.email ?? '') : input.recipient.phone;

      // Mirrors the real failure: an email-only recipient with no address on file.
      if (!destination) {
        return { channel, status: 'failed', error: `No ${channel} destination for recipient` };
      }

      this.sent.push({
        channel,
        template: input.template,
        destination,
        body,
        ...(input.bookingId ? { bookingId: input.bookingId } : {}),
        sentAt: new Date(),
      });

      if (this.options.log) {
        console.warn(`[notification:${channel}] -> ${destination}: ${body}`);
      }

      return { channel, status: 'sent', providerMessageId: `fake_${this.sent.length}` };
    });

    return { results, delivered: results.some((r) => r.status === 'sent') };
  }

  async sendOtp(phone: string, code: string): Promise<ChannelResult> {
    this.otps.push({ phone, code, sentAt: new Date() });

    if (this.options.log) {
      console.warn(`[otp] -> ${phone}: ${code}`);
    }

    return { channel: 'sms', status: 'sent', providerMessageId: `fake_otp_${this.otps.length}` };
  }

  /** Test helper: the messages a given booking generated. */
  forBooking(bookingId: string): RecordedNotification[] {
    return this.sent.filter((n) => n.bookingId === bookingId);
  }

  reset(): void {
    this.sent.length = 0;
    this.otps.length = 0;
  }
}
