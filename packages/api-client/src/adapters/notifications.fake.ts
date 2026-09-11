/**
 * In-memory notifications adapter.
 *
 * Every message is rendered and recorded rather than discarded, so tests can assert on what a
 * Seeker would actually have received - which is how spec 7.1's "a confirmation message is
 * sent for 100% of successful bookings" gets verified without a provider account.
 *
 * In local development it also prints to the console, so the OTP needed to log in is visible
 * in the dev server output.
 *
 * It can be given a real `EmailSender`, and that is deliberately useful rather than a test hook:
 * DLT and WhatsApp approval take one to three weeks (spec §13) while verifying an email sending
 * domain takes hours. Setting EMAIL_PROVIDER=resend while notifications are still faked sends
 * real email through the real code path weeks before SMS can be tested at all.
 */
import type { EmailSender } from './email';
import {
  renderSubject,
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

  constructor(private readonly options: { log?: boolean; email?: EmailSender } = { log: true }) {}

  async send(input: SendNotificationInput): Promise<SendNotificationResult> {
    const channels = input.channels ?? TEMPLATE_CHANNELS[input.template];
    const body = renderTemplate(input.template, input.variables);

    const results = await Promise.all(
      channels.map((channel) => this.sendOne(channel, input, body)),
    );

    return { results, delivered: results.some((r) => r.status === 'sent') };
  }

  private async sendOne(
    channel: ChannelResult['channel'],
    input: SendNotificationInput,
    body: string,
  ): Promise<ChannelResult> {
    const destination = channel === 'email' ? (input.recipient.email ?? '') : input.recipient.phone;

    // Mirrors the real failure: an email-only recipient with no address on file.
    if (!destination) {
      return { channel, status: 'failed', error: `No ${channel} destination for recipient` };
    }

    let providerMessageId: string | undefined;

    // A configured email provider really sends, even here. Faking SMS and sending email for
    // real is the normal state for weeks while DLT approval is pending, not a contradiction.
    if (channel === 'email' && this.options.email) {
      try {
        const result = await this.options.email.send({
          to: destination,
          subject: renderSubject(input.template, input.variables),
          text: body,
        });
        providerMessageId = result.providerMessageId;
      } catch (error) {
        return {
          channel,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
      }
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

    return {
      channel,
      status: 'sent',
      providerMessageId: providerMessageId ?? `fake_${this.sent.length}`,
    };
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
