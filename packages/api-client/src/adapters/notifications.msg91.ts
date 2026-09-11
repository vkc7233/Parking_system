/**
 * MSG91 implementation of NotificationsAdapter (spec section 9.9).
 *
 * MSG91 is also what Supabase Auth's custom SMS hook routes OTP delivery through (spec 9.5),
 * so `sendOtp` here is the function that hook calls - one provider account, one integration.
 *
 * Transactional email is a separate provider (spec 9.9 says "a standard transactional email
 * provider"), so it is injected rather than implemented here - see `email.ts`. When none is
 * configured the email channel is reported as failed rather than silently dropped, so the
 * notification log shows the gap instead of hiding it.
 */
import type { EmailSender } from './email';
import {
  NotificationAdapterError,
  renderSubject,
  renderTemplate,
  TEMPLATE_CHANNELS,
  type ChannelResult,
  type NotificationChannel,
  type NotificationsAdapter,
  type NotificationTemplate,
  type SendNotificationInput,
  type SendNotificationResult,
} from './notifications';

export interface Msg91Config {
  authKey: string;
  /** Sender id for SMS, e.g. 'PARKNG'. DLT-registered with the operator. */
  senderId: string;
  /** DLT-approved template ids, keyed by our template name. */
  smsTemplateIds: Partial<Record<NotificationTemplate, string>>;
  otpTemplateId: string;
  /** WhatsApp Business number in E.164, once the API is approved (spec section 13). */
  whatsappNumber?: string;
  whatsappTemplateNames?: Partial<Record<NotificationTemplate, string>>;
  apiBase?: string;
  /** Transactional email, from a different provider. Absent means the channel is unavailable. */
  email?: EmailSender;
}

export class Msg91NotificationsAdapter implements NotificationsAdapter {
  readonly name = 'msg91';
  private readonly apiBase: string;

  constructor(private readonly config: Msg91Config) {
    if (!config.authKey) {
      throw new NotificationAdapterError('MSG91_AUTH_KEY is required', 'provider_error');
    }
    this.apiBase = config.apiBase ?? 'https://control.msg91.com/api';
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const response = await fetch(`${this.apiBase}${path}`, {
      method: 'POST',
      headers: { authkey: this.config.authKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new NotificationAdapterError(
        `MSG91 ${path} failed with ${response.status}: ${text}`,
        'provider_error',
      );
    }
    return text ? JSON.parse(text) : {};
  }

  async send(input: SendNotificationInput): Promise<SendNotificationResult> {
    const channels = input.channels ?? TEMPLATE_CHANNELS[input.template];

    // Channels are independent: a WhatsApp template still pending approval must not stop the
    // SMS going out, so each is settled separately and failures are recorded, not thrown.
    const results = await Promise.all(
      channels.map((channel) =>
        this.sendOne(channel, input).catch((error: unknown) => ({
          channel,
          status: 'failed' as const,
          error: error instanceof Error ? error.message : String(error),
        })),
      ),
    );

    return { results, delivered: results.some((r) => r.status === 'sent') };
  }

  private async sendOne(
    channel: NotificationChannel,
    input: SendNotificationInput,
  ): Promise<ChannelResult> {
    const { recipient, template, variables } = input;

    if (channel === 'sms') {
      const templateId = this.config.smsTemplateIds[template];
      if (!templateId) {
        throw new NotificationAdapterError(
          `No DLT-approved SMS template registered for "${template}"`,
          'template_not_approved',
        );
      }

      const response = (await this.post('/v5/flow/', {
        template_id: templateId,
        sender: this.config.senderId,
        recipients: [{ mobiles: normalisePhone(recipient.phone), ...variables }],
      })) as { request_id?: string };

      return {
        channel,
        status: 'sent',
        ...(response.request_id ? { providerMessageId: response.request_id } : {}),
      };
    }

    if (channel === 'whatsapp') {
      const templateName = this.config.whatsappTemplateNames?.[template];
      if (!this.config.whatsappNumber || !templateName) {
        throw new NotificationAdapterError(
          `WhatsApp is not configured for "${template}" - Business API approval pending (spec 13)`,
          'template_not_approved',
        );
      }

      const response = (await this.post('/v5/whatsapp/whatsapp-outbound-message/', {
        integrated_number: this.config.whatsappNumber,
        content_type: 'template',
        payload: {
          messaging_product: 'whatsapp',
          to: normalisePhone(recipient.phone),
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en', policy: 'deterministic' },
            components: [
              {
                type: 'body',
                parameters: Object.values(variables).map((text) => ({ type: 'text', text })),
              },
            ],
          },
        },
      })) as { message_id?: string };

      return {
        channel,
        status: 'sent',
        ...(response.message_id ? { providerMessageId: response.message_id } : {}),
      };
    }

    // Email.
    if (!this.config.email) {
      // Reported, not silently swallowed, so the gap is visible in notification_log rather than
      // looking like a delivered message.
      throw new NotificationAdapterError(
        `Email provider not configured; would have sent: ${renderTemplate(template, variables)}`,
        'provider_error',
      );
    }

    // An account with no email address is the ordinary case, not a fault: sign-up is by phone
    // and the address is optional. It still fails the channel rather than reporting a send that
    // never happened - the SMS and WhatsApp channels carry the message.
    if (!recipient.email) {
      throw new NotificationAdapterError(
        'No email address on file for this user',
        'invalid_recipient',
      );
    }

    const sent = await this.config.email.send({
      to: recipient.email,
      subject: renderSubject(template, variables),
      text: renderTemplate(template, variables),
    });

    return {
      channel,
      status: 'sent',
      ...(sent.providerMessageId ? { providerMessageId: sent.providerMessageId } : {}),
    };
  }

  async sendOtp(phone: string, code: string): Promise<ChannelResult> {
    const response = (await this.post('/v5/flow/', {
      template_id: this.config.otpTemplateId,
      sender: this.config.senderId,
      recipients: [{ mobiles: normalisePhone(phone), otp: code }],
    })) as { request_id?: string };

    return {
      channel: 'sms',
      status: 'sent',
      ...(response.request_id ? { providerMessageId: response.request_id } : {}),
    };
  }
}

/** MSG91 wants the country code without a leading '+'. */
function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}
