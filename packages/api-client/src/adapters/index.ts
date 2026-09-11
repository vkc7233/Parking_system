/**
 * Adapter selection.
 *
 * Every vendor integration is chosen here, from environment variables, and nowhere else. That
 * is what makes the Sprint 0 build possible before the Razorpay merchant account and WhatsApp
 * Business API approval land (spec sections 13 and 16): the same code runs against fakes today
 * and against the real providers the day the credentials arrive, with no diff.
 *
 * The default is deliberately 'fake' rather than the real provider. A missing environment
 * variable in production should surface as an obviously fake payment id in the logs on the
 * first test transaction, not as a silent failure to charge anyone.
 */
import { FakeAnalyticsAdapter } from './analytics.fake';
import { FakeEmailSender, ResendEmailSender } from './email';
import { FakeErrorTrackingAdapter } from './errors.fake';
import { SentryErrorTrackingAdapter, parseSentryDsn } from './errors.sentry';
import { PostHogAnalyticsAdapter } from './analytics.posthog';
import { FakeMapsAdapter } from './maps.fake';
import { GoogleMapsAdapter } from './maps.google';
import { FakeNotificationsAdapter } from './notifications.fake';
import { Msg91NotificationsAdapter } from './notifications.msg91';
import { FakePaymentsAdapter } from './payments.fake';
import { RazorpayPaymentsAdapter } from './payments.razorpay';
import type { AnalyticsAdapter } from './analytics';
import type { EmailSender } from './email';
import type { ErrorTrackingAdapter } from './errors';
import type { MapsAdapter } from './maps';
import type { NotificationsAdapter } from './notifications';
import type { PaymentsAdapter } from './payments';

export * from './analytics';
export * from './email';
export * from './errors';
export * from './maps';
export * from './notifications';
export * from './payments';
export { FakeAnalyticsAdapter, type RecordedEvent } from './analytics.fake';
export { FakeErrorTrackingAdapter, type RecordedError } from './errors.fake';
export { SentryErrorTrackingAdapter, parseSentryDsn, type ParsedDsn } from './errors.sentry';
export { PostHogAnalyticsAdapter } from './analytics.posthog';
export { FakeMapsAdapter } from './maps.fake';
export { GoogleMapsAdapter } from './maps.google';
export { FakeNotificationsAdapter } from './notifications.fake';
export { Msg91NotificationsAdapter } from './notifications.msg91';
export { FakePaymentsAdapter } from './payments.fake';
export { RazorpayPaymentsAdapter } from './payments.razorpay';

export interface AdapterEnv {
  PAYMENTS_PROVIDER?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_PAYOUT_ACCOUNT_NUMBER?: string;

  NOTIFICATIONS_PROVIDER?: string;
  MSG91_AUTH_KEY?: string;
  MSG91_SENDER_ID?: string;
  MSG91_OTP_TEMPLATE_ID?: string;
  MSG91_WHATSAPP_NUMBER?: string;
  /** `booking_confirmed=1707…,booking_cancelled=1707…` - DLT-approved SMS template ids. */
  MSG91_SMS_TEMPLATE_IDS?: string;
  /** `booking_confirmed=booking_confirmed_v1,…` - approved WhatsApp template names. */
  MSG91_WHATSAPP_TEMPLATES?: string;

  /** Transactional email, a separate provider from MSG91 (spec 9.9). 'resend' or 'fake'. */
  EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  /** e.g. `Parking Marketplace <bookings@yourdomain.in>`; the domain must be verified at Resend. */
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;

  MAPS_PROVIDER?: string;
  GOOGLE_MAPS_API_KEY?: string;

  ANALYTICS_PROVIDER?: string;
  POSTHOG_KEY?: string;
  POSTHOG_HOST?: string;

  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
}

export interface Adapters {
  payments: PaymentsAdapter;
  notifications: NotificationsAdapter;
  maps: MapsAdapter;
  analytics: AnalyticsAdapter;
  errors: ErrorTrackingAdapter;
}

/**
 * The fakes hold their state in memory, so they have to be singletons.
 *
 * An order created by one instance is invisible to another, which would make a two-step flow -
 * create the order here, verify the capture over there - fail in a way that looks like a payment
 * bug rather than a wiring one. The real adapters are stateless and are rebuilt freely.
 */
let fakePayments: FakePaymentsAdapter | undefined;
let fakeNotifications: FakeNotificationsAdapter | undefined;
let fakeEmail: FakeEmailSender | undefined;
let fakeMaps: FakeMapsAdapter | undefined;
let fakeAnalytics: FakeAnalyticsAdapter | undefined;
let fakeErrors: FakeErrorTrackingAdapter | undefined;

export function createPaymentsAdapter(env: AdapterEnv): PaymentsAdapter {
  if ((env.PAYMENTS_PROVIDER ?? 'fake') !== 'razorpay') {
    fakePayments ??= new FakePaymentsAdapter();
    return fakePayments;
  }

  return new RazorpayPaymentsAdapter({
    keyId: env.RAZORPAY_KEY_ID ?? '',
    keySecret: env.RAZORPAY_KEY_SECRET ?? '',
    ...(env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER
      ? { payoutAccountNumber: env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER }
      : {}),
  });
}

