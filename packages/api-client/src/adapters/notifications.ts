/**
 * Notification provider adapter (spec sections 7.1, 9.9).
 *
 * Spec 9.9 asks for SMS, WhatsApp and email to be "wired to the same notification-triggering
 * logic so a booking event fires every required channel from one place". That single place is
 * this interface: callers name an event, not a channel, and the adapter decides which
 * channels that event uses.
 *
 * WhatsApp Business API approval takes 3-5 days (spec section 13) and templates need
 * pre-approval, so `NotificationTemplate` is a closed union: every message the MVP can send
 * is enumerable here and can be submitted for approval before the code that sends it exists.
 */

export type NotificationTemplate =
  | 'booking_confirmed'
  | 'booking_reminder'
  | 'booking_cancelled'
  | 'booking_refunded'
  | 'listing_approved'
  | 'listing_rejected'
  | 'payout_processed'
  | 'review_request';

export type NotificationChannel = 'sms' | 'whatsapp' | 'email';

export interface NotificationRecipient {
  userId: string;
  /** E.164, e.g. +919876543210. */
  phone: string;
  email?: string | null;
  name?: string | null;
}

export interface SendNotificationInput {
  recipient: NotificationRecipient;
  template: NotificationTemplate;
  /** Values substituted into the approved template body, in template-defined order. */
  variables: Record<string, string>;
  /** Overrides the template's default channel set. */
  channels?: NotificationChannel[];
  /** Correlates the log entry with a booking (spec 7.1 wants 100% coverage evidenced). */
  bookingId?: string;
}

export interface ChannelResult {
  channel: NotificationChannel;
  status: 'sent' | 'failed';
  providerMessageId?: string;
  error?: string;
}

export interface SendNotificationResult {
  results: ChannelResult[];
  /** True when at least one channel got through - the user was reached somehow. */
  delivered: boolean;
}

export interface NotificationsAdapter {
  readonly name: string;
  send(input: SendNotificationInput): Promise<SendNotificationResult>;
  /** Phone-OTP delivery for Supabase Auth's custom SMS hook (spec 9.5). */
  sendOtp(phone: string, code: string): Promise<ChannelResult>;
}

/**
 * Which channels each event uses by default.
 *
 * Booking confirmation goes out on all three: spec 7.1 requires a confirmation for 100% of
 * successful bookings, and redundancy is the cheapest way to hit that. Lower-stakes events
 * use one channel to keep per-message cost down.
 */
export const TEMPLATE_CHANNELS: Record<NotificationTemplate, NotificationChannel[]> = {
  booking_confirmed: ['sms', 'whatsapp', 'email'],
  booking_reminder: ['whatsapp'],
  booking_cancelled: ['sms', 'whatsapp', 'email'],
  booking_refunded: ['whatsapp', 'email'],
  listing_approved: ['whatsapp'],
  listing_rejected: ['whatsapp'],
  payout_processed: ['whatsapp', 'email'],
  review_request: ['whatsapp'],
};

/**
 * Fallback bodies, used by the fake adapter and by email (which needs no pre-approval).
 * WhatsApp sends the provider-side approved template by name instead, with these variables.
 */
export const TEMPLATE_BODIES: Record<NotificationTemplate, string> = {
  booking_confirmed:
    'Your parking at {{listing}} is confirmed for {{start}}. Booking ref {{reference}}. Show your pass on arrival.',
  booking_reminder: 'Reminder: your parking at {{listing}} starts at {{start}}. Ref {{reference}}.',
  booking_cancelled: 'Your booking {{reference}} at {{listing}} has been cancelled.',
  booking_refunded: 'A refund of {{amount}} for booking {{reference}} is on its way to you.',
  listing_approved: 'Your listing "{{listing}}" is now live and can be booked.',
  listing_rejected: 'Your listing "{{listing}}" needs changes before it can go live: {{reason}}',
  payout_processed: 'Your payout of {{amount}} has been sent. Reference {{reference}}.',
  review_request: 'How was your parking at {{listing}}? Leave a rating to help other drivers.',
};

export function renderTemplate(
  template: NotificationTemplate,
  variables: Record<string, string>,
): string {
  return TEMPLATE_BODIES[template].replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
    key in variables ? (variables[key] as string) : `{{${key}}}`,
  );
}

export class NotificationAdapterError extends Error {
  constructor(
    message: string,
    readonly code: 'provider_error' | 'invalid_recipient' | 'template_not_approved',
  ) {
    super(message);
    this.name = 'NotificationAdapterError';
  }
}
