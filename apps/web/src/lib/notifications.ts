import 'server-only';

/**
 * The single notification entry point (spec §9.9, §11's `send-notification`).
 *
 * §9.9 asks that SMS, WhatsApp and email be "wired to the same notification-triggering logic so
 * a booking event fires every required channel from one place". This is that place: callers name
 * an event, never a channel.
 *
 * Every attempt is written to `notification_log`, including failures. §7.1 requires a
 * confirmation for 100% of successful bookings, and without a log there is no way to evidence
 * that or to find the ones that did not arrive.
 *
 * Notification failure never fails the thing that triggered it. A booking that is paid for is
 * paid for whether or not the SMS went out.
 */
import { createNotificationsAdapter, type NotificationTemplate } from '@parking/api-client';
import { getServerEnv } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/service';

export interface NotifyInput {
  userId: string;
  template: NotificationTemplate;
  variables: Record<string, string>;
  bookingId?: string;
}

export async function notify(input: NotifyInput): Promise<void> {
  const service = createServiceClient();

  try {
    const { data: user } = await service
      .from('users')
      .select('id, name, phone, email')
      .eq('id', input.userId)
      .single();

    if (!user) return;

    const env = getServerEnv();
    const adapter = createNotificationsAdapter({
      NOTIFICATIONS_PROVIDER: env.NOTIFICATIONS_PROVIDER,
      ...(env.MSG91_AUTH_KEY ? { MSG91_AUTH_KEY: env.MSG91_AUTH_KEY } : {}),
      ...(env.MSG91_SENDER_ID ? { MSG91_SENDER_ID: env.MSG91_SENDER_ID } : {}),
      ...(env.MSG91_OTP_TEMPLATE_ID ? { MSG91_OTP_TEMPLATE_ID: env.MSG91_OTP_TEMPLATE_ID } : {}),
      ...(env.MSG91_WHATSAPP_NUMBER ? { MSG91_WHATSAPP_NUMBER: env.MSG91_WHATSAPP_NUMBER } : {}),
      ...(env.MSG91_SMS_TEMPLATE_IDS ? { MSG91_SMS_TEMPLATE_IDS: env.MSG91_SMS_TEMPLATE_IDS } : {}),
      ...(env.MSG91_WHATSAPP_TEMPLATES
        ? { MSG91_WHATSAPP_TEMPLATES: env.MSG91_WHATSAPP_TEMPLATES }
        : {}),
      // Email comes from a different provider to SMS and WhatsApp (spec §9.9). The factory
      // returns no sender when it is unconfigured, and the email channel then fails loudly in
      // the log rather than reporting a delivery that never happened.
      ...(env.EMAIL_PROVIDER ? { EMAIL_PROVIDER: env.EMAIL_PROVIDER } : {}),
      ...(env.RESEND_API_KEY ? { RESEND_API_KEY: env.RESEND_API_KEY } : {}),
      ...(env.EMAIL_FROM ? { EMAIL_FROM: env.EMAIL_FROM } : {}),
      ...(env.EMAIL_REPLY_TO ? { EMAIL_REPLY_TO: env.EMAIL_REPLY_TO } : {}),
    });

    const result = await adapter.send({
      recipient: { userId: user.id, phone: user.phone, email: user.email, name: user.name },
      template: input.template,
      variables: input.variables,
      ...(input.bookingId ? { bookingId: input.bookingId } : {}),
    });

    await service.from('notification_log').insert(
      result.results.map((channel) => ({
        user_id: user.id,
        booking_id: input.bookingId ?? null,
        channel: channel.channel,
        template: input.template,
        destination: channel.channel === 'email' ? (user.email ?? '') : user.phone,
        status: channel.status === 'sent' ? 'sent' : 'failed',
        provider_message_id: channel.providerMessageId ?? null,
        error: channel.error ?? null,
        sent_at: channel.status === 'sent' ? new Date().toISOString() : null,
      })),
    );
  } catch (error) {
    // Swallowed on purpose: see the note above. Logged so it is not invisible.
    console.error('[notify] failed to send', input.template, error);
  }
}
