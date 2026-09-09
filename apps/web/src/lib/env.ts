/**
 * Environment access, validated once at module load.
 *
 * The point of validating here rather than reading process.env inline is that a missing
 * SUPABASE_SERVICE_ROLE_KEY should stop the server starting, not produce a confusing RLS
 * denial three screens into a booking flow.
 *
 * `serverEnv` must never be imported from a client component - it would leak the service role
 * key into the browser bundle. The `server-only` guard below turns that mistake into a build
 * error instead of a security incident.
 */
import { z } from 'zod';

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Where this deployment is reachable. Needed for absolute URLs in sitemaps and social cards
  // (§7.4 "public listing pages return valid metadata and are crawlable") — a relative URL in a
  // sitemap is ignored by every crawler, silently.
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  /*
   * Razorpay's *publishable* key id. It is designed to be public - the Checkout widget runs in
   * the browser and identifies the merchant with it - and it can only create payments against
   * orders this server already created. The SECRET stays server-side in RAZORPAY_KEY_SECRET and
   * is what signs and verifies.
   */
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().optional(),
  NEXT_PUBLIC_MAPS_PROVIDER: z.enum(['fake', 'google']).default('fake'),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
});

// Next.js inlines NEXT_PUBLIC_* only when referenced as a full literal, so these cannot be
// read from a loop over process.env.
const rawClientEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
  NEXT_PUBLIC_MAPS_PROVIDER: process.env.NEXT_PUBLIC_MAPS_PROVIDER,
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
};

function parseClientEnv() {
  const parsed = clientSchema.safeParse(rawClientEnv);

  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(
      `Invalid client environment: ${missing}. Copy .env.example to .env.local and fill it in.`,
    );
  }

  return parsed.data;
}

export const clientEnv = parseClientEnv();

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ACCESS_PASS_SECRET: z.string().min(32, 'ACCESS_PASS_SECRET must be at least 32 characters'),
  PAYMENTS_PROVIDER: z.enum(['fake', 'razorpay']).default('fake'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_PAYOUT_ACCOUNT_NUMBER: z.string().optional(),
  NOTIFICATIONS_PROVIDER: z.enum(['fake', 'msg91']).default('fake'),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_SENDER_ID: z.string().optional(),
  MSG91_OTP_TEMPLATE_ID: z.string().optional(),
  MSG91_WHATSAPP_NUMBER: z.string().optional(),
  /*
   * DLT and WhatsApp template ids, as `template=value,template=value`.
   *
   * A flat string rather than JSON because these are pasted into a hosting provider's
   * environment-variable box, where braces and quotes get mangled. Templates clear approval one
   * at a time, so a partial map is the normal state and an unmapped one simply fails on that
   * channel.
   */
  /*
   * Shared secret for the scheduled notification route. Absent means the route answers 404 to
   * everyone, which is the safe default: an open endpoint that sends messages to real people is
   * a spam cannon with our sender id on it.
   */
  CRON_SECRET: z.string().optional(),
  MSG91_SMS_TEMPLATE_IDS: z.string().optional(),
  MSG91_WHATSAPP_TEMPLATES: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cachedServerEnv: ServerEnv | undefined;

/**
 * Server-side configuration. Call this inside a server component, route handler, or action.
 * Reading it lazily rather than at module scope keeps the client bundle free of the schema.
 */
export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  if (typeof window !== 'undefined') {
    throw new Error('getServerEnv() was called in the browser - this would leak server secrets');
  }

  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid server environment: ${detail}`);
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

/**
 * Selecting a real provider without its credentials is a misconfiguration that only shows up
 * when someone tries to pay. Called from instrumentation.ts so it fails at boot instead.
 */
export function assertProvidersConfigured(): void {
  const env = getServerEnv();

  if (env.PAYMENTS_PROVIDER === 'razorpay' && !(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)) {
    throw new Error('PAYMENTS_PROVIDER=razorpay but RAZORPAY_KEY_ID/SECRET are not set');
  }

  // Without this the checkout screen renders with no way to pay: the widget cannot identify the
  // merchant. Worth failing the boot for, because the symptom otherwise appears only at the
  // moment a seeker tries to hand over money.
  if (env.PAYMENTS_PROVIDER === 'razorpay' && !clientEnv.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
    throw new Error(
      'PAYMENTS_PROVIDER=razorpay but NEXT_PUBLIC_RAZORPAY_KEY_ID is not set - ' +
        'the browser Checkout widget needs the publishable key id',
    );
  }

  if (env.NOTIFICATIONS_PROVIDER === 'msg91' && !env.MSG91_AUTH_KEY) {
    throw new Error('NOTIFICATIONS_PROVIDER=msg91 but MSG91_AUTH_KEY is not set');
  }

  if (
    clientEnv.NEXT_PUBLIC_MAPS_PROVIDER === 'google' &&
    !clientEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  ) {
    throw new Error('NEXT_PUBLIC_MAPS_PROVIDER=google but no API key is set');
  }
}