/**
 * Parses `template=value,template=value` into a map.
 *
 * A flat string rather than JSON because these land in a hosting provider's environment-variable
 * box, where a value with quotes and braces gets mangled by whoever pastes it.
 */
function parseTemplateMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {};

  return Object.fromEntries(
    raw
      .split(',')
      .map((pair) => pair.split('=').map((part) => part.trim()))
      .filter(
        (parts): parts is [string, string] => parts.length === 2 && Boolean(parts[0] && parts[1]),
      ),
  );
}

/**
 * Transactional email (spec 7.1, 9.9), chosen independently of SMS and WhatsApp.
 *
 * Returns undefined rather than a fake when nothing is configured, and the notification adapter
 * then fails the email channel loudly. A silent fake in production would report every email as
 * delivered while none was, against a criterion that asks for evidence of delivery.
 */
export function createEmailSender(env: AdapterEnv): EmailSender | undefined {
  const provider = env.EMAIL_PROVIDER ?? 'none';

  if (provider === 'fake') {
    fakeEmail ??= new FakeEmailSender();
    return fakeEmail;
  }

  if (provider !== 'resend' || !env.RESEND_API_KEY || !env.EMAIL_FROM) return undefined;

  return new ResendEmailSender({
    apiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM,
    ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
  });
}

export function createNotificationsAdapter(env: AdapterEnv): NotificationsAdapter {
  const email = createEmailSender(env);

  if ((env.NOTIFICATIONS_PROVIDER ?? 'fake') !== 'msg91') {
    // The email sender is passed through on purpose: email can be verified for real weeks
    // before DLT approval lets SMS be tested at all.
    fakeNotifications ??= new FakeNotificationsAdapter({
      log: true,
      ...(email ? { email } : {}),
    });
    return fakeNotifications;
  }

  return new Msg91NotificationsAdapter({
    authKey: env.MSG91_AUTH_KEY ?? '',
    senderId: env.MSG91_SENDER_ID ?? 'PARKNG',
    otpTemplateId: env.MSG91_OTP_TEMPLATE_ID ?? '',
    /*
     * Read from the environment rather than hard-coded empty.
     *
     * These were `{}` with a comment saying they would be "populated as each template clears
     * approval" - which meant a code change and a deploy for every template DLT signed off, and
     * in the meantime EVERY SMS and WhatsApp send threw `template_not_approved`. With
     * NOTIFICATIONS_PROVIDER=msg91 that was 100% of booking confirmations failing, against a
     * criterion that asks for 100% succeeding.
     *
     * Templates clear approval one at a time and out of order, so a partial map is the normal
     * state, not an error: an unmapped template still fails loudly on that channel and the
     * others carry on.
     */
    smsTemplateIds: parseTemplateMap(env.MSG91_SMS_TEMPLATE_IDS),
    whatsappTemplateNames: parseTemplateMap(env.MSG91_WHATSAPP_TEMPLATES),
    ...(env.MSG91_WHATSAPP_NUMBER ? { whatsappNumber: env.MSG91_WHATSAPP_NUMBER } : {}),
    ...(email ? { email } : {}),
  });
}

export function createMapsAdapter(env: AdapterEnv): MapsAdapter {
  if ((env.MAPS_PROVIDER ?? 'fake') !== 'google') {
    fakeMaps ??= new FakeMapsAdapter();
    return fakeMaps;
  }

  return new GoogleMapsAdapter({ apiKey: env.GOOGLE_MAPS_API_KEY ?? '' });
}

export function createAnalyticsAdapter(env: AdapterEnv): AnalyticsAdapter {
  if ((env.ANALYTICS_PROVIDER ?? 'fake') !== 'posthog' || !env.POSTHOG_KEY) {
    fakeAnalytics ??= new FakeAnalyticsAdapter();
    return fakeAnalytics;
  }

  return new PostHogAnalyticsAdapter({
    apiKey: env.POSTHOG_KEY,
    ...(env.POSTHOG_HOST ? { host: env.POSTHOG_HOST } : {}),
  });
}

/**
 * Error tracking, from the DSN.
 *
 * A malformed DSN falls back to the console adapter rather than throwing. A typo in an
 * environment variable should cost error reporting, not the ability to boot.
 */
export function createErrorTrackingAdapter(env: AdapterEnv): ErrorTrackingAdapter {
  const parsed = env.SENTRY_DSN ? parseSentryDsn(env.SENTRY_DSN) : null;

  if (!parsed) {
    fakeErrors ??= new FakeErrorTrackingAdapter();
    return fakeErrors;
  }

  return new SentryErrorTrackingAdapter({
    dsn: parsed,
    ...(env.SENTRY_ENVIRONMENT ? { environment: env.SENTRY_ENVIRONMENT } : {}),
    ...(env.SENTRY_RELEASE ? { release: env.SENTRY_RELEASE } : {}),
  });
}

export function createAdapters(env: AdapterEnv): Adapters {
  return {
    payments: createPaymentsAdapter(env),
    notifications: createNotificationsAdapter(env),
    maps: createMapsAdapter(env),
    analytics: createAnalyticsAdapter(env),
    errors: createErrorTrackingAdapter(env),
  };
}
