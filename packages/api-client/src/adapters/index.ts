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
import { FakeMapsAdapter } from './maps.fake';
import { GoogleMapsAdapter } from './maps.google';
import { FakeNotificationsAdapter } from './notifications.fake';
import { Msg91NotificationsAdapter } from './notifications.msg91';
import { FakePaymentsAdapter } from './payments.fake';
import { RazorpayPaymentsAdapter } from './payments.razorpay';
import type { MapsAdapter } from './maps';
import type { NotificationsAdapter } from './notifications';
import type { PaymentsAdapter } from './payments';

export * from './maps';
export * from './notifications';
export * from './payments';
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

  MAPS_PROVIDER?: string;
  GOOGLE_MAPS_API_KEY?: string;
}

export interface Adapters {
  payments: PaymentsAdapter;
  notifications: NotificationsAdapter;
  maps: MapsAdapter;
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
let fakeMaps: FakeMapsAdapter | undefined;

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

export function createNotificationsAdapter(env: AdapterEnv): NotificationsAdapter {
  if ((env.NOTIFICATIONS_PROVIDER ?? 'fake') !== 'msg91') {
    fakeNotifications ??= new FakeNotificationsAdapter();
    return fakeNotifications;
  }

  return new Msg91NotificationsAdapter({
    authKey: env.MSG91_AUTH_KEY ?? '',
    senderId: env.MSG91_SENDER_ID ?? 'PARKNG',
    otpTemplateId: env.MSG91_OTP_TEMPLATE_ID ?? '',
    // Populated as each DLT/WhatsApp template clears approval; an unapproved template fails
    // loudly on that channel rather than blocking the others.
    smsTemplateIds: {},
    whatsappTemplateNames: {},
    ...(env.MSG91_WHATSAPP_NUMBER ? { whatsappNumber: env.MSG91_WHATSAPP_NUMBER } : {}),
  });
}

export function createMapsAdapter(env: AdapterEnv): MapsAdapter {
  if ((env.MAPS_PROVIDER ?? 'fake') !== 'google') {
    fakeMaps ??= new FakeMapsAdapter();
    return fakeMaps;
  }

  return new GoogleMapsAdapter({ apiKey: env.GOOGLE_MAPS_API_KEY ?? '' });
}

export function createAdapters(env: AdapterEnv): Adapters {
  return {
    payments: createPaymentsAdapter(env),
    notifications: createNotificationsAdapter(env),
    maps: createMapsAdapter(env),
  };
}
